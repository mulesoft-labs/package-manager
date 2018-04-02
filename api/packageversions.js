const db = require('../util/pghelper');

const SELECT_ALL_HEROKU_CONNECT =
    `SELECT pv.id, pv.sfid, pv.name, p.name as package_name, pv.sflma__version__c as version_number, pv.sflma__package__c as package_id, 
        pv.sflma__release_date__c as release_date, pv.status__c as status, pv.sflma__version_id__c as version_id, 
        p.sflma__developer_org_id__c as package_org_id 
    FROM sflma__package_version__c as pv 
    INNER JOIN sflma__package__c as p on pv.sflma__package__c = p.sfid`;

const SELECT_ALL =
    `SELECT 
        pv.id, pv.sfid, pv.name, pv.version_number, pv.package_id, pv.release_date, pv.status, pv.version_id, 
        p.package_org_id, p.name as package_name 
    FROM package_version pv 
    INNER JOIN package p on p.sfid = pv.package_id`;

const SELECT_ALL_WITH_LICENSE =
    `SELECT
        pv.id, pv.sfid, pv.name, pv.version_number, pv.package_id, pv.release_date, pv.status, pv.version_id,
        p.package_org_id, p.name as package_name, 
        pvl.version_number latest_version_number, pvl.version_id latest_version_id,
        l.org_id, l.status license_status
    FROM package_version pv
    INNER JOIN package p on p.sfid = pv.package_id
    INNER JOIN package_version_latest pvl ON pvl.package_id = pv.package_id
    INNER JOIN license l ON l.package_version_id = pv.sfid`;

const SELECT_ALL_WITH_LICENSE_IN_GROUP =
    SELECT_ALL_WITH_LICENSE +
    ` INNER JOIN org_group_member gm ON gm.org_id = l.org_id`;

async function requestAll(req, res, next) {
    try {
        let recs = await findAll(
            req.query.sort_field,
            req.query.sort_dir,
            req.query.status,
            req.query.packageId,
            req.query.packageOrgId,
            req.query.licensedOrgId);
        return res.send(JSON.stringify(recs));
    } catch (err) {
        next(err);
    }
}

async function findAll(sortField, sortDir, status, packageId, packageOrgId, licensedOrgId) {
    let whereParts = [], values = [], select = SELECT_ALL;
    if (status && status !== "All") {
        values.push(status);
        whereParts.push("pv.status = $" + values.length);
    }

    if (packageId) {
        values.push(packageId);
        whereParts.push("pv.package_id = $" + values.length);
    }

    if (packageOrgId) {
        values.push(packageOrgId);
        whereParts.push("p.package_org_id = $" + values.length);
    }

    if (licensedOrgId) {
        select = SELECT_ALL_WITH_LICENSE;
        values.push(licensedOrgId);
        whereParts.push("l.org_id = $" + values.length);
        // values.push('Uninstalled');
        // whereParts.push("l.status != $" + values.length);
        // values.push('Suspended');
        // whereParts.push("l.status != $" + values.length);
    }

    let where = whereParts.length > 0 ? (" WHERE " + whereParts.join(" AND ")) : "";
    let orderBy = ` ORDER BY ${sortField || "release_date"} ${sortDir || "desc"}`;
    return db.query(select + where + orderBy, values);
}

async function requestById(req, res, next) {
    try {
        let recs = await findByIds([req.params.id]);
        return res.json(recs[0]);
    } catch (err) {
        next(err);
    }
}

async function findByIds(versionIds) {
    let whereParts = [], values = [], select = SELECT_ALL;

    if (versionIds) {
        let params = [];
        for(let i = 1; i <= versionIds.length; i++) {
            params.push('$' + i);
        }
        whereParts.push(`pv.version_id IN (${params.join(",")})`);
        values = values.concat(versionIds);
    }

    let where = whereParts.length > 0 ? (" WHERE " + whereParts.join(" AND ")) : "";
    return db.query(select + where, values);
}

async function findLatestByOrgIds(versionIds, orgIds) {
    let whereParts = [], values = [], select = SELECT_ALL_WITH_LICENSE;

    if (versionIds) {
        let params = [];
        for(let i = 1; i <= versionIds.length; i++) {
            params.push('$' + i);
        }
        whereParts.push(`pvl.version_id IN (${params.join(",")})`);
        values = values.concat(versionIds);
    }

    if (orgIds) {
        let params = [];
        for(let i = 1; i <= orgIds.length; i++) {
            params.push('$' + (values.length + i));
        }

        whereParts.push(`l.org_id IN (${params.join(",")})`);
        values = values.concat(orgIds);

        // Filter out orgs already on the latest version
        whereParts.push(`l.package_version_id != pvl.sfid`);
    }

    let where = whereParts.length > 0 ? (" WHERE " + whereParts.join(" AND ")) : "";
    return db.query(select + where, values);
}

async function findLatestByGroupIds(versionIds, orgGroupIds) {
    let whereParts = [], values = [], select = SELECT_ALL;

    if (versionIds) {
        let params = [];
        for(let i = 1; i <= versionIds.length; i++) {
            params.push('$' + (values.length + i));
        }
        whereParts.push(`pvl.version_id IN (${params.join(",")})`);
        values = values.concat(versionIds);
    }


    if (orgGroupIds) {
        select = SELECT_ALL_WITH_LICENSE_IN_GROUP;
        let params = [];
        for(let i = 1; i <= orgGroupIds.length; i++) {
            params.push('$' + (values.length + i));
        }

        whereParts.push(`gm.org_group_id IN (${params.join(",")})`);
        values = values.concat(orgGroupIds);

        // Filter out orgs already on the latest version
        whereParts.push(`l.package_version_id != pvl.sfid`);
    }

    let where = whereParts.length > 0 ? (" WHERE " + whereParts.join(" AND ")) : "";
    return db.query(select + where, values);
}

exports.findLatestByOrgIds = findLatestByOrgIds;
exports.findLatestByGroupIds = findLatestByGroupIds;
exports.requestAll = requestAll;
exports.requestById = requestById;