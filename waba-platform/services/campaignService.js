const db = require('../db/db');
const config = require('../config/config');
const timesMobile = require('../adapters/timesmobile');
const lsq = require('../adapters/leadsquared');

function getCampaign(id) {
  return db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
}

function createDraftCampaign({ name, templateId, messageId, cohortListId, cohortName, charterGranular, charterRollup, scheduledDate, sendComponents, userId }) {
  const info = db.prepare(`
    INSERT INTO campaigns (name, template_id, message_id, cohort_list_id, cohort_name, charter_granular, charter_rollup, scheduled_date, send_components_json, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)
  `).run(
    name, templateId || null, messageId || null, cohortListId || null, cohortName || null,
    charterGranular, charterRollup || config.charters.granularToRollup[charterGranular] || null,
    scheduledDate || null, JSON.stringify(sendComponents || []), userId || null
  );
  return getCampaign(info.lastInsertRowid);
}

function getTemplateName(templateId) {
  const t = db.prepare('SELECT * FROM templates WHERE id = ?').get(templateId);
  if (!t) throw new Error('Template not found - must be created and approved before sending');
  return t;
}

// Record one recipient's send attempt + its immediate accept/fail result
function recordSend(campaignId, { leadId, phone, isTest, apiResult }) {
  const info = db.prepare(`
    INSERT INTO campaign_recipients (campaign_id, lead_id, phone, is_test_send, wa_message_id, ct_trace_id, send_status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    campaignId, leadId || null, phone, isTest ? 1 : 0,
    apiResult && apiResult.res_json && apiResult.res_json.messages ? apiResult.res_json.messages[0].id : (apiResult && apiResult.message_id) || null,
    apiResult && apiResult.ct_trace_id || null,
    apiResult && (apiResult.status === true || apiResult.status === 'success') ? 'accepted' : 'failed'
  );
  const recipientId = info.lastInsertRowid;
  // Log the immediate 'sent' (or 'failed') event into the event log right away;
  // delivered/read/clicked/failed-later events arrive via webhook and get appended separately.
  const eventType = (apiResult && (apiResult.status === true || apiResult.status === 'success')) ? 'sent' : 'failed';
  db.prepare(`
    INSERT INTO message_events (campaign_recipient_id, campaign_id, event_type, event_timestamp, raw_payload_json)
    VALUES (?, ?, ?, datetime('now'), ?)
  `).run(recipientId, campaignId, eventType, JSON.stringify(apiResult || {}));
  return recipientId;
}

async function sendTest(campaignId) {
  const campaign = getCampaign(campaignId);
  if (!campaign) throw new Error('Campaign not found');
  if (!config.approverWhatsAppNumber) throw new Error('APPROVER_WHATSAPP_NUMBER is not set in .env');

  const template = getTemplateName(campaign.template_id);
  if (template.status !== 'approved') {
    throw new Error(`Template "${template.name}" is not yet approved (status: ${template.status}). Wait for the approval webhook before testing.`);
  }

  const components = JSON.parse(campaign.send_components_json || '[]');
  const apiResult = await timesMobile.sendTemplateMessage({
    to: config.approverWhatsAppNumber,
    templateName: template.name,
    languageCode: template.language,
    components,
  });
  recordSend(campaignId, { phone: config.approverWhatsAppNumber, isTest: true, apiResult });

  db.prepare("UPDATE campaigns SET status = 'awaiting_approval', updated_at = datetime('now') WHERE id = ?").run(campaignId);
  return { campaign: getCampaign(campaignId), apiResult };
}

async function reject(campaignId) {
  db.prepare("UPDATE campaigns SET status = 'draft', updated_at = datetime('now') WHERE id = ?").run(campaignId);
  return getCampaign(campaignId);
}

// Approve -> fetch full cohort from LSQ -> loop send to every recipient.
// This is the "no bulk API" architecture: our backend does the fan-out.
async function approveAndLaunch(campaignId, { rateLimitMs = 250 } = {}) {
  const campaign = getCampaign(campaignId);
  if (!campaign) throw new Error('Campaign not found');
  if (campaign.status !== 'awaiting_approval') {
    throw new Error(`Campaign must be awaiting_approval to launch (current: ${campaign.status})`);
  }
  const template = getTemplateName(campaign.template_id);
  const components = JSON.parse(campaign.send_components_json || '[]');

  // Pull cohort: full lead records (need phone numbers)
  const leadsResp = await lsq.getLeadsInList(campaign.cohort_list_id, { pageSize: 500 });
  const leads = (leadsResp && (leadsResp.Leads || leadsResp)) || [];
  const list = Array.isArray(leads) ? leads : [];

  let sent = 0, failed = 0;
  for (const lead of list) {
    const phone = lead.Phone || lead.Mobile;
    if (!phone) { failed++; continue; }
    try {
      const apiResult = await timesMobile.sendTemplateMessage({
        to: phone.replace(/\D/g, ''),
        templateName: template.name,
        languageCode: template.language,
        components,
      });
      recordSend(campaignId, { leadId: lead.ProspectID || lead.ProspectId, phone, isTest: false, apiResult });
      sent++;
    } catch (err) {
      recordSend(campaignId, { leadId: lead.ProspectID || lead.ProspectId, phone, isTest: false, apiResult: { status: false, message: err.message } });
      failed++;
    }
    // basic rate limiting between individual sends
    if (rateLimitMs) await new Promise((r) => setTimeout(r, rateLimitMs));
  }

  db.prepare("UPDATE campaigns SET status = 'launched', updated_at = datetime('now') WHERE id = ?").run(campaignId);
  return { campaign: getCampaign(campaignId), sent, failed, totalCohort: list.length };
}

function listCampaigns({ charter, search } = {}) {
  let q = 'SELECT * FROM campaigns WHERE 1=1';
  const params = [];
  if (charter) { q += ' AND (charter_granular = ? OR charter_rollup = ?)'; params.push(charter, charter); }
  if (search) { q += ' AND name LIKE ?'; params.push(`%${search}%`); }
  q += ' ORDER BY created_at DESC';
  return db.prepare(q).all(...params);
}

module.exports = {
  getCampaign,
  createDraftCampaign,
  sendTest,
  reject,
  approveAndLaunch,
  listCampaigns,
};
