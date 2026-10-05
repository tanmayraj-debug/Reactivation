const bcrypt = require('bcryptjs');
const db = require('../db/db');

function userCount() {
  return db.prepare('SELECT COUNT(*) as c FROM users').get().c;
}

function createUser({ email, password, name }) {
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)')
    .run(email.toLowerCase().trim(), hash, name || null);
  return { id: info.lastInsertRowid, email, name };
}

function verifyUser(email, password) {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) return null;
  if (!bcrypt.compareSync(password, user.password_hash)) return null;
  return { id: user.id, email: user.email, name: user.name };
}

function listUsers() {
  return db.prepare('SELECT id, email, name, created_at FROM users ORDER BY created_at').all();
}

function deleteUser(id) {
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}

module.exports = { userCount, createUser, verifyUser, listUsers, deleteUser, requireAuth };
