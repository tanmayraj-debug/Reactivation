const express = require('express');
const router = express.Router();
const authService = require('../services/authService');

// First-run bootstrap: if no users exist yet, allow creating the first one without auth
router.post('/bootstrap', (req, res) => {
  if (authService.userCount() > 0) return res.status(403).json({ error: 'Already bootstrapped - use /invite while logged in' });
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const user = authService.createUser({ email, password, name });
  req.session.userId = user.id;
  res.json({ ok: true, user });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = authService.verifyUser(email, password);
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });
  req.session.userId = user.id;
  res.json({ ok: true, user });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  res.json({ ok: true, userId: req.session.userId });
});

// Admin: invite/add a user (any logged-in user can, per binary-access design)
router.post('/invite', authService.requireAuth, (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  try {
    const user = authService.createUser({ email, password, name });
    res.json({ ok: true, user });
  } catch (e) {
    res.status(400).json({ error: 'Could not create user - email may already exist' });
  }
});

router.get('/users', authService.requireAuth, (req, res) => {
  res.json(authService.listUsers());
});

router.delete('/users/:id', authService.requireAuth, (req, res) => {
  authService.deleteUser(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
