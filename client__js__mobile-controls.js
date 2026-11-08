// Мультитач: Map<id,{type,startX,startY}>, type: joystick | camera | button | ui | sprint
import { Input } from './input.js';
import { $, $$ } from './ui.js';
const touches = new Map(); let joyId = null, joyC = { x: 0, y: 0 }; const R = 80;
const EDGE = ['jump', 'crouch', 'attack', 'aim', 'interact', 'reload'];
export function initMobile() {
  const layer = $('#touch'), joy = $('#joy'), knob = $('i', joy);
  const resetAll = () => { touches.clear(); joyId = null; joy.style.display = 'none'; Input.reset(); $$('.tbtn').forEach(b => b.classList.remove('on')); };
  addEventListener('blur', resetAll); document.addEventListener('visibilitychange', resetAll);
  const gameOn = () => Input.enabled && document.body.classList.contains('touch') && !layer.classList.contains('hidden');
  document.addEventListener('touchstart', e => {
    if (!gameOn()) return;
    for (const t of e.changedTouches) {
      const el = t.target;
      if (el.closest('#btn-editor')) { touches.set(t.identifier, { type: 'ui' }); continue; }
      if (el.closest('.tbtn')) { const b = el.closest('.tbtn'), a = b.dataset.act; touches.set(t.identifier, { type: 'button', act: a, b }); b.classList.add('on'); if (EDGE.includes(a)) { Input.touch.held.add(a); if (a === 'attack') Input.fire('attackdown'); if (a === 'aim') Input.fire('aimdown'); if (a === 'interact' || a === 'reload') Input.fire(a); } else Input.fire(a); e.preventDefault(); continue; }
      if (el.closest('.gamepanel,.back,.ctx,#chat-input,#hotbar,#death,.panel')) { touches.set(t.identifier, { type: 'ui' }); continue; }
      e.preventDefault();
      if (t.clientX < innerWidth / 2) {
        if (joyId === null) { joyId = t.identifier; joyC = { x: t.clientX, y: t.clientY }; joy.style.display = 'block'; joy.style.left = joyC.x + 'px'; joy.style.top = joyC.y + 'px'; knob.style.transform = 'none'; touches.set(t.identifier, { type: 'joystick' }); }
        else { Input.touch.sprint = true; touches.set(t.identifier, { type: 'sprint' }); } // второй палец слева — бег
      } else touches.set(t.identifier, { type: 'camera', x: t.clientX, y: t.clientY });
    }
  }, { passive: false });
  document.addEventListener('touchmove', e => {
    if (!gameOn()) return;
    for (const t of e.changedTouches) {
      const info = touches.get(t.identifier); if (!info) continue;
      if (info.type === 'joystick') { let dx = t.clientX - joyC.x, dy = t.clientY - joyC.y; const l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; } knob.style.transform = `translate(${dx}px,${dy}px)`; Input.touch.move.x = dx / R; Input.touch.move.y = -dy / R; if (l > R * 1.15) Input.touch.sprint = true; else if (!hasType('sprint')) Input.touch.sprint = false; e.preventDefault(); }
      else if (info.type === 'camera') { Input.touch.look.x += t.clientX - info.x; Input.touch.look.y += t.clientY - info.y; info.x = t.clientX; info.y = t.clientY; e.preventDefault(); }
    }
  }, { passive: false });
  const hasType = ty => [...touches.values()].some(v => v.type === ty);
  const end = e => {
    for (const t of e.changedTouches) {
      const info = touches.get(t.identifier); if (!info) continue; touches.delete(t.identifier);
      if (info.type === 'joystick') { joyId = null; joy.style.display = 'none'; Input.touch.move.x = Input.touch.move.y = 0; if (!hasType('sprint')) Input.touch.sprint = false; }
      if (info.type === 'sprint') Input.touch.sprint = false;
      if (info.type === 'button') { info.b.classList.remove('on'); if (EDGE.includes(info.act)) { Input.touch.held.delete(info.act); if (info.act === 'aim') Input.fire('aimup'); } }
    }
  };
  document.addEventListener('touchend', end); document.addEventListener('touchcancel', end);
  const orient = () => $('#rotate-hint').classList.toggle('hidden', !(Input.enabled && document.body.classList.contains('touch') && innerHeight > innerWidth));
  addEventListener('resize', orient); addEventListener('orientationchange', orient); return { orient, resetAll };
}
