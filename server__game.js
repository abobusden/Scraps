'use strict';
const path = require('path');
const { pathToFileURL } = require('url');
const db = require('./db');
const { verifyToken } = require('./auth');
const admin = require('./admin');
const shop = require('./shop');
const DATA = require('../client/recipes.json');
const I = DATA.items, C = DATA.combat, B = DATA.build;
const HOT = 6, GRID = 24, BACK = 12, TOTAL = HOT + GRID + BACK;
const MAX_PLAYERS = +process.env.MAX_PLAYERS || 30; // лимит онлайна на сервере
const G = { io: null, WG: null, players: new Map(), byUid: new Map(), res: [], resMap: new Map(), builds: new Map(), bags: new Map(), fires: [], startTime: Date.now(), timeOffset: 0.3, weather: 'clear', zones: [], monuments: [], roads: [], crates: [], crateMap: new Map() };
const r2 = n => Math.round(n * 100) / 100;
const now = () => Date.now();
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

// ---------- инвентарь ----------
const invSize = p => HOT + GRID + (p.eq.backpack ? BACK : 0);
const hotOk = id => I[id] && I[id].t !== 'res' && I[id].t !== 'armor';
function addItem(p, id, count, dur, skin) {
  if (!I[id]) return count; const st = I[id].s, n = invSize(p);
  if (st > 1) for (let i = 0; i < n && count > 0; i++) { const s = p.inv[i]; if (s && s.id === id && s.count < st && (s.skin || null) === (skin || null)) { const k = Math.min(st - s.count, count); s.count += k; count -= k; } }
  const order = []; const hot = [...Array(HOT).keys()], rest = []; for (let i = HOT; i < n; i++) rest.push(i);
  const pref = (I[id].t === 'tool' || I[id].t === 'weapon' || I[id].t === 'build') ? hot.concat(rest) : rest.concat(hotOk(id) ? hot : []);
  for (const i of pref) { if (count <= 0) break; if (!p.inv[i]) { const k = Math.min(st, count); p.inv[i] = { id, count: k, dur: dur != null ? dur : (I[id].d || 0), skin: skin || null }; count -= k; } }
  return count;
}
const countItem = (p, id) => { let c = 0; for (let i = 0; i < invSize(p); i++) if (p.inv[i] && p.inv[i].id === id) c += p.inv[i].count; return c; };
function removeItem(p, id, count) { for (let i = 0; i < invSize(p) && count > 0; i++) { const s = p.inv[i]; if (s && s.id === id) { const k = Math.min(s.count, count); s.count -= k; count -= k; if (!s.count) p.inv[i] = null; } } return count === 0; }
const hasAll = (p, ing, m = 1) => Object.entries(ing).every(([k, v]) => countItem(p, k) >= v * m);
const missing = (p, ing, m = 1) => Object.entries(ing).filter(([k, v]) => countItem(p, k) < v * m).map(([k, v]) => `${v * m - countItem(p, k)} ${I[k].n.toLowerCase()}`).join(', ');
const takeAll = (p, ing, m = 1) => Object.entries(ing).forEach(([k, v]) => removeItem(p, k, v * m));
function giveOrDrop(p, id, count, dur, skin) { const left = addItem(p, id, count, dur, skin); if (left > 0) { dropBag(p.x, p.y, p.z, [{ id, count: left, dur: dur || 0, skin }]); toast(p, 'Инвентарь полон', 'warn'); } }

// ---------- утилиты ----------
const toast = (p, msg, type = 'info') => p.socket.emit('toast', { msg, type });
const sys = (p, text, priv = true) => p.socket.emit('chat:system', { text, private: priv });
const sysAll = text => G.io.emit('chat:system', { text, private: false });
const gameTime = () => (G.timeOffset + (now() - G.startTime) / 1000 / 1440) % 1;
const setTime = v => { G.timeOffset = ((v - (now() - G.startTime) / 1000 / 1440) % 1 + 1) % 1; G.io.emit('time', { t: gameTime(), w: G.weather }); };
const find = name => { name = String(name || '').toLowerCase(); for (const p of G.players.values()) if (p.name.toLowerCase() === name) return p; return null; };
const heightAt = (x, z) => G.WG.heightAt(x, z);
const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
function sendSelf(p) {
  p.socket.emit('self', { inv: p.inv.slice(0, invSize(p)), size: invSize(p), eq: p.eq, hp: r2(p.hp), hunger: r2(p.hunger), thirst: r2(p.thirst), flags: p.flags, mags: p.mags, kills: p.kills, queue: p.queue.map(q => ({ id: q.id, mult: q.mult, t: q.t })), sel: p.sel, scrapSkin: p.skin });
}
function savePlayer(p) {
  const tx = db.transaction(() => {
    db.prepare('UPDATE players SET x=?,y=?,z=?,rotation=?,hp=?,hunger=?,thirst=?,kills=?,deaths=?,playtime=? WHERE user_id=?').run(p.x, p.y, p.z, p.rot, p.hp, p.hunger, p.thirst, p.kills, p.deaths, p.playtimeBase + Math.floor((now() - p.joinAt) / 1000), p.uid);
    db.prepare('DELETE FROM inventory WHERE user_id=?').run(p.uid); db.prepare('DELETE FROM equipment WHERE user_id=?').run(p.uid);
    const ii = db.prepare('INSERT INTO inventory VALUES(?,?,?,?,?,?)'); p.inv.forEach((s, i) => s && ii.run(p.uid, i, s.id, s.count, s.dur, s.skin));
    const ie = db.prepare('INSERT INTO equipment VALUES(?,?,?,?)'); Object.entries(p.eq).forEach(([k, v]) => v && ie.run(p.uid, k, v.id, v.dur));
  }); tx();
}
function saveAll() { for (const p of G.players.values()) savePlayer(p); }


