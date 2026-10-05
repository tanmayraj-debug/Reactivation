const express = require('express');
const router = express.Router();
const { requireAuth } = require('../services/authService');
const claude = require('../adapters/claude');
const budgetService = require('../services/budgetService');
const config = require('../config/config');

router.use(requireAuth);

router.post('/suggest-calendar', async (req, res) => {
  const { constraint } = req.body; // e.g. "only the 1st or 2nd of the month"
  if (!constraint) return res.status(400).json({ error: 'constraint is required' });
  try {
    const rollup = budgetService.charterRollup({});
    const summaryLines = Object.entries(rollup).map(([charter, d]) => `${charter}: delivered=${d.delivered}, cost=₹${d.cost.toFixed(2)}`);
    const suggestion = await claude.suggestCalendar({
      constraint,
      pastCampaignsSummary: summaryLines.join('\n'),
      charters: config.charters.granular,
    });
    res.json({ suggestion });
  } catch (err) {
    res.status(502).json({ error: 'Claude API call failed', detail: err.message });
  }
});

module.exports = router;
