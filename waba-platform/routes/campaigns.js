const express = require('express');
const router = express.Router();
const { requireAuth } = require('../services/authService');
const campaignService = require('../services/campaignService');
const funnelService = require('../services/funnelService');

router.use(requireAuth);

router.get('/', (req, res) => {
  const { charter, search } = req.query;
  res.json(campaignService.listCampaigns({ charter, search }));
});

router.get('/:id', (req, res) => {
  const c = campaignService.getCampaign(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  res.json(c);
});

router.get('/:id/funnel', (req, res) => {
  res.json(funnelService.computeFunnelForCampaign(req.params.id));
});

router.post('/', (req, res) => {
  const { name, templateId, messageId, cohortListId, cohortName, charterGranular, charterRollup, scheduledDate, sendComponents } = req.body;
  if (!name || !templateId || !cohortListId || !charterGranular) {
    return res.status(400).json({ error: 'name, templateId, cohortListId and charterGranular are required' });
  }
  const campaign = campaignService.createDraftCampaign({
    name, templateId, messageId, cohortListId, cohortName, charterGranular, charterRollup, scheduledDate, sendComponents,
    userId: req.session.userId,
  });
  res.status(201).json(campaign);
});

router.post('/:id/send-test', async (req, res) => {
  try {
    const result = await campaignService.sendTest(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/reject', async (req, res) => {
  res.json(await campaignService.reject(req.params.id));
});

router.post('/:id/approve-and-launch', async (req, res) => {
  try {
    const result = await campaignService.approveAndLaunch(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
