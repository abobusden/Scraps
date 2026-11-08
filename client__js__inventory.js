// Инвентарь (6x4 + рюкзак +12), хотбар, экипировка, сундук. ПК: клик-клик / drag&drop / Shift+клик / ПКМ. Мобильный: тап-тап, долгий тап — меню.
import { $, toast } from './ui.js';
import { DATA, itemName, itemIcon } from './data.js';
import { skinById } from './skins.js';
import { play } from './audio.js';
export const Inv = {
  net: null, st: { inv: [], size: 30, eq: {}, hp: 70, hunger: 100, thirst: 100, flags: {}, mags: {}, sel: 0, queue: [] }, pick: null, chest: null, hover: null, search: '', onSelect: null,
  count(id) { let c = 0; for (let i = 0; i < this.st.size; i++) { const s = this.st.inv[i]; if (s && s.id === id) c += s.count; } return c; },
  held() { const s = this.st.sel >= 0 ? this.st.inv[this.st.sel] : null; return s; },
  init(net, onSelect) { this.net = net; this.onSelect = onSelect; },
  update(st) { Object.assign(this.st, st); this.renderHotbar(); if (this.isOpen()) { const sig = JSON.stringify([st.inv, st.eq, this.chest && this.chest.slots]); if (sig !== this._sig) { this._sig = sig; this.render(); } } },
  isOpen() { return !$('#panel-inv').classList.contains('hidden'); },
  slotEl(s, ref, opts = {}) {
    const el = document.createElement('div'); el.className = 'slot'; el._ref = ref; if (this.pick && this.pick.k === ref.k && this.pick.i === ref.i) el.classList.add('pick');
    if (s) {
      const it = DATA.items[s.id]; el.innerHTML = `<span>${it.e}</span>${s.count > 1 ? `<span class="n">${s.count}</span>` : ''}`;
      if (it.d && s.dur > 0) { const p = Math.max(0, Math.min(1, s.dur / it.d)); el.insertAdjacentHTML('beforeend', `<div class="dur"><i style="width:${p * 100}%;background:${p < .25 ? '#e5484d' : p < .5 ? '#e0a030' : '#46c37b'}"></i></div>`); }
      if (s.skin) { const sk = skinById(s.skin); if (sk) el.insertAdjacentHTML('beforeend', `<i class="sk-dot" style="background:${sk.color}"></i>`); }
      if (this.search && !it.n.toLowerCase().includes(this.search)) el.style.opacity = .25;
      el.draggable = true; el.ondragstart = e => { e.dataTransfer.setData('text', JSON.stringify(ref)); this.pick = null; };
    }
    if (opts.key) el.insertAdjacentHTML('beforeend', `<span class="k">${opts.key}</span>`);
    el.ondragover = e => e.preventDefault(); el.ondrop = e => { e.preventDefault(); try { this.move(JSON.parse(e.dataTransfer.getData('text')), ref); } catch { } };
    el.onclick = e => this.click(ref, s, e); el.oncontextmenu = e => { e.preventDefault(); if (s) this.menu(ref, s, e.clientX, e.clientY); };
    el.ondblclick = () => { if (s && ref.k === 'inv') { this.net.emit('inv:use', ref.i); } };
    el.onmouseenter = e => { this.hover = ref; if (s) this.tip(s, e); }; el.onmousemove = e => { if (s) this.tip(s, e); }; el.onmouseleave = () => { this.hover = null; $('#tip').style.display = 'none'; };
    let armT, menuT, sx = 0, sy = 0, armed = false, drag = null;
    el.ontouchstart = e => { if (!s || e.touches.length > 1) return; const t = e.touches[0]; sx = t.clientX; sy = t.clientY; armed = false; drag = null; clearTimeout(armT); clearTimeout(menuT);
      armT = setTimeout(() => { armed = true; }, 220); menuT = setTimeout(() => { if (!drag) { this.menu(ref, s, sx, sy); this._lp = true; } }, 650); };
    el.ontouchmove = e => { if (!s) return; const t = e.touches[0], mv = Math.hypot(t.clientX - sx, t.clientY - sy);
      if (!drag && mv > 8) { clearTimeout(menuT); if (!armed) { clearTimeout(armT); return; } // палец двинулся до удержания — это прокрутка
        const gh = document.createElement('div'); gh.className = 'drag-ghost'; gh.innerHTML = el.innerHTML; document.body.appendChild(gh); el.classList.add('dragging'); drag = { gh }; if (navigator.vibrate) try { navigator.vibrate(15); } catch { } }
      if (drag) { e.preventDefault(); drag.gh.style.left = t.clientX + 'px'; drag.gh.style.top = t.clientY + 'px'; } };
    el.ontouchend = el.ontouchcancel = e => { clearTimeout(armT); clearTimeout(menuT);
      if (drag) { const t = e.changedTouches[0], to = document.elementFromPoint(t.clientX, t.clientY), sl = to && to.closest && to.closest('.slot'); drag.gh.remove(); el.classList.remove('dragging'); drag = null; this.pick = null;
        if (sl && sl._ref) this.move(ref, sl._ref); else this.render(); e.preventDefault(); } };
    return el;
  },
  tip(s, e) { const t = $('#tip'), it = DATA.items[s.id], sk = s.skin && skinById(s.skin); t.style.display = 'block'; t.style.left = Math.min(e.clientX + 14, innerWidth - 230) + 'px'; t.style.top = e.clientY + 14 + 'px'; t.innerHTML = `<b>${it.n}</b>${sk ? ` <small style="color:${sk.color}">[${sk.name}]</small>` : ''}<br><small>Кол-во: ${s.count}${it.d ? ` • Прочность: ${Math.round(s.dur)}/${it.d}` : ''}</small>${it.red ? `<br><small>Защита: -${Math.round(it.red * 100)}%</small>` : ''}`; },
  click(ref, s, e) {
    if (this._lp) { this._lp = false; return; } play('click', .4);
    if (e.shiftKey && s) { if (ref.k === 'inv') { if (this.chest) { const to = this.chest.slots.findIndex(x => !x); if (to >= 0) this.net.emit('chest:move', { id: this.chest.id, from: ref, to: { k: 'chest', i: to } }); } else this.net.emit('inv:quick', ref.i); } else if (ref.k === 'chest') { for (let i = 0; i < this.st.size; i++) if (!this.st.inv[i]) { this.net.emit('chest:move', { id: this.chest.id, from: ref, to: { k: 'inv', i } }); break; } } return; }
    if (ref.k === 'eq') { if (s) this.net.emit('eq:unequip', ref.i); return; }
    if (!this.pick) { if (s) { this.pick = ref; this.render(); } return; }
    const a = this.pick; this.pick = null; this.move(a, ref);
  },
  move(a, b) {
    if (a.k === b.k && a.i === b.i) return this.render();
    if (a.k === 'inv' && b.k === 'inv') this.net.emit('inv:move', { from: a.i, to: b.i });
    else if (a.k === 'eq' || b.k === 'eq') { if (a.k === 'inv' && b.k === 'eq') this.net.emit('inv:use', a.i); }
    else if (this.chest) this.net.emit('chest:move', { id: this.chest.id, from: a, to: b });
    this.render();
  },
  menu(ref, s, x, y) {
    document.querySelectorAll('.ctx').forEach(e => e.remove()); const m = document.createElement('div'); m.className = 'ctx'; m.style.left = Math.min(x, innerWidth - 180) + 'px'; m.style.top = Math.min(y, innerHeight - 170) + 'px';
    const add = (t, f) => { const b = document.createElement('button'); b.textContent = t; b.onclick = () => { m.remove(); f(); }; m.appendChild(b); };
    if (ref.k === 'inv') { add('Использовать', () => this.net.emit('inv:use', ref.i)); add('Выбросить 1', () => this.net.emit('inv:drop', { slot: ref.i })); add('Выбросить всё', () => this.net.emit('inv:drop', { slot: ref.i, all: true })); }
    else if (ref.k === 'eq') add('Снять', () => this.net.emit('eq:unequip', ref.i)); document.body.appendChild(m);
    setTimeout(() => addEventListener('pointerdown', function h(e) { if (!m.contains(e.target)) { m.remove(); removeEventListener('pointerdown', h); } }), 0);
  },
  renderHotbar() {
    const hb = $('#hotbar'), sig = JSON.stringify(this.st.inv.slice(0, 6)) + this.search;
    if (sig !== this._hsig) { this._hsig = sig; hb.innerHTML = '';
      for (let i = 0; i < 6; i++) { const el = this.slotEl(this.st.inv[i], { k: 'inv', i }, { key: i + 1 }); el.onpointerdown = e => { e.preventDefault(); e.stopPropagation(); this.onSelect && this.onSelect(i); }; el.onclick = null; el.ondblclick = null; el.ontouchstart = el.ontouchmove = el.ontouchend = el.ontouchcancel = null; el.draggable = false; hb.appendChild(el); } }
    [...hb.children].forEach((el, i) => el.classList.toggle('sel', this.st.sel === i));
    const h = this.held(), C = h && DATA.combat[h.id]; const am = $('#ammo');
    if (C && C.k === 'gun') am.textContent = `${this.st.mags[h.id] || 0} / ${this.count(C.ammo)}`; else if (C && C.k === 'bow') am.textContent = `➶ ${this.count('arrows') + this.count('fire_arrows')}`; else am.textContent = '';
    $('#v-hp').style.width = Math.max(0, this.st.hp) + '%'; $('#t-hp').textContent = Math.ceil(this.st.hp); $('#v-food').style.width = this.st.hunger + '%'; $('#v-water').style.width = this.st.thirst + '%';
  },
  open() { this.pick = null; $('#panel-inv').classList.remove('hidden'); this.render(); },
  close() { $('#panel-inv').classList.add('hidden'); this.pick = null; this.chest = null; $('#tip').style.display = 'none'; document.querySelectorAll('.ctx').forEach(e => e.remove()); },
  openChest(d) { this.chest = d; if (!this.isOpen()) $('#panel-inv').classList.remove('hidden'); this.render(); },
  render() {
    const p = $('#panel-inv'), st0 = p.scrollTop; p.innerHTML = ''; const L = document.createElement('div'); L.className = 'gp';
    L.innerHTML = `<div class="row"><b>Инвентарь</b><input id="inv-search" placeholder="Поиск" style="max-width:150px;min-height:36px" value="${this.search}"><button class="btn small" id="inv-sort">Сортировка</button></div>`;
    const eq = document.createElement('div'); eq.className = 'igrid'; eq.style.gridTemplateColumns = 'repeat(4,56px)';
    [['helmet', '⛑️'], ['chest', '🦺'], ['pants', '👖'], ['backpack', '🎒']].forEach(([k, ic]) => { const s = this.st.eq[k] ? { id: this.st.eq[k].id, count: 1, dur: this.st.eq[k].dur } : null; const el = this.slotEl(s, { k: 'eq', i: k }); if (!s) { el.innerHTML = `<span style="opacity:.25">${ic}</span>`; } eq.appendChild(el); });
    L.append('Экипировка', eq); const h = document.createElement('div'); h.className = 'igrid'; for (let i = 0; i < 6; i++) h.appendChild(this.slotEl(this.st.inv[i], { k: 'inv', i }, { key: i + 1 })); L.append('Хотбар (в руки)', h);
    const g = document.createElement('div'); g.className = 'igrid'; for (let i = 6; i < this.st.size; i++) g.appendChild(this.slotEl(this.st.inv[i], { k: 'inv', i })); L.append('Рюкзак', g); p.appendChild(L);
    if (this.chest) {
      const R = document.createElement('div'); R.className = 'gp'; const lk = this.chest.lock !== 'none' ? ' 🔒' : ''; const TC = { basic: '#d6b27a', military: '#9fc272', elite: '#ffcc4d' }; R.innerHTML = `<div class="row"><b${this.chest.crate ? ` style="color:${TC[this.chest.crate] || '#fff'}"` : ''}>${this.chest.title || 'Сундук'}${lk}</b></div>`; const cg = document.createElement('div'); cg.className = 'igrid'; this.chest.slots.forEach((s, i) => cg.appendChild(this.slotEl(s, { k: 'chest', i }))); R.appendChild(cg);
      const r = document.createElement('div'); r.className = 'row'; r.innerHTML = '<button class="btn small" id="ch-take">Взять всё</button>' + (this.chest.crate ? '' : '<button class="btn small" id="ch-put">Положить всё</button>'); if (this.chest.owner) r.insertAdjacentHTML('beforeend', '<button class="btn small" id="ch-lock">Замок</button>'); R.appendChild(r); p.appendChild(R);
      $('#ch-take').onclick = () => this.net.emit('chest:all', { id: this.chest.id, mode: 'take' }); const pb = $('#ch-put'); if (pb) pb.onclick = () => this.net.emit('chest:all', { id: this.chest.id, mode: 'put' }); const lb = $('#ch-lock'); if (lb) lb.onclick = () => this.onLock && this.onLock(this.chest.id, this.chest.lock);
    }
    p.scrollTop = st0; $('#inv-sort').onclick = () => this.net.emit('inv:sort'); const sr = $('#inv-search'); sr.oninput = () => { this.search = sr.value.toLowerCase(); this.render(); $('#inv-search').focus(); $('#inv-search').setSelectionRange(99, 99); }; sr.onkeydown = e => e.stopPropagation();
  },
};
