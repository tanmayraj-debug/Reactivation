const axios = require('axios');
const config = require('../config/config');

function authParams(extra = {}) {
  return { accessKey: config.lsq.accessKey, secretKey: config.lsq.secretKey, ...extra };
}

function base() {
  return config.lsq.baseUrl.replace(/\/$/, '');
}

/**
 * All endpoints below are confirmed via LeadSquared's public API docs
 * (apidocs.leadsquared.com). Adjust only if your account uses a different
 * API version or custom field schema names.
 */

// List all cohorts/lists (for the cohort picker)
async function listCohorts() {
  const res = await axios.get(`${base()}/LeadManagement.svc/Lists.Get`, { params: authParams() });
  return res.data;
}

// Get the LeadIds of members of a list (fast, up to 10k leads)
async function getLeadIdsInList(listId) {
  const res = await axios.get(`${base()}/LeadManagement.svc/List.GetLeads`, {
    params: authParams({ listId }),
  });
  return res.data; // { ProspectId: [...] }
}

// Get full lead records (with phone, name etc) for a list, paginated
async function getLeadsInList(listId, { pageIndex = 1, pageSize = 200, includeColumns = 'ProspectID,FirstName,LastName,Phone,Mobile,EmailAddress,CreatedOn' } = {}) {
  const res = await axios.post(
    `${base()}/LeadManagement.svc/Leads/Retrieve/BySearchParameter`,
    {
      SearchParameters: { ListId: listId, RetrieveBehaviour: '0' },
      Columns: { Include_CSV: includeColumns },
      Sorting: { ColumnName: 'CreatedOn', Direction: '1' },
      Paging: { PageIndex: pageIndex, PageSize: pageSize },
    },
    { params: authParams() }
  );
  return res.data;
}

// Get a single lead's full details by LeadId
async function getLeadById(leadId) {
  const res = await axios.get(`${base()}/LeadManagement.svc/Leads.GetById`, {
    params: authParams({ id: leadId }),
  });
  return res.data;
}

// Search leads by criteria - e.g. CreatedOn > date, or LeadStage = X
async function searchLeads({ lookupName, lookupValue, sqlOperator = '=', includeColumns, pageIndex = 1, pageSize = 200 }) {
  const res = await axios.post(
    `${base()}/LeadManagement.svc/Leads.Get`,
    {
      Parameter: { LookupName: lookupName, LookupValue: lookupValue, SqlOperator: sqlOperator },
      Columns: { Include_CSV: includeColumns || 'ProspectID,FirstName,LastName,Phone,EmailAddress,CreatedOn' },
      Sorting: { ColumnName: 'CreatedOn', Direction: '1' },
      Paging: { PageIndex: pageIndex, PageSize: pageSize },
    },
    { params: authParams() }
  );
  return res.data;
}

// Get a lead's activity history (used to infer stage-change events -
// assumes stage changes are logged as activities in this account; verify
// on first live call, see requirements doc open items)
async function getLeadActivities(leadId) {
  const res = await axios.post(
    `${base()}/ProspectActivity.svc/Retrieve`,
    {},
    { params: authParams({ leadId }) }
  );
  return res.data; // { RecordCount, ProspectActivities: [...] }
}

// Get a lead's current owner (BDE)
async function getLeadOwner(leadIdentifier, value) {
  const res = await axios.get(`${base()}/LeadManagement.svc/LeadOwner.Get`, {
    params: authParams({ LeadIdentifier: leadIdentifier, value }),
  });
  return res.data;
}

// List all users in the account (BDEs). Confirm this returns email - if not,
// cross-reference with getLeadOwner responses instead.
async function getUsers() {
  const res = await axios.get(`${base()}/LeadManagement.svc/User.GetAll`, {
    params: authParams(),
  });
  return res.data;
}

// Update a lead's owner (write - Page 6 assignment action)
async function updateLeadOwner(leadId, ownerEmail) {
  const res = await axios.post(
    `${base()}/LeadManagement.svc/Lead.Update`,
    [{ Attribute: 'Owner', Value: ownerEmail }],
    { params: authParams({ leadId }) }
  );
  return res.data;
}

// Generic: update any lead field(s)
async function updateLeadFields(leadId, fields) {
  // fields: [{ Attribute, Value }, ...]
  const res = await axios.post(
    `${base()}/LeadManagement.svc/Lead.Update`,
    fields,
    { params: authParams({ leadId }) }
  );
  return res.data;
}

module.exports = {
  listCohorts,
  getLeadIdsInList,
  getLeadsInList,
  getLeadById,
  searchLeads,
  getLeadActivities,
  getLeadOwner,
  getUsers,
  updateLeadOwner,
  updateLeadFields,
};
