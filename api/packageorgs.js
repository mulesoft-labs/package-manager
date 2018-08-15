const db = require('../util/pghelper');
const crypt = require('../util/crypt');
const sfdc = require('./sfdcconn');
const admin = require('./admin');
const logger = require('../util/logger').logger;

const Status = {Connected: "Connected", Invalid: "Invalid", Missing: "Missing"};

const CRYPT_KEY = process.env.CRYPT_KEY || "supercalifragolisticexpialodocious";

const ENABLE_ACCESS_TOKEN_UI = process.env.ENABLE_ACCESS_TOKEN_UI === "true";

const SELECT_ALL = 
	`SELECT id, name, description, division, namespace, org_id, instance_name, instance_url, type, status, refreshed_date 
	${ENABLE_ACCESS_TOKEN_UI ? ", access_token" : ""}
	FROM package_org`;

// NOT to be used in UI requests
const SELECT_ALL_WITH_REFRESH_TOKEN = 
	`SELECT id, name, description, division, namespace, org_id, instance_name, instance_url, type, status, refreshed_date, 
		refresh_token, access_token
	FROM package_org`;

async function requestAll(req, res, next) {
	let sort = ` ORDER BY ${req.query.sort_field || "name"} ${req.query.sort_dir || "asc"}`;
	try {
		let recs = await db.query(SELECT_ALL + sort, []);
		await crypt.passwordDecryptObjects(CRYPT_KEY, recs, ["access_token"]);

		let ids = recs.map(o => o.org_id);
		Object.entries(sfdc.NamedOrgs).forEach(([key, val]) => {
			if (ids.indexOf(val.orgId) === -1) {
				recs.push({org_id: val.orgId, status: Status.Missing, name: val.name, instance_url: val.instanceUrl})
			}
		});

		return res.send(JSON.stringify(recs));
	} catch (err) {
		return res.status(500).send(err.message || err);
	}
}

async function requestById(req, res, next) {
	let id = req.params.id;
	try {
		let where = " WHERE org_id = $1";
		let recs = await db.query(SELECT_ALL + where, [id]);
		await crypt.passwordDecryptObjects(CRYPT_KEY, recs, ["access_token", "refresh_token"]);
		await sfdc.applyLoginIPAccessControls(id);
		return res.json(recs[0]);
	} catch (err) {
		return res.status(500).send(err.message || err);
	}
}

async function retrieve(id) {
	let where = " WHERE id = $1";
	let recs = await db.query(SELECT_ALL_WITH_REFRESH_TOKEN + where, [id]);
	await crypt.passwordDecryptObjects(CRYPT_KEY, recs, ["access_token", "refresh_token"]);
	return recs[0];
}

async function retrieveByOrgId(org_id) {
	let where = " WHERE org_id = $1";
	let recs = await db.query(SELECT_ALL_WITH_REFRESH_TOKEN + where, [org_id]);
	await crypt.passwordDecryptObjects(CRYPT_KEY, recs, ["access_token", "refresh_token"]);
	return recs[0];
}

async function initOrg(conn, org_id) {
	let org = await refreshOrgConnection(conn, org_id);
	if (org.status === Status.Invalid) {
		return await updateOrgStatus(org_id, org.status);
	}
	applyLoginIPAccessControls(org_id).then(() => {});

	await crypt.passwordEncryptObjects(CRYPT_KEY, [org], ["access_token", "refresh_token"]);
	let sql = `INSERT INTO package_org 
            (org_id, name, division, namespace, instance_name, instance_url, refresh_token, access_token, status)
           VALUES 
            ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           on conflict (org_id) do update set
            name = excluded.name, division = excluded.division, namespace = excluded.namespace, instance_name = excluded.instance_name, 
            instance_url = excluded.instance_url, refresh_token = excluded.refresh_token, access_token = excluded.access_token,
            status = excluded.status`;
	return await db.insert(sql,
		[org_id, org.name, org.division, org.namespace, org.instance_name, org.instance_url, org.refresh_token, org.access_token, org.status]);
	
}

async function applyLoginIPAccessControls(packageOrgId) {
	let conn = await sfdc.buildOrgConnection(packageOrgId);
	let profileName = "SteelBrick Package Manager Admin";
	let metadata = {
		fullName: profileName,
		loginIpRanges: [
			{description: "SFDC Network", startAddress: "204.14.232.0", endAddress: "204.14.239.255"},
			{description: "SteelBrick Heroku NA", startAddress: "35.165.148.180", endAddress: "35.165.148.180"},
			{description: "SteelBrick Heroku NA", startAddress: "35.165.168.63", endAddress: "35.165.168.63"},
			{description: "SteelBrick Heroku NA", startAddress: "35.165.214.66", endAddress: "35.165.214.66"},
			{description: "SteelBrick Heroku NA", startAddress: "35.165.214.102", endAddress: "35.165.214.102"},
			{description: "SFDC Phoenix (PRD)", startAddress: "136.146.0.0", endAddress: "136.147.255.255"}
		]
	};
	
	conn.metadata.update('Profile', metadata).then( (result, err) => {
		if (err) {
			admin.emit(admin.Events.ALERT, {subject: 'Profile Not Updated',
				message: `Profile not updated for org ${packageOrgId}.  Error: ${err.message}`});
		} else {
			if (result.success) {
				logger.info(`Updated Profile with login IP ranges`, {profileName: profileName});
			} else {
				logger.warn(`Did not find named profile to apply login IP ranges`, {profileName: profileName});
				admin.emit(admin.Events.ALERT, {subject: "Profile Not Found", 
					message: `Head's up.  We did not find a profile named ${profileName} found in org ${packageOrgId}.  We recommend you create one, so we can apply our IP access control ranges the next time you refresh.`});
			}
		}
	}).catch(e => logger.warn(e.message));
}

async function updateOrgStatus(orgId, status) {
	return await db.update(`UPDATE package_org SET status = $1, access_token = null WHERE org_id = $2`, [status, orgId]);
}

async function refreshOrgConnection(conn, org_id) {
	try {
		let org = await conn.sobject("Organization").retrieve(org_id);
		return {
			org_id,
			status: Status.Connected,
			instance_url: conn.instanceUrl,
			refresh_token: conn.refreshToken,
			access_token: conn.accessToken,
			name: org.Name,
			division: org.Division,
			namespace: org.NamespacePrefix,
			instance_name: org.InstanceName
		};
	} catch (error) {
		if (error.name === "invalid_grant") {
			return {org_id: org_id, status: Status.Invalid};
		}

		// No access to the Organization object.  Not ideal, but our token was still refreshed.
		return {
			org_id,
			name: parseNameFromMyUrl(conn.instanceUrl),
			status: Status.Connected,
			instance_url: conn.instanceUrl,
			refresh_token: conn.refreshToken,
			access_token: conn.accessToken
		};
	}
}

function parseNameFromMyUrl(instanceUrl) {
	let n = instanceUrl.indexOf("://");
	let m = instanceUrl.indexOf(".my.salesforce.com");
	if (n === -1 || m === -1) {
		return null; // Nope. Bad url! Bad url!
	}
	return instanceUrl.substring(n + 3, m).toUpperCase();
}

async function updateAccessToken(org_id, access_token) {
	let encrypto = {access_token: access_token};
	await crypt.passwordEncryptObjects(CRYPT_KEY, [encrypto]);
	await db.update(`UPDATE package_org set access_token = $1, status = $2, refreshed_date = NOW() WHERE org_id = $3`,
		[encrypto.access_token, Status.Connected, org_id]);
}

async function requestDelete(req, res, next) {
	try {
		let orgIds = req.body.orgIds;
		await revokeByOrgIds(orgIds);

		let n = 1;
		let params = orgIds.map(v => `$${n++}`);
		await db.delete(`DELETE FROM package_org WHERE org_id IN (${params.join(",")})`, orgIds);
		return res.send({result: 'ok'});
	} catch (err) {
		return res.status(500).send(err.message || err);
	}
}

async function requestUpdate(req, res, next) {
	try {
		let orgId = req.body.packageorg.org_id;
		let type = req.body.packageorg.type;
		let description = req.body.packageorg.description;
		let orgs = await db.update(`UPDATE package_org SET description = $1, type = $2 WHERE org_id = $3`, [description, type, orgId]);
		return res.json(orgs[0]);
	} catch (err) {
		return res.status(500).send(err.message || err);
	}
}

async function requestRefresh(req, res, next) {
	try {
		let orgs = [];
		let orgIds = req.body.orgIds;
		for (let i = 0; i < orgIds.length; i++) {
			let orgId = orgIds[i];
			let conn = await sfdc.buildOrgConnection(orgId);
			let recs = await initOrg(conn, orgId);
			orgs.push(recs[0]);
		}
		await crypt.passwordDecryptObjects(CRYPT_KEY, orgs, ['access_token', 'refresh_token']);
		return res.json(orgs);
	} catch (err) {
		return res.status(500).send(err.message || err);
	}
}

async function requestRevoke(req, res, next) {
	try {
		let orgIds = req.body.orgIds;
		await revokeByOrgIds(orgIds);
		res.json({result: "OK"});
	} catch (err) {
		return res.status(500).send(err.message || err);
	}
}

async function revokeByOrgIds(orgIds) {
	for (let i = 0; i < orgIds.length; i++) {
		let orgId = orgIds[i];
		let conn = await sfdc.buildOrgConnection(orgId);
		try {
			await conn.logoutByOAuth2(conn.refreshToken != null);
		} catch (e) {
			// Connection is already invalid, just be sure our local record is updated.
		}
		
		await db.update(
			`UPDATE package_org SET status = $1, access_token = null, refresh_token = null 
				WHERE org_id = $2`, [Status.Invalid, orgId]);
	}
}

exports.requestAll = requestAll;
exports.requestById = requestById;
exports.requestUpdate = requestUpdate;
exports.requestRefresh = requestRefresh;
exports.requestRevoke = requestRevoke;
exports.requestDelete = requestDelete;
exports.retrieveById = retrieve;
exports.retrieveByOrgId = retrieveByOrgId;
exports.initOrg = initOrg;
exports.updateOrgStatus = updateOrgStatus;
exports.updateAccessToken = updateAccessToken;
exports.Status = Status;
