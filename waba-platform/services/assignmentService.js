const db = require('../db/db');
const config = require('../config/config');
const stages = require('../config/stages');
const lsq = require('../adapters/leadsquared');
const alertService = require('./alertService');

const { singleCampaignClicks, crossCampaignClicks, crossCampaignWindowDays } = config.assignedThresholds;
const fastConversionHours = config.assignedFastConversionHours;

function alreadyQualified(leadId) {
  return db.prepare('SELECT 1 FROM qualified_leads WHERE lead_id = ?').get(leadId);
}

function qualify(leadId, campaignId, reason) {
  if (alreadyQualified(leadId)) return; // qualify once, first reason wins
  db.prepare(`
    INSERT INTO qualified_leads (lead_id, campaign_id, qualification_reason)
    VALUES (?, ?, ?)
  `).run(leadId, campaignId, reason);
}

// Path A, single campaign: 3+ clicks on one campaign by the same lead
function evaluateSingleCampaignClicks() {
  const rows = db.prepare(`
    SELECT cr.lead_id, cr.campaign_id, COUNT(*) as clicks
    FROM message_events me
    JOIN campaign_recipients cr ON cr.id = me.campaign_recipient_id
    WHERE me.event_type = 'clicked' AND cr.lead_id IS NOT NULL
    GROUP BY cr.lead_id, cr.campaign_id
    HAVING clicks >= ?
  `).all(singleCampaignClicks);
  for (const r of rows) qualify(r.lead_id, r.campaign_id, 'clicks_single_campaign');
  return rows.length;
}

// Path A, cross campaign: 5+ clicks across different campaigns within a rolling window
function evaluateCrossCampaignClicks() {
  const clicks = db.prepare(`
    SELECT cr.lead_id, cr.campaign_id, me.event_timestamp
    FROM message_events me
    JOIN campaign_recipients cr ON cr.id = me.campaign_recipient_id
    WHERE me.event_type = 'clicked' AND cr.lead_id IS NOT NULL
    ORDER BY cr.lead_id, me.event_timestamp
  `).all();

  const byLead = {};
  for (const c of clicks) {
    byLead[c.lead_id] = byLead[c.lead_id] || [];
    byLead[c.lead_id].push(c);
  }

  let qualifiedCount = 0;
  const windowMs = crossCampaignWindowDays * 24 * 60 * 60 * 1000;
  for (const [leadId, events] of Object.entries(byLead)) {
    for (let i = 0; i < events.length; i++) {
      const windowEvents = events.filter((e) =>
        new Date(e.event_timestamp) >= new Date(events[i].event_timestamp) &&
        new Date(e.event_timestamp) - new Date(events[i].event_timestamp) <= windowMs
      );
      const distinctCampaigns = new Set(windowEvents.map((e) => e.campaign_id));
      if (windowEvents.length >= crossCampaignClicks && distinctCampaigns.size > 1) {
        const lastCampaign = windowEvents[windowEvents.length - 1].campaign_id;
        qualify(leadId, lastCampaign, 'clicks_cross_campaign');
        qualifiedCount++;
        break;
      }
    }
  }
  return qualifiedCount;
}

// Path A, form fill: event_type='form_fill' rows (fed by an external webhook/route)
function evaluateFormFills() {
  const rows = db.prepare(`
    SELECT DISTINCT cr.lead_id, cr.campaign_id
    FROM message_events me
    JOIN campaign_recipients cr ON cr.id = me.campaign_recipient_id
    WHERE me.event_type = 'form_fill' AND cr.lead_id IS NOT NULL
  `).all();
  for (const r of rows) qualify(r.lead_id, r.campaign_id, 'form_fill');
  return rows.length;
}

// Path B: LSQ stage -> "Lead" within N hours of the message being sent, regardless of view/click
function evaluateFastConversions() {
  const leadStageEvents = db.prepare(`
    SELECT lead_id, changed_at FROM lsq_stage_events WHERE new_stage = ?
  `).all(stages.LEAD);

  let qualifiedCount = 0;
  const windowMs = fastConversionHours * 60 * 60 * 1000;
  for (const ev of leadStageEvents) {
    if (alreadyQualified(ev.lead_id)) continue;
    // Find this lead's most recent 'sent' event before the stage change
    const sentEvent = db.prepare(`
      SELECT me.event_timestamp, cr.campaign_id
      FROM message_events me
      JOIN campaign_recipients cr ON cr.id = me.campaign_recipient_id
      WHERE cr.lead_id = ? AND me.event_type = 'sent' AND me.event_timestamp <= ?
      ORDER BY me.event_timestamp DESC LIMIT 1
    `).get(ev.lead_id, ev.changed_at);
    if (!sentEvent) continue;
    const diffMs = new Date(ev.changed_at) - new Date(sentEvent.event_timestamp);
    if (diffMs >= 0 && diffMs <= windowMs) {
      qualify(ev.lead_id, sentEvent.campaign_id, 'fast_conversion');
      qualifiedCount++;
    }
  }
  return qualifiedCount;
}

function runAllQualificationChecks() {
  return {
    singleCampaignClicks: evaluateSingleCampaignClicks(),
    crossCampaignClicks: evaluateCrossCampaignClicks(),
    formFills: evaluateFormFills(),
    fastConversions: evaluateFastConversions(),
  };
}

function listQualifiedLeadsForCampaign(campaignId) {
  return db.prepare(`
    SELECT ql.*, (
      SELECT new_stage FROM lsq_stage_events WHERE lead_id = ql.lead_id ORDER BY changed_at DESC LIMIT 1
    ) as current_stage
    FROM qualified_leads ql
    WHERE ql.campaign_id = ?
    ORDER BY ql.qualified_at DESC
  `).all(campaignId);
}

// Write BDE assignment back into LSQ + record in our own history log
async function assignLeadToBde(leadId, bdeEmail, userId) {
  const last = db.prepare(`
    SELECT new_owner_email FROM bde_assignment_events WHERE lead_id = ? ORDER BY changed_at DESC LIMIT 1
  `).get(leadId);

  await lsq.updateLeadOwner(leadId, bdeEmail); // the actual LSQ write

  db.prepare(`
    INSERT INTO bde_assignment_events (lead_id, old_owner_email, new_owner_email, changed_by_user_id)
    VALUES (?, ?, ?, ?)
  `).run(leadId, last ? last.new_owner_email : null, bdeEmail, userId || null);

  db.prepare(`UPDATE qualified_leads SET assigned_bde_email = ? WHERE lead_id = ?`).run(bdeEmail, leadId);

  alertService.notifyBdeAssignment(bdeEmail, leadId).catch((e) => console.warn('BDE alert email failed:', e.message));
}

module.exports = {
  runAllQualificationChecks,
  listQualifiedLeadsForCampaign,
  assignLeadToBde,
};
