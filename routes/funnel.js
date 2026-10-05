const express = require('express');
const router = express.Router();
const { requireAuth } = require('../services/authService');
const funnelService = require('../services/funnelService');
const budgetService = require('../services/budgetService');
const db = require('../db/db');
const config = require('../config/config');

router.use(requireAuth);

// Page 1: main preview - roll-up charters
router.get('/rollup', (req, res) => {
  const { charters, dateFrom, dateTo } = req.query;
  const list = charters ? charters.split(',') : config.charters.rollup;
  res.json(funnelService.computeFunnel({ charters: list, dateFrom, dateTo }));
});

// Page 2: charter-wise (granular), one funnel per charter
router.get('/by-charter', (req, res) => {
  const { charters, dateFrom, dateTo } = req.query;
  const list = charters ? charters.split(',') : config.charters.granular;
  res.json(funnelService.computeFunnelByCharter({ charters: list, dateFrom, dateTo }));
});

// Page 3: deep-dive - month-over-month comparison + RFD-by-BDE + live pipeline by BDE
router.get('/deep-dive', (req, res) => {
  const { charter, dateFrom, dateTo } = req.query;
  if (!charter || !dateFrom || !dateTo) return res.status(400).json({ error: 'charter, dateFrom, dateTo are required' });

  const current = funnelService.computeFunnel({ charters: [charter], dateFrom, dateTo });

  // Same day-range, previous month
  const from = new Date(dateFrom); from.setMonth(from.getMonth() - 1);
  const to = new Date(dateTo); to.setMonth(to.getMonth() - 1);
  const previous = funnelService.computeFunnel({
    charters: [charter], dateFrom: from.toISOString().slice(0, 10), dateTo: to.toISOString().slice(0, 10),
  });

  // Section B: RFD in range, by BDE (using qualified_leads.assigned_bde_email + stage events)
  const rfdByBde = db.prepare(`
    SELECT ql.assigned_bde_email as bde, COUNT(DISTINCT ql.lead_id) as rfd_count
    FROM qualified_leads ql
    JOIN lsq_stage_events se ON se.lead_id = ql.lead_id AND se.new_stage = 'Ready For Disbursal'
    WHERE ql.campaign_id IN (${current._campaignIds.length ? current._campaignIds.map(() => '?').join(',') : 'NULL'})
      AND date(se.changed_at) BETWEEN date(?) AND date(?)
    GROUP BY ql.assigned_bde_email
  `).all(...current._campaignIds, dateFrom, dateTo);

  // Section C: live pipeline by BDE (current stage = Prospect/Session Scheduled/Session Done)
  const pipelineByBde = db.prepare(`
    SELECT ql.assigned_bde_email as bde, latest.new_stage as stage, COUNT(*) as c
    FROM qualified_leads ql
    JOIN (
      SELECT lead_id, new_stage, ROW_NUMBER() OVER (PARTITION BY lead_id ORDER BY changed_at DESC) as rn
      FROM lsq_stage_events
    ) latest ON latest.lead_id = ql.lead_id AND latest.rn = 1
    WHERE ql.campaign_id IN (${current._campaignIds.length ? current._campaignIds.map(() => '?').join(',') : 'NULL'})
      AND latest.new_stage IN ('Prospect', 'Session Scheduled', 'Session Done')
    GROUP BY ql.assigned_bde_email, latest.new_stage
  `).all(...current._campaignIds, ...current._campaignIds);

  res.json({ current, previous, rfdByBde, pipelineByBde });
});

// Page 7: campaign search + comparison
router.get('/campaign/:id', (req, res) => {
  res.json(funnelService.computeFunnelForCampaign(req.params.id));
});

module.exports = router;
