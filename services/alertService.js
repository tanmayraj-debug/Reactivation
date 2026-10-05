const emailService = require('./emailService');
const db = require('../db/db');

async function notifyBdeAssignment(bdeEmail, leadId) {
  return emailService.sendEmail({
    to: bdeEmail,
    subject: 'New lead assigned to you',
    text: `A new lead (ID: ${leadId}) has just been assigned to you in the campaign platform. Please follow up.`,
  });
}

async function notifyTemplateStatus(config, templateName, status, reason) {
  if (!config.email.digestRecipients.length) return;
  return emailService.sendEmail({
    to: config.email.digestRecipients.join(','),
    subject: `Template "${templateName}" ${status}`,
    text: `Your WhatsApp template "${templateName}" was ${status}.${reason ? ` Reason: ${reason}` : ''}`,
  });
}

// Basic delivery-rate-drop check: compares last 24h delivery rate to the
// trailing 7-day average; alerts if it drops meaningfully below normal.
async function checkDeliveryRateDrop(config) {
  const row = db.prepare(`
    SELECT
      SUM(CASE WHEN me.event_type='sent' AND me.event_timestamp >= datetime('now', '-1 day') THEN 1 ELSE 0 END) as sent_24h,
      SUM(CASE WHEN me.event_type='delivered' AND me.event_timestamp >= datetime('now', '-1 day') THEN 1 ELSE 0 END) as delivered_24h,
      SUM(CASE WHEN me.event_type='sent' AND me.event_timestamp >= datetime('now', '-7 day') THEN 1 ELSE 0 END) as sent_7d,
      SUM(CASE WHEN me.event_type='delivered' AND me.event_timestamp >= datetime('now', '-7 day') THEN 1 ELSE 0 END) as delivered_7d
    FROM message_events me
  `).get();

  if (!row.sent_24h || row.sent_24h < 10) return; // not enough volume to judge
  const rate24h = row.delivered_24h / row.sent_24h;
  const rate7d = row.sent_7d ? row.delivered_7d / row.sent_7d : rate24h;

  if (rate7d > 0 && rate24h < rate7d * 0.7) {
    await emailService.sendEmail({
      to: config.email.digestRecipients.join(','),
      subject: 'Alert: delivery rate drop detected',
      text: `Delivery rate in the last 24h (${(rate24h * 100).toFixed(1)}%) is notably below the 7-day average (${(rate7d * 100).toFixed(1)}%). Worth checking TimesMobile status.`,
    });
  }
}

module.exports = { notifyBdeAssignment, notifyTemplateStatus, checkDeliveryRateDrop };
