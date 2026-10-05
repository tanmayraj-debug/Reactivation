const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const db = require('../db/db');
const { requireAuth } = require('../services/authService');
const timesMobile = require('../adapters/timesmobile');

router.use(requireAuth);

const upload = multer({ dest: path.join(__dirname, '..', 'uploads') });

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM templates ORDER BY created_at DESC').all());
});

router.get('/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  res.json(t);
});

// Upload media for a template header (image/video/document) -> returns file_handler
router.post('/upload-media', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required' });
  try {
    const result = await timesMobile.uploadTemplateMedia(req.file.path);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: 'TimesMobile media upload failed', detail: err.message });
  }
});

// Submit a new template for WABA approval
router.post('/', async (req, res) => {
  const { messageId, name, language, category, components } = req.body;
  if (!name || !category || !components) {
    return res.status(400).json({ error: 'name, category and components are required' });
  }
  try {
    const result = await timesMobile.createTemplate({ name, language: language || 'en', category, components });
    const status = result.res_json && result.res_json.status === 'submitted' ? 'submitted' : 'submitted';
    const info = db.prepare(`
      INSERT INTO templates (message_id, name, category, language, components_json, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(messageId || null, name, category, language || 'en', JSON.stringify(components), status);
    res.status(201).json(db.prepare('SELECT * FROM templates WHERE id = ?').get(info.lastInsertRowid));
  } catch (err) {
    res.status(502).json({ error: 'TimesMobile template creation failed', detail: err.response ? err.response.data : err.message });
  }
});

// Manually re-check status against TimesMobile (fallback if webhook is missed)
router.post('/:id/refresh-status', async (req, res) => {
  const t = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  try {
    const result = await timesMobile.getTemplateByName(t.name);
    const remote = result.res_json;
    if (remote && remote.status) {
      db.prepare(`
        UPDATE templates SET status = ?, timesmobile_template_id = ?, rejected_reason = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        remote.status === 'approved' ? 'approved' : remote.status === 'rejected' ? 'rejected' : t.status,
        remote.whatsapp_template_id || t.timesmobile_template_id,
        remote.rejected_reason && remote.rejected_reason !== 'NONE' ? remote.rejected_reason : null,
        t.id
      );
    }
    res.json(db.prepare('SELECT * FROM templates WHERE id = ?').get(t.id));
  } catch (err) {
    res.status(502).json({ error: 'Could not refresh from TimesMobile', detail: err.message });
  }
});

module.exports = router;
