const express = require('express');
const router = express.Router();
const { requireAuth } = require('../services/authService');
const assignmentService = require('../services/assignmentService');
const lsq = require('../adapters/leadsquared');

router.use(requireAuth);

// Re-run qualification checks (clicks/form-fill/fast-conversion) against the event log
router.post('/recompute', (req, res) => {
  res.json(assignmentService.runAllQualificationChecks());
});

router.get('/campaign/:id', (req, res) => {
  res.json(assignmentService.listQualifiedLeadsForCampaign(req.params.id));
});

router.get('/bdes', async (req, res) => {
  try {
    const result = await lsq.getUsers();
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: 'Could not fetch users from LSQ', detail: err.message });
  }
});

router.post('/assign', async (req, res) => {
  const { leadIds, bdeEmail } = req.body;
  if (!Array.isArray(leadIds) || !leadIds.length || !bdeEmail) {
    return res.status(400).json({ error: 'leadIds (array) and bdeEmail are required' });
  }
  const results = [];
  for (const leadId of leadIds) {
    try {
      await assignmentService.assignLeadToBde(leadId, bdeEmail, req.session.userId);
      results.push({ leadId, ok: true });
    } catch (err) {
      results.push({ leadId, ok: false, error: err.message });
    }
  }
  res.json({ results });
});

module.exports = router;
