// Глобальный чат без истории: сообщения живут 8 с (системные 12 с), максимум 5, дубли между вкладками отсекаются по messageId.
import { $, colorOf, esc, toast, channel } from './ui.js';
import { suggest } from './commands.js';
import { play } from './audio.js';
export const Chat = {
  open: false, draft: '', seen: new Set(), net: null, isAdmin: false, onToggle: null,
  init(net, isAdmin, onToggle) {
    Object.assign(this, { net, isAdmin, onToggle }); const f = $('#chat-field');
    $('#chat-msgs').innerHTML = ''; this.close(false);
    net.on('chat:message', m => this.addMessage(m, true)); net.on('chat:system', m => this.addSystem(m.text, m.private));
    net.on('chat:mute', m => { toast(`Вы заглушены на ${m.sec} с`, 'warn'); this.addSystem(`Вы заглушены на ${m.sec} сек.`, true); }); net.on('chat:clear', () => { $('#chat-msgs').innerHTML = ''; });
    net.on('chat:kill', k => { const d = document.createElement('div'); d.innerHTML = `<b style="color:${k.killer ? colorOf(k.killer) : '#ddd'}">${esc(k.killer || '☠')}</b> ➜ <b style="color:${colorOf(k.victim)}">${esc(k.victim)}</b> <small>${esc(k.weapon || '')}</small>`; $('#killfeed').appendChild(d); setTimeout(() => d.remove(), 6000); });
    f.oninput = () => { $('#chat-count').textContent = `${f.value.length}/200`; this.sugg(); };
    f.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); this.send(); } else if (e.key === 'Escape') { e.preventDefault(); this.close(true); } else if (e.key === 'Tab') { e.preventDefault(); const s = suggest(f.value, this.isAdmin)[0]; if (s) { f.value = s; this.sugg(); } } };
    $('#chat-send').onclick = () => this.send();
    if (!$('#chat-cmds')) { const b = document.createElement('button'); b.id = 'chat-cmds'; b.className = 'btn small'; b.textContent = 'Команды'; b.onclick = () => { f.value = '/'; f.focus(); this.sugg(true); }; $('#chat-input').insertBefore(b, $('#chat-send')); }
    if (channel) channel.addEventListener('message', e => { if (e.data && e.data.t === 'chat') this.addMessage(e.data.m, false); });
  },
  sugg(all) {
    const f = $('#chat-field'), box = $('#chat-sugg'); box.innerHTML = ''; if (!f.value.startsWith('/') || f.value.includes(' ') && !all) return;
    suggest(f.value, this.isAdmin).forEach(c => { const s = document.createElement('span'); s.textContent = c.trim(); s.onclick = () => { f.value = c; f.focus(); this.sugg(); }; box.appendChild(s); });
  },
  show(el, ttl) {
    const box = $('#chat-msgs'); box.appendChild(el); while (box.children.length > 5) box.firstChild.remove();
    setTimeout(() => { el.classList.add('fade'); setTimeout(() => el.remove(), 650); }, ttl);
  },
  addMessage(m, local) {
    if (this.seen.has(m.id)) return; this.seen.add(m.id); if (this.seen.size > 300) this.seen.delete(this.seen.values().next().value);
    if (local && channel) channel.postMessage({ t: 'chat', m });
    const el = document.createElement('div'); el.className = 'cm'; el.innerHTML = `<b style="color:${colorOf(m.name)}">${esc(m.name)}:</b> ${esc(m.text)}`; this.show(el, 8000); play('chat', .5);
  },
  addSystem(text, priv) { const el = document.createElement('div'); el.className = 'cm sys'; el.textContent = text; this.show(el, priv ? 8000 : 12000); },
  openBox(prefill = '') { this.open = true; $('#chat-input').classList.remove('hidden'); const f = $('#chat-field'); f.value = prefill || this.draft; $('#chat-count').textContent = `${f.value.length}/200`; this.onToggle && this.onToggle(true); setTimeout(() => f.focus(), 30); this.sugg(); },
  close(saveDraft) { const f = $('#chat-field'); if (saveDraft) this.draft = f.value; this.open = false; $('#chat-input').classList.add('hidden'); f.blur(); $('#chat-sugg').innerHTML = ''; this.onToggle && this.onToggle(false); },
  send() {
    const f = $('#chat-field'), t = f.value.trim(); f.value = ''; this.draft = ''; $('#chat-count').textContent = '0/200';
    if (t === '/' || !t) return this.close(false);
    if (t[0] === '/') this.net.emit('command:execute', t); else this.net.emit('chat:send', { id: Math.random().toString(36).slice(2) + Date.now(), text: t });
    this.close(false);
  },
};
