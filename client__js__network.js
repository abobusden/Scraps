import { io } from 'https://cdn.socket.io/4.7.5/socket.io.esm.min.js';
import { toast } from './ui.js';
// Обёртка над Socket.io: подключение, 3 попытки реконнекта, измерение пинга.
export const net = { socket: null, ping: 0, onLost: null, joined: false,
  connect(url, token) {
    return new Promise((resolve, reject) => {
      if (this.socket) this.socket.disconnect();
      const s = this.socket = io(url, { transports: ['websocket', 'polling'], reconnectionAttempts: 3, reconnectionDelay: 1000, timeout: 6000 });
      let done = false, lost = false;
      s.on('connect', () => { s.emit('join', token); if (lost) { toast('Соединение восстановлено', 'success'); lost = false; } });
      s.once('init', d => { done = true; this.joined = true; resolve(d); });
      s.once('join:error', m => { done = true; reject(new Error(m)); s.disconnect(); });
      s.on('connect_error', () => { if (!done && !s.active) reject(new Error('Сервер недоступен')); });
      s.on('disconnect', reason => { if (reason === 'io client disconnect' || !this.joined) return; lost = true; toast('Соединение потеряно, переподключение...', 'warn'); });
      s.io.on('reconnect_failed', () => { if (this.onLost) this.onLost('Сервер недоступен'); });
      s.on('kicked', r => { this.joined = false; if (this.onLost) this.onLost('Вас кикнули: ' + r); });
      clearInterval(this.pt); this.pt = setInterval(() => { const t = performance.now(); s.volatile.emit('ping', () => { this.ping = Math.round(performance.now() - t); s.emit('ping:report', this.ping); }); }, 3000);
    });
  },
  on(ev, fn) { this.socket.on(ev, fn); }, emit(ev, d) { if (this.socket && this.socket.connected) this.socket.emit(ev, d); },
  disconnect() { this.joined = false; clearInterval(this.pt); if (this.socket) { this.socket.disconnect(); this.socket = null; } },
};
