// Ядро игры: сцена, цикл, мультиплеер-события, HUD, взаимодействие, бой, строительство, карты, пауза.
import * as THREE from 'three';
import { World, heightAt, makeMapImage, MAP_SPAN, buildMesh, ISLAND_R, weakPoint, WEAK_TYPES, crateMesh, setCrateFull, CRATE_NAMES } from './world.js';
import { LocalPlayer, ViewModel, RemotePlayers } from './player.js';
import { Input, initInput } from './input.js';
import { initMobile } from './mobile-controls.js';
import { net } from './network.js';
import { Inv } from './inventory.js';
import { Craft } from './craft.js';
import { Chat } from './chat.js';
import { DATA, itemName } from './data.js';
import { $, $$, toast, modal, prompt4, confirmBox, settings, onSettings, show, overlay, esc, detectTouch, applyLayout } from './ui.js';
import { play, unlock, startMusic } from './audio.js';
import { loadCatalog } from './skins.js';

const TIPS = ['Собирай дерево стартовым камнем, затем крафти топор (C).', 'Верстак нужен для Тир 2–3. Ставь его рядом с базой.', 'C4 — единственный быстрый способ рейда.', 'Спальник — точка респавна. Ставь его в укромном месте.', 'PvP включён везде, даже на пляже.', 'Шкаф защищает зону 15 м от чужого строительства.'];
const REGEN = {};
const RES_SND = { tree: 'hit_wood', rock: 'hit_stone', ore: 'hit_ore', sulfur: 'hit_stone', scrap: 'hit_metal', barrel: 'hit_metal', crate: 'hit_wood', bush: 'hit_leaf' };
const RES_COL = { tree: '#8b5a2b', bush: '#4c8a3a', rock: '#9a9a9a', ore: '#d7e2f0', sulfur: '#e8d83a', scrap: '#b0b4ba', barrel: '#a8452e', crate: '#9a7640' };
const HARVEST = new Set(['rock', 'stone_axe', 'metal_axe', 'stone_pickaxe', 'metal_pickaxe']);
export const Game = {
  running: false, ui: null, hooks: {}, bags: new Map(), marks: [],
  async start(base, token, setProgress) {
    const tip = $('#load-tip'); tip.textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
    const prog = p => { $('#load-bar').style.width = p + '%'; setProgress && setProgress(p); };
    prog(10); const init = await net.connect(base, token); prog(40);
    try { await loadCatalog(); } catch { } prog(55);
    this.canvas = $('#game'); if (!this.renderer) { this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' }); this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; initInput(this.canvas); this.mobile = initMobile(); }
    this.scene = new THREE.Scene(); this.cam = new THREE.PerspectiveCamera(settings.fov, innerWidth / innerHeight, .08, 1200); this.scene.add(this.cam);
    this.me = init; this.time = { t: init.t, w: init.w, at: performance.now() }; this.applyGraphics();
    this.world = new World(this.scene, init, { view: this.view, lite: document.body.classList.contains('touch') || settings.quality === 'low' }); this.applyGraphics(); prog(75);
    this.local = new LocalPlayer(this.cam, this.world); this.local.teleport(init.x, init.y, init.z); this.local.yaw = init.rot || 0; this.local.stepCb = () => { const p = this.local.pos, gy = heightAt(p.x, p.z), fy = this.world.buildings.floorY(p.x, p.z, p.y); play(Math.abs(p.y - fy) < .15 && fy > gy + .05 ? 'step_wood' : gy < 2.4 ? 'step_sand' : gy > 28 ? 'step_rock' : 'step', .35); };
    this.vm = new ViewModel(this.cam); this.vm.onEvent = n => play(n, .7); this.shake = 0; this.drawing = false; this.hbT = 0;
    { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 4, 32, 32, 30); gr.addColorStop(0, 'rgba(255,80,40,.55)'); gr.addColorStop(1, 'rgba(255,80,40,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); x.strokeStyle = '#ff3b2a'; x.lineWidth = 5; x.beginPath(); x.arc(32, 32, 18, 0, 6.3); x.stroke(); x.strokeStyle = '#fff'; x.lineWidth = 4; x.beginPath(); x.moveTo(23, 23); x.lineTo(41, 41); x.moveTo(41, 23); x.lineTo(23, 41); x.stroke();
      this.wpMark = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false, depthWrite: false })); this.wpMark.renderOrder = 999; this.wpMark.visible = false; this.scene.add(this.wpMark); } this.remotes = new RemotePlayers(this.scene); this.fx = []; this.bags.clear(); this.heldKey = null;
    this.flash = new THREE.PointLight('#ffcc66', 0, 14); this.flash.position.set(0, -.1, -.9); this.cam.add(this.flash);
    this.flashlight = new THREE.SpotLight('#fff6dd', 0, 60, .5, .4, 1); this.flashlight.position.set(0, 0, 0); this.flashlight.target.position.set(0, 0, -5); this.cam.add(this.flashlight, this.flashlight.target); this.flOn = false; this.flashlight.visible = false;
    this.rain = this.makeRain(); this.scene.add(this.rain);
    this.mapImg = makeMapImage(512, init); this.marks = settings.marks || [];
    init.builds.forEach(b => this.world.buildings.add(b)); init.bags.forEach(b => this.addBag(b));
    this.crates = new Map(); (init.crates || []).forEach(c => this.addCrate(c)); // ящики на РТ
    Inv.init(net, i => this.select(i)); Inv.onLock = (id, lk) => this.lockMenu(id); Craft.init(net, () => this.nearBench());
    Chat.init(net, init.isAdmin, on => { if (on) this.openUI('chat'); else if (this.ui === 'chat') this.closeUI(); });
    this.bindNet(); this.bindInput(); prog(95);
    this.running = true; this.ui = null; Input.enabled = true; Input.blocked = false; Input.reset();
    document.body.classList.add('ingame'); $$('.screen').forEach(s => s.classList.remove('active', 'out')); $('#hud').classList.remove('hidden');
    const t = applyLayout(); $('#touch').classList.toggle('hidden', !t); this.mobile.orient();
    $('#hotbar').addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
    if (init.first) { toast('Добро пожаловать! У тебя есть камень и факел. Собирай ресурсы, крафти, выживай.', 'success'); $('#tutorial').classList.remove('hidden'); const c = () => { $('#tutorial').classList.add('hidden'); removeEventListener('pointerdown', c); }; setTimeout(() => addEventListener('pointerdown', c), 800); this.tutClose = c; }
    prog(100); startMusic(); this.last = performance.now(); this.fpsT = 0; this.fpsN = 0; this.lowT = 0; this.sendT = 0; this.focusT = 0; this.mapT = 0; this.lodT = 0; this.pickT = 0;
    this.raf = requestAnimationFrame(t => this.loop(t)); this.resizeH = () => this.resize(); addEventListener('resize', this.resizeH); this.resize();
    this.unsub = onSettings(() => this.applyGraphics());
  },
  stop() {
    this.running = false; cancelAnimationFrame(this.raf); Input.enabled = false; Input.reset(); removeEventListener('resize', this.resizeH); if (document.pointerLockElement) document.exitPointerLock(); this.closeSub();
    net.disconnect(); document.body.classList.remove('ingame'); $('#hud').classList.add('hidden'); $('#touch').classList.add('hidden'); $('#rotate-hint').classList.add('hidden'); ['inv', 'craft', 'players', 'map'].forEach(n => $('#panel-' + n).classList.add('hidden')); overlay('pause', false); $('#death').classList.add('hidden');
    if (this.scene) this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    this.scene = null; Input.handlers = {};
  },
  applyGraphics() {
    const q = settings.quality, mob = document.body.classList.contains('touch') || detectTouch() && settings.layout !== 'pc'; const r = this.renderer; if (!r) return;
    const pr = mob ? (q === 'low' ? .65 : q === 'medium' ? .9 : 1.25) : Math.min(devicePixelRatio, q === 'high' ? 2 : q === 'medium' ? 1.25 : 1) * (q === 'low' ? .8 : 1); r.setPixelRatio(Math.max(.5, Math.min(pr, devicePixelRatio)));
    const cap = q === 'low' ? 150 : q === 'medium' ? 300 : 600; this.view = Math.min(cap, settings.viewDistance) * (mob ? .7 : 1);
    r.shadowMap.enabled = !!settings.shadows && q !== 'low' && (!mob || q === 'high'); this.shadowSize = mob ? 512 : q === 'high' ? 2048 : 1024;
    if (this.world) { const s = this.world.sun; s.castShadow = r.shadowMap.enabled; s.shadow.mapSize.set(this.shadowSize, this.shadowSize); const c = s.shadow.camera; c.left = c.bottom = -50; c.right = c.top = 50; c.near = 1; c.far = 400; c.updateProjectionMatrix(); s.shadow.map && (s.shadow.map.dispose(), s.shadow.map = null); this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); }
    if (this.cam) { this.cam.fov = settings.fov; this.cam.updateProjectionMatrix(); }
    if (settings.fullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => { }); else if (!settings.fullscreen && document.fullscreenElement) document.exitFullscreen?.();
  },
  resize() { this.renderer.setSize(innerWidth, innerHeight, false); this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix(); this.mobile && this.mobile.orient(); },
  makeRain() { const n = 700, a = new Float32Array(n * 6); for (let i = 0; i < n; i++) { const x = (Math.random() - .5) * 40, y = Math.random() * 25, z = (Math.random() - .5) * 40; a.set([x, y, z, x, y - .6, z], i * 6); } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3)); const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#9bb', transparent: true, opacity: .5 })); l.frustumCulled = false; l.visible = false; return l; },
  // ---------- UI-состояния ----------
  openUI(name) { this.ui = name; Input.blocked = true; Input.mouse.l = Input.mouse.r = false; if (document.pointerLockElement) document.exitPointerLock(); },
  // Настройки и репорт, открытые из паузы, — это вложенные экраны паузы: закрываем их вместе с ней.
  closeSub() { let any = false; for (const n of ['settings', 'report']) { const e = $('#' + n); if (e.classList.contains('active')) { e.classList.remove('active', 'out'); any = true; } } return any; },
  closeUI() {
    const was = this.ui; this.ui = null; Input.blocked = false; ['inv', 'craft', 'players', 'map'].forEach(n => $('#panel-' + n).classList.add('hidden')); Inv.close(); Craft.close(); overlay('pause', false); this.closeSub();
    if (was === 'chat') Chat.close(true); if (!document.body.classList.contains('touch')) try { this.canvas.requestPointerLock(); } catch { }
  },
  toggle(name) { if (this.ui === name) return this.closeUI(); if (this.ui || this.local.dead) return; this.openUI(name); if (name === 'inv') Inv.open(); if (name === 'craft') Craft.open(); if (name === 'map') { $('#panel-map').classList.remove('hidden'); this.drawBig(); } if (name === 'players') { $('#panel-players').classList.remove('hidden'); this.listPlayers(); } },
  pause() { if (this.ui === 'pause' && this.closeSub()) { overlay('pause', true); return; } if (this.ui && this.ui !== 'pause') return this.closeUI(); if (this.ui === 'pause') return this.closeUI(); this.openUI('pause'); overlay('pause', true); },
  listPlayers() { const p = $('#panel-players'); net.socket.emit('players:list', list => { p.innerHTML = `<div class="gp" style="min-width:260px"><b>Игроки (${list.length})</b>${list.map(x => `<div class="rec"><span>${esc(x.n)}</span><small>${x.ping} мс</small></div>`).join('')}</div>`; }); },
  select(i) { Inv.st.sel = i; net.emit('sel', i); Inv.renderHotbar(); play('click', .3); this.syncHeld(); },
  syncHeld() { const h = Inv.held(), key = h ? h.id + '|' + (h.skin || '') : 'fist'; if (key !== this.heldKey) { this.heldKey = key; this.vm.setItem(h ? h.id : 'fist', h && h.skin); } },
  nearBench() { const p = this.local.pos; for (const b of this.world.buildings.map.values()) if (b.type === 'workbench' && Math.hypot(b.x - p.x, b.z - p.z) <= 3.5) return true; return false; },
  // ---------- сеть ----------
  bindNet() {
    net.onLost = msg => { if (!this.running) return; this.stop(); modal({ title: msg.includes('кикнули') ? 'Отключение' : 'Сервер недоступен', html: `<p>${esc(msg)}</p>`, buttons: [{ label: 'В меню', value: 'menu' }, { label: 'Повторить', primary: true, value: 'retry' }] }).then(v => { if (v === 'retry') this.hooks.retry && this.hooks.retry(); else this.hooks.menu && this.hooks.menu(); }); };
    net.on('self', s => { Inv.update(s); this.local.flags = s.flags; this.renderModes(s.flags); if (Craft.isOpen()) Craft.render(); this.syncHeld(); });
    net.on('state', list => this.remotes.sync(list));
    net.on('time', t => { this.time = { t: t.t, w: t.w, at: performance.now() }; });
    net.on('toast', t => toast(t.msg, t.type)); net.on('teleport', p => this.local.teleport(p.x, p.y, p.z));
    net.on('build:add', b => this.world.buildings.add(b)); net.on('build:update', u => this.world.buildings.update(u)); net.on('build:remove', id => this.world.buildings.remove(id));
    net.on('crate:state', d => { const g = this.crates && this.crates.get(d.id); if (g) { g.userData.full = d.full; setCrateFull(g, d.full); } });
    net.on('bag:add', b => this.addBag(b)); net.on('bag:remove', id => { const m = this.bags.get(id); if (m) { this.scene.remove(m); this.bags.delete(id); } });
    net.on('res:state', d => { const r = this.world.res.get(d.id); if (r && r.alive && !d.alive) { const dist = Math.hypot(r.x - this.local.pos.x, r.z - this.local.pos.z); if (dist < 60) play(r.type === 'tree' ? 'tree_fall' : r.type === 'rock' || r.type === 'ore' || r.type === 'sulfur' ? 'rock_break' : 'hit', Math.max(.2, 1 - dist / 60)); } this.world.setAlive(d.id, d.alive); });
    net.on('res:hit', d => { this.world.onHit(d); if (d.by !== this.me.id) { const r = this.world.res.get(d.id); if (r) { const dist = Math.hypot(r.x - this.local.pos.x, r.z - this.local.pos.z); if (dist < 40) play(RES_SND[r.type] || 'hit', .6 * (1 - dist / 40)); } } });
    net.on('gather:fx', d => { const r = this.world.res.get(d.id); if (!r) return; const L = this.local.pos, dx = L.x - r.x, dz = L.z - r.z, n = Math.hypot(dx, dz) || 1, tree = r.type === 'tree'; this.burst(new THREE.Vector3(r.x + dx / n * (tree ? .45 : .9), r.y + (tree ? 1.4 : .7), r.z + dz / n * (tree ? .45 : .9)), RES_COL[r.type] || '#aaa', d.wp ? 16 : 8); play(RES_SND[r.type] || 'hit'); if (d.wp) play('crit'); this.punch(d.wp ? 1 : .6); });
    net.on('damage', d => { const amt = d.amount || 10, f = $('#dmgflash'); f.style.boxShadow = `inset 0 0 ${Math.round(90 + Math.min(120, amt * 3))}px rgba(220,0,0,${Math.min(.95, .55 + amt / 80).toFixed(2)})`; f.classList.remove('show'); void f.offsetWidth; f.classList.add('show'); this.shake = Math.min(1, this.shake + .3 + amt / 40); this.local.recoil = Math.max(-.08, this.local.recoil - Math.min(.06, amt / 400)); play('hurt'); });
    net.on('hitmarker', h => { const m = $('#hitmark'); m.classList.remove('show', 'head'); void m.offsetWidth; if (h.head) m.classList.add('head'); m.classList.add('show'); play(h.head ? 'headshot' : 'hitmark', .6); play('hit_flesh', .6); this.punch(h.head ? 1 : .6); });
    net.on('death', d => { this.local.dead = true; this.openUI('dead'); Chat.close(false); $('#death').classList.remove('hidden'); $('#death-by').textContent = d.by ? `Вас убил ${d.by}` : 'Вы погибли'; play('death'); });
    net.on('respawn', p => { this.local.dead = false; this.local.teleport(p.x, p.y, p.z); $('#death').classList.add('hidden'); this.ui = null; this.closeUI(); });
    $('#btn-respawn').onclick = () => net.emit('respawn');
    net.on('reloading', r => this.vm.reload(r.t));
    net.on('shot', s => this.shotFx(s));
    net.on('fx:boom', b => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), new THREE.MeshBasicMaterial({ color: '#ff9a30', transparent: true, opacity: .9 })); m.position.set(b.x, b.y, b.z); this.scene.add(m); this.fx.push({ m, life: .5, grow: b.r * 3, light: new THREE.PointLight('#ff8a30', 8, 30) }); this.fx[this.fx.length - 1].light.position.copy(m.position); this.scene.add(this.fx[this.fx.length - 1].light); const d = Math.hypot(b.x - this.local.pos.x, b.z - this.local.pos.z); play('boom', Math.max(.1, 1 - d / 200)); });
    net.on('fx:throw', t => { const m = new THREE.Mesh(new THREE.SphereGeometry(.07, 8, 6), new THREE.MeshBasicMaterial({ color: t.k === 'molotov' ? '#ff8a30' : '#333' })); m.position.set(t.from.x, t.from.y, t.from.z); this.scene.add(m); this.fx.push({ m, life: .8, from: t.from, to: t.to, throw: true, t0: .8 }); });
    net.on('fx:smoke', p => { const m = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 10), new THREE.MeshBasicMaterial({ color: '#aaa', transparent: true, opacity: .55 })); m.position.set(p.x, p.y + 2, p.z); this.scene.add(m); this.fx.push({ m, life: 10, grow: 0, fade: true }); });
    net.on('chest:open', d => { if (this.ui !== 'inv') { this.openUI('inv'); } Inv.openChest(d); });
    net.on('cupboard:open', d => this.cupMenu(d)); net.on('door:locked', d => this.doorLocked(d)); net.on('build:menu', d => this.buildMenu(d));
    net.on('session:replaced', () => { if (!this.running) return; this.stop(); modal({ title: 'Сессия открыта в другой вкладке', html: '<p>Этот аккаунт вошёл в игру в другой вкладке браузера.</p>', buttons: [{ label: 'Вернуться в меню', primary: true, value: 1 }] }).then(() => this.hooks.menu && this.hooks.menu()); });
    net.on('world:wipe', () => location.reload());
  },
  bindInput() {
    const I = Input; I.handlers = {}; const L = this;
    I.on('inventory', () => L.toggle('inv')); I.on('craft', () => L.toggle('craft')); I.on('map', () => L.toggle('map')); I.on('players', () => L.toggle('players'));
    I.on('chat', () => { if (!L.ui && !L.local.dead) Chat.openBox(); }); I.on('pause', () => L.pause());
    I.on('slot', i => !L.ui && L.select(i)); I.on('wheel', d => { if (L.ui) return; const n = ((Inv.st.sel < 0 ? 0 : Inv.st.sel) + d + 6) % 6; L.select(n); });
    I.on('interact', () => !L.ui && L.interact()); I.on('reload', () => !L.ui && net.emit('reload'));
    I.on('drop', () => { if (L.ui === 'inv' && Inv.hover && Inv.hover.k === 'inv') net.emit('inv:drop', { slot: Inv.hover.i }); else if (!L.ui && Inv.st.sel >= 0) net.emit('inv:drop', { slot: Inv.st.sel }); });
    I.on('dropall', () => { if (L.ui === 'inv' && Inv.hover && Inv.hover.k === 'inv') net.emit('inv:drop', { slot: Inv.hover.i, all: true }); else if (!L.ui && Inv.st.sel >= 0) net.emit('inv:drop', { slot: Inv.st.sel, all: true }); });
    I.on('flashlight', () => { if (!Inv.count('flashlight')) return toast('Нужен фонарик (крафт, Тир 2)', 'warn'); L.flOn = !L.flOn; L.flashlight.visible = L.flOn; L.flashlight.intensity = L.flOn ? 6 : 0; });
    I.on('escape', () => { if (L.tutClose) L.tutClose(); if (L.ui === 'dead') return; if (L.ui === 'pause' && L.closeSub()) { overlay('pause', true); return; } if (L.ui) return L.closeUI(); if (L.ghostActive) { L.select(-1); return; } });
    I.on('unlock', () => { if (!L.running || L.ui || L.local.dead || document.body.classList.contains('touch')) return; L.pause(); });
    I.on('aimdown', () => { if (L.ghostActive) L.rot = ((L.rot || 0) + Math.PI / 2) % (Math.PI * 2); });
    $('#pa-resume').onclick = () => L.closeUI(); $('#pa-settings').onclick = () => { overlay('pause', false); L.hooks.settings && L.hooks.settings(); }; $('#pa-report').onclick = () => { overlay('pause', false); L.hooks.report && L.hooks.report(); };
    $('#pa-exit').onclick = async () => {
      let ok = true; try { ok = !settings.confirmExit || await confirmBox('Выйти в меню?', 'Прогресс будет сохранён.'); } catch { ok = true; }
      if (!ok) return;
      try { L.stop(); } catch (e) { console.error(e); } // даже если остановка споткнулась — всё равно возвращаемся в меню
      L.closeSub(); overlay('pause', false); L.hooks.menu && L.hooks.menu();
    };
    $('#panel-inv').onclick = e => { if (e.target.id === 'panel-inv') L.closeUI(); }; $('#panel-craft').onclick = e => { if (e.target.id === 'panel-craft') L.closeUI(); }; $('#panel-map').onclick = e => { if (e.target.id === 'panel-map') L.closeUI(); }; $('#panel-players').onclick = e => { if (e.target.id === 'panel-players') L.closeUI(); };
    const bm = $('#bigmap'); bm.oncontextmenu = e => { e.preventDefault(); L.mark(e.clientX, e.clientY); }; let lp; bm.ontouchstart = e => { const t = e.touches[0]; lp = setTimeout(() => L.mark(t.clientX, t.clientY), 600); }; bm.ontouchend = bm.ontouchmove = () => clearTimeout(lp);
  },
  mark(cx, cy) { const bm = $('#bigmap'), r = bm.getBoundingClientRect(), x = ((cx - r.left) / r.width - .5) * MAP_SPAN, z = ((cy - r.top) / r.height - .5) * MAP_SPAN; const i = this.marks.findIndex(m => Math.hypot(m.x - x, m.z - z) < 15); if (i >= 0) this.marks.splice(i, 1); else this.marks.push({ x, z }); settings.marks = this.marks; localStorage.setItem('rl_settings', JSON.stringify(settings)); this.drawBig(); },
  renderModes(f) { $('#modes').innerHTML = (f.fly ? '<span>✈️ FLY</span>' : '') + (f.noclip ? '<span class="nc">👻 NOCLIP</span>' : '') + (f.god ? '<span>🛡️ GOD</span>' : ''); if (this.prevNoclip && !f.noclip) { const p = this.local.pos; p.y = Math.max(p.y, this.world.groundY(p.x, p.z, p.y + 1) + .05); this.world.collide(p, .35); } this.prevNoclip = f.noclip; },
  addCrate(c) {
    const g = crateMesh(c.k); g.position.set(c.x, c.y, c.z); g.rotation.y = c.r; g.userData.id = c.id; g.userData.full = c.full; setCrateFull(g, c.full); this.scene.add(g); this.crates.set(c.id, g);
    const [w, h, d] = g.userData.size, cs = Math.cos(c.r), sn = Math.sin(c.r), rid = -(5000 + c.id); // ящик твёрдый, как и остальные объекты
    this.world.buildings.map.set(rid, { id: rid, type: 'static', tier: 0, x: c.x, y: c.y, z: c.z, rot: c.r, info: { group: new THREE.Group(), boxes: [[w, h, d, 0, h / 2, 0]] } });
  },
  addBag(b) { const g = new THREE.Group(); const m = b.kind === 'death' ? new THREE.Mesh(new THREE.BoxGeometry(.5, .35, .4), new THREE.MeshStandardMaterial({ color: '#5a3a1e' })) : new THREE.Mesh(new THREE.OctahedronGeometry(.18), new THREE.MeshStandardMaterial({ color: '#e0a030', emissive: '#8a5a10' })); m.position.y = .3; g.add(m); g.position.set(b.x, Math.max(b.y, heightAt(b.x, b.z)), b.z); g.userData = { m, id: b.id, x: b.x, y: g.position.y, z: b.z }; this.scene.add(g); this.bags.set(b.id, g); },
  // ---------- взаимодействие ----------
  interact() {
    const f = this.focus; if (!f) return;
    if (f.kind === 'bag') return net.emit('bag:take', f.id);
    if (f.kind === 'crate') return f.full ? net.emit('crate:open', f.id) : toast('Ящик пуст — загляните позже', 'info');
    const b = f.b; const owner = b.own === this.me.uid || this.me.isAdmin; const lockable = ['door', 'gate', 'sliding_door', 'double_door', 'chest'].includes(b.type); const h = Inv.held();
    if (lockable && owner && (this.local.crouch || (h && (h.id === 'lock_basic' || h.id === 'lock_code')))) return this.lockMenu(b.id);
    net.emit('build:use', { id: b.id });
  },
  async doorLocked(d) { if (d.code) { const c = await prompt4('Кодовый замок', 'Введите 4-значный код'); if (c) net.emit('build:use', { id: d.id, code: c }); } else toast('Заперто', 'error'); },
  async lockMenu(id) {
    const b = this.world.buildings.map.get(id); if (!b) return; const lk = b.lock || 'none';
    const btns = lk === 'none' ? [{ label: 'Закрыть', value: null }, { label: 'Обычный замок', value: 'basic' }, { label: 'Кодовый замок', primary: true, value: 'code' }] : lk === 'code' ? [{ label: 'Закрыть', value: null }, { label: 'Сменить код', value: 'change' }, { label: 'Снять замок', primary: true, value: 'remove' }] : [{ label: 'Закрыть', value: null }, { label: 'Снять замок', primary: true, value: 'remove' }];
    const prevUI = this.ui; this.openUI('modal'); const v = await modal({ title: 'Замок', html: `<p class="muted">Замок: ${lk === 'none' ? 'нет' : lk === 'code' ? 'кодовый' : 'обычный'}</p>`, buttons: btns }); this.closeUI();
    if (v === 'basic') net.emit('lock:set', { id, type: 'basic' });
    else if (v === 'code') { const c = await this.askCode('Код нового замка'); if (c) net.emit('lock:set', { id, type: 'code', code: c }); }
    else if (v === 'change') { const o = await this.askCode('Старый код'); const n = o && await this.askCode('Новый код'); if (n) net.emit('lock:change', { id, old: o, code: n }); }
    else if (v === 'remove') net.emit('lock:remove', { id });
  },
  async askCode(t) { this.openUI('modal'); const c = await prompt4(t, '4 цифры'); this.closeUI(); return c; },
  async cupMenu(d) {
    this.openUI('modal'); const html = `<p class="muted">Зона строительства: 15 м. Зарегистрировано: ${d.members.length}/10</p>${d.members.map(n => `<div class="rec"><span>${esc(n)}</span>${d.owner ? `<button class="btn small" data-rm="${esc(n)}">Удалить</button>` : ''}</div>`).join('')}${d.owner ? '<input id="cup-name" placeholder="Ник игрока">' : ''}`;
    const v = await modal({ title: 'Шкаф', html, buttons: d.owner ? [{ label: 'Закрыть', value: null }, { label: 'Зарегистрировать', primary: true, value: b => ({ add: $('#cup-name', b).value }) }] : [{ label: 'Закрыть', value: null }], onMount: (b, close) => $$('[data-rm]', b).forEach(x => x.onclick = () => close({ rm: x.dataset.rm })) });
    this.closeUI(); if (v && v.add) net.emit('cupboard:add', { id: d.id, name: v.add }); if (v && v.rm) net.emit('cupboard:remove', { id: d.id, name: v.rm });
  },
  async buildMenu(d) {
    this.openUI('modal'); const up = d.up ? Object.entries(d.up.cost).map(([k, v]) => `${v} ${itemName(k).toLowerCase()}`).join(', ') : null;
    const btns = [{ label: 'Закрыть', value: null }, { label: 'Убрать', value: 'remove' }]; if (d.st && up) btns.push({ label: `Апгрейд (${up})`, primary: true, value: 'upgrade' });
    const v = await modal({ title: itemName(d.type), html: `<p class="muted">HP: ${Math.round(d.hp)} • Уровень: ${['Дерево', 'Камень', 'Металл'][d.tier] || ''}</p>`, buttons: btns }); this.closeUI();
    if (v === 'upgrade') net.emit('build:upgrade', d.id); if (v === 'remove') net.emit('build:remove', d.id);
  },
  // ---------- бой / строительство ----------
  skyPoint(o, d, max = 30) { const t = this.world.target(o, d, max); if (t) return new THREE.Vector3().copy(o).addScaledVector(d, Math.max(.5, t.t)); for (let s = 1; s < max; s += .5) { const p = new THREE.Vector3().copy(o).addScaledVector(d, s); if (p.y <= this.world.groundY(p.x, p.z, p.y)) return p; } return new THREE.Vector3().copy(o).addScaledVector(d, max); },
  tryAttack(edge) {
    const now = performance.now(); if (now < (this.nextAtk || 0) || this.local.dead || this.ui) return; const h = Inv.held(), id = h ? h.id : 'fist', it = DATA.items[id], C = DATA.combat[id];
    if (this.ghostActive) { if (edge && this.ghost && this.ghost.ok) { net.emit('place', { slot: Inv.st.sel, ...this.ghost.pos, rot: this.ghost.rot }); play('click'); this.nextAtk = now + 300; } return; }
    if (it && (it.t === 'food' || it.t === 'med')) { if (edge) { net.emit('inv:use', Inv.st.sel); this.vm.use(); this.nextAtk = now + 700; } return; }
    if (!C) { if (it && it.t === 'armor' && edge) net.emit('inv:use', Inv.st.sel); return; } if (C.k === 'melee' && C.dmg === 0 && id === 'torch') { /* факел — не оружие */ }
    if ((C.k === 'gun' || C.k === 'throw' || C.k === 'c4' || C.k === 'bow') && !edge && !C.auto) return;
    if (C.k === 'bow') return; // лук обрабатывается bowStep (натяжение)
    if (C.k === 'melee') { this.nextAtk = now + (C.spd || .5) * 1000; const dly = this.vm.attack(C.spd || .5); setTimeout(() => this.meleeHit(id, C), dly); return; }
    const o = this.cam.position.clone(), d = this.local.dir(); const data = { dir: [d.x, d.y, d.z], mv: this.local.running ? 2 : this.local.moving ? 1 : 0, cr: +this.local.crouch, aim: +this.aiming };
    this.nextAtk = now + (C.spd || .5) * 1000;
    if (C.k === 'gun') { const mag = Inv.st.mags[id] || 0; if (mag <= 0) { play('click'); net.emit('reload'); return; } Inv.st.mags[id] = mag - 1; Inv.renderHotbar(); this.vm.attack(C.spd); this.local.recoil = Math.min(.27, this.local.recoil + C.recoil * .0035 * (this.aiming ? .6 : 1)); this.flash.intensity = 6; setTimeout(() => this.flash.intensity = 0, 50); play(id === 'ak' ? 'ak' : id === 'shotgun' ? 'shotgun' : id === 'rifle' ? 'rifle' : 'pistol'); }
        else if (C.k === 'throw') { const p = this.skyPoint(o, d, C.range); data.point = { x: p.x, y: p.y, z: p.z }; this.vm.attack(C.spd); }
    else if (C.k === 'c4') { const t = this.world.buildings.target(o, d, 4.5); if (!t || t.id < 0) { toast('Наведитесь на постройку вплотную', 'warn'); return; } data.target = { kind: 'build', id: t.id }; this.vm.attack(C.spd); }
    net.emit('attack', data);
    if (data.target && data.target.kind === 'res') { const p = $('#progress'); p.style.display = 'block'; const bar = $('i', p); bar.style.transition = 'none'; bar.style.width = '0'; void bar.offsetWidth; bar.style.transition = `width ${C.spd || .5}s linear`; bar.style.width = '100%'; clearTimeout(this.pt); this.pt = setTimeout(() => p.style.display = 'none', (C.spd || .5) * 1000 + 100); }
  },
  // удар ближнего боя в момент попадания (после замаха)
  meleeHit(id, C) {
    const h = Inv.held(); if ((h ? h.id : 'fist') !== id || this.local.dead || this.ui) return;
    const o = this.cam.position.clone(), d = this.local.dir(), data = { dir: [d.x, d.y, d.z], mv: this.local.running ? 2 : this.local.moving ? 1 : 0, cr: +this.local.crouch, aim: 0 };
    const t = this.world.target(o, d, 3.6); if (t) data.target = { kind: t.kind, id: t.id }; net.emit('attack', data);
    if (t) { this.punch(t.kind === 'res' ? .5 : .35); if (t.kind === 'build') play('hit_wood', .6); }
    if (data.target && data.target.kind === 'res') { const p = $('#progress'); p.style.display = 'block'; const bar = $('i', p); bar.style.transition = 'none'; bar.style.width = '0'; void bar.offsetWidth; bar.style.transition = `width ${C.spd || .5}s linear`; bar.style.width = '100%'; clearTimeout(this.pt); this.pt = setTimeout(() => p.style.display = 'none', (C.spd || .5) * 1000 + 100); }
  },
  punch(v) { this.shake = Math.min(1, this.shake + v * .18); this.local.recoil = Math.max(-.08, this.local.recoil - v * .012); },
  // лук: зажать — натягивать тетиву, отпустить — выстрел (сила зависит от времени натяжения)
  bowStep(a, C) {
    const bow = C && C.k === 'bow' && !this.local.dead && !this.ui, now = performance.now();
    if (!bow) { this.drawing = false; this.vm.setDraw(0); return; }
    if (a && !this.prevA && now >= (this.nextAtk || 0)) { this.drawing = true; this.drawT = now; play('bow_draw'); }
    if (!this.drawing) { this.vm.setDraw(0); return; }
    const pw = Math.min(1, (now - this.drawT) / 900); this.vm.setDraw(pw);
    if (!a) {
      this.drawing = false; if (pw < .2) { this.vm.setDraw(0); return; }
      const d = this.local.dir(); net.emit('attack', { dir: [d.x, d.y, d.z], mv: this.local.running ? 2 : this.local.moving ? 1 : 0, cr: +this.local.crouch, aim: +this.aiming, pw });
      this.vm.releaseBow(pw); play('bow', .5 + .5 * pw); this.nextAtk = now + 350;
    }
  },
  // красная метка слабой точки на дереве/камне/руде при наведении инструментом добычи
  updateWeak() {
    const h = Inv.held(), L = this.local; let W = null;
    if (h && HARVEST.has(h.id) && !L.dead && !this.ui) { const t = this.world.target(this.cam.position, L.dir(), 4.2); if (t && t.kind === 'res' && WEAK_TYPES[t.type]) W = weakPoint(t.r, L.pos.x, L.pos.z); }
    if (W) this.wpMark.position.set(W.x, W.y, W.z); this.wpMark.visible = !!W;
  },
  shotFx(s) { // трассер + вспышка + звук (громкость от расстояния)
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(s.from.x, s.from.y, s.from.z), new THREE.Vector3(s.to.x, s.to.y, s.to.z)]); const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#ffe9a0', transparent: true })); this.scene.add(l); this.fx.push({ m: l, life: .1 });
    if (s.by !== this.me.id) { const f = new THREE.PointLight('#ffcc66', 6, 12); f.position.set(s.from.x, s.from.y, s.from.z); this.scene.add(f); this.fx.push({ m: f, life: .05 }); const C = DATA.combat[s.w] || {}; play(s.w === 'ak' ? 'ak' : s.w === 'shotgun' ? 'shotgun' : s.w === 'rifle' ? 'rifle' : s.w === 'bow' ? 'bow' : 'pistol', Math.max(.05, 1 - s.d / (C.snd || 100))); }
  },
  burst(p, color, n = 8) { for (let i = 0; i < n; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(.06, .06, .06), new THREE.MeshBasicMaterial({ color })); m.position.copy(p); this.scene.add(m); this.fx.push({ m, life: .6, v: new THREE.Vector3((Math.random() - .5) * 3, Math.random() * 3, (Math.random() - .5) * 3) }); } },
  updateGhost() {
    const h = Inv.held(), def = h && DATA.build[h.id]; this.ghostActive = !!def && !this.ui && !this.local.dead;
    if (!this.ghostActive) { if (this.ghost) { this.scene.remove(this.ghost.g); this.ghost = null; } return; }
    const id = h.id; if (!this.ghost || this.ghost.id !== id) { if (this.ghost) this.scene.remove(this.ghost.g); const gm = new THREE.MeshBasicMaterial({ color: '#46c37b', transparent: true, opacity: .45, depthWrite: false }); const info = buildMesh(id, 0, gm); this.scene.add(info.group); this.ghost = { id, g: info.group, mat: gm, rot: this.rot || 0, pos: { x: 0, y: 0, z: 0 }, ok: false, w: def.size[0] }; }
    const o = this.cam.position, d = this.local.dir(); let p = new THREE.Vector3().copy(o).addScaledVector(d, 6);
    for (let s = 1; s <= 7; s += .25) { const q = new THREE.Vector3().copy(o).addScaledVector(d, s); if (q.y <= this.world.groundY(q.x, q.z, q.y) + .05) { p = q; break; } }
    const G = this.ghost; G.rot = this.rot || 0; const along = (v, w) => w >= 2 ? Math.round(v) : Math.floor(v) + .5; let x = p.x, z = p.z, y;
    const structural = def.st || ['door', 'gate', 'sliding_door', 'double_door'].includes(id), wallLike = ['wall', 'wall_window', 'wall_door', 'door', 'gate', 'sliding_door', 'double_door'].includes(id);
    if (wallLike) { if (Math.round(G.rot / (Math.PI / 2)) % 2 === 0) { x = along(p.x, def.size[0]); z = Math.round(p.z); } else { z = along(p.z, def.size[0]); x = Math.round(p.x); } }
    else if (structural) { x = Math.floor(p.x) + .5; z = Math.floor(p.z) + .5; } else { x = Math.round(p.x * 10) / 10; z = Math.round(p.z * 10) / 10; G.rot = (this.rot || 0) + this.local.yaw; }
    y = this.world.groundY(x, z, p.y + .05); if (id === 'roof') y = this.world.groundY(x, z, heightAt(x, z) + .8) + 3;
    G.pos = { x, y, z }; G.g.position.set(x, y, z); G.g.rotation.y = G.rot; G.ok = heightAt(x, z) > .15 && Math.hypot(x - this.local.pos.x, z - this.local.pos.z) < 10; G.mat.color.set(G.ok ? '#46c37b' : '#e5484d');
  },
  // ---------- карты ----------
  drawMini() {
    const c = $('#minimap'), g = c.getContext('2d'), p = this.local.pos, R = 50, src = (R * 2) / MAP_SPAN * 512, sx = (p.x / MAP_SPAN + .5) * 512 - src / 2, sz = (p.z / MAP_SPAN + .5) * 512 - src / 2;
    g.clearRect(0, 0, 200, 200); g.drawImage(this.mapImg, sx, sz, src, src, 0, 0, 200, 200); const k = 200 / (R * 2), px = x => 100 + (x - p.x) * k, pz = z => 100 + (z - p.z) * k;
    g.fillStyle = '#ffb347'; for (const q of this.me.monuments || []) { if (Math.abs(q.x - p.x) < R && Math.abs(q.z - p.z) < R) { g.beginPath(); g.arc(px(q.x), pz(q.z), 5, 0, 7); g.fill(); } }
    for (const b of this.world.buildings.map.values()) { if (b.id < 0 || Math.abs(b.x - p.x) > R || Math.abs(b.z - p.z) > R) continue; g.fillStyle = b.own === this.me.uid ? '#fff' : '#bbb'; g.fillRect(px(b.x) - 2, pz(b.z) - 2, 4, 4); }
    for (const r of this.world.res.values()) { if (!r.alive || (r.type !== 'ore' && r.type !== 'sulfur' && r.type !== 'scrap') || Math.abs(r.x - p.x) > R || Math.abs(r.z - p.z) > R) continue; g.fillStyle = r.type === 'ore' ? '#cfe' : r.type === 'sulfur' ? '#ee3' : '#d85'; g.fillRect(px(r.x) - 1.5, pz(r.z) - 1.5, 3, 3); }
    g.fillStyle = '#ff4d4d'; for (const r of this.remotes.map.values()) { const q = r.g.position; if (Math.abs(q.x - p.x) < R && Math.abs(q.z - p.z) < R) { g.beginPath(); g.arc(px(q.x), pz(q.z), 3.5, 0, 7); g.fill(); } }
    g.save(); g.translate(100, 100); g.rotate(-this.local.yaw); g.fillStyle = '#4aa3ff'; g.beginPath(); g.moveTo(0, -8); g.lineTo(6, 6); g.lineTo(-6, 6); g.fill(); g.restore(); g.fillStyle = '#fff'; g.font = '700 16px Rubik'; g.fillText('N', 92, 16);
    const cc = $('#compass'), h = cc.getContext('2d'); h.clearRect(0, 0, 200, 22); h.fillStyle = 'rgba(20,28,36,.6)'; h.fillRect(0, 0, 200, 22); const hd = ((-this.local.yaw * 180 / Math.PI) % 360 + 360) % 360; h.fillStyle = '#fff'; h.font = '700 13px Rubik'; h.textAlign = 'center';
    [['N', 0], ['E', 90], ['S', 180], ['W', 270]].forEach(([l, a]) => { let d = ((a - hd + 540) % 360) - 180; if (Math.abs(d) < 60) { h.fillStyle = l === 'N' ? '#ff6b6b' : '#fff'; h.fillText(l, 100 + d * 1.6, 16); } }); h.fillStyle = '#e0a030'; h.fillRect(99, 0, 2, 5);
  },
  drawBig() {
    const c = $('#bigmap'), g = c.getContext('2d'), S = c.width; g.drawImage(this.mapImg, 0, 0, S, S); const m = x => (x / MAP_SPAN + .5) * S; g.font = '600 13px Rubik'; g.textAlign = 'center';
    const MI = { gas: '⛽', shop: '🛒', military: '🎖️' }; (this.me.monuments || []).forEach(q => { g.font = '16px sans-serif'; g.fillStyle = '#fff'; g.strokeStyle = '#0009'; g.lineWidth = 3; g.fillText(MI[q.id] || '📍', m(q.x), m(q.z) - 4); g.font = '700 13px Rubik'; g.fillStyle = '#ffd27a'; g.strokeText(q.n, m(q.x), m(q.z) + 13); g.fillText(q.n, m(q.x), m(q.z) + 13); g.font = '600 13px Rubik'; });
    (this.me.zones || []).forEach(z => { g.fillStyle = '#fff'; g.strokeStyle = '#0008'; g.lineWidth = 3; g.strokeText(z.n, m(z.x), m(z.z)); g.fillText(z.n, m(z.x), m(z.z)); });
    for (const b of this.world.buildings.map.values()) { if (b.id < 0 || b.own !== this.me.uid) continue; g.fillStyle = b.type === 'sleeping_bag' ? '#6cf' : b.type === 'cupboard' ? '#fc3' : '#fff'; const r = b.type === 'sleeping_bag' || b.type === 'cupboard' ? 6 : 2; g.fillRect(m(b.x) - r / 2, m(b.z) - r / 2, r, r); }
    g.fillStyle = '#f5f'; this.marks.forEach(k => { g.beginPath(); g.arc(m(k.x), m(k.z), 6, 0, 7); g.fill(); }); const p = this.local.pos; g.save(); g.translate(m(p.x), m(p.z)); g.rotate(-this.local.yaw); g.fillStyle = '#4aa3ff'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -10); g.lineTo(7, 8); g.lineTo(-7, 8); g.closePath(); g.fill(); g.stroke(); g.restore();
  },
  screenshot() { if (!this.running) return null; this.renderer.render(this.scene, this.cam); return this.canvas.toDataURL('image/png'); },
  // ---------- главный цикл ----------
  loop(t) {
    if (!this.running) return; this.raf = requestAnimationFrame(t2 => this.loop(t2)); const dt = Math.min(.05, (t - this.last) / 1000); this.last = t;
    const L = this.local, C = (() => { const h = Inv.held(); return h && DATA.combat[h.id]; })();
    this.aiming = Input.isActionPressed('aim') && C && (C.k === 'gun' || C.k === 'bow'); L.slow = this.aiming ? 1 - C.slow : 1;
    L.update(dt, Input); this.syncHeld();
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt * 2.2); const sh = this.shake * this.shake, tn = performance.now(); this.cam.rotation.z = Math.sin(tn / 22) * .05 * sh; this.cam.rotation.x += Math.sin(tn / 17) * .03 * sh; }
    const wantFov = this.aiming ? settings.fov / C.zoom : settings.fov; if (Math.abs(wantFov - this.cam.fov) > .01) { this.cam.fov += (wantFov - this.cam.fov) * Math.min(1, dt * 12); this.cam.updateProjectionMatrix(); } const co = this.aiming && C.zoom >= 4 ? 0 : 1; if (co !== this._co) { this._co = co; $('#crosshair').style.opacity = co; }
    const a = Input.isActionPressed('attack'); if (a) this.tryAttack(!this.prevA); this.bowStep(a, C); this.prevA = a;
    this.vm.hide = L.dead; this.vm.update(dt, L.moving, L.running, this.aiming, L); this.world.updateAnims(dt); if (this.wpMark.visible) { const k = 1 + Math.sin(t / 110) * .15; this.wpMark.scale.set(.34 * k, .34 * k, 1); }
    this.remotes.update(dt); this.updateGhost();
    const tt = (this.time.t + (performance.now() - this.time.at) / 1440000) % 1; const day = this.world.setTime(tt, this.time.w, this.cam.position, this.view); this.rain.visible = this.time.w === 'rain'; if (this.rain.visible) { this.rain.position.set(this.cam.position.x, this.cam.position.y - 6, this.cam.position.z); this.rain.position.y -= (performance.now() / 4 % 25) * 0; const arr = this.rain.geometry.attributes.position; for (let i = 0; i < arr.count; i += 2) { let y = arr.getY(i) - dt * 22; if (y < 0) y += 25; arr.setY(i, y); arr.setY(i + 1, y - .6); } arr.needsUpdate = true; }
    this.lodT += dt; if (this.lodT > .4) { this.lodT = 0; this.world.updateLOD(this.cam.position, this.view); }
    // эффекты
    for (let i = this.fx.length - 1; i >= 0; i--) { const f = this.fx[i]; f.life -= dt; if (f.v) { f.v.y -= 9 * dt; f.m.position.addScaledVector(f.v, dt); } if (f.grow) { const s = 1 + (1 - f.life / .5) * f.grow; f.m.scale.setScalar(s); f.m.material.opacity = Math.max(0, f.life / .5); if (f.light) f.light.intensity = Math.max(0, f.life * 14); } if (f.throw) { const k = 1 - f.life / f.t0; f.m.position.set(f.from.x + (f.to.x - f.from.x) * k, f.from.y + (f.to.y - f.from.y) * k + Math.sin(k * Math.PI) * 1.5, f.from.z + (f.to.z - f.from.z) * k); } if (f.fade && f.life < 3) f.m.material.opacity = f.life / 3 * .55; if (f.m.material && f.m.material.opacity !== undefined && !f.grow && !f.fade && !f.throw && f.m.isLine) f.m.material.opacity = Math.max(0, f.life * 10); if (f.life <= 0) { this.scene.remove(f.m); if (f.light) this.scene.remove(f.light); this.fx.splice(i, 1); } }
    for (const g of this.bags.values()) g.userData.m.rotation.y += dt * 2, g.userData.m.position.y = .3 + Math.sin(t / 400 + g.userData.id) * .06;
    // отправка позиции 20 Гц
    this.sendT += dt; if (this.sendT >= .05) { this.sendT = 0; net.emit('move', { x: L.pos.x, y: L.pos.y, z: L.pos.z, r: L.yaw, p: L.pitch, a: L.anim, s: Inv.st.sel }); }
    // фокус (подсказка E) + автоподбор
    this.focusT += dt; if (this.focusT > .1) { this.focusT = 0; this.updateFocus(); this.updateWeak(); }
    { const hp = Inv.st.hp, low = hp > 0 && hp < 30 && !L.dead; if (low !== this.lowHp) { this.lowHp = low; document.body.classList.toggle('lowhp', low); } if (low) { this.hbT -= dt; if (this.hbT <= 0) { this.hbT = .55 + hp / 30 * .7; play('heart', .8); } } }
    this.pickT += dt; if (settings.autoPickup && this.pickT > .5 && !L.dead) { this.pickT = 0; for (const g of this.bags.values()) if (Math.hypot(g.userData.x - L.pos.x, g.userData.z - L.pos.z) < 1.6 && Math.abs(g.userData.y - L.pos.y) < 2) { net.emit('bag:take', g.userData.id); break; } }
    this.mapT += dt; if (this.mapT > .1) { this.mapT = 0; this.drawMini(); if (this.ui === 'map') this.drawBig(); const dbg = []; if (settings.showFps) dbg.push(`FPS ${this.fps | 0}`); if (settings.showPing) dbg.push(`Пинг ${net.ping} мс`); if (settings.showCoords) dbg.push(`X ${L.pos.x.toFixed(0)} Y ${L.pos.y.toFixed(0)} Z ${L.pos.z.toFixed(0)}`); $('#debug').textContent = dbg.join('\n'); if (this.ui === 'pause') $('#pa-info').textContent = `Пинг ${net.ping} мс • FPS ${this.fps | 0} • X ${L.pos.x.toFixed(0)} Z ${L.pos.z.toFixed(0)} • ${String(Math.floor(tt * 24)).padStart(2, '0')}:${String(Math.floor(tt * 24 * 60 % 60)).padStart(2, '0')}`; }
    // FPS + автоснижение графики
    this.fpsN++; this.fpsT += dt; if (this.fpsT >= .5) { this.fps = this.fpsN / this.fpsT; this.fpsN = 0; this.fpsT = 0; if (this.fps < 30) this.lowT += .5; else this.lowT = 0; if (this.lowT >= 5 && settings.quality !== 'low') { settings.quality = settings.quality === 'high' ? 'medium' : 'low'; this.lowT = 0; this.applyGraphics(); toast('Низкий FPS: графика снижена до «' + (settings.quality === 'low' ? 'низкое' : 'среднее') + '»', 'warn'); } }
    this.renderer.render(this.scene, this.cam);
  },
  updateFocus() {
    const L = this.local; if (L.dead || this.ui) { $('#prompt').style.display = 'none'; this.focus = null; return; }
    const o = this.cam.position, d = L.dir(); let f = null; const b = this.world.buildings.target(o, d, 4.2);
    if (b && b.id > 0) f = { kind: 'build', id: b.id, b: b.b, t: b.t };
    for (const g of this.bags.values()) { const dx = g.userData.x - o.x, dy = g.userData.y + .3 - o.y, dz = g.userData.z - o.z, t = dx * d.x + dy * d.y + dz * d.z; if (t > 0 && t < 3.5 && Math.hypot(dx - d.x * t, dy - d.y * t, dz - d.z * t) < .6 && (!f || t < f.t)) f = { kind: 'bag', id: g.userData.id, t }; }
    if (this.crates) for (const g of this.crates.values()) { const dx = g.position.x - o.x, dy = g.position.y + .35 - o.y, dz = g.position.z - o.z, t = dx * d.x + dy * d.y + dz * d.z; if (t > 0 && t < 3.6 && Math.hypot(dx - d.x * t, dy - d.y * t, dz - d.z * t) < .75 && (!f || t < f.t)) f = { kind: 'crate', id: g.userData.id, t, k: g.userData.kind, full: g.userData.full }; }
    this.focus = f; const p = $('#prompt'); let txt = '';
    if (f) { const key = document.body.classList.contains('touch') ? 'E' : 'E'; if (f.kind === 'bag') txt = `${key} — Подобрать`; else if (f.kind === 'crate') txt = f.full ? `${key} — Открыть: ${CRATE_NAMES[f.k]}` : `${CRATE_NAMES[f.k]} — пуст, наполнится позже`; else { const T = f.b.type, own = f.b.own === this.me.uid || this.me.isAdmin; txt = { door: 'Открыть/закрыть', gate: 'Открыть/закрыть', sliding_door: 'Открыть/закрыть', double_door: 'Открыть/закрыть', chest: 'Сундук', cupboard: 'Шкаф', sleeping_bag: own ? 'Поднять спальник' : '', campfire: 'Костёр: приготовить / уголь' }[T] || (own && (DATA.build[T].st || T === 'workbench') ? 'Меню / апгрейд' : ''); if (txt) txt = `${key} — ${txt}`; if (txt && ['door', 'gate', 'sliding_door', 'double_door', 'chest'].includes(T) && f.b.lock && f.b.lock !== 'none') txt += ' 🔒'; } }
    else if (!document.body.classList.contains('touch') && document.pointerLockElement !== this.canvas) txt = 'Кликните, чтобы захватить мышь';
    p.style.display = txt ? 'block' : 'none'; p.textContent = txt;
  },
};
