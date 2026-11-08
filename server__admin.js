const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { authMw } = require('./auth');
const router = express.Router();
function logAdmin(p, action, targetId) { db.prepare('INSERT INTO admin_logs(admin_id,action,target_id,timestamp) VALUES(?,?,?,?)').run(p.uid, action, targetId || null, Date.now()); }
function setMode(p, mode, val) {
  const f = p.flags;
  if (mode === 'noclip') { f.noclip = val; if (val) f.fly = true; } else f[mode] = val;
  logAdmin(p, `${mode}:${val ? 'on' : 'off'}`, p.uid);
}
function adminOff(p) { p.flags.fly = p.flags.noclip = p.flags.god = false; logAdmin(p, 'adminoff', p.uid); }
const last = new Map();
router.post('/report', authMw, (req, res) => {
  const now = Date.now(), prev = last.get(req.user.id) || 0;
  if (now - prev < 300000) return res.status(429).json({ error: `Репорт можно отправлять раз в 5 минут (ещё ${Math.ceil((300000 - (now - prev)) / 1000)} с)` });
  const { theme, text, screenshot } = req.body || {};
  if (!['Баг', 'Читер', 'Оскорбления', 'Другое'].includes(theme)) return res.status(400).json({ error: 'Выберите тему' });
  if (typeof text !== 'string' || !text.trim() || text.length > 500) return res.status(400).json({ error: 'Описание: 1–500 символов' });
  let sp = null;
  if (typeof screenshot === 'string' && screenshot.startsWith('data:image/')) {
    const dir = path.join(__dirname, 'uploads'); fs.mkdirSync(dir, { recursive: true });
    sp = `report_${now}_${req.user.id}.png`; fs.writeFileSync(path.join(dir, sp), Buffer.from(screenshot.split(',')[1] || '', 'base64'));
  }
  db.prepare('INSERT INTO reports(from_user_id,theme,text,screenshot_path,created_at) VALUES(?,?,?,?,?)').run(req.user.id, theme, text.trim(), sp, now);
  last.set(req.user.id, now); res.json({ ok: true });
});
module.exports = { router, logAdmin, setMode, adminOff };
