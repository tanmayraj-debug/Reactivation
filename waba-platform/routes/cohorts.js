const express = require('express');
const router = express.Router();
const { requireAuth } = require('../services/authService');
const lsq = require('../adapters/leadsquared');
const db = require('../db/db');

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const result = await lsq.listCohorts();
    db.prepare(`
      INSERT INTO sync_status (source, last_synced_at, last_error) VALUES ('lsq', datetime('now'), NULL)
      ON CONFLICT(source) DO UPDATE SET last_synced_at = datetime('now'), last_error = NULL
    `).run();
    res.json(result);
  } catch (err) {
    db.prepare(`
      INSERT INTO sync_status (source, last_synced_at, last_error) VALUES ('lsq', datetime('now'), ?)
      ON CONFLICT(source) DO UPDATE SET last_error = ?
    `).run(err.message, err.message);
    res.status(502).json({ error: 'Could not fetch cohorts from LSQ', detail: err.message });
  }
});

module.exports = router;
