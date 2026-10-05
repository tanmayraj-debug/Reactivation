const express = require('express');
const router = express.Router();
const db = require('../db/db');
const config = require('../config/config');
const alertService = require('../services/alertService');

function findRecipientByWaMessageId(waMessageId) {
  return db.prepare('SELECT * FROM campaign_recipients WHERE wa_message_id = ?').get(waMessageId);
}

function findMostRecentRecipientByPhone(phone) {
  return db.prepare(`
    SELECT * FROM campaign_recipients WHERE phone = ? ORDER BY created_at DESC LIMIT 1
  `).get(phone);
}

function insertEvent(recipientId, campaignId, eventType, timestamp, payload) {
  db.prepare(`
    INSERT INTO message_events (campaign_recipient_id, campaign_id, event_type, event_timestamp, raw_payload_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(recipientId, campaignId, eventType, timestamp || new Date().toISOString(), JSON.stringify(payload || {}));
}

/**
 * Message status webhook: sent / delivered / read / failed
 * Matches TimesMobile's confirmed payload shape (see Async_API_Response doc):
 * entry[].changes[].value.statuses[] = [{ id, status, timestamp, ct_trace_id, ... }]
 */
router.post('/timesmobile/status', (req, res) => {
  try {
    const entries = req.body.entry || [];
    let processed = 0;
    for (const entry of entries) {
      for (const change of entry.changes || []) {
        const statuses = (change.value && change.value.statuses) || [];
        for (const s of statuses) {
          const recipient = findRecipientByWaMessageId(s.id);
          if (!recipient) continue; // not one of ours, or not matched yet
          insertEvent(recipient.id, recipient.campaign_id, s.status, s.timestamp ? new Date(parseInt(s.timestamp) * 1000).toISOString() : null, s);
          processed++;
        }
      }
    }
    res.json({ ok: true, processed });
  } catch (err) {
    console.error('status webhook error', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Inbound message webhook: button clicks, list replies, CTA clicks.
 * We treat any of these interaction types as a 'clicked' event.
 * Matches by context.id (original message wamid) when present, else by phone.
 */
router.post('/timesmobile/inbound', (req, res) => {
  try {
    const entries = req.body.entry || [];
    let processed = 0;
    for (const entry of entries) {
      for (const change of entry.changes || []) {
        const messages = (change.value && change.value.messages) || [];
        for (const m of messages) {
          const isInteraction = m.type === 'button' || m.type === 'interactive';
          if (!isInteraction) continue;
          let recipient = null;
          if (m.context && m.context.id) recipient = findRecipientByWaMessageId(m.context.id);
          if (!recipient && m.from) recipient = findMostRecentRecipientByPhone(m.from);
          if (!recipient) continue;
          insertEvent(recipient.id, recipient.campaign_id, 'clicked', m.timestamp ? new Date(parseInt(m.timestamp) * 1000).toISOString() : null, m);
          processed++;
        }
      }
    }
    res.json({ ok: true, processed });
  } catch (err) {
    console.error('inbound webhook error', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Template status webhook: approved / rejected (message_template_status_update)
 */
router.post('/timesmobile/template-status', (req, res) => {
  try {
    const entries = req.body.entry || [];
    let updated = 0;
    for (const entry of entries) {
      for (const change of entry.changes || []) {
        if (change.field !== 'message_template_status_update') continue;
        const v = change.value || {};
        const status = (v.event || '').toLowerCase() === 'approved' ? 'approved'
          : (v.event || '').toLowerCase() === 'rejected' ? 'rejected' : null;
        if (!status) continue;
        db.prepare(`
          UPDATE templates SET status = ?, rejected_reason = ?, updated_at = datetime('now')
          WHERE name = ?
        `).run(status, v.reason && v.reason !== 'NONE' ? v.reason : null, v.message_template_name);
        updated++;
        alertService.notifyTemplateStatus(config, v.message_template_name, status, v.reason).catch((e) => console.warn('Template alert email failed:', e.message));
      }
    }
    res.json({ ok: true, updated });
  } catch (err) {
    console.error('template-status webhook error', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Form-fill hook: call this from your website when a WhatsApp-click lead
 * fills a form. Body: { leadId, phone? } - phone is used as a fallback if
 * leadId can't be matched to a recipient row directly.
 */
router.post('/formfill', (req, res) => {
  try {
    const { leadId, phone } = req.body;
    let recipient = null;
    if (leadId) {
      recipient = db.prepare(`
        SELECT * FROM campaign_recipients WHERE lead_id = ? ORDER BY created_at DESC LIMIT 1
      `).get(leadId);
    }
    if (!recipient && phone) recipient = findMostRecentRecipientByPhone(phone);
    if (!recipient) return res.status(404).json({ error: 'No matching recipient found for this lead/phone' });

    insertEvent(recipient.id, recipient.campaign_id, 'form_fill', null, req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