// ---------- ящики на РТ ----------
// Три вида ящиков; появляются ТОЛЬКО на РТ (заправка, магазин, военная база), места задаёт shared/worldgen.mjs (monumentLayout).
//  basic    — базовый: в основном мусор и еда, ценное выпадает редко;
//  military — военный: лучший лут, заметно выше шанс на ценное (патроны, броня, оружие);
//  elite    — элитный: гарантированно оружие с патронами и броня + лучшее снаряжение.
// Время респавна пустого ящика — в минутах [мин, макс]; поменяйте здесь под свой сервер.
const CRATE_KINDS = {
  basic: { name: 'Базовый ящик', respawn: [6, 9], rolls: [3, 5] },
  military: { name: 'Военный ящик', respawn: [12, 18], rolls: [4, 6] },
  elite: { name: 'Элитный ящик', respawn: [25, 35], rolls: [3, 5] },
};
// запись: [вес, id, мин, макс] или [вес, id, 1, 1, id патронов, мин, макс] (оружие идёт сразу с патронами)
const CRATE_LOOT = {
  basic: [
    [18, 'scrap', 5, 18], [10, 'cloth', 3, 8], [9, 'wood', 20, 60], [9, 'stone', 20, 50], [7, 'fiber', 5, 15], [10, 'canned', 1, 2], [8, 'water_bottle', 1, 2],
    [8, 'bandage', 1, 2], [5, 'leather', 3, 6], [4, 'raw_meat', 1, 2], [4, 'arrows', 5, 12], [3, 'charcoal', 5, 12], [2, 'stone_axe', 1, 1], [2, 'stone_pickaxe', 1, 1],
    // редкое ценное (около 10% всех выпадений)
    [2.5, 'metal', 8, 20], [2, 'gunpowder', 5, 12], [1.5, 'sulfur', 5, 12], [2.5, 'ammo', 6, 14], [1.2, 'medkit', 1, 1], [1, 'leather_chest', 1, 1], [.8, 'wood_helmet', 1, 1],
    [.8, 'makeshift_pistol', 1, 1, 'ammo', 6, 12], [.35, 'pistol', 1, 1, 'ammo', 8, 14],
  ],
  military: [
    [14, 'ammo', 15, 45], [8, 'shells', 8, 20], [8, 'rifle_ammo', 8, 20], [10, 'metal', 20, 60], [8, 'scrap', 20, 50], [8, 'gunpowder', 15, 40], [6, 'sulfur', 20, 50],
    [8, 'bandage', 2, 4], [6, 'medkit', 1, 1], [6, 'canned', 2, 4], [4, 'water_bottle', 1, 2],
    [4, 'grenade', 1, 3], [3, 'smoke', 1, 2], [3, 'molotov', 1, 3],
    [3, 'pistol', 1, 1, 'ammo', 12, 30], [2.5, 'shotgun', 1, 1, 'shells', 8, 16], [2, 'combat_knife', 1, 1], [2, 'machete', 1, 1],
    [2, 'metal_helmet', 1, 1], [2, 'metal_pants', 1, 1], [1.5, 'metal_chest', 1, 1], [1.5, 'backpack', 1, 1], [2, 'leather_chest', 1, 1],
    [1.2, 'ak', 1, 1, 'ammo', 30, 60], [1, 'rifle', 1, 1, 'rifle_ammo', 10, 20], [.6, 'c4', 1, 1],
  ],
  elite: [
    [10, 'metal_helmet', 1, 1], [10, 'metal_chest', 1, 1], [10, 'metal_pants', 1, 1], [8, 'backpack', 1, 1], [10, 'medkit', 2, 4], [8, 'grenade', 2, 5], [6, 'c4', 1, 2],
    [10, 'ammo', 40, 100], [8, 'rifle_ammo', 20, 50], [8, 'shells', 20, 40], [8, 'metal', 50, 150], [8, 'gunpowder', 40, 100], [6, 'sulfur', 40, 100],
    [5, 'ak', 1, 1, 'ammo', 60, 120], [4, 'rifle', 1, 1, 'rifle_ammo', 20, 40], [3, 'shotgun', 1, 1, 'shells', 20, 40],
    [3, 'machete', 1, 1], [2, 'metal_spear', 1, 1], [3, 'flashlight', 1, 1], [4, 'smoke', 2, 4], [4, 'molotov', 2, 5], [3, 'hammer', 1, 1], [5, 'bandage', 4, 8],
  ],
};
// элитный ящик всегда содержит 1 оружие (с патронами) и 1 деталь металлической брони
const ELITE_GUNS = [[45, 'ak', 1, 1, 'ammo', 60, 120], [25, 'rifle', 1, 1, 'rifle_ammo', 20, 40], [20, 'shotgun', 1, 1, 'shells', 20, 40], [10, 'pistol', 1, 1, 'ammo', 30, 60]];
const ELITE_ARMOR = [[1, 'metal_helmet', 1, 1], [1, 'metal_chest', 1, 1], [1, 'metal_pants', 1, 1]];
function pickWeighted(tbl) { let t = 0; for (const e of tbl) t += e[0]; let x = Math.random() * t; for (const e of tbl) { x -= e[0]; if (x < 0) return e; } return tbl[tbl.length - 1]; }
function rollCrate(kind) {
  const K = CRATE_KINDS[kind], slots = Array(24).fill(null);
  const put = (id, cnt) => {
    if (!I[id] || cnt <= 0) return; const st = I[id].s;
    if (st > 1) for (const s of slots) if (s && s.id === id && s.count < st) { const k = Math.min(st - s.count, cnt); s.count += k; cnt -= k; }
    while (cnt > 0) { const free = []; slots.forEach((s, i) => { if (!s) free.push(i); }); if (!free.length) return; const k = Math.min(st, cnt); slots[free[rnd(0, free.length - 1)]] = { id, count: k, dur: I[id].d || 0, skin: null }; cnt -= k; }
  };
  const give = e => { put(e[1], rnd(e[2], e[3])); if (e[4]) put(e[4], rnd(e[5], e[6])); };
  if (kind === 'elite') { give(pickWeighted(ELITE_GUNS)); give(pickWeighted(ELITE_ARMOR)); }
  const n = rnd(K.rolls[0], K.rolls[1]); for (let i = 0; i < n; i++) give(pickWeighted(CRATE_LOOT[kind]));
  return slots;
}
function refillCrate(c) { c.items = rollCrate(c.k); c.respawn = 0; }
const isCrateId = id => typeof id === 'string' && /^c\d+$/.test(id);
const crateView = c => ({ id: 'c' + c.id, slots: c.items || Array(24).fill(null), lock: 'none', owner: false, title: CRATE_KINDS[c.k].name, crate: c.k });
function crateFor(p, sid) { const c = G.crateMap.get(+String(sid).slice(1)); return c && !p.dead && p.crateOpen === c.id && Math.hypot(c.x - p.x, c.z - p.z) <= 6 ? c : null; }
function crateCheck(c) { // ящик пуст -> респавн через несколько минут
  if (c.items && c.items.every(s => !s)) { c.items = null; const [a, b] = CRATE_KINDS[c.k].respawn; c.respawn = now() + rnd(a, b) * 60000; G.io.emit('crate:state', { id: c.id, full: 0 }); }
}
const crateSend = (p, c) => { p.socket.emit('chest:open', crateView(c)); sendSelf(p); };
function crateTake(p, c, i) { const s = c.items && c.items[i]; if (!s) return; const left = addItem(p, s.id, s.count, s.dur, s.skin); c.items[i] = left ? { ...s, count: left } : null; if (left) toast(p, 'Инвентарь полон', 'warn'); }
function crateMove(p, d) { // из ящика можно только забирать
  const c = crateFor(p, d.id); if (!c) return;
  if (c.items && d.from && d.from.k === 'chest') crateTake(p, c, +d.from.i);
  crateCheck(c); crateSend(p, c);
}
function crateAll(p, d) {
  const c = crateFor(p, d.id); if (!c) return;
  if (c.items && d.mode === 'take') for (let i = 0; i < 24; i++) crateTake(p, c, i);
  crateCheck(c); crateSend(p, c);
}

// ---------- мешки / выброшенные предметы ----------
function dropBag(x, y, z, items, kind = 'drop') {
  items = items.filter(Boolean); if (!items.length) return;
  const exp = now() + 300000;
  const id = db.prepare('INSERT INTO loot_bags(x,y,z,contents_json,expires_at) VALUES(?,?,?,?,?)').run(x, y, z, JSON.stringify(items), exp).lastInsertRowid;
  const b = { id, x, y, z, items, exp, kind }; G.bags.set(id, b); G.io.emit('bag:add', { id, x, y, z, kind, ic: I[items[0].id].e }); return b;
}
function removeBag(b) { G.bags.delete(b.id); db.prepare('DELETE FROM loot_bags WHERE id=?').run(b.id); G.io.emit('bag:remove', b.id); }

// ---------- урон ----------
function armorReduction(p, zone) {
  const slot = zone === 'head' ? 'helmet' : zone === 'legs' ? 'pants' : 'chest', a = p.eq[slot];
  return a ? I[a.id].red : 0;
}
function damagePlayer(t, dmg, att, zone = 'body', weapon = '?', ignoreArmor) {
  if (t.dead || t.flags.god || dmg <= 0) return;
  let red = ignoreArmor ? 0 : armorReduction(t, zone);
  let final = dmg * (1 - red);
  if (!ignoreArmor) { const slot = zone === 'head' ? 'helmet' : zone === 'legs' ? 'pants' : 'chest', a = t.eq[slot]; if (a) { a.dur -= dmg; if (a.dur <= 0) { t.eq[slot] = null; toast(t, 'Броня сломалась', 'error'); } } }
  t.hp -= final; t.socket.emit('damage', { amount: r2(final), from: att ? att.name : null });
  if (att && att !== t) att.socket.emit('hitmarker', { head: zone === 'head', kill: t.hp <= 0 });
  if (t.hp <= 0) die(t, att, weapon); else sendSelf(t);
}
function die(p, killer, weapon) {
  if (p.dead) return; p.dead = true; p.hp = 0; p.deaths++;
  const items = p.inv.filter(Boolean); Object.values(p.eq).forEach(e => e && items.push({ id: e.id, count: 1, dur: e.dur, skin: null }));
  p.inv = Array(TOTAL).fill(null); p.eq = { helmet: null, chest: null, pants: null, backpack: null };
  dropBag(p.x, p.y, p.z, items, 'death');
  p.queue = []; p.flags.fly = p.flags.noclip = false;
  if (killer && killer !== p) { killer.kills++; sendSelf(killer); }
  G.io.emit('chat:kill', { killer: killer && killer !== p ? killer.name : null, victim: p.name, weapon: (I[weapon] && I[weapon].n) || weapon });
  sysAll(killer && killer !== p ? `${p.name} убит ${killer.name}` : `${p.name} погиб`);
  p.socket.emit('death', { by: killer ? killer.name : null }); savePlayer(p); sendSelf(p);
}
function respawn(p) {
  if (!p.dead) return; p.dead = false; p.hp = 70; p.hunger = 100; p.thirst = 100;
  let pos = null;
  for (const b of G.builds.values()) if (b.type === 'sleeping_bag' && b.owner === p.uid) pos = { x: b.x, y: b.y + .3, z: b.z };
  if (!pos) pos = G.WG.beachSpawn();
  p.x = pos.x; p.y = pos.y; p.z = pos.z;
  p.socket.emit('respawn', { x: p.x, y: p.y, z: p.z }); toast(p, 'Вы возродились', 'info'); sendSelf(p);
}

