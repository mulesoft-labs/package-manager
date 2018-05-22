import * as h from './h';

let url = "/api/orggroups";

export let requestAll = sort => h.get(url, {sort_field: sort.field, sort_dir: sort.direction});
export let requestByTextSearch = (text, excludeId) => h.get(url, {text, excludeId});
export let requestById = id => h.get(url + "/" + id);

export let requestMembers = id => h.get(url + "/" + id + "/members");
export let requestAddMembers = (id, orgIds) => h.post(url + "/" + id + "/members", {orgIds});
export let requestRemoveMembers = (id, orgIds) => h.post(url + "/" + id + "/members/remove", {orgIds});

export let requestUpdate = orggroup => h.put(url, orggroup);
export let requestCreate = orggroup => h.post(url, orggroup);
export let requestDelete = orggroupIds => h.post(url + "/delete", {orggroupIds});

export let requestUpgrade = (id, versions, scheduled_date, description) => h.post(url + "/" + id + "/upgrade", {versions, scheduled_date, description});

export let requestRefresgPackageVersions = (id) => h.post(url + "/refresh", {id});