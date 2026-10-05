const db = require('../db/db');
const STAGES = require('../config/stages');

function placeholders(arr) { return arr.map(() => '?').join(','); }

// Base set of (recipient_id, lead_id, campaign_id) matching charter + date-sent range.
// Date range filters by the date the message was SENT to that person (per requirements doc),
// using either a 'sent' or 'failed' event so failed attempts still count toward "Selected".
function getRecipientRows({ charters, dateFrom, dateTo }) {
  let q = `
    SELECT DISTINCT cr.id as recipient_id, cr.lead_id, cr.campaign_id
    FROM campaign_recipients cr
    JOIN campaigns c ON c.id = cr.campaign_id
    JOIN message_events me ON me.campaign_recipient_id = cr.id AND me.event_type IN ('sent','failed')
    WHERE cr.is_test_send = 0
  `;
  const params = [];
  if (charters && charters.length) {
    q += ` AND (c.charter_granular IN (${placeholders(charters)}) OR c.charter_rollup IN (${placeholders(charters)}))`;
    params.push(...charters, ...charters);
  }
  if (dateFrom) { q += ' AND date(me.event_timestamp) >= date(?)'; params.push(dateFrom); }
  if (dateTo) { q += ' AND date(me.event_timestamp) <= date(?)'; params.push(dateTo); }
  return db.prepare(q).all(...params);
}

function countRecipientsWithEvent(recipientIds, eventType) {
  if (!recipientIds.length) return 0;
  const row = db.prepare(`
    SELECT COUNT(DISTINCT campaign_recipient_id) as c
    FROM message_events
    WHERE event_type = ? AND campaign_recipient_id IN (${placeholders(recipientIds)})
  `).get(eventType, ...recipientIds);
  return row.c;
}

function countLeadsEverReachedStage(leadIds, stageValue) {
  if (!leadIds.length) return 0;
  const row = db.prepare(`
    SELECT COUNT(DISTINCT lead_id) as c
    FROM lsq_stage_events
    WHERE new_stage = ? AND lead_id IN (${placeholders(leadIds)})
  `).get(stageValue, ...leadIds);
  return row.c;
}

// True Churn is LIVE: current stage (latest event per lead) is CNC or CBL.
function countTrueChurn(leadIds) {
  if (!leadIds.length) return 0;
  const row = db.prepare(`
    SELECT COUNT(*) as c FROM (
      SELECT lead_id, new_stage,
        ROW_NUMBER() OVER (PARTITION BY lead_id ORDER BY changed_at DESC) as rn
      FROM lsq_stage_events
      WHERE lead_id IN (${placeholders(leadIds)})
    ) latest
    WHERE rn = 1 AND new_stage IN (?, ?)
  `).get(...leadIds, STAGES.CNC, STAGES.CBL);
  return row.c;
}

function countAssigned(campaignIds) {
  if (!campaignIds.length) return 0;
  const row = db.prepare(`
    SELECT COUNT(DISTINCT lead_id) as c FROM qualified_leads
    WHERE campaign_id IN (${placeholders(campaignIds)})
  `).get(...campaignIds);
  return row.c;
}

function computeFunnel({ charters, dateFrom, dateTo }) {
  const rows = getRecipientRows({ charters, dateFrom, dateTo });
  const recipientIds = rows.map((r) => r.recipient_id);
  const leadIds = [...new Set(rows.map((r) => r.lead_id).filter(Boolean))];
  const campaignIds = [...new Set(rows.map((r) => r.campaign_id))];

  return {
    selected: recipientIds.length,
    sent: countRecipientsWithEvent(recipientIds, 'sent'),
    delivered: countRecipientsWithEvent(recipientIds, 'delivered'),
    read: countRecipientsWithEvent(recipientIds, 'read'),
    clicked: countRecipientsWithEvent(recipientIds, 'clicked'),
    assigned: countAssigned(campaignIds),
    lead: countLeadsEverReachedStage(leadIds, STAGES.LEAD),
    trueChurn: countTrueChurn(leadIds),
    prospect: countLeadsEverReachedStage(leadIds, STAGES.PROSPECT),
    sessionScheduled: countLeadsEverReachedStage(leadIds, STAGES.SESSION_SCHEDULED),
    sessionDone: countLeadsEverReachedStage(leadIds, STAGES.SESSION_DONE),
    rfd: countLeadsEverReachedStage(leadIds, STAGES.RFD),
    _leadIds: leadIds,
    _campaignIds: campaignIds,
  };
}

// Per-charter breakdown (Page 2): one computeFunnel call per charter
function computeFunnelByCharter({ charters, dateFrom, dateTo }) {
  const out = {};
  for (const charter of charters) {
    out[charter] = computeFunnel({ charters: [charter], dateFrom, dateTo });
  }
  return out;
}

// Per-campaign funnel + percentage metrics (Page 7)
function computeFunnelForCampaign(campaignId) {
  const rows = db.prepare(`
    SELECT cr.id as recipient_id, cr.lead_id
    FROM campaign_recipients cr
    WHERE cr.campaign_id = ? AND cr.is_test_send = 0
  `).all(campaignId);
  const recipientIds = rows.map((r) => r.recipient_id);
  const leadIds = [...new Set(rows.map((r) => r.lead_id).filter(Boolean))];

  const funnel = {
    selected: recipientIds.length,
    sent: countRecipientsWithEvent(recipientIds, 'sent'),
    delivered: countRecipientsWithEvent(recipientIds, 'delivered'),
    read: countRecipientsWithEvent(recipientIds, 'read'),
    clicked: countRecipientsWithEvent(recipientIds, 'clicked'),
    assigned: countAssigned([campaignId]),
    prospect: countLeadsEverReachedStage(leadIds, STAGES.PROSPECT),
    rfd: countLeadsEverReachedStage(leadIds, STAGES.RFD),
  };

  funnel.clickThroughRate = funnel.read > 0 ? funnel.clicked / funnel.read : 0;
  funnel.assignedToProspectRate = funnel.assigned > 0 ? funnel.prospect / funnel.assigned : 0;
  funnel.assignedToRfdRate = funnel.assigned > 0 ? funnel.rfd / funnel.assigned : 0;
  return funnel;
}

module.exports = { computeFunnel, computeFunnelByCharter, computeFunnelForCampaign };
