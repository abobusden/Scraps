const express = require('express');
const db = require('./db');
const { authMw } = require('./auth');
const router = express.Router();
const P = ['Пиксель','Лес','Пустыня','Город','Зима','Тигр','Зебра','Леопард','Змея','Дерево'];
const PC = ['#6a8','#3a6b35','#d2b46a','#667','#dfe9f2','#e08a2b','#ddd','#c9a24a','#4d7a3c','#7a5230'];
const T = ['Пламя','Лёд','Кровь','Ржавчина','Неон','Кибер','Токсик','Кости','Дракон','Космос'];
const TC = ['#ff5a1f','#8fe3ff','#a0121c','#a0522d','#39ff14','#00e5ff','#9bff3a','#e8e2cf','#b01fd0','#3b2a8c'];
const skins = [];
P.forEach((n, i) => skins.push({ id: 'p' + i, name: n, type: 'pattern', rarity: 'rare', color: PC[i], price: 500 }));
T.forEach((n, i) => skins.push({ id: 't' + i, name: n, type: 'theme', rarity: 'epic', color: TC[i], emissive: TC[i], price: 700 }));
[['Золото', '#ffd34d'], ['Серебро', '#cfd6dd'], ['Бронза', '#b87333']].forEach(([n, c], i) => skins.push({ id: 'm' + i, name: n, type: 'metal', rarity: 'epic', color: c, price: 800 }));
[['Радуга', '#ff66cc', 0.1], ['Голограмма', '#66ffee', 0.3], ['Кровавая луна', '#b0001a', 0.5], ['Ледяной дракон', '#9fe8ff', 0.3], ['Проклятие', '#6d00a8', 0.5], ['Ангел', '#fff6c4', 0.2], ['Демон', '#ff2200', 0.2]]
  .forEach(([n, c, ch], i) => skins.push({ id: 'r' + i, name: n, type: 'rare', rarity: 'legendary', color: c, emissive: c, price: 0, chance: ch }));
const byId = Object.fromEntries(skins.map(s => [s.id, s]));
const CASE_PRICE = 200;
db.prepare('DELETE FROM shop_items').run();
const ins = db.prepare('INSERT INTO shop_items(type,skin_id,price) VALUES(?,?,?)');
ins.run('case', null, CASE_PRICE); skins.filter(s => s.price).forEach(s => ins.run('skin', s.id, s.price));

const owned = uid => db.prepare('SELECT skin_id,active FROM user_skins WHERE user_id=?').all(uid);
const cases = uid => (db.prepare('SELECT count FROM user_cases WHERE user_id=?').get(uid) || { count: 0 }).count;
const addCases = (uid, n) => db.prepare('INSERT INTO user_cases(user_id,count) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET count=count+?').run(uid, n, n);
const unlock = (uid, sid) => db.prepare('INSERT OR IGNORE INTO user_skins(user_id,skin_id,active) VALUES(?,?,0)').run(uid, sid).changes > 0;
const balance = uid => db.prepare('SELECT scrap FROM users WHERE id=?').get(uid).scrap;
const addScrap = (uid, n) => db.prepare('UPDATE users SET scrap=scrap+? WHERE id=?').run(n, uid);
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const pend = (uid, id, c) => db.prepare('INSERT INTO pending_items(user_id,item_id,count) VALUES(?,?,?)').run(uid, id, c);

function rollCase(uid) {
  const r = Math.random() * 100, res = { rewards: [] };
  const patt = skins.filter(s => s.type === 'pattern' || s.type === 'metal'), theme = skins.filter(s => s.type === 'theme');
  const giveSkin = s => { const fresh = unlock(uid, s.id); res.skin = s; if (!fresh) { addScrap(uid, 100); res.rewards.push('Дубликат скина: +100 скрапа'); } };
  if (r < 50) { res.rarity = 'common'; const n = rnd(10, 50); addScrap(uid, n); res.rewards.push(`+${n} скрапа`); }
  else if (r < 80) { res.rarity = 'uncommon'; const n = rnd(50, 100), m = rnd(10, 40); addScrap(uid, n); pend(uid, 'metal', m); res.rewards.push(`+${n} скрапа`, `+${m} металла (выдастся в игре)`); }
  else if (r < 95) { res.rarity = 'rare'; const n = rnd(100, 200); addScrap(uid, n); giveSkin(pick(patt)); res.rewards.push(`+${n} скрапа`); }
  else if (r < 99) { res.rarity = 'epic'; const n = rnd(200, 500); addScrap(uid, n); giveSkin(pick(theme)); const w = pick(['pistol', 'shotgun', 'metal_axe']); pend(uid, w, 1); res.rewards.push(`+${n} скрапа`, 'Оружие/инструмент (выдастся в игре)'); }
  else { res.rarity = 'legendary'; const n = rnd(500, 1000); addScrap(uid, n); giveSkin(pick(skins.filter(s => s.type === 'rare'))); res.rewards.push(`+${n} скрапа`); }
  return res;
}
router.use(authMw);
router.get('/catalog', (req, res) => res.json({ skins, casePrice: CASE_PRICE, balance: balance(req.user.id), cases: cases(req.user.id), owned: owned(req.user.id) }));
router.post('/buy-case', (req, res) => {
  const n = Math.max(1, Math.min(10, +req.body.count || 1));
  if (balance(req.user.id) < CASE_PRICE * n) return res.status(400).json({ error: 'Не хватает скрапа' });
  addScrap(req.user.id, -CASE_PRICE * n); addCases(req.user.id, n); res.json({ ok: true });
});
router.post('/buy-skin', (req, res) => {
  const s = byId[req.body.id];
  if (!s || !s.price) return res.status(400).json({ error: 'Этот скин нельзя купить' });
  if (owned(req.user.id).some(o => o.skin_id === s.id)) return res.status(400).json({ error: 'Скин уже есть' });
  if (balance(req.user.id) < s.price) return res.status(400).json({ error: 'Не хватает скрапа' });
  addScrap(req.user.id, -s.price); unlock(req.user.id, s.id); res.json({ ok: true });
});
router.post('/open-case', (req, res) => {
  if (cases(req.user.id) < 1) return res.status(400).json({ error: 'Нет кейсов' });
  db.prepare('UPDATE user_cases SET count=count-1 WHERE user_id=?').run(req.user.id);
  res.json(rollCase(req.user.id));
});
router.post('/apply-skin', (req, res) => {
  const uid = req.user.id; db.prepare('UPDATE user_skins SET active=0 WHERE user_id=?').run(uid);
  if (req.body.id) { if (!owned(uid).some(o => o.skin_id === req.body.id)) return res.status(400).json({ error: 'Скин не разблокирован' }); db.prepare('UPDATE user_skins SET active=1 WHERE user_id=? AND skin_id=?').run(uid, req.body.id); }
  res.json({ ok: true });
});
module.exports = { router, skins, byId, unlock, addCases };