// ---------- постройки ----------
const lockOf = id => db.prepare('SELECT lock_type,code FROM doors WHERE id=?').get(id);
function pubBuild(b) { return { id: b.id, type: b.type, x: b.x, y: b.y, z: b.z, rot: b.rot, hp: b.hp, tier: b.tier, own: b.owner, open: b.open ? 1 : 0, lock: b.lock ? b.lock.type : 'none', burn: b.burn ? 1 : 0 }; }
function loadBuilds() {
  for (const r of db.prepare('SELECT * FROM buildings').all()) {
    const b = { id: r.id, type: r.type, x: r.x, y: r.y, z: r.z, rot: r.rotation, hp: r.hp, tier: r.tier, owner: r.owner_id, open: false, lock: null, members: new Set(), chest: null };
    const lk = lockOf(r.id); if (lk && lk.lock_type !== 'none') b.lock = { type: lk.lock_type, code: lk.code };
    if (r.type === 'cupboard') db.prepare('SELECT user_id FROM cupboard_members WHERE cupboard_id=?').all(r.id).forEach(m => b.members.add(m.user_id));
    if (r.type === 'chest') { const c = db.prepare('SELECT contents_json FROM chests WHERE id=?').get(r.id); b.chest = c ? JSON.parse(c.contents_json) : Array(24).fill(null); }
    if (r.type === 'campfire') { b.burn = now() + 600000; b.coal = 0; }
    G.builds.set(r.id, b);
  }
}
function destroyBuild(b) {
  G.builds.delete(b.id);
  db.prepare('DELETE FROM buildings WHERE id=?').run(b.id); db.prepare('DELETE FROM doors WHERE id=?').run(b.id); db.prepare('DELETE FROM cupboards WHERE id=?').run(b.id); db.prepare('DELETE FROM cupboard_members WHERE cupboard_id=?').run(b.id); db.prepare('DELETE FROM chests WHERE id=?').run(b.id);
  if (b.chest) dropBag(b.x, b.y + .5, b.z, b.chest);
  G.io.emit('build:remove', b.id);
}
function damageBuild(b, amount) {
  b.hp -= amount; if (b.hp <= 0) return destroyBuild(b);
  db.prepare('UPDATE buildings SET hp=? WHERE id=?').run(b.hp, b.id); G.io.emit('build:update', { id: b.id, hp: b.hp });
}
const cupCovering = (x, z) => [...G.builds.values()].filter(b => b.type === 'cupboard' && Math.hypot(b.x - x, b.z - z) <= 15);
const isMember = (p, c) => c.owner === p.uid || c.members.has(p.uid);
function canBuildAt(p, x, z) { if (p.isAdmin) return true; return cupCovering(x, z).every(c => isMember(p, c)); }
function canAccess(p, b, code) {
  if (p.isAdmin || b.owner === p.uid) return true;
  if (cupCovering(b.x, b.z).some(c => isMember(p, c))) return true;
  if (!b.lock) return true;
  if (b.lock.type === 'code') return String(code || '') === b.lock.code;
  return false;
}
function placeBuild(p, d) {
  const s = p.inv[d.slot]; if (!s || !B[s.id]) return toast(p, 'Нечего ставить', 'error');
  const def = B[s.id], type = s.id; let { x, y, z } = d; const rot = +d.rot || 0;
  if (![x, y, z, rot].every(Number.isFinite)) return;
  if (Math.hypot(x - p.x, z - p.z) > 12 || Math.abs(y - p.y) > 12) return toast(p, 'Слишком далеко', 'error');
  const gy = heightAt(x, z);
  if (gy < 0.15) return toast(p, 'Нельзя строить на воде', 'error');
  y = Math.max(gy - 1, Math.min(gy + 40, y));
  if (!p.isAdmin) {
    if (!canBuildAt(p, x, z)) return toast(p, 'Нельзя строить в зоне чужого шкафа', 'error');
    let own = 0, near = false;
    for (const b of G.builds.values()) { if (b.owner === p.uid) own++; else if (Math.hypot(b.x - x, b.z - z) < 5 && !cupCovering(x, z).some(c => isMember(p, c))) near = true; }
    if (own >= 200) return toast(p, 'Лимит построек: 200', 'error');
    if (near) return toast(p, 'Слишком близко к чужой постройке (5 м)', 'error');
  }
  if (type === 'sleeping_bag') for (const b of [...G.builds.values()]) if (b.type === 'sleeping_bag' && b.owner === p.uid) destroyBuild(b);
  s.count--; if (!s.count) p.inv[d.slot] = null;
  const id = db.prepare('INSERT INTO buildings(owner_id,type,x,y,z,rotation,hp,tier) VALUES(?,?,?,?,?,?,?,0)').run(p.uid, type, x, y, z, rot, def.hp).lastInsertRowid;
  const b = { id, type, x, y, z, rot, hp: def.hp, tier: 0, owner: p.uid, open: false, lock: null, members: new Set(), chest: null };
  if (['door', 'gate', 'sliding_door', 'double_door', 'chest'].includes(type)) db.prepare('INSERT INTO doors(id,x,y,z,owner_id,hp) VALUES(?,?,?,?,?,?)').run(id, x, y, z, p.uid, def.hp);
  if (type === 'cupboard') db.prepare('INSERT INTO cupboards VALUES(?,?,?,?,?,?)').run(id, p.uid, x, y, z, def.hp);
  if (type === 'chest') { b.chest = Array(24).fill(null); db.prepare('INSERT INTO chests VALUES(?,?,?,?,?)').run(id, x, y, z, JSON.stringify(b.chest)); }
  if (type === 'campfire') { b.burn = now() + 600000; b.coal = 0; }
  G.builds.set(id, b); G.io.emit('build:add', pubBuild(b)); p.builds++; sendSelf(p);
}
function saveChest(b) { db.prepare('UPDATE chests SET contents_json=? WHERE id=?').run(JSON.stringify(b.chest), b.id); }

// ---------- бой ----------
function rayBox(o, d, b, size, maxT) {
  const c = Math.cos(b.rot), s = Math.sin(b.rot);
  const ox = o.x - b.x, oz = o.z - b.z, lx = ox * c - oz * s, lz = ox * s + oz * c, dx = d.x * c - d.z * s, dz = d.x * s + d.z * c;
  const mn = [-size[0] / 2, b.y, -size[2] / 2], mx = [size[0] / 2, b.y + size[1], size[2] / 2], oo = [lx, o.y, lz], dd = [dx, d.y, dz];
  let t0 = 0, t1 = maxT;
  for (let i = 0; i < 3; i++) { if (Math.abs(dd[i]) < 1e-9) { if (oo[i] < mn[i] || oo[i] > mx[i]) return -1; } else { let a = (mn[i] - oo[i]) / dd[i], bb = (mx[i] - oo[i]) / dd[i]; if (a > bb) [a, bb] = [bb, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, bb); if (t0 > t1) return -1; } }
  return t0;
}
function raySphere(o, d, c, r, maxT) { const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z, b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r, disc = b * b - cc; if (disc < 0) return -1; const t = -b - Math.sqrt(disc); return t >= 0 && t <= maxT ? t : -1; }
function castRay(p, o, d, range) {
  const hits = [];
  for (const q of G.players.values()) {
    if (q === p || q.dead) continue; if (Math.hypot(q.x - o.x, q.z - o.z) > range + 2) continue;
    const zs = [['head', { x: q.x, y: q.y + 1.65, z: q.z }, .24], ['body', { x: q.x, y: q.y + 1.15, z: q.z }, .38], ['legs', { x: q.x, y: q.y + .5, z: q.z }, .38]];
    let best = null; for (const [z, c, r] of zs) { const t = raySphere(o, d, c, r, range); if (t >= 0 && (!best || t < best.t)) best = { t, zone: z }; }
    if (best) hits.push({ t: best.t, kind: 'player', q, zone: best.zone });
  }
  for (const b of G.builds.values()) {
    if (Math.hypot(b.x - o.x, b.z - o.z) > range + 3) continue; const def = B[b.type];
    if (b.open && ['door', 'gate', 'sliding_door', 'double_door'].includes(b.type)) continue;
    if (!def.st && !['door', 'gate', 'sliding_door', 'double_door'].includes(b.type) && !['chest', 'workbench', 'cupboard'].includes(b.type)) continue;
    const t = rayBox(o, d, b, def.size, range); if (t >= 0) hits.push({ t, kind: 'build', b });
  }
  return hits.sort((a, b) => a.t - b.t);
}
const eye = p => ({ x: p.x, y: p.y + 1.6, z: p.z });
function normDir(a) { if (!Array.isArray(a) || a.length < 3) return null; const [x, y, z] = a.map(Number); const l = Math.hypot(x, y, z); if (!l || !isFinite(l)) return null; return { x: x / l, y: y / l, z: z / l }; }
function spreadDir(d, deg) { const k = Math.tan(deg * Math.PI / 180); const v = { x: d.x + (Math.random() - .5) * 2 * k, y: d.y + (Math.random() - .5) * 2 * k, z: d.z + (Math.random() - .5) * 2 * k }; const l = Math.hypot(v.x, v.y, v.z); return { x: v.x / l, y: v.y / l, z: v.z / l }; }
function wearTool(p, slot) { const s = p.inv[slot]; if (!s || !s.dur || !I[s.id].d) return; s.dur--; if (s.dur <= 0) { p.inv[slot] = null; toast(p, `${I[s.id].n} сломан(а)`, 'error'); } }
const toolDmgBuild = id => id === 'hammer' ? 30 : id === 'rock' || id === 'fist' ? .1 : ['stone_axe', 'stone_pickaxe', 'metal_axe', 'metal_pickaxe', 'wood_spear', 'metal_spear'].includes(id) ? .5 : .1;

