const db = require('../db/db');
const config = require('../config/config');
const funnelService = require('../services/funnelService');
const budgetService = require('../services/budgetService');
const emailService = require('../services/emailService');

// Runs every Monday. Computes charter-wise funnel + spend for the past
// week (Mon-Sun just ended), archives it, and emails it out.
async function runWeeklyDigest() {
  const today = new Date();
  const thisMonday = budgetService.mondayOf(today.toISOString().slice(0, 10));
  const lastMonday = new Date(thisMonday); lastMonday.setDate(lastMonday.getDate() - 7);
  const lastSunday = new Date(thisMonday); lastSunday.setDate(lastSunday.getDate() - 1);

  const weekStart = lastMonday.toISOString().slice(0, 10);
  const weekEnd = lastSunday.toISOString().slice(0, 10);

  const funnelByCharter = funnelService.computeFunnelByCharter({
    charters: config.charters.granular, dateFrom: weekStart, dateTo: weekEnd,
  });
  const spendByCharter = budgetService.charterRollup({ dateFrom: weekStart, dateTo: weekEnd });

  const data = { weekStart, weekEnd, funnelByCharter, spendByCharter };

  db.prepare(`
    INSERT INTO digest_archive (week_start, week_end, data_json) VALUES (?, ?, ?)
  `).run(weekStart, weekEnd, JSON.stringify(data));

  if (config.email.digestRecipients.length) {
    const rows = Object.keys(funnelByCharter).map((charter) => {
      const f = funnelByCharter[charter];
      const s = spendByCharter[charter] || { delivered: 0, cost: 0 };
      return `${charter}: sent=${f.sent}, delivered=${f.delivered}, read=${f.read}, clicked=${f.clicked}, assigned=${f.assigned}, rfd=${f.rfd} | spend=₹${s.cost.toFixed(2)}`;
    });
    await emailService.sendEmail({
      to: config.email.digestRecipients.join(','),
      subject: `Weekly digest: ${weekStart} to ${weekEnd}`,
      text: `Charter-wise funnel and spend for last week:\n\n${rows.join('\n')}\n\nFull detail is archived in the tool under Planner > Digests.`,
    });
  }

  return data;
}

module.exports = { runWeeklyDigest };
