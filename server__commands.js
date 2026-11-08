// Обработка команд, начинающихся с «/». Ответ — только автору (кроме /say /broadcast /me).
const ALIAS = { 'калаш': 'ak', 'винтовка': 'rifle', 'дробовик': 'shotgun', 'пистолет': 'pistol', 'патроны': 'ammo', 'дерево': 'wood', 'камень': 'stone', 'металл': 'metal', 'скрап': 'scrap', 'ткань': 'cloth', 'кожа': 'leather', 'сера': 'sulfur', 'уголь': 'charcoal', 'порох': 'gunpowder', 'топор': 'metal_axe', 'кирка': 'metal_pickaxe', 'нож': 'combat_knife', 'копьё': 'metal_spear', 'копье': 'metal_spear', 'лук': 'bow', 'стрелы': 'arrows', 'граната': 'grenade', 'взрывчатка': 'c4', 'шлем': 'metal_helmet', 'нагрудник': 'metal_chest', 'штаны': 'metal_pants', 'рюкзак': 'backpack', 'дробь': 'shells', 'бинт': 'bandage', 'аптечка': 'medkit', 'факел': 'torch', 'молот': 'hammer', 'мачете': 'machete' };
const USER = ['help', 'players', 'ping', 'report', 'stats', 'coords', 'suicide', 'clear', 'roll', 'msg', 'r', 'me'];
const ADMIN = ['kick', 'mute', 'unmute', 'ban', 'banip', 'unban', 'tp', 'tphere', 'give', 'giveme', 'heal', 'kill', 'god', 'fly', 'noclip', 'adminoff', 'time', 'weather', 'spawn', 'online', 'say', 'broadcast', 'reports', 'reportclose', 'save', 'restart', 'wipe'];
module.exports = function run(api, p, text) {
  const { db, sys, find, G, I } = api; const parts = text.slice(1).trim().split(/\s+/); const cmd = (parts.shift() || '').toLowerCase(); const a = parts; const rest = a.join(' ');
  const say = (m) => sys(p, m);
  if (!cmd) return;
  const isAdminCmd = ADMIN.includes(cmd);
  if (isAdminCmd && !p.isAdmin) return say('Неизвестная команда. /help');
  if (!isAdminCmd && !USER.includes(cmd)) return say('Неизвестная команда. /help');
  const target = (n) => { const t = find(n); if (!t) say('Игрок не найден или не в сети: ' + (n || '')); return t; };
  const item = (name) => { const k = String(name || '').toLowerCase(); if (ALIAS[k]) return ALIAS[k]; if (I[k]) return k; return Object.keys(I).find(id => I[id].n.toLowerCase() === k.replace(/_/g, ' ')) || null; };
  const log = (act, t) => api.admin.logAdmin(p, `${cmd} ${rest}`.slice(0, 120), t && t.uid);
  const giveTo = (t, name, cnt) => {
    cnt = Math.max(1, Math.min(100000, parseInt(cnt) || 1)); const k = String(name || '').toLowerCase();
    if (k === 'кейс') { api.shop.addCases(t.uid, cnt); return `Выдано: кейс x${cnt} (в меню → инвентарь)`; }
    if (k === 'броня') { ['metal_helmet', 'metal_chest', 'metal_pants'].forEach(i => api.addItem(t, i, 1)); api.sendSelf(t); return 'Выдан комплект металлической брони'; }
    if (k.startsWith('скин_')) { const nm = k.slice(5).replace(/_/g, ' '); const s = api.shop.skins.find(x => x.name.toLowerCase() === nm); if (!s) return 'Скин не найден'; api.shop.unlock(t.uid, s.id); return `Скин «${s.name}» разблокирован`; }
    const id = item(k); if (!id) return 'Неизвестный предмет: ' + name;
    api.addItem(t, id, cnt); api.sendSelf(t); return `Выдано: ${I[id].n} x${cnt}`;
  };
  switch (cmd) {
    case 'help': {
      say('Команды: /help /players /ping /report ник причина /stats [ник] /coords /suicide /clear /roll /msg ник текст /r текст /me действие');
      if (p.isAdmin) say('Админ: ' + ADMIN.map(c => '/' + c).join(' ')); break;
    }
    case 'players': say(`Онлайн (${G.players.size}): ` + [...G.players.values()].map(q => q.name).join(', ')); break;
    case 'ping': say(`Пинг: ${p.ping} мс`); break;
    case 'report': {
      const t = db.prepare('SELECT id FROM users WHERE login=?').get(a[0] || ''); if (!t || a.length < 2) return say('Использование: /report ник причина');
      db.prepare('INSERT INTO reports(from_user_id,to_user_id,theme,text,created_at) VALUES(?,?,?,?,?)').run(p.uid, t.id, 'Игрок', a.slice(1).join(' ').slice(0, 500), Date.now()); say('Репорт отправлен'); break;
    }
    case 'stats': {
      const u = a[0] ? db.prepare('SELECT id,login FROM users WHERE login=?').get(a[0]) : { id: p.uid, login: p.name }; if (!u) return say('Игрок не найден');
      const s = db.prepare('SELECT * FROM players WHERE user_id=?').get(u.id) || {}; const kd = s.deaths ? (s.kills / s.deaths).toFixed(2) : (s.kills || 0);
      say(`${u.login}: убийств ${s.kills || 0}, смертей ${s.deaths || 0}, K/D ${kd}, время ${Math.floor((s.playtime || 0) / 60)} мин`); break;
    }
    case 'coords': say(`X ${p.x.toFixed(1)}  Y ${p.y.toFixed(1)}  Z ${p.z.toFixed(1)}`); break;
    case 'suicide': api.die(p, null, 'суицид'); break;
    case 'clear': p.socket.emit('chat:clear'); break;
    case 'roll': say(`Вы выбросили: ${1 + Math.floor(Math.random() * 100)} (1–100)`); break;
    case 'msg': { const t = target(a[0]); if (!t) return; const m = a.slice(1).join(' '); if (!m) return say('Использование: /msg ник текст'); t.socket.emit('chat:system', { text: `[ЛС от ${p.name}] ${m}`, private: true }); t.lastMsgFrom = p; say(`[ЛС для ${t.name}] ${m}`); break; }
    case 'r': { const t = p.lastMsgFrom; if (!t || !G.players.has(t.socket.id)) return say('Некому отвечать'); if (!rest) return say('Использование: /r текст'); t.socket.emit('chat:system', { text: `[ЛС от ${p.name}] ${rest}`, private: true }); t.lastMsgFrom = p; say(`[ЛС для ${t.name}] ${rest}`); break; }
    case 'me': if (!rest) return say('Использование: /me действие'); api.sysAll(`* ${p.name} ${rest}`); break;
    // ----- админ -----
    case 'kick': { const t = target(a[0]); if (!t) return; t.socket.emit('kicked', a.slice(1).join(' ') || 'Без причины'); log('kick', t); api.savePlayer(t); api.removePlayer(t); t.socket.disconnect(true); say(`${t.name} кикнут`); break; }
    case 'mute': { const t = target(a[0]); if (!t) return; const m = parseFloat(a[1]) || 5; api.muted.set(t.uid, Date.now() + m * 60000); t.socket.emit('chat:mute', { sec: Math.round(m * 60) }); log('mute', t); say(`${t.name} заглушен на ${m} мин`); break; }
    case 'unmute': { const t = target(a[0]); if (!t) return; api.muted.delete(t.uid); log('unmute', t); say('Мут снят'); break; }
    case 'ban': { const u = db.prepare('SELECT id,login FROM users WHERE login=?').get(a[0] || ''); if (!u) return say('Аккаунт не найден'); db.prepare('UPDATE users SET banned=1,ban_reason=? WHERE id=?').run(a.slice(1).join(' ') || 'Без причины', u.id); const t = find(u.login); if (t) { t.socket.emit('kicked', 'Вы заблокированы'); api.savePlayer(t); api.removePlayer(t); t.socket.disconnect(true); } log('ban', u); say(`${u.login} заблокирован`); break; }
    case 'banip': { const t = target(a[0]); if (!t) return; const ip = t.socket.handshake.address; db.prepare('INSERT OR REPLACE INTO ip_bans VALUES(?,?)').run(ip, 'banip by ADAM'); db.prepare('UPDATE users SET banned=1,ban_reason=? WHERE id=?').run('IP ban', t.uid); t.socket.emit('kicked', 'IP заблокирован'); api.savePlayer(t); api.removePlayer(t); t.socket.disconnect(true); log('banip', t); say(`IP ${ip} заблокирован`); break; }
    case 'unban': { const u = db.prepare('SELECT id FROM users WHERE login=?').get(a[0] || ''); if (!u) return say('Аккаунт не найден'); db.prepare('UPDATE users SET banned=0,ban_reason=NULL WHERE id=?').run(u.id); log('unban', u); say('Разбанен'); break; }
    case 'tp': { const t = target(a[0]); if (!t) return; api.teleport(p, t.x + 1, t.y + .2, t.z); log('tp', t); break; }
    case 'tphere': { const t = target(a[0]); if (!t) return; api.teleport(t, p.x + 1, p.y + .2, p.z); log('tphere', t); break; }
    case 'give': { const t = target(a[0]); if (!t) return; say(giveTo(t, a[1], a[2])); log('give', t); break; }
    case 'giveme': say(giveTo(p, a[0], a[1])); log('giveme', p); break;
    case 'heal': { const t = target(a[0]); if (!t) return; t.hp = 100; t.hunger = 100; t.thirst = 100; api.sendSelf(t); log('heal', t); say('Вылечен'); break; }
    case 'kill': { const t = target(a[0]); if (!t) return; const g = t.flags.god; t.flags.god = false; api.die(t, p, 'admin'); t.flags.god = g; log('kill', t); break; }
    case 'god': case 'fly': case 'noclip': {
      const v = !p.flags[cmd]; api.admin.setMode(p, cmd, v); api.sendSelf(p); const nm = { god: 'GOD', fly: 'FLY', noclip: 'NOCLIP' }[cmd]; p.socket.emit('toast', { msg: `${nm} ${v ? 'включён' : 'выключен'}`, type: v ? 'success' : 'info' }); break;
    }
    case 'adminoff': api.admin.adminOff(p); api.sendSelf(p); p.socket.emit('toast', { msg: 'Все режимы админа выключены', type: 'info' }); break;
    case 'time': { const v = (a[0] || '').toLowerCase(); let t = v === 'день' || v === 'day' ? .5 : v === 'ночь' || v === 'night' ? 0 : parseFloat(v) / 24; if (!isFinite(t)) return say('/time день | ночь | 0-24'); api.setTime(((t % 1) + 1) % 1); log('time'); say('Время изменено'); break; }
    case 'weather': { const w = a[0] === 'rain' ? 'rain' : 'clear'; api.setWeather(w); log('weather'); say('Погода: ' + w); break; }
    case 'spawn': { const t = target(a[0]); if (!t) return; const s = G.WG.beachSpawn(); api.teleport(t, s.x, s.y, s.z); log('spawn', t); break; }
    case 'online': say(`Онлайн: ${G.players.size} — ` + [...G.players.values()].map(q => `${q.name} (${Math.round(q.x)},${Math.round(q.z)}) ${q.ping}мс`).join('; ')); break;
    case 'say': case 'broadcast': if (!rest) return; G.io.emit('chat:message', { id: 'sys' + Date.now(), name: cmd === 'say' ? p.name : 'ОБЪЯВЛЕНИЕ', text: rest }); log(cmd); break;
    case 'reports': { const rows = db.prepare("SELECT r.id,r.theme,r.text,u.login f FROM reports r LEFT JOIN users u ON u.id=r.from_user_id WHERE status='open' ORDER BY r.id DESC LIMIT 10").all(); say(rows.length ? rows.map(r => `#${r.id} [${r.theme}] ${r.f}: ${r.text.slice(0, 80)}`).join(' | ') : 'Открытых репортов нет'); break; }
    case 'reportclose': db.prepare("UPDATE reports SET status='closed' WHERE id=?").run(parseInt(a[0]) || 0); log('reportclose'); say('Репорт закрыт'); break;
    case 'save': api.saveAll(); say('Сохранено'); break;
    case 'restart': api.saveAll(); api.sysAll('Сервер перезапускается...'); setTimeout(() => process.exit(0), 800); break;
    case 'wipe': api.wipe(); log('wipe'); api.sysAll('Мир сброшен администратором'); break;
  }
};
module.exports.names = { user: USER, admin: ADMIN };