// сбор ресурсов
const YIELD = {
  tree: { rock: ['wood', 3], stone_axe: ['wood', 15], metal_axe: ['wood', 28], stone_pickaxe: ['wood', 4], metal_pickaxe: ['wood', 6], fist: ['wood', 1] },
  rock: { rock: ['stone', 2], stone_axe: ['stone', 3], metal_axe: ['stone', 4], stone_pickaxe: ['stone', 12], metal_pickaxe: ['stone', 22] },
  ore: { stone_pickaxe: ['metal', 8], metal_pickaxe: ['metal', 16] },
  sulfur: { stone_pickaxe: ['sulfur', 8], metal_pickaxe: ['sulfur', 14] },
  bush: { any: ['cloth', 3] }, scrap: { any: ['scrap', 4], stone_pickaxe: ['scrap', 6], metal_pickaxe: ['scrap', 8], metal_axe: ['scrap', 7], stone_axe: ['scrap', 6] },
  barrel: { any: ['scrap', 4] }, crate: { any: ['scrap', 3] },
};
const HITS = { tree: 15, rock: 15, ore: 15, sulfur: 15, bush: 1, scrap: 2, barrel: 2, crate: 2 };
const RESPAWN = { tree: [20, 30], rock: [20, 30], ore: [20, 30], sulfur: [20, 30], bush: [5, 5], scrap: [10, 15], barrel: [10, 15], crate: [10, 15] };

