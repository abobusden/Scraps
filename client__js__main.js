import { $, show, session, setSession, api, toast, settings, applyLayout, detectTouch } from './ui.js';
import { loadData } from './data.js';
import { initAuth } from './auth.js';
import { initBackground, initMenu } from './menu.js';
import { Game } from './game.js';
import { unlock } from './audio.js';

(async function boot() {
  applyLayout(); if (detectTouch()) document.body.classList.add('touch');
  addEventListener('pointerdown', unlock, { once: true });
  await loadData(); initBackground();
  let lastBase = location.origin;
  const menu = initMenu({
    game: Game,
    async play(base) {
      lastBase = base; show('loading'); $('#load-bar').style.width = '0';
      try { await Game.start(base, session.token); } catch (e) { toast(e.message || 'Не удалось подключиться', 'error'); show('servers'); }
    },
  });
  Game.hooks.retry = () => menu && Game.start(lastBase, session.token).catch(e => { toast(e.message, 'error'); show('servers'); });
  initAuth(() => { menu.refresh(); show('menu'); });
  if (session.token) {
    try { const r = await api('/api/auth/me'); session.user = r.user; menu.refresh(); show('menu'); } catch (e) { setSession(null, null); show('auth'); if (e.message !== 'Сервер недоступен') toast('Войдите заново', 'warn'); }
  } else show('auth');
})();
