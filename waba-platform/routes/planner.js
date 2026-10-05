const express = require('express');
const router = express.Router();
const db = require('../db/db');
const { requireAuth } = require('../services/authService');

router.use(requireAuth);

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM planner_entries ORDER BY planned_date').all());
});

router.post('/', (req, res) => {
  const { plannedDate, cohortListId, cohortName, messageId, charterGranular, charterRollup } = req.body;
  if (!plannedDate || !cohortListId || !charterGranular) {
    return res.status(400).json({ error: 'plannedDate, cohortListId, charterGranular are required' });
  }
  const info = db.prepare(`
    INSERT INTO planner_entries (planned_date, cohort_list_id, cohort_name, message_id, charter_granular, charter_rollup, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(plannedDate, cohortListId, cohortName || null, messageId || null, charterGranular, charterRollup || null, req.session.userId);
  res.status(201).json(db.prepare('SELECT * FROM planner_entries WHERE id = ?').get(info.lastInsertRowid));
});

router.delete('/:id', (req, res) => {
  db.prepare("DELETE FROM planner_entries WHERE id = ? AND status = 'planned'").run(req.params.id);
  res.json({ ok: true });
});

// Weekly digest archive
router.get('/digests', (req, res) => {
  res.json(db.prepare('SELECT * FROM digest_archive ORDER BY week_start DESC').all());
});

router.get('/digests/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM digest_archive WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json({ ...row, data: JSON.parse(row.data_json) });
});

module.exports = router;