// слабые точки на ресурсах (формула совпадает с клиентской weakPoint в world.js)
const hh = (x, y, z) => { let h = Math.imul(Math.round(x * 97), 374761393) ^ Math.imul(Math.round(y * 97), 668265263) ^ Math.imul(Math.round(z * 97), 1274126177); h = Math.imul(h ^ (h >>> 13), 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const WPC = { tree: [.36, .8, 2.6], rock: [1.05, .25, .8], ore: [1.05, .25, .8], sulfur: [.95, .25, .7], scrap: [.75, .15, .55] };
function weakPoint(r, px, pz) {
  const c = WPC[r.type]; if (!c) return null;
  const sc = .8 + hh(r.z, r.x, 2) * .55, hits = r.hits || 0, s1 = hh(r.id, hits, 5), s2 = hh(hits, r.id, 9);
  const a = Math.atan2(pz - r.z, px - r.x) + (s1 - .5) * 1.3, h = c[1] + (c[2] - c[1]) * s2;
  let R = c[0] * sc; if (r.type !== 'tree') R *= Math.sqrt(Math.max(.25, 1 - Math.pow((h - .5) / .85, 2)));
  return { x: r.x + Math.cos(a) * R, y: r.y + h * sc, z: r.z + Math.sin(a) * R };
}
const rayDist = (o, d, w) => { const vx = w.x - o.x, vy = w.y - o.y, vz = w.z - o.z, t = Math.max(0, vx * d.x + vy * d.y + vz * d.z); return Math.hypot(vx - d.x * t, vy - d.y * t, vz - d.z * t); };
function gather(p, rid, toolId, slot, o, dir) {
  const r = G.resMap.get(rid); if (!r || r.respawn > now()) return;
  if (Math.hypot(r.x - p.x, r.z - p.z) > 5.5 || Math.abs(r.y - p.y) > 8) return;
  const tbl = YIELD[r.type], y = tbl[toolId] || tbl.any;
  if (!y) return toast(p, r.type === 'ore' || r.type === 'sulfur' ? 'Нужна кирка' : r.type === 'rock' ? 'Нужен инструмент покрепче' : 'Этим не добыть', 'warn');
  const wpt = o && dir ? weakPoint(r, p.x, p.z) : null, wp = !!(wpt && rayDist(o, dir, wpt) < .45), mul = wp ? 2 : 1;
  r.hits = (r.hits || 0) + 1; p.socket.emit('gather:fx', { id: rid, wp }); G.io.emit('res:hit', { id: rid, h: r.hits, px: r2(p.x), pz: r2(p.z), wp, by: p.id });
  // 15 ударов вместо 6: добычу за удар уменьшаем пропорционально (6/15), чтобы общий выход ресурсов остался прежним
  const kk = ['tree', 'rock', 'ore', 'sulfur'].includes(r.type) ? .4 : 1, q = n => Math.max(1, Math.round(n * kk));
  if (r.hits < HITS[r.type]) { giveOrDrop(p, y[0], q(rnd(Math.ceil(y[1] * .5), y[1])) * mul); } else {
    giveOrDrop(p, y[0], q(y[1] * 2) * mul); r.hits = 0; const [a, b] = RESPAWN[r.type]; r.respawn = now() + rnd(a, b) * 60000;
    db.prepare('UPDATE world_resources SET respawn_at=? WHERE id=?').run(r.respawn, rid); G.io.emit('res:state', { id: rid, alive: 0 });
    if (r.type === 'bush') { giveOrDrop(p, 'fiber', rnd(2, 5)); if (Math.random() < .5) giveOrDrop(p, 'berries', rnd(1, 3)); }
    if (r.type === 'tree' && Math.random() < .2) giveOrDrop(p, 'mushroom', 1);
    if (r.type === 'barrel') { giveOrDrop(p, 'leather', rnd(1, 2)); if (Math.random() < .4) giveOrDrop(p, 'water_bottle', rnd(1, 3)); }
    if (r.type === 'crate') { if (Math.random() < .6) giveOrDrop(p, 'raw_meat', 1); if (Math.random() < .5) giveOrDrop(p, 'canned', 1); if (Math.random() < .4) giveOrDrop(p, 'water_bottle', rnd(1, 2)); }
  }
  if (r.type === 'bush' && r.hits === 0) { /* уже обработано */ }
  wearTool(p, slot); sendSelf(p);
}
function explode(att, x, y, z, rad, dmg, wpn) {
  G.io.emit('fx:boom', { x, y, z, r: rad });
  for (const q of G.players.values()) if (!q.dead && Math.hypot(q.x - x, q.y + 1 - y, q.z - z) <= rad) damagePlayer(q, dmg, att, 'body', wpn);
}
function onAttack(p, d) {
  if (p.dead) return; const t = now(); if (t < p.nextAttack) return;
  const slot = p.sel, s = slot >= 0 ? p.inv[slot] : null, id = s ? s.id : 'fist', st = C[id] || (I[id] && I[id].t === 'tool' ? C.fist : null);
  const dir = normDir(d.dir); if (!dir) return; if (!st) return;
  p.nextAttack = t + (st.k === 'bow' ? 350 : (st.spd || .5) * 1000 - 40); p.ak++; p.act = st.k;
  const o = eye(p);
  if (st.k === 'melee') {
    if (st.dmg > 0) {
      const hits = castRay(p, o, dir, 2.8); const h = hits.find(x => x.kind === 'player');
      if (h && (!hits[0] || hits[0].kind === 'player' || hits[0].t >= h.t - .01)) { const dm = id === 'hammer' ? 50 : st.dmg; damagePlayer(h.q, dm, p, h.zone, id); if (s) wearTool(p, slot); sendSelf(p); return; }
    }
    if (d.target && d.target.kind === 'res') return gather(p, d.target.id, id, slot, o, dir);
    if (d.target && d.target.kind === 'build') { const b = G.builds.get(d.target.id); if (b && b.owner !== p.uid && Math.hypot(b.x - p.x, b.z - p.z) < 5) { damageBuild(b, toolDmgBuild(id)); if (s) wearTool(p, slot); sendSelf(p); } }
    return;
  }
  if (st.k === 'gun' || st.k === 'bow') {
    let mag = 1, key = id;
    if (st.k === 'gun') {
      if (p.reloadEnd > t) return; mag = p.mags[id] || 0;
      if (mag <= 0) { toast(p, 'Нужна перезарядка (R)', 'warn'); return; }
      p.mags[id] = mag - 1;
    } else { if (countItem(p, 'fire_arrows') < 1 && countItem(p, 'arrows') < 1) return toast(p, 'Нет стрел', 'warn'); }
    let fire = false; if (st.k === 'bow') { if (countItem(p, 'fire_arrows') > 0) { removeItem(p, 'fire_arrows', 1); fire = true; } else removeItem(p, 'arrows', 1); }
    const pw = st.k === 'bow' ? Math.max(.25, Math.min(1, +d.pw || 1)) : 1, bm = st.k === 'bow' ? .3 + .7 * pw : 1;
    let sp = st.spread || 0; if (d.mv === 1) sp *= 1.5; else if (d.mv === 2) sp *= 3; if (d.cr) sp *= .7; if (d.aim) sp *= .5;
    const dr = sp ? spreadDir(dir, sp) : dir; const hits = castRay(p, o, dr, st.k === 'bow' ? st.range * (.5 + .5 * pw) : st.range);
    let mult = 1, end = { x: o.x + dr.x * st.range, y: o.y + dr.y * st.range, z: o.z + dr.z * st.range };
    for (const h of hits) {
      end = { x: o.x + dr.x * h.t, y: o.y + dr.y * h.t, z: o.z + dr.z * h.t };
      if (h.kind === 'player') {
        const f = id === 'shotgun' ? (st.dmg + (st.far - st.dmg) * h.t / st.range) : st.dmg * (1 - .5 * h.t / st.range);
        damagePlayer(h.q, f * mult * bm, p, h.zone, id); break;
      } else { const strong = h.b.tier >= 1 && B[h.b.type].st; if (strong) break; if (h.b.type === 'door' || B[h.b.type].st) { mult *= (st.pen || .5); if (fire && h.b.tier === 0) ignite(h.b); } }
    }
    for (const q of G.players.values()) { const dd = Math.hypot(q.x - p.x, q.z - p.z); if (dd < (st.snd || 20)) q.socket.emit('shot', { from: o, to: end, w: id, d: dd, by: p.id }); }
    if (st.k === 'bow' && s) wearTool(p, slot); else if (s) wearTool(p, slot);
    sendSelf(p); return;
  }
  if (st.k === 'throw') {
    const pt = d.point; if (!pt || ![pt.x, pt.y, pt.z].every(Number.isFinite)) return; if (Math.hypot(pt.x - p.x, pt.z - p.z) > st.range + 3) return;
    removeItem(p, id, 1); sendSelf(p);
    if (st.sub === 'knife') { const hits = castRay(p, o, dir, st.range); const h = hits.find(x => x.kind === 'player'); if (h && (!hits[0] || hits[0].kind === 'player')) damagePlayer(h.q, 20, p, h.zone, id); return; }
    G.io.emit('fx:throw', { from: o, to: pt, k: st.sub });
    if (st.sub === 'grenade') setTimeout(() => explode(p, pt.x, pt.y, pt.z, 3, 40, id), 2500);
    if (st.sub === 'molotov') setTimeout(() => G.fires.push({ x: pt.x, y: pt.y, z: pt.z, r: 2, until: now() + 10000, by: p, dps: 10 }), 900);
    if (st.sub === 'smoke') setTimeout(() => G.io.emit('fx:smoke', pt), 1000);
    return;
  }
  if (st.k === 'c4') {
    const b = G.builds.get(d.target && d.target.id); if (!b || Math.hypot(b.x - p.x, b.z - p.z) > 4.5) return toast(p, 'Подойдите к постройке и наведитесь', 'warn');
    if (b.owner === p.uid && !p.isAdmin) { /* своё разрушать можно */ }
    removeItem(p, 'c4', 1); G.io.emit('fx:boom', { x: b.x, y: b.y + 1, z: b.z, r: 1.5 }); damageBuild(b, 150); sendSelf(p);
  }
}
function ignite(b) { if (b.tier === 0) G.fires.push({ x: b.x, y: b.y + 1, z: b.z, r: .7, until: now() + 15000, dps: 0, bdps: .5 }); }
function reload(p) {
  const s = p.inv[p.sel], st = s && C[s.id]; if (!st || st.k !== 'gun' || p.reloadEnd > now()) return;
  const have = p.mags[s.id] || 0; if (have >= st.mag) return; if (countItem(p, st.ammo) < 1) return toast(p, 'Нет патронов', 'warn');
  p.reloadEnd = now() + st.reload * 1000; p.ak++; p.act = 'reload'; p.socket.emit('reloading', { t: st.reload });
  const id = s.id; setTimeout(() => { if (!G.players.has(p.socket.id)) return; const need = Math.min(st.mag - (p.mags[id] || 0), countItem(p, st.ammo)); removeItem(p, st.ammo, need); p.mags[id] = (p.mags[id] || 0) + need; sendSelf(p); }, st.reload * 1000);
}

// ---------- крафт ----------
const nearWorkbench = p => [...G.builds.values()].some(b => b.type === 'workbench' && Math.hypot(b.x - p.x, b.z - p.z) <= 3.5 && Math.abs(b.y - p.y) < 4);
function craft(p, id, qty) {
  const r = DATA.recipes.find(x => x.id === id); if (!r) return; const mult = qty === 10 ? 10 : 1;
  if (p.dead) return; if (p.queue.length >= 5) return toast(p, 'Очередь крафта заполнена (5)', 'warn');
  if (r.t > 1 && !nearWorkbench(p) && !p.isAdmin) return toast(p, 'Нужен верстак поблизости (3 м)', 'warn');
  if (!hasAll(p, r.ing, mult)) return toast(p, 'Не хватает: ' + missing(p, r.ing, mult), 'error');
  takeAll(p, r.ing, mult); p.queue.push({ id, mult, t: DATA.craftTime[r.t] * (mult === 10 ? 5 : 1), start: 0 }); sendSelf(p);
}
function craftTick(p) {
  const q = p.queue[0]; if (!q) return; const t = now(); if (!q.start) { q.start = t; return sendSelf(p); }
  if (t - q.start < q.t * 1000) return; p.queue.shift();
  const r = DATA.recipes.find(x => x.id === q.id); const skin = (I[q.id].t === 'tool' || I[q.id].t === 'weapon') && p.skin ? p.skin : null;
  giveOrDrop(p, q.id, r.n * q.mult, null, skin); p.crafts++; toast(p, `Создано: ${I[q.id].n}`, 'success'); sendSelf(p);
}

// ---------- использование предметов ----------
const FOOD = DATA.food;
function useItem(p, slot) {
  const s = p.inv[slot]; if (!s) return; const it = I[s.id], t = now();
  if (it.t === 'armor') {
    const cur = p.eq[it.slot]; if (it.slot === 'backpack' && cur) return; p.eq[it.slot] = { id: s.id, dur: s.dur }; p.inv[slot] = cur ? { id: cur.id, count: 1, dur: cur.dur, skin: null } : null;
    if (it.slot === 'backpack') toast(p, 'Рюкзак надет: +12 слотов', 'success'); return sendSelf(p);
  }
  if (it.t === 'food' || it.t === 'med') { p.ak++; p.act = 'eat'; }
  if (FOOD[s.id]) { p.hunger = Math.min(100, p.hunger + FOOD[s.id]); }
  else if (s.id === 'water_bottle') p.thirst = Math.min(100, p.thirst + 30);
  else if (s.id === 'bandage') { if (t < p.nextBandage) return toast(p, 'Бинт: перезарядка', 'warn'); p.nextBandage = t + 5000; p.hp = Math.min(100, p.hp + 5); p.regen = 5; }
  else if (s.id === 'medkit') p.hp = Math.min(100, p.hp + 40);
  else return;
  s.count--; if (!s.count) p.inv[slot] = null; sendSelf(p);
}
function moveSlots(p, A, i, Bv, j, capA, capB) {
  if (i === j && A === Bv) return; if (i < 0 || j < 0 || i >= capA || j >= capB) return;
  const a = A[i], b = Bv[j]; if (!a) return;
  const hotCheck = (arr, idx, item) => arr !== p.inv || idx >= HOT || !item || hotOk(item.id);
  if (!hotCheck(Bv, j, a) || !hotCheck(A, i, b)) return toast(p, 'В хотбар нельзя положить это', 'warn');
  if (b && b.id === a.id && I[a.id].s > 1 && (a.skin || null) === (b.skin || null)) { const k = Math.min(I[a.id].s - b.count, a.count); b.count += k; a.count -= k; if (!a.count) A[i] = null; return; }
  A[i] = b || null; Bv[j] = a;
}

// ---------- вход / сеть ----------
const mkPlayer = (socket, user, row) => ({
  socket, id: socket.id, uid: user.id, name: user.login, isAdmin: !!user.isAdmin, x: row.x, y: row.y, z: row.z, rot: row.rotation || 0, pitch: 0, hp: row.hp, hunger: row.hunger, thirst: row.thirst, kills: row.kills, deaths: row.deaths, playtimeBase: row.playtime || 0, joinAt: now(),
  inv: Array(TOTAL).fill(null), eq: { helmet: null, chest: null, pants: null, backpack: null }, sel: 0, flags: { fly: false, noclip: false, god: false }, anim: 'idle', ak: 0, act: '', dead: false,
  mags: {}, nextAttack: 0, reloadEnd: 0, nextBandage: 0, regen: 0, queue: [], lastChat: 0, lastCmd: 0, spam: 0, lastText: '', lastMove: now(), ping: 0, builds: db.prepare('SELECT COUNT(*) c FROM buildings WHERE owner_id=?').get(user.id).c, crafts: 0, lastMsgFrom: null, chestOpen: null, skin: null,
});
const muted = new Map();
function onJoin(socket, token) {
  const pl = verifyToken(token); const user = pl && db.prepare('SELECT * FROM users WHERE id=?').get(pl.uid);
  if (!user) return socket.emit('join:error', 'Недействительный токен — войдите заново');
  if (user.banned) return socket.emit('join:error', 'Вы заблокированы: ' + (user.ban_reason || ''));
  const ip = socket.handshake.address; if (db.prepare('SELECT 1 FROM ip_bans WHERE ip=?').get(ip) && !user.isAdmin) return socket.emit('join:error', 'Ваш IP заблокирован');
  const old = G.byUid.get(user.id);
  if (!old && G.players.size >= MAX_PLAYERS && !user.isAdmin) return socket.emit('join:error', `Сервер переполнен (${G.players.size}/${MAX_PLAYERS})`);
  if (old) { old.socket.emit('session:replaced'); savePlayer(old); removePlayer(old, true); old.socket.disconnect(true); }
  db.prepare('INSERT OR IGNORE INTO players(user_id) VALUES(?)').run(user.id);
  const row = db.prepare('SELECT * FROM players WHERE user_id=?').get(user.id);
  const fresh = row.x == null; if (fresh) { const sp = G.WG.beachSpawn(); row.x = sp.x; row.y = sp.y; row.z = sp.z; }
  if (row.hp <= 0) row.hp = 70;
  const p = mkPlayer(socket, user, row); G.players.set(socket.id, p); G.byUid.set(user.id, p);
  for (const r of db.prepare('SELECT * FROM inventory WHERE user_id=?').all(user.id)) p.inv[r.slot] = { id: r.item_id, count: r.count, dur: r.durability, skin: r.skin };
  for (const r of db.prepare('SELECT * FROM equipment WHERE user_id=?').all(user.id)) p.eq[r.slot] = { id: r.item_id, dur: r.durability };
  const sk = db.prepare('SELECT skin_id FROM user_skins WHERE user_id=? AND active=1').get(user.id); p.skin = sk ? sk.skin_id : null;
  let first = false;
  if (!user.starter_pack_claimed) { addItem(p, 'rock', 1); addItem(p, 'torch', 1); db.prepare('UPDATE users SET starter_pack_claimed=1 WHERE id=?').run(user.id); first = true; }
  for (const pi of db.prepare('SELECT * FROM pending_items WHERE user_id=?').all(user.id)) { giveOrDrop(p, pi.item_id, pi.count); } db.prepare('DELETE FROM pending_items WHERE user_id=?').run(user.id);
  socket.emit('init', { id: socket.id, uid: user.id, name: user.login, isAdmin: p.isAdmin, x: p.x, y: p.y, z: p.z, rot: p.rot, first, res: G.res.map(r => [r.id, r.type, r.x, r.y, r.z, r.respawn > now() ? 0 : 1, r.hits || 0]), zones: G.zones, monuments: G.monuments, roads: G.roads, crates: G.crates.map(c => ({ id: c.id, k: c.k, x: c.x, y: c.y, z: c.z, r: c.r, full: c.items ? 1 : 0 })), builds: [...G.builds.values()].map(pubBuild), bags: [...G.bags.values()].map(b => ({ id: b.id, x: b.x, y: b.y, z: b.z, kind: b.kind, ic: I[b.items[0].id].e })), t: gameTime(), w: G.weather });
  sendSelf(p); sysAll(`${p.name} зашёл на сервер`);
  bind(socket, p);
}
function removePlayer(p, silent) { G.players.delete(p.socket.id); if (G.byUid.get(p.uid) === p) G.byUid.delete(p.uid); if (!silent) sysAll(`${p.name} вышел с сервера`); }
function bind(socket, p) {
  const on = (ev, fn) => socket.on(ev, (...a) => { try { if (G.players.get(socket.id) === p) fn(...a); } catch (e) { console.error('[socket]', ev, e); } });
  on('move', d => {
    if (p.dead || !d) return; const t = now(), dt = Math.max((t - p.lastMove) / 1000, .05); p.lastMove = t;
    const x = +d.x, y = +d.y, z = +d.z; if (![x, y, z].every(Number.isFinite)) return;
    if (!p.isAdmin && Math.hypot(x - p.x, z - p.z) > 14 * dt + 4) return socket.emit('teleport', { x: p.x, y: p.y, z: p.z });
    p.x = x; p.y = Math.max(-5, Math.min(300, y)); p.z = z; p.rot = +d.r || 0; p.pitch = +d.p || 0; p.anim = String(d.a || 'idle').slice(0, 8);
    if (Number.isInteger(d.s) && d.s >= -1 && d.s < HOT && d.s !== p.sel) { p.sel = d.s; }
  });
  on('sel', i => { if (Number.isInteger(i) && i >= -1 && i < HOT) p.sel = i; });
  on('ping:report', ms => { p.ping = Math.min(9999, +ms || 0); });
  on('ping', cb => typeof cb === 'function' && cb());
  on('players:list', cb => typeof cb === 'function' && cb([...G.players.values()].map(q => ({ n: q.name, ping: q.ping }))));
  on('chat:send', d => {
    let text = String((d && d.text) || '').trim().slice(0, 200); if (!text || text[0] === '/') return; const t = now();
    if (!p.isAdmin) {
      if ((muted.get(p.uid) || 0) > t) return socket.emit('chat:mute', { sec: Math.ceil((muted.get(p.uid) - t) / 1000) });
      if (t - p.lastChat < 2000 || text.toLowerCase() === p.lastText) { p.spam++; if (p.spam >= 3) { muted.set(p.uid, t + 10000); p.spam = 0; return socket.emit('chat:mute', { sec: 10 }); } return sys(p, 'Не так быстро (1 сообщение в 2 сек)'); }
      text = text.replace(/(https?:\/\/|www\.)\S+|\b[\w-]+\.(com|ru|net|org|io|gg|xyz|me|su)\b/gi, '[ссылка скрыта]');
    }
    p.lastChat = t; p.lastText = text.toLowerCase(); G.io.emit('chat:message', { id: String(d.id || t + Math.random()), name: p.name, text });
  });
  on('command:execute', text => {
    text = String(text || '').trim(); if (text.length < 2 || text[0] !== '/') return; const t = now();
    if (!p.isAdmin && t - p.lastCmd < 1000) return; p.lastCmd = t;
    console.log(`[cmd] ${p.name}: ${text}`);
    require('./commands')(api, p, text);
  });
  on('inv:move', d => { if (p.dead) return; moveSlots(p, p.inv, +d.from, p.inv, +d.to, invSize(p), invSize(p)); sendSelf(p); });
  on('inv:quick', i => { const s = p.inv[i]; if (!s) return; const to = i < HOT ? [HOT, invSize(p)] : [0, HOT]; if (i >= HOT && !hotOk(s.id)) return; for (let j = to[0]; j < to[1]; j++) if (!p.inv[j]) { p.inv[j] = s; p.inv[i] = null; break; } sendSelf(p); });
  on('inv:drop', d => { const s = p.inv[d.slot]; if (!s || p.dead) return; const k = d.all ? s.count : 1; const it = { id: s.id, count: k, dur: s.dur, skin: s.skin }; s.count -= k; if (!s.count) p.inv[d.slot] = null; dropBag(p.x + Math.sin(p.rot) * -1, p.y, p.z + Math.cos(p.rot) * -1, [it]); sendSelf(p); });
  on('inv:use', i => { if (!p.dead) useItem(p, i); });
  on('inv:sort', () => { const n = invSize(p); const items = p.inv.slice(HOT, n).filter(Boolean).sort((a, b) => (I[a.id].t + a.id).localeCompare(I[b.id].t + b.id)); for (let i = HOT; i < n; i++) p.inv[i] = items[i - HOT] || null; sendSelf(p); });
  on('eq:unequip', slot => { const e = p.eq[slot]; if (!e) return; if (slot === 'backpack' && p.inv.slice(HOT + GRID).some(Boolean)) return toast(p, 'Сначала освободите слоты рюкзака', 'warn'); p.eq[slot] = null; giveOrDrop(p, e.id, 1, e.dur); sendSelf(p); });
  on('attack', d => onAttack(p, d || {}));
  on('reload', () => reload(p));
  on('craft', d => craft(p, d.id, d.qty));
  on('craft:cancel', i => { const q = p.queue[i]; if (!q) return; p.queue.splice(i, 1); const r = DATA.recipes.find(x => x.id === q.id); Object.entries(r.ing).forEach(([k, v]) => giveOrDrop(p, k, v * q.mult)); sendSelf(p); });
  on('place', d => !p.dead && placeBuild(p, d || {}));
  on('respawn', () => respawn(p));
  on('crate:open', id => {
    const c = G.crateMap.get(+id); if (!c || p.dead || Math.hypot(c.x - p.x, c.z - p.z) > 3.8 || Math.abs(c.y - p.y) > 3) return;
    if (!c.items) return toast(p, 'Ящик пуст — загляните позже', 'info');
    p.crateOpen = c.id; socket.emit('chest:open', crateView(c));
  });
  on('bag:take', id => {
    const b = G.bags.get(id); if (!b || p.dead || Math.hypot(b.x - p.x, b.z - p.z) > 3.5) return; const left = [];
    for (const it of b.items) { const r = addItem(p, it.id, it.count, it.dur, it.skin); if (r > 0) left.push({ ...it, count: r }); }
    if (left.length) { b.items = left; db.prepare('UPDATE loot_bags SET contents_json=? WHERE id=?').run(JSON.stringify(left), b.id); toast(p, 'Инвентарь полон', 'warn'); } else removeBag(b); sendSelf(p);
  });
  on('build:use', d => {
    const b = G.builds.get(d.id); if (!b || p.dead || Math.hypot(b.x - p.x, b.z - p.z) > 5) return;
    if (['door', 'gate', 'sliding_door', 'double_door'].includes(b.type)) { if (!canAccess(p, b, d.code)) return socket.emit('door:locked', { id: b.id, code: b.lock && b.lock.type === 'code' }); b.open = !b.open; G.io.emit('build:update', { id: b.id, open: b.open ? 1 : 0 }); }
    else if (b.type === 'chest') { if (!canAccess(p, b, d.code)) return socket.emit('door:locked', { id: b.id, code: b.lock && b.lock.type === 'code' }); p.chestOpen = b.id; socket.emit('chest:open', { id: b.id, slots: b.chest, lock: b.lock ? b.lock.type : 'none', owner: b.owner === p.uid || p.isAdmin }); }
    else if (b.type === 'cupboard') { if (!isMember(p, b) && !p.isAdmin) return toast(p, 'Это чужой шкаф', 'error'); socket.emit('cupboard:open', cupInfo(b, p)); }
    else if (b.type === 'sleeping_bag') { if (b.owner !== p.uid && !p.isAdmin) return toast(p, 'Чужой спальник', 'error'); destroyBuild(b); giveOrDrop(p, 'sleeping_bag', 1); sendSelf(p); }
    else if (b.type === 'campfire') {
      if (b.burn < now()) return toast(p, 'Костёр погас', 'warn'); let c = countItem(p, 'raw_meat'); if (c) { removeItem(p, 'raw_meat', c); giveOrDrop(p, 'cooked_meat', c); toast(p, `Приготовлено: ${c}`, 'success'); }
      if (b.coal >= 1) { giveOrDrop(p, 'charcoal', Math.floor(b.coal)); b.coal = 0; } sendSelf(p);
    }
    else if (B[b.type].st || b.type === 'workbench') { if (b.owner !== p.uid && !p.isAdmin) return; socket.emit('build:menu', { id: b.id, type: b.type, tier: b.tier, hp: b.hp, up: DATA.upgrade[b.tier] || null, st: B[b.type].st }); }
  });
  on('build:upgrade', id => {
    const b = G.builds.get(id); if (!b || !B[b.type].st || (b.owner !== p.uid && !p.isAdmin) || Math.hypot(b.x - p.x, b.z - p.z) > 6) return; const up = DATA.upgrade[b.tier]; if (!up) return toast(p, 'Максимальный уровень', 'warn');
    if (!hasAll(p, up.cost)) return toast(p, 'Не хватает: ' + missing(p, up.cost), 'error'); takeAll(p, up.cost); b.tier++; b.hp = up.hp; db.prepare('UPDATE buildings SET tier=?,hp=? WHERE id=?').run(b.tier, b.hp, b.id); G.io.emit('build:update', { id: b.id, tier: b.tier, hp: b.hp }); toast(p, 'Постройка улучшена', 'success'); sendSelf(p);
  });
  on('build:remove', id => { const b = G.builds.get(id); if (!b || (b.owner !== p.uid && !p.isAdmin)) return; destroyBuild(b); });
  on('lock:set', d => {
    const b = G.builds.get(d.id); if (!b || b.owner !== p.uid && !p.isAdmin || !(['door', 'gate', 'sliding_door', 'double_door', 'chest'].includes(b.type)) || b.lock) return;
    const type = d.type === 'code' ? 'code' : 'basic', item = type === 'code' ? 'lock_code' : 'lock_basic'; if (countItem(p, item) < 1) return toast(p, 'Нет замка в инвентаре', 'error');
    let code = null; if (type === 'code') { code = String(d.code || ''); if (!/^\d{4}$/.test(code)) return toast(p, 'Код — 4 цифры', 'error'); }
    removeItem(p, item, 1); b.lock = { type, code }; db.prepare('UPDATE doors SET lock_type=?,code=? WHERE id=?').run(type, code, b.id); G.io.emit('build:update', { id: b.id, lock: type }); toast(p, 'Замок установлен', 'success'); sendSelf(p);
  });
  on('lock:change', d => { const b = G.builds.get(d.id); if (!b || !b.lock || b.lock.type !== 'code' || (b.owner !== p.uid && !p.isAdmin)) return; if (!p.isAdmin && String(d.old) !== b.lock.code) return toast(p, 'Старый код неверен', 'error'); if (!/^\d{4}$/.test(String(d.code))) return toast(p, 'Код — 4 цифры', 'error'); b.lock.code = String(d.code); db.prepare('UPDATE doors SET code=? WHERE id=?').run(b.lock.code, b.id); toast(p, 'Код изменён', 'success'); });
  on('lock:remove', d => { const b = G.builds.get(d.id); if (!b || !b.lock || (b.owner !== p.uid && !p.isAdmin)) return; const item = b.lock.type === 'code' ? 'lock_code' : 'lock_basic'; b.lock = null; db.prepare("UPDATE doors SET lock_type='none',code=NULL WHERE id=?").run(b.id); giveOrDrop(p, item, 1); G.io.emit('build:update', { id: b.id, lock: 'none' }); sendSelf(p); });
  on('cupboard:add', d => {
    const b = G.builds.get(d.id); if (!b || b.type !== 'cupboard' || (b.owner !== p.uid && !p.isAdmin)) return; const u = db.prepare('SELECT id,login FROM users WHERE login=?').get(String(d.name || ''));
    if (!u) return toast(p, 'Игрок не найден', 'error'); if (b.members.size >= 10) return toast(p, 'Максимум 10 игроков', 'warn');
    b.members.add(u.id); db.prepare('INSERT OR IGNORE INTO cupboard_members VALUES(?,?)').run(b.id, u.id); socket.emit('cupboard:open', cupInfo(b, p));
  });
  on('cupboard:remove', d => { const b = G.builds.get(d.id); if (!b || b.type !== 'cupboard' || (b.owner !== p.uid && !p.isAdmin)) return; const u = db.prepare('SELECT id FROM users WHERE login=?').get(String(d.name || '')); if (!u) return; b.members.delete(u.id); db.prepare('DELETE FROM cupboard_members WHERE cupboard_id=? AND user_id=?').run(b.id, u.id); socket.emit('cupboard:open', cupInfo(b, p)); });
  on('chest:move', d => {
    if (isCrateId(d && d.id)) return crateMove(p, d);
    const b = G.builds.get(p.chestOpen); if (!b || b.id !== d.id || Math.hypot(b.x - p.x, b.z - p.z) > 6) return;
    const src = d.from.k === 'inv' ? p.inv : b.chest, dst = d.to.k === 'inv' ? p.inv : b.chest; moveSlots(p, src, +d.from.i, dst, +d.to.i, src === p.inv ? invSize(p) : 24, dst === p.inv ? invSize(p) : 24);
    saveChest(b); socket.emit('chest:open', { id: b.id, slots: b.chest, lock: b.lock ? b.lock.type : 'none', owner: b.owner === p.uid || p.isAdmin }); sendSelf(p);
  });
  on('chest:all', d => {
    if (isCrateId(d && d.id)) return crateAll(p, d);
    const b = G.builds.get(p.chestOpen); if (!b || b.id !== d.id) return;
    if (d.mode === 'take') for (let i = 0; i < 24; i++) { const s = b.chest[i]; if (!s) continue; const left = addItem(p, s.id, s.count, s.dur, s.skin); b.chest[i] = left ? { ...s, count: left } : null; }
    else for (let i = HOT; i < invSize(p); i++) { const s = p.inv[i]; if (!s) continue; const e = b.chest.findIndex(x => !x); if (e < 0) break; b.chest[e] = s; p.inv[i] = null; }
    saveChest(b); socket.emit('chest:open', { id: b.id, slots: b.chest, lock: b.lock ? b.lock.type : 'none', owner: b.owner === p.uid || p.isAdmin }); sendSelf(p);
  });
  socket.on('disconnect', () => { if (G.players.get(socket.id) !== p) return; savePlayer(p); removePlayer(p); });
}
function cupInfo(b, p) { const names = [...b.members].map(id => (db.prepare('SELECT login FROM users WHERE id=?').get(id) || {}).login).filter(Boolean); return { id: b.id, owner: b.owner === p.uid || p.isAdmin, members: names }; }

// ---------- главный цикл ----------
function init(io) {
  G.io = io;
  return import(pathToFileURL(path.join(__dirname, '../shared/worldgen.mjs')).href).then(WG => {
    G.WG = WG; const w = WG.generateWorld(); G.zones = w.zones; G.monuments = w.monuments; G.roads = w.roads;
    G.crates = w.crates.map(c => ({ ...c, items: null, respawn: 0 })); G.crates.forEach(c => { G.crateMap.set(c.id, c); refillCrate(c); });
    const ex = new Map(db.prepare('SELECT id,respawn_at FROM world_resources').all().map(r => [r.id, r.respawn_at]));
    const ins = db.prepare('INSERT OR REPLACE INTO world_resources(id,type,x,y,z,respawn_at) VALUES(?,?,?,?,?,?)');
    db.transaction(() => w.res.forEach(([id, type, x, y, z]) => { const r = { id, type, x, y, z, respawn: ex.get(id) || 0, hits: 0 }; G.res.push(r); G.resMap.set(id, r); if (!ex.has(id)) ins.run(id, type, x, y, z, 0); }))();
    loadBuilds();
    for (const r of db.prepare('SELECT * FROM loot_bags').all()) { if (r.expires_at < now()) db.prepare('DELETE FROM loot_bags WHERE id=?').run(r.id); else { const items = JSON.parse(r.contents_json); G.bags.set(r.id, { id: r.id, x: r.x, y: r.y, z: r.z, items, exp: r.expires_at, kind: 'drop' }); } }
    io.on('connection', socket => { const to = setTimeout(() => socket.disconnect(true), 15000); socket.on('join', t => { clearTimeout(to); onJoin(socket, t); }); });
    setInterval(() => { // снапшоты 20 Гц
      const list = [...G.players.values()];
      for (const p of list) {
        const out = []; for (const q of list) { if (q === p || Math.abs(q.x - p.x) > 350 || Math.abs(q.z - p.z) > 350) continue; const s = q.sel >= 0 ? q.inv[q.sel] : null; out.push({ i: q.id, n: q.name, x: r2(q.x), y: r2(q.y), z: r2(q.z), r: r2(q.rot), p: r2(q.pitch), a: q.anim, h: s ? s.id : null, sk: s ? s.skin : null, ak: q.ak, ac: q.act, d: q.dead ? 1 : 0 }); }
        p.socket.volatile.emit('state', out);
      }
    }, 50);
    setInterval(() => { for (const p of G.players.values()) craftTick(p); }, 250);
    setInterval(() => { // 1 раз в секунду
      const t = now();
      for (const p of G.players.values()) {
        if (p.dead) continue;
        if (!p.flags.god) { p.hunger = Math.max(0, p.hunger - 1 / 60); p.thirst = Math.max(0, p.thirst - 1 / 60); if (p.hunger <= 0) p.hp -= 1; if (p.thirst <= 0) p.hp -= 1; }
        if (p.regen > 0) { p.regen--; p.hp = Math.min(100, p.hp + 1); }
        if (p.hp <= 0) { die(p, null, 'голод/жажда'); continue; }
        sendSelf(p);
      }
      for (const f of G.fires) {
        if (f.dps) for (const q of G.players.values()) if (!q.dead && Math.hypot(q.x - f.x, q.z - f.z) <= f.r && Math.abs(q.y - f.y) < 3) damagePlayer(q, f.dps, f.by, 'body', 'molotov', true);
        if (f.bdps || f.dps) for (const b of G.builds.values()) if (b.tier === 0 && b.type !== 'campfire' && Math.hypot(b.x - f.x, b.z - f.z) <= f.r + .5 && Math.abs(b.y - f.y) < 4) damageBuild(b, f.bdps || .5);
      }
      G.fires = G.fires.filter(f => f.until > t);
      for (const b of G.builds.values()) if (b.type === 'campfire' && b.burn > t) b.coal = Math.min(10, (b.coal || 0) + .05);
      for (const [id, b] of G.bags) if (b.exp < t) removeBag(b);
    }, 1000);
    setInterval(() => { const t = now(); for (const r of G.res) if (r.respawn && r.respawn <= t) { r.respawn = 0; db.prepare('UPDATE world_resources SET respawn_at=0 WHERE id=?').run(r.id); io.emit('res:state', { id: r.id, alive: 1 }); } }, 10000);
    setInterval(() => { const t = now(); for (const c of G.crates) if (!c.items && c.respawn <= t) { refillCrate(c); io.emit('crate:state', { id: c.id, full: 1 }); } }, 5000); // респавн ящиков
    setInterval(saveAll, 30000);
    setInterval(() => io.emit('time', { t: gameTime(), w: G.weather }), 15000);
    console.log(`[game] Мир: ${G.res.length} ресурсов, ${G.builds.size} построек, ${G.crates.length} ящиков на РТ, дорог: ${G.roads.length}`);
  });
}
const api = { G, I, C, B, DATA, init, find, sys, sysAll, toast, sendSelf, savePlayer, saveAll, addItem: giveOrDrop, damagePlayer, die, respawn, setTime, db, shop, admin, muted, destroyBuild, heightAt, removePlayer };
api.setWeather = w => { G.weather = w; G.io.emit('time', { t: gameTime(), w }); };
api.wipe = () => { for (const b of [...G.builds.values()]) { G.builds.delete(b.id); } ['buildings', 'doors', 'cupboards', 'cupboard_members', 'chests', 'loot_bags'].forEach(t => db.prepare(`DELETE FROM ${t}`).run()); G.bags.clear(); db.prepare('UPDATE world_resources SET respawn_at=0').run(); G.res.forEach(r => { r.respawn = 0; }); G.crates.forEach(refillCrate); G.io.emit('world:wipe'); };
api.teleport = (p, x, y, z) => { p.x = x; p.y = y; p.z = z; p.socket.emit('teleport', { x, y, z }); };
api.MAX_PLAYERS = MAX_PLAYERS;
module.exports = api;
