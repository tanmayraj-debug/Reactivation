const db = require('../db/db');
const config = require('../config/config');
const emailService = require('../services/emailService');

// Runs daily. Finds planner entries due today, emails a reminder listing
// what needs to be created/tested/approved today, and marks them 'fired'
// so the reminder doesn't repeat. Actual campaign creation and the
// test-send + approve step still happen manually in the tool (per your
// requirement: every send still needs a fresh approval, even if planned
// weeks in advance).
async function runDailyPlannerCheck() {
  const today = new Date().toISOString().slice(0, 10);
  const due = db.prepare(`
    SELECT * FROM planner_entries WHERE planned_date = ? AND status = 'planned'
  `).all(today);

  if (!due.length) return { due: 0 };

  if (config.email.digestRecipients.length) {
    const lines = due.map((e) => `- ${e.charter_granular}: cohort "${e.cohort_name || e.cohort_list_id}", message #${e.message_id || '(unset)'}`);
    await emailService.sendEmail({
      to: config.email.digestRecipients.join(','),
      subject: `Campaigns due today (${today})`,
      text: `The following planned campaigns are due today:\n\n${lines.join('\n')}\n\nOpen the tool to create, test-send and approve each one.`,
    });
  }

  const markFired = db.prepare(`UPDATE planner_entries SET status = 'fired' WHERE id = ?`);
  for (const e of due) markFired.run(e.id);

  return { due: due.length };
}

module.exports = { runDailyPlannerCheck };
