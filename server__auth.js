const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const router = express.Router();
const sign = u => jwt.sign({ uid: u.id }, JWT_SECRET, { expiresIn: '7d' });
function verifyToken(t) { try { return jwt.verify(t, JWT_SECRET); } catch { return null; } }
function authMw(req, res, next) {
  const h = req.headers.authorization || '';
  const p = verifyToken(h.replace('Bearer ', ''));
  if (!p) return res.status(401).json({ error: 'Требуется вход в аккаунт' });
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(p.uid);
  if (!u) return res.status(401).json({ error: 'Аккаунт не найден' });
  if (u.banned) return res.status(403).json({ error: 'Аккаунт заблокирован: ' + (u.ban_reason || '') });
  req.user = u; next();
}
const pub = u => ({ id: u.id, login: u.login, isAdmin: !!u.isAdmin, created_at: u.created_at });
router.post('/register', (req, res) => {
  const { login, password } = req.body || {};
  if (typeof login !== 'string' || !/^[A-Za-z0-9_]{3,16}$/.test(login)) return res.status(400).json({ error: 'Логин: 3–16 символов, буквы, цифры и _' });
  if (typeof password !== 'string' || password.length < 6) return res.status(400).json({ error: 'Пароль — минимум 6 символов' });
  if (db.prepare('SELECT 1 FROM users WHERE login=?').get(login)) return res.status(409).json({ error: 'Этот логин уже занят' });
  const r = db.prepare('INSERT INTO users(login,password_hash,created_at) VALUES(?,?,?)').run(login, bcrypt.hashSync(password, 10), Date.now());
  db.prepare('INSERT OR IGNORE INTO players(user_id) VALUES(?)').run(r.lastInsertRowid);
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(r.lastInsertRowid);
  res.json({ token: sign(u), user: pub(u) });
});
router.post('/login', (req, res) => {
  const { login, password } = req.body || {};
  const u = typeof login === 'string' && db.prepare('SELECT * FROM users WHERE login=?').get(login);
  if (!u || typeof password !== 'string' || !bcrypt.compareSync(password, u.password_hash)) return res.status(401).json({ error: 'Неверный логин или пароль' });
  if (u.banned) return res.status(403).json({ error: 'Аккаунт заблокирован: ' + (u.ban_reason || '') });
  res.json({ token: sign(u), user: pub(u) });
});
router.post('/change-password', authMw, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!bcrypt.compareSync(String(oldPassword || ''), req.user.password_hash)) return res.status(400).json({ error: 'Старый пароль неверен' });
  if (typeof newPassword !== 'string' || newPassword.length < 6) return res.status(400).json({ error: 'Новый пароль — минимум 6 символов' });
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(newPassword, 10), req.user.id);
  res.json({ ok: true });
});
router.get('/me', authMw, (req, res) => {
  const p = db.prepare('SELECT * FROM players WHERE user_id=?').get(req.user.id) || {};
  const builds = db.prepare('SELECT COUNT(*) c FROM buildings WHERE owner_id=?').get(req.user.id).c;
  res.json({ user: pub(req.user), stats: { kills: p.kills || 0, deaths: p.deaths || 0, playtime: p.playtime || 0, builds, crafts: p.crafts || 0 } });
});
module.exports = { router, authMw, verifyToken, JWT_SECRET };
