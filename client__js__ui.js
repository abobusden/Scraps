// Общие UI-утилиты: toast, модалки, переходы экранов, настройки (+синхронизация между вкладками), API.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const DEFAULT_KEYS = { forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', sprint: 'ShiftLeft', jump: 'Space', crouch: 'ControlLeft', interact: 'KeyE', inventory: 'Tab', craft: 'KeyC', chat: 'KeyT', players: 'KeyP', flashlight: 'KeyF', map: 'KeyM', reload: 'KeyR', drop: 'KeyQ' };
export const KEY_NAMES = { forward: 'Вперёд', back: 'Назад', left: 'Влево', right: 'Вправо', sprint: 'Бег', jump: 'Прыжок', crouch: 'Присесть', interact: 'Взаимодействие', inventory: 'Инвентарь', craft: 'Крафт', chat: 'Чат', players: 'Игроки', flashlight: 'Фонарик', map: 'Карта', reload: 'Перезарядка', drop: 'Выбросить' };
const DEF = { quality: 'medium', shadows: true, viewDistance: 300, fov: 75, fullscreen: false, vol: 0.8, music: 0.3, sfx: 0.8, layout: 'auto', sensM: 1, sensT: 1, invertY: false, keys: DEFAULT_KEYS, showFps: true, showCoords: false, showPing: true, confirmExit: true, notifVol: 0.6, autoPickup: true, lang: 'ru', marks: [], btnLayout: {}, btnScale: 1 };
export const settings = Object.assign({}, DEF, JSON.parse(localStorage.getItem('rl_settings') || '{}'));
settings.keys = Object.assign({}, DEFAULT_KEYS, settings.keys);
const chan = 'BroadcastChannel' in window ? new BroadcastChannel('rustland') : null;
const listeners = new Set();
export const onSettings = f => listeners.add(f);
export function saveSettings(broadcast = true) {
  localStorage.setItem('rl_settings', JSON.stringify(settings)); listeners.forEach(f => f());
  if (broadcast && chan) chan.postMessage({ t: 'settings', v: settings });
}
export function resetSettings() { Object.assign(settings, JSON.parse(JSON.stringify(DEF))); saveSettings(); }
if (chan) chan.addEventListener('message', e => { if (e.data && e.data.t === 'settings') { Object.assign(settings, e.data.v); localStorage.setItem('rl_settings', JSON.stringify(settings)); listeners.forEach(f => f()); } });
export const channel = chan;

export const session = { token: localStorage.getItem('rl_token'), user: null, server: location.origin };
export function setSession(token, user) { session.token = token; session.user = user; if (token) localStorage.setItem('rl_token', token); else localStorage.removeItem('rl_token'); }
export async function api(path, body, method) {
  let r;
  try {
    r = await fetch(session.base + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session.token || '') }, body: body ? JSON.stringify(body) : undefined });
  } catch { throw new Error('Сервер недоступен'); }
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Ошибка ' + r.status); return j;
}
session.base = location.origin;

export function toast(msg, type = 'info') {
  const el = document.createElement('div'); el.className = 'toast ' + type; el.textContent = msg; $('#toasts').appendChild(el);
  setTimeout(() => { el.style.transition = '.3s'; el.style.opacity = 0; setTimeout(() => el.remove(), 300); }, 3000);
}
export function modal({ title, html = '', buttons = [{ label: 'Ок', primary: true, value: true }], onMount }) {
  return new Promise(res => {
    const back = document.createElement('div'); back.className = 'back';
    back.innerHTML = `<div class="panel narrow">${title ? `<h2>${title}</h2>` : ''}<div class="mbody">${html}</div><div class="row end mbtns"></div></div>`;
    const close = v => { back.remove(); res(v); };
    buttons.forEach(b => { const e = document.createElement('button'); e.className = 'btn' + (b.primary ? ' primary' : ''); e.textContent = b.label; e.onclick = () => close(typeof b.value === 'function' ? b.value(back) : b.value); $('.mbtns', back).appendChild(e); });
    $('#modals').appendChild(back); if (onMount) onMount(back, close);
  });
}
export const confirmBox = (title, text) => modal({ title, html: `<p>${text}</p>`, buttons: [{ label: 'Отмена', value: false }, { label: 'Да', primary: true, value: true }] });
export function prompt4(title, label = '') { return modal({ title, html: `<p class="muted">${label}</p><input id="m-in" inputmode="numeric" maxlength="4" placeholder="0000">`, buttons: [{ label: 'Отмена', value: null }, { label: 'Ок', primary: true, value: b => $('#m-in', b).value }], onMount: b => setTimeout(() => $('#m-in', b).focus(), 50) }); }

