// Меню: 3D-фон, серверы, настройки, репорт, профиль.
import * as THREE from 'three';
import { $, $$, api, session, settings, saveSettings, resetSettings, KEY_NAMES, DEFAULT_KEYS, show, overlay, toast, fmtDate, esc, applyLayout, setSession, openButtonEditor } from './ui.js';
import { changePasswordDialog, logout } from './auth.js';
import { renderShop } from './shop.js';
import { renderSkins } from './skins.js';
import { Game } from './game.js';

let bgRun = true, settingsFrom = 'menu', reportFrom = 'menu', shot = null;
export function initBackground() {
  const canvas = $('#bg'), r = new THREE.WebGLRenderer({ canvas, antialias: true }); r.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  const sc = new THREE.Scene(); sc.background = new THREE.Color('#0c1418'); sc.fog = new THREE.FogExp2('#0c1418', .035); const cam = new THREE.PerspectiveCamera(60, 1, .1, 200);
  sc.add(new THREE.HemisphereLight('#6a8aa8', '#1a2a1a', .9)); const sun = new THREE.DirectionalLight('#ffb070', 1.1); sun.position.set(-8, 6, -4); sc.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#1f3a22', roughness: 1 })); sc.add(ground);
  const tg = new THREE.ConeGeometry(1.2, 4.5, 7).translate(0, 3.2, 0), trg = new THREE.CylinderGeometry(.18, .25, 1.6, 6).translate(0, .8, 0), N = 260, tm = new THREE.InstancedMesh(tg, new THREE.MeshStandardMaterial({ color: '#2e6a35', flatShading: true }), N), tr = new THREE.InstancedMesh(trg, new THREE.MeshStandardMaterial({ color: '#4a3220' }), N), m = new THREE.Matrix4();
  for (let i = 0; i < N; i++) { const a = Math.random() * 6.28, d = 6 + Math.random() * 70, s = .7 + Math.random() * 1.1; m.compose(new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d), new THREE.Quaternion(), new THREE.Vector3(s, s, s)); tm.setMatrixAt(i, m); tr.setMatrixAt(i, m); } sc.add(tm, tr);
  const pn = 220, pa = new Float32Array(pn * 3); for (let i = 0; i < pn; i++) pa.set([(Math.random() - .5) * 40, Math.random() * 10, (Math.random() - .5) * 40], i * 3); const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pa, 3)); const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: '#ffd9a0', size: .08, transparent: true, opacity: .7 })); sc.add(pts);
  let mx = 0, my = 0; addEventListener('mousemove', e => { mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5; });
  const rs = () => { r.setSize(innerWidth, innerHeight, false); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }; addEventListener('resize', rs); rs();
  const loop = t => { requestAnimationFrame(loop); if (document.body.classList.contains('ingame')) return; const a = t / 30000; cam.position.set(Math.cos(a) * 5 + mx * 1.5, 2.2 - my, Math.sin(a) * 5); cam.lookAt(0, 2.3, 0); const p = pg.attributes.position; for (let i = 0; i < pn; i++) { let y = p.getY(i) + .003; if (y > 10) y = 0; p.setY(i, y); } p.needsUpdate = true; r.render(sc, cam); };
  requestAnimationFrame(loop);
}
export function initMenu(hooks) {
  const user = () => session.user; const refresh = () => { $('#menu-user').textContent = user() ? user().login : ''; $('#btn-profile').style.display = user() ? '' : 'none'; };
  const go = id => {
    if (id !== 'menu' && !session.token) return show('auth');
    if (id === 'servers') renderServers(hooks); if (id === 'shop') renderShop(); if (id === 'skins') renderSkins(); if (id === 'settings') { settingsFrom = 'menu'; renderSettings(); } if (id === 'report') { reportFrom = 'menu'; shot = null; $('#rep-shot-state').textContent = ''; } if (id === 'profile') renderProfile();
    show(id); refresh();
  };
  $$('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go)); const doLogout = () => { try { if (Game.running) Game.stop(); } catch (e) { console.error(e); } cancelRebind(); $('#settings').classList.remove('active'); $('#report').classList.remove('active'); logout(); refresh(); };
  $('#btn-logout').onclick = doLogout;
  $('#set-back').onclick = () => { cancelRebind(); if (settingsFrom === 'game') { $('#settings').classList.remove('active'); overlay('pause', true); } else go('menu'); };
  $('#set-save').onclick = () => { collect(); saveSettings(); applyLayout(); toast('Настройки сохранены', 'success'); };
  $('#rep-back').onclick = () => { if (reportFrom === 'game') { $('#report').classList.remove('active'); overlay('pause', true); } else go('menu'); };
  $('#rep-shot').onclick = () => { shot = Game.screenshot(); $('#rep-shot-state').textContent = shot ? 'Скриншот прикреплён' : 'Доступно только в игре'; };
  $('#rep-file').onchange = e => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { shot = rd.result; $('#rep-shot-state').textContent = 'Файл прикреплён'; }; rd.readAsDataURL(f); };
  $('#rep-send').onclick = async () => { try { await api('/api/report', { theme: $('#rep-theme').value, text: $('#rep-text').value, screenshot: shot }); toast('Репорт отправлен', 'success'); $('#rep-text').value = ''; $('#rep-back').click(); } catch (e) { toast(e.message, 'error'); } };
  $('#pf-pass').onclick = changePasswordDialog; $('#pf-logout').onclick = doLogout;
  hooks.game.hooks.settings = () => { settingsFrom = 'game'; renderSettings(); $('#settings').classList.add('active'); };
  hooks.game.hooks.report = () => { reportFrom = 'game'; shot = null; $('#rep-shot-state').textContent = ''; $('#report').classList.add('active'); };
  hooks.game.hooks.menu = () => { show('menu'); refresh(); };
  return { refresh, go };
}
async function renderProfile() {
  try { const r = await api('/api/auth/me'); const u = r.user, s = r.stats; $('#pf-avatar').textContent = u.login[0].toUpperCase(); $('#pf-name').textContent = u.login + (u.isAdmin ? ' 🛡' : ''); $('#pf-date').textContent = 'Регистрация: ' + fmtDate(u.created_at);
    const kd = s.deaths ? (s.kills / s.deaths).toFixed(2) : s.kills; $('#pf-stats').innerHTML = [['Убийства', s.kills], ['Смерти', s.deaths], ['K/D', kd], ['Время', Math.floor(s.playtime / 60) + ' мин'], ['Постройки', s.builds], ['Крафты', s.crafts]].map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join(''); } catch (e) { toast(e.message, 'error'); }
}
let srvTimer = null;
// Один общий сервер: карточка «Официальный сервер #1 (N/30)», счётчик обновляется каждые 3 с.
async function renderServers(hooks) {
  clearInterval(srvTimer);
  const base = location.origin;
  $('#srv-local').innerHTML = '<div class="card"><span><b id="srv-name">Официальный сервер #1</b> <b id="srv-count">(…/30)</b><br><small class="muted" id="srv-state">проверка…</small></span><button class="btn small primary" id="srv-play">Играть</button></div>';
  $('#srv-play').onclick = () => hooks.play(base);
  const update = async first => {
    if (!first && !$('#servers').classList.contains('active')) return; // обновляем, только пока экран открыт
    const cnt = $('#srv-count'), st = $('#srv-state'); if (!cnt) return;
    try {
      const t = performance.now(), i = await (await fetch(base + '/api/info', { cache: 'no-store' })).json();
      $('#srv-name').textContent = i.name; cnt.textContent = `(${i.players}/${i.max})`; cnt.classList.toggle('full', i.players >= i.max);
      st.textContent = (i.players >= i.max ? 'Сервер заполнен' : 'Онлайн') + ` • ${Math.round(performance.now() - t)} мс`;
    } catch { cnt.textContent = '(—/—)'; cnt.classList.remove('full'); st.textContent = 'Сервер недоступен'; }
  };
  $('#srv-refresh').onclick = () => update(true);
  update(true); srvTimer = setInterval(update, 3000);
}
// ---------- Настройки ----------
let pane = 'gfx', rebindH = null;
function cancelRebind() { if (rebindH) { removeEventListener('keydown', rebindH, true); rebindH = null; } }
function renderSettings() {
  const nav = $$('#set-nav button'); nav.forEach(b => { b.onclick = () => { collect(); pane = b.dataset.pane; renderSettings(); }; b.classList.toggle('active', b.dataset.pane === pane); });
  const f = (label, html) => `<div class="field"><span>${label}</span>${html}</div>`, sel = (id, opts, v) => `<select id="${id}">${opts.map(([k, t]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${t}</option>`).join('')}</select>`, rng = (id, a, b, st, v) => `<input id="${id}" type="range" min="${a}" max="${b}" step="${st}" value="${v}">`, chk = (id, v) => `<input id="${id}" type="checkbox" ${v ? 'checked' : ''}>`;
  const s = settings, body = $('#set-body');
  if (pane === 'gfx') body.innerHTML = f('Качество', sel('s-quality', [['low', 'Низкое'], ['medium', 'Среднее'], ['high', 'Высокое']], s.quality)) + f('Тени', chk('s-shadows', s.shadows)) + f(`Дальность прорисовки`, rng('s-view', 100, 600, 25, s.viewDistance)) + f('Поле зрения (FOV)', rng('s-fov', 60, 110, 1, s.fov)) + f('Полноэкранный режим', chk('s-full', s.fullscreen));
  if (pane === 'snd') body.innerHTML = f('Общая громкость', rng('s-vol', 0, 1, .05, s.vol)) + f('Музыка', rng('s-music', 0, 1, .05, s.music)) + f('Эффекты', rng('s-sfx', 0, 1, .05, s.sfx));
  if (pane === 'ctl') body.innerHTML = f('Раскладка', sel('s-layout', [['auto', 'Авто'], ['pc', 'ПК'], ['mobile', 'Мобильный']], s.layout)) + f('Чувствительность мыши', rng('s-sensm', .2, 3, .05, s.sensM)) + f('Чувствительность тача', rng('s-senst', .2, 3, .05, s.sensT)) + f('Инверсия оси Y', chk('s-inv', s.invertY)) + '<button class="btn" id="s-btnedit">Расположение кнопок…</button><button class="btn small" id="s-btnreset">Сбросить кнопки</button>' + '<h3>Переназначение клавиш</h3>' + Object.keys(KEY_NAMES).map(a => f(KEY_NAMES[a], `<button class="keyb" data-key="${a}">${s.keys[a].replace('Key', '').replace('Digit', '')}</button>`)).join('') + '<button class="btn small" id="s-reset">Сбросить всё</button>';
  if (pane === 'game') body.innerHTML = f('Язык', sel('s-lang', [['ru', 'Русский']], 'ru')) + f('Показывать FPS', chk('s-fps', s.showFps)) + f('Показывать координаты', chk('s-coords', s.showCoords)) + f('Показывать пинг', chk('s-ping', s.showPing)) + f('Подтверждение выхода', chk('s-confirm', s.confirmExit)) + f('Громкость уведомлений', rng('s-notif', 0, 1, .05, s.notifVol)) + f('Автоподбор предметов', chk('s-auto', s.autoPickup));
  if (pane === 'acc') body.innerHTML = f('Ник', `<b>${session.user ? esc(session.user.login) : '—'}</b>`) + '<button class="btn" id="s-pass">Сменить пароль</button><button class="btn danger" id="s-out">Выйти из аккаунта</button>';
  $$('.keyb', body).forEach(b => b.onclick = () => { cancelRebind(); b.textContent = '…'; rebindH = e => { e.preventDefault(); e.stopPropagation(); if (e.code !== 'Escape') settings.keys[b.dataset.key] = e.code; cancelRebind(); renderSettings(); }; addEventListener('keydown', rebindH, true); });
  const be = $('#s-btnedit'); if (be) be.onclick = () => { collect(); openButtonEditor(); }; const br = $('#s-btnreset'); if (br) br.onclick = () => { settings.btnLayout = {}; settings.btnScale = 1; saveSettings(); applyLayout(); toast('Кнопки сброшены', 'info'); };
  const r = $('#s-reset'); if (r) r.onclick = () => { resetSettings(); renderSettings(); toast('Настройки сброшены', 'info'); };
  const p = $('#s-pass'); if (p) p.onclick = changePasswordDialog; const o = $('#s-out'); if (o) o.onclick = () => { try { if (Game.running) Game.stop(); } catch (e) { console.error(e); } cancelRebind(); logout(); $('#menu-user').textContent = ''; $('#settings').classList.remove('active'); };
}
function collect() {
  const g = id => document.getElementById(id), s = settings; if (!g('set-body')) return;
  const map = { 's-quality': ['quality', 'v'], 's-shadows': ['shadows', 'c'], 's-view': ['viewDistance', 'n'], 's-fov': ['fov', 'n'], 's-full': ['fullscreen', 'c'], 's-vol': ['vol', 'n'], 's-music': ['music', 'n'], 's-sfx': ['sfx', 'n'], 's-layout': ['layout', 'v'], 's-sensm': ['sensM', 'n'], 's-senst': ['sensT', 'n'], 's-inv': ['invertY', 'c'], 's-fps': ['showFps', 'c'], 's-coords': ['showCoords', 'c'], 's-ping': ['showPing', 'c'], 's-confirm': ['confirmExit', 'c'], 's-notif': ['notifVol', 'n'], 's-auto': ['autoPickup', 'c'] };
  for (const [id, [k, t]] of Object.entries(map)) { const e = g(id); if (e) s[k] = t === 'c' ? e.checked : t === 'n' ? +e.value : e.value; }
}
