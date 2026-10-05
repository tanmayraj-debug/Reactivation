const express = require('express');
const router = express.Router();
const { requireAuth } = require('../services/authService');
const budgetService = require('../services/budgetService');
const config = require('../config/config');

router.use(requireAuth);

router.get('/campaigns', (req, res) => {
  const { dateFrom, dateTo } = req.query;
  res.json(budgetService.deliveredByCampaign({ dateFrom, dateTo }));
});

router.get('/by-charter', (req, res) => {
  const { dateFrom, dateTo } = req.query;
  const rollup = budgetService.charterRollup({ dateFrom, dateTo });
  const withBudgets = {};
  for (const [charter, data] of Object.entries(rollup)) {
    const weekBudget = budgetService.getLatestBudget({ charter, periodType: 'week', periodStart: budgetService.mondayOf(new Date().toISOString().slice(0, 10)) });
    const monthBudget = budgetService.getLatestBudget({ charter, periodType: 'month', periodStart: budgetService.firstOfMonth(new Date().toISOString().slice(0, 10)) });
    withBudgets[charter] = { ...data, weekBudget, monthBudget, overWeekBudget: weekBudget !== null && data.cost > weekBudget, overMonthBudget: monthBudget !== null && data.cost > monthBudget };
  }
  res.json(withBudgets);
});

router.get('/week-wise', (req, res) => {
  res.json(budgetService.weekWiseSpend());
});

router.post('/set', (req, res) => {
  const { charter, periodType, periodStart, amount } = req.body;
  if (!periodType || !periodStart || amount === undefined) {
    return res.status(400).json({ error: 'periodType, periodStart, amount are required (charter optional - omit for overall cap)' });
  }
  budgetService.setBudget({ charter: charter || null, periodType, periodStart, amount });
  res.json({ ok: true });
});

router.get('/cost-per-delivered', (req, res) => {
  res.json({ costPerDelivered: config.costPerDelivered });
});

module.exports = router;
