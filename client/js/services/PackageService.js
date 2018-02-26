import * as h from './h';

let url = "/packages";

export let requestAll = sort => h.get(url, {sort});

export let findByLicense = license_id => h.get(url, {license_id});

export let requestById = id => h.get(url + "/" + id);