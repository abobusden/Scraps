// Единый ввод: getMoveVector(), getLookDelta(), isActionPressed(name). Работает для клавиатуры/мыши и тач-управления.
import { settings, onSettings } from './ui.js';
const ACTIONS = ['forward', 'back', 'left', 'right', 'sprint', 'jump', 'crouch', 'interact', 'inventory', 'craft', 'chat', 'players', 'flashlight', 'map', 'reload', 'drop'];
let rev = {}; const rebuild = () => { rev = {}; for (const a of ACTIONS) rev[settings.keys[a]] = a; }; rebuild(); onSettings(rebuild);
export const Input = {
  enabled: false, blocked: false, keys: new Set(), mouse: { l: false, r: false }, look: { x: 0, y: 0 },
  touch: { move: { x: 0, y: 0 }, sprint: false, held: new Set(), look: { x: 0, y: 0 } },
  handlers: {}, // action -> [fn]
  on(a, fn) { (this.handlers[a] ||= []).push(fn); }, fire(a, p) { (this.handlers[a] || []).forEach(f => f(p)); },
  getMoveVector() {
    if (this.blocked) return { x: 0, y: 0 };
    let x = 0, y = 0; const k = this.isActionPressed.bind(this);
    if (k('forward')) y += 1; if (k('back')) y -= 1; if (k('left')) x -= 1; if (k('right')) x += 1;
    x += this.touch.move.x; y += this.touch.move.y; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } return { x, y };
  },
  getLookDelta() {
    const s = this.blocked ? { x: 0, y: 0 } : { x: this.look.x * settings.sensM * .0022 + this.touch.look.x * settings.sensT * .005, y: this.look.y * settings.sensM * .0022 + this.touch.look.y * settings.sensT * .005 };
    this.look.x = this.look.y = this.touch.look.x = this.touch.look.y = 0; if (settings.invertY) s.y = -s.y; return s;
  },
  isActionPressed(n) {
    if (this.blocked && n !== 'attack' && n !== 'aim') return false;
    if (n === 'attack') return !this.blocked && (this.mouse.l || this.touch.held.has('attack'));
    if (n === 'aim') return !this.blocked && (this.mouse.r || this.touch.held.has('aim'));
    if (n === 'sprint') return this.keys.has(settings.keys.sprint) || this.touch.sprint;
    return this.keys.has(settings.keys[n]) || this.touch.held.has(n);
  },
  reset() { this.keys.clear(); this.mouse.l = this.mouse.r = false; this.touch.move.x = this.touch.move.y = 0; this.touch.sprint = false; this.touch.held.clear(); },
};
export function initInput(canvas) {
  addEventListener('keydown', e => {
    if (!Input.enabled) return; const tag = (e.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) return; Input.keys.add(e.code);
    const a = rev[e.code]; if (a && !['forward', 'back', 'left', 'right', 'sprint', 'crouch'].includes(a)) Input.fire(a);
    if (/^Digit[1-6]$/.test(e.code)) Input.fire('slot', +e.code.slice(5) - 1);
    if (e.code === 'Escape') Input.fire('escape');
    if (e.shiftKey && a === 'drop') Input.fire('dropall');
  });
  addEventListener('keyup', e => Input.keys.delete(e.code));
  addEventListener('blur', () => Input.reset()); document.addEventListener('visibilitychange', () => Input.reset());
  canvas.addEventListener('mousedown', e => { if (!Input.enabled || Input.blocked) return; if (document.pointerLockElement !== canvas) { if (!document.body.classList.contains('touch')) canvas.requestPointerLock(); return; } if (e.button === 0) { Input.mouse.l = true; Input.fire('attackdown'); } if (e.button === 2) { Input.mouse.r = true; Input.fire('aimdown'); } });
  addEventListener('mouseup', e => { if (e.button === 0) Input.mouse.l = false; if (e.button === 2) { Input.mouse.r = false; Input.fire('aimup'); } });
  addEventListener('mousemove', e => { if (document.pointerLockElement === canvas && !Input.blocked) { Input.look.x += e.movementX; Input.look.y += e.movementY; } });
  addEventListener('wheel', e => { if (Input.enabled && !Input.blocked) Input.fire('wheel', Math.sign(e.deltaY)); }, { passive: true });
  addEventListener('contextmenu', e => { if (Input.enabled) e.preventDefault(); });
  document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== canvas) { Input.mouse.l = Input.mouse.r = false; Input.fire('unlock'); } });
}