let current = 'loading';
export function show(id) {
  const prev = $('.screen.active:not(.overlay)');
  if (prev && prev.id !== id) { prev.classList.remove('active'); prev.classList.add('out'); setTimeout(() => prev.classList.remove('out'), 300); }
  const el = document.getElementById(id); if (el) { el.classList.remove('out'); el.classList.add('active'); } current = id; return el;
}
export const overlay = (id, on) => { const e = document.getElementById(id); e.classList.toggle('active', on); e.classList.remove('out'); };
export const currentScreen = () => current;
export const fmtDate = t => new Date(t).toLocaleDateString('ru-RU');
export const colorOf = name => { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) | 0; return `hsl(${Math.abs(h) % 360},70%,65%)`; };
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Определение тач-устройства
export function detectTouch() { return ('ontouchstart' in window) || navigator.maxTouchPoints > 0; }
export function applyLayout() {
  const m = settings.layout === 'mobile' ? true : settings.layout === 'pc' ? false : detectTouch();
  document.body.classList.toggle('touch', m); document.body.classList.toggle('desktop', !m); applyButtonLayout(); return m;
}
// ---------- Расположение экранных кнопок (настраивается игроком) ----------
const BTN_SIZE = b => b.classList.contains('big') ? 76 : b.classList.contains('s') ? 48 : 56;
function defaultPos(b) { // стартовая позиция из inline-стиля кнопки в index.html (right/bottom/left/top)
  if (!b.dataset.def) b.dataset.def = b.getAttribute('style') || '';
  const st = {}; b.dataset.def.split(';').forEach(p => { const [k, v] = p.split(':'); if (k && v) st[k.trim()] = parseFloat(v); });
  const w = BTN_SIZE(b); return { x: st.left != null ? st.left : innerWidth - (st.right || 0) - w, y: st.top != null ? st.top : innerHeight - (st.bottom || 0) - w };
}
export function applyButtonLayout() {
  const L = settings.btnLayout || {}, sc = settings.btnScale || 1;
  $$('#touch .tbtn').forEach(b => {
    const a = b.dataset.act, p = L[a]; defaultPos(b);
    if (p) { b.style.left = p.x * 100 + '%'; b.style.top = p.y * 100 + '%'; b.style.right = b.style.bottom = 'auto'; } else b.setAttribute('style', b.dataset.def);
    b.style.transform = sc !== 1 ? `scale(${sc})` : ''; b.style.transformOrigin = 'center';
  });
}
// Редактор: перетаскивайте кнопки пальцем/мышью, ползунок меняет размер. Работает и в меню, и из паузы.
export function openButtonEditor() {
  return new Promise(res => {
    const ed = document.createElement('div'); ed.id = 'btn-editor';
    ed.style.cssText = 'position:fixed;inset:0;z-index:500;background:rgba(8,12,16,.88);touch-action:none;user-select:none';
    ed.innerHTML = '<div style="position:absolute;left:0;right:0;top:10px;text-align:center;pointer-events:none"><b>Расположение кнопок</b><br><small class="muted">Перетащите кнопки на удобное место</small></div>' +
      '<div style="position:absolute;left:50%;bottom:14px;transform:translateX(-50%);display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:center;z-index:2"><label class="muted">Размер <input type="range" id="be-scale" min=".7" max="1.5" step=".05"></label><button class="btn small" id="be-reset">Сбросить</button><button class="btn small" id="be-cancel">Отмена</button><button class="btn small primary" id="be-save">Сохранить</button></div>';
    const pos = {}, sc0 = settings.btnScale || 1; let scale = sc0;
    $$('#touch .tbtn').forEach(src => {
      const a = src.dataset.act, d = defaultPos(src), sv = settings.btnLayout && settings.btnLayout[a], p = sv ? { x: sv.x * innerWidth, y: sv.y * innerHeight } : d; pos[a] = { ...p };
      const b = document.createElement('div'); b.className = 'tbtn' + (src.classList.contains('big') ? ' big' : src.classList.contains('s') ? ' s' : ''); b.textContent = src.textContent; b.style.cssText = `left:${p.x}px;top:${p.y}px;cursor:grab;pointer-events:auto;line-height:1;display:flex;align-items:center;justify-content:center;transform:scale(${scale})`; b.dataset.act = a;
      b.onpointerdown = e => { e.preventDefault(); b.setPointerCapture(e.pointerId); const ox = e.clientX - pos[a].x, oy = e.clientY - pos[a].y, w = BTN_SIZE(b);
        b.onpointermove = ev => { pos[a].x = Math.max(0, Math.min(innerWidth - w, ev.clientX - ox)); pos[a].y = Math.max(0, Math.min(innerHeight - w, ev.clientY - oy)); b.style.left = pos[a].x + 'px'; b.style.top = pos[a].y + 'px'; };
        b.onpointerup = b.onpointercancel = () => { b.onpointermove = null; }; };
      ed.appendChild(b);
    });
    document.body.appendChild(ed); const sl = $('#be-scale', ed); sl.value = scale;
    sl.oninput = () => { scale = +sl.value; $$('.tbtn', ed).forEach(b => b.style.transform = `scale(${scale})`); };
    const close = v => { ed.remove(); res(v); };
    $('#be-cancel', ed).onclick = () => close(false);
    $('#be-reset', ed).onclick = () => { $$('#touch .tbtn').forEach(src => { const d = defaultPos(src); pos[src.dataset.act] = { ...d }; const b = $(`.tbtn[data-act="${src.dataset.act}"]`, ed); b.style.left = d.x + 'px'; b.style.top = d.y + 'px'; }); scale = 1; sl.value = 1; sl.oninput(); };
    $('#be-save', ed).onclick = () => { settings.btnLayout = {}; for (const a in pos) settings.btnLayout[a] = { x: pos[a].x / innerWidth, y: pos[a].y / innerHeight }; settings.btnScale = scale; saveSettings(); applyButtonLayout(); toast('Расположение кнопок сохранено', 'success'); close(true); };
  });
}
