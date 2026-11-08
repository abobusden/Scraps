import { api, $, toast, esc } from './ui.js';
import { catalog, loadCatalog, RARNAME } from './skins.js';
import { openCaseAnimation } from './cases.js';
export async function renderShop() {
  try { await loadCatalog(); } catch (e) { return toast(e.message, 'error'); }
  $('#shop-balance').textContent = `🔩 ${catalog.balance} скрапа`;
  $('#shop-case').innerHTML = `<div class="card"><span>🎁 <b>Кейс</b> — ${catalog.casePrice} скрапа <small class="muted">(у вас: ${catalog.cases})</small></span><span class="row"><button class="btn small primary" id="buy-case">Купить</button><button class="btn small" id="open-case" ${catalog.cases ? '' : 'disabled'}>Открыть</button></span></div>`;
  $('#buy-case').onclick = async () => { try { await api('/api/shop/buy-case', { count: 1 }); toast('Кейс куплен', 'success'); renderShop(); } catch (e) { toast(e.message, 'error'); } };
  $('#open-case').onclick = async () => { try { const r = await api('/api/shop/open-case', {}); await openCaseAnimation(r); renderShop(); } catch (e) { toast(e.message, 'error'); } };
  const grid = $('#shop-skins'); grid.innerHTML = '';
  for (const s of catalog.skins.filter(x => x.price)) {
    const own = catalog.owned.some(o => o.skin_id === s.id), d = document.createElement('div'); d.className = 'sk';
    d.innerHTML = `<div class="sw" style="background:linear-gradient(135deg,${s.color},#000a)"></div><b class="rar-${s.rarity}">${esc(s.name)}</b><small class="muted">${RARNAME[s.rarity]}</small><button class="btn small ${own ? '' : 'primary'}" ${own ? 'disabled' : ''}>${own ? 'Куплено' : `🔩 ${s.price}`}</button>`;
    $('button', d).onclick = async () => { try { await api('/api/shop/buy-skin', { id: s.id }); toast(`Куплено: ${s.name}`, 'success'); renderShop(); } catch (e) { toast(e.message, 'error'); } };
    grid.appendChild(d);
  }
}
