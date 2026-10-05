const db = require('../db/db');
const config = require('../config/config');

// Monday of the week containing `date` (YYYY-MM-DD in, YYYY-MM-DD out)
function mondayOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1 - day); // move back to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function firstOfMonth(dateStr) {
  return dateStr.slice(0, 7) + '-01';
}

// Delivered-message counts, grouped by campaign, within an optional date range
function deliveredByCampaign({ dateFrom, dateTo } = {}) {
  let q = `
    SELECT c.id as campaign_id, c.name, c.charter_granular, c.charter_rollup,
      COUNT(DISTINCT CASE WHEN me.event_type='delivered' THEN me.campaign_recipient_id END) as delivered_count
    FROM campaigns c
    LEFT JOIN campaign_recipients cr ON cr.campaign_id = c.id AND cr.is_test_send = 0
    LEFT JOIN message_events me ON me.campaign_recipient_id = cr.id
    WHERE 1=1
  `;
  const params = [];
  if (dateFrom) { q += ` AND (me.event_timestamp IS NULL OR date(me.event_timestamp) >= date(?))`; params.push(dateFrom); }
  if (dateTo) { q += ` AND (me.event_timestamp IS NULL OR date(me.event_timestamp) <= date(?))`; params.push(dateTo); }
  q += ' GROUP BY c.id ORDER BY c.created_at DESC';
  return db.prepare(q).all(...params).map((r) => ({
    ...r,
    delivered_count: r.delivered_count || 0,
    cost: (r.delivered_count || 0) * config.costPerDelivered,
  }));
}

function charterRollup({ dateFrom, dateTo } = {}) {
  const rows = deliveredByCampaign({ dateFrom, dateTo });
  const byCharter = {};
  for (const r of rows) {
    const key = r.charter_granular || 'Unknown';
    byCharter[key] = byCharter[key] || { delivered: 0, cost: 0 };
    byCharter[key].delivered += r.delivered_count;
    byCharter[key].cost += r.cost;
  }
  return byCharter;
}

function setBudget({ charter, periodType, periodStart, amount }) {
  db.prepare(`
    INSERT INTO budgets (charter, period_type, period_start, amount) VALUES (?, ?, ?, ?)
  `).run(charter || null, periodType, periodStart, amount);
}

function getLatestBudget({ charter, periodType, periodStart }) {
  const row = db.prepare(`
    SELECT * FROM budgets WHERE period_type = ? AND period_start = ? AND (charter = ? OR (charter IS NULL AND ? IS NULL))
    ORDER BY id DESC LIMIT 1
  `).get(periodType, periodStart, charter || null, charter || null);
  return row ? row.amount : null;
}

function weekWiseSpend({ weeksBack = 6 } = {}) {
  const rows = deliveredByCampaign({});
  // group by ISO week (Monday) using each campaign's delivered events' dates -
  // simplification: re-query per-recipient event dates directly for accuracy
  const perEvent = db.prepare(`
    SELECT c.charter_granular, date(me.event_timestamp) as d
    FROM message_events me
    JOIN campaign_recipients cr ON cr.id = me.campaign_recipient_id AND cr.is_test_send = 0
    JOIN campaigns c ON c.id = cr.campaign_id
    WHERE me.event_type = 'delivered'
  `).all();
  const byWeekCharter = {};
  for (const row of perEvent) {
    const week = mondayOf(row.d);
    const key = `${week}||${row.charter_granular || 'Unknown'}`;
    byWeekCharter[key] = (byWeekCharter[key] || 0) + 1;
  }
  return Object.entries(byWeekCharter).map(([key, count]) => {
    const [weekStart, charter] = key.split('||');
    return { weekStart, charter, delivered: count, cost: count * config.costPerDelivered };
  }).sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

module.exports = {
  mondayOf, firstOfMonth,
  deliveredByCampaign, charterRollup, setBudget, getLatestBudget, weekWiseSpend,
};
