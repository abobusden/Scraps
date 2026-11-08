// Каталог скинов (кэш) + инвентарь скинов в меню.
import { api, $, toast, esc } from './ui.js';
import { openCaseAnimation } from './cases.js';
import { play } from './audio.js';
export const catalog = { skins: [], owned: [], balance: 0, cases: 0, casePrice: 200 };
export const skinById = id => catalog.skins.find(s => s.id === id);
export async function loadCatalog() { Object.assign(catalog, await api('/api/shop/catalog')); return catalog; }
export const RARNAME = { common: 'Обычный', uncommon: 'Необычный', rare: 'Редкий', epic: 'Эпический', legendary: 'Легендарный' };
export async function renderSkins() {
  try { await loadCatalog(); } catch (e) { return toast(e.message, 'error'); }
  const cases = $('#inv-cases'), grid = $('#inv-skins'); const active = catalog.owned.find(o => o.active);
  cases.innerHTML = `<div class="card"><span>🎁 Кейсы: <b>${catalog.cases}</b></span><button class="btn small primary" id="inv-open" ${catalog.cases ? '' : 'disabled'}>Открыть</button></div>`;
  $('#inv-open').onclick = async () => { try { const res = await api('/api/shop/open-case', {}); await openCaseAnimation(res); renderSkins(); } catch (e) { toast(e.message, 'error'); } };
  grid.innerHTML = catalog.owned.length ? '' : '<p class="muted">Скинов пока нет. Купите их в магазине или выбейте из кейсов.</p>';
  for (const o of catalog.owned) {
    const s = skinById(o.skin_id); if (!s) continue; const isA = o.active === 1;
    const d = document.createElement('div'); d.className = 'sk' + (isA ? ' active' : '');
    d.innerHTML = `<div class="sw" style="background:linear-gradient(135deg,${s.color},#000a)"></div><b class="rar-${s.rarity}">${esc(s.name)}</b><small class="muted">${RARNAME[s.rarity]}</small>${isA ? '<small style="color:var(--ac)">Активен</small>' : ''}<button class="btn small ${isA ? '' : 'primary'}">${isA ? 'Снять' : 'Применить'}</button>`;
    $('button', d).onclick = async () => { try { await api('/api/shop/apply-skin', { id: isA ? null : s.id }); play('click'); toast(isA ? 'Скин снят' : `Скин «${s.name}» применён`, 'success'); renderSkins(); } catch (e) { toast(e.message, 'error'); } };
    grid.appendChild(d);
  }
}
