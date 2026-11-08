// Крафт: категории, подсветка нехватки, «Создать»/«Создать x10», очередь до 5 с прогрессом и отменой.
import { $ } from './ui.js';
import { DATA } from './data.js';
import { Inv } from './inventory.js';
const CATS = ['Инструменты', 'Оружие', 'Постройки', 'Расходники', 'Броня', 'Материалы'];
export const Craft = {
  net: null, cat: 'Инструменты', nearBench: () => false, timer: null,
  init(net, nearBench) { this.net = net; this.nearBench = nearBench; },
  isOpen() { return !$('#panel-craft').classList.contains('hidden'); },
  open() { $('#panel-craft').classList.remove('hidden'); this.render(); clearInterval(this.timer); this.timer = setInterval(() => this.renderQueue(), 200); },
  close() { $('#panel-craft').classList.add('hidden'); clearInterval(this.timer); },
  render() {
    const p = $('#panel-craft'); const near = this.nearBench(); p.innerHTML = `<div class="gp" style="width:min(520px,100%)"><div class="row"><b>Крафт</b><small class="muted">${near ? '🛠 Верстак рядом' : 'Верстака рядом нет (Тир 2–3 недоступны)'}</small></div><div class="cats"></div><div id="rl" style="display:flex;flex-direction:column;gap:6px"></div><b>Очередь</b><div id="cq"></div></div>`;
    const cats = $('.cats', p); CATS.forEach(c => { const b = document.createElement('button'); b.textContent = c; b.className = c === this.cat ? 'on' : ''; b.onclick = () => { this.cat = c; this.render(); }; cats.appendChild(b); });
    const list = $('#rl', p);
    for (const r of DATA.recipes.filter(x => x.cat === this.cat)) {
      const it = DATA.items[r.id], ok = Object.entries(r.ing).every(([k, v]) => Inv.count(k) >= v), ok10 = Object.entries(r.ing).every(([k, v]) => Inv.count(k) >= v * 10), lock = r.t > 1 && !near;
      const ing = Object.entries(r.ing).map(([k, v]) => `<span class="${Inv.count(k) < v ? 'miss' : ''}">${DATA.items[k].e}${v}</span>`).join(' ');
      const d = document.createElement('div'); d.className = 'rec'; d.innerHTML = `<div><b>${it.e} ${it.n}${r.n > 1 ? ' x' + r.n : ''}</b> <small>Тир ${r.t} • ${DATA.craftTime[r.t]} с</small><br><small>${ing}</small></div><div class="row"><button class="btn small primary" ${ok && !lock ? '' : 'disabled'}>Создать</button><button class="btn small" ${ok10 && !lock ? '' : 'disabled'}>x10</button></div>`;
      const [b1, b2] = d.querySelectorAll('button'); b1.onclick = () => this.net.emit('craft', { id: r.id, qty: 1 }); b2.onclick = () => this.net.emit('craft', { id: r.id, qty: 10 }); list.appendChild(d);
    }
    this.renderQueue();
  },
  renderQueue() {
    const q = $('#cq'); if (!q) return; q.innerHTML = Inv.st.queue.length ? '' : '<small class="muted">Пусто</small>';
    Inv.st.queue.forEach((e, i) => { const d = document.createElement('div'); d.className = 'rec'; d.innerHTML = `<span>${DATA.items[e.id].e} ${DATA.items[e.id].n}${e.mult > 1 ? ' x' + e.mult : ''}</span><button class="btn small">Отмена</button>`; d.querySelector('button').onclick = () => this.net.emit('craft:cancel', i); q.appendChild(d); });
  },
};
