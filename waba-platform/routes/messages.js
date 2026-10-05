const express = require('express');
const router = express.Router();
const db = require('../db/db');
const { requireAuth } = require('../services/authService');
const claude = require('../adapters/claude');

router.use(requireAuth);

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM messages ORDER BY created_at DESC').all());
});

router.post('/', (req, res) => {
  const { body, headerType, headerContent, footer, buttons } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'Message body is required' });
  const info = db.prepare(`
    INSERT INTO messages (body, header_type, header_content, footer, buttons_json, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(body, headerType || null, headerContent || null, footer || null, JSON.stringify(buttons || []), req.session.userId);
  res.status(201).json(db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid));
});

// AI drafting (Page 8): generate a message body from a prompt
router.post('/generate', async (req, res) => {
  const { prompt, charter } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });
  try {
    const draft = await claude.draftMessage({ prompt, charter });
    res.json({ draft });
  } catch (err) {
    res.status(502).json({ error: 'Claude API call failed', detail: err.message });
  }
});

// Content playbook management (Page 8) - paste once, stored as reference
router.get('/playbook', (req, res) => {
  const row = db.prepare('SELECT * FROM content_playbook ORDER BY id DESC LIMIT 1').get();
  res.json(row || { content_text: '' });
});

router.post('/playbook', (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'content is required' });
  db.prepare('INSERT INTO content_playbook (content_text) VALUES (?)').run(content);
  res.json({ ok: true });
});

module.exports = router;
