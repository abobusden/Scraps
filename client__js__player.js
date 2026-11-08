// Локальный игрок (1-е лицо), viewmodel (руки + предмет), удалённые игроки (процедурная модель).
import * as THREE from 'three';
import { heightAt } from './world.js';
import { skinById } from './skins.js';
import { colorOf } from './ui.js';
import { DATA } from './data.js';

const mat = (c, o = {}) => o.metalness ? new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .45 }, o)) : new THREE.MeshLambertMaterial(Object.assign({ color: c }, o));
const cyl = (r1, r2, h, c, seg = 8) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat(c));
const bx = (w, h, d, c, o) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, o));
// Кисть: ладонь, 4 пальца и большой палец; манжета рукава
function mkHand(skin) { const h = new THREE.Group(); const palm = bx(.08, .04, .09, skin); palm.position.z = -.01; h.add(palm); for (let i = 0; i < 4; i++) { const f = bx(.016, .02, .055, skin); f.position.set(-.027 + i * .018, -.006, -.07); f.rotation.x = .45; h.add(f); } const t = bx(.02, .022, .05, skin); t.position.set(-.05, .0, -.03); t.rotation.set(0, .5, 0); h.add(t); return h; }
function mkCuff(c) { const m = cyl(.056, .056, .05, '#d8d2c4', 10); m.rotation.x = Math.PI / 2; m.position.z = .03; return m; }
// Предметы в руке. Ось -Z — вперёд от руки.
export function makeItemMesh(id, skinId) {
  const g = new THREE.Group(); const S = '#8a8f96', WD = '#7a5230', WD2 = '#5b3a1f', DK = '#2b2f35', LT = '#4a3220';
  const handle = (len, c = WD) => { const h = cyl(.018, .022, len, c, 7); h.rotation.x = Math.PI / 2; return h; };
  const wrap = (z, len = .05, c = LT, r = .025) => { const w = cyl(r, r, len, c, 7); w.rotation.x = Math.PI / 2; w.position.z = z; return w; };
  const put = (m, x = 0, y = 0, z = 0) => { m.position.set(x, y, z); g.add(m); return m; };
  const blob = (r, c, sx = 1, sy = .8, sz = .9) => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat(c, { flatShading: true })); m.scale.set(sx, sy, sz); return m; };
  const cone = (r, h, c, seg = 6, o) => { const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat(c, o)); m.rotation.x = -Math.PI / 2; return m; };
  const gun = (len, h, mag, extra) => { const b = bx(.045, h, len, DK); g.add(b);
    const br = cyl(.012, .012, len * .5, '#111', 8); br.rotation.x = Math.PI / 2; br.position.z = -len * .7; g.add(br);
    const tip = cyl(.017, .017, .035, '#0b0b0b', 8); tip.rotation.x = Math.PI / 2; tip.position.z = -len * .95; g.add(tip);
    put(bx(.008, .022, .008, '#111'), 0, h / 2 + .012, -len * .92); put(bx(.022, .012, .012, '#111'), 0, h / 2 + .008, len * .36);
    put(bx(.014, .006, len * .5, '#1d2025'), 0, h / 2 + .004, -len * .1);
    const gr = bx(.04, .1, .05, WD); gr.position.set(0, -.08, len * .3); gr.rotation.x = .3; g.add(gr);
    put(bx(.006, .03, .008, '#111'), 0, -.045, len * .08); put(bx(.006, .006, .075, '#111'), 0, -.062, len * .12);
    if (mag) { const m = bx(.03, mag, .05, '#222'); m.position.set(0, -.1, 0); m.rotation.x = mag > .1 ? .16 : 0; m.name = 'mag'; g.add(m); }
    const mz = new THREE.Mesh(new THREE.ConeGeometry(.045, .2, 7), new THREE.MeshBasicMaterial({ color: '#ffcf6a', transparent: true, opacity: .9, depthWrite: false })); mz.rotation.x = -Math.PI / 2; mz.position.z = -len * .95 - .1; mz.name = 'muzzle'; mz.visible = false; g.add(mz); if (extra) extra(); };
  const slide = len => { const s = bx(.042, .03, len * .8, '#3a3f46'); s.position.set(0, .04, -len * .05); s.name = 'slide'; g.add(s); put(bx(.044, .006, len * .6, '#555d66'), 0, .058, -len * .05); };
  const bolt = z => { const o = bx(.012, .018, .05, '#aab'); o.position.set(.028, .02, z); o.name = 'bolt'; g.add(o); };
  switch (id) {
    case 'rock': { put(blob(.075, '#8a8c8e', 1.05, .8, .9)); put(blob(.045, '#9c9ea0', 1, .8, 1), .04, .035, -.03); put(blob(.03, '#74767a'), -.05, -.02, .03); break; }
    case 'torch': { const h = handle(.5, WD2); g.add(h); put(wrap(-.2, .08, '#2a1a0c', .027)); const f = new THREE.Mesh(new THREE.ConeGeometry(.05, .16, 7), new THREE.MeshBasicMaterial({ color: '#ff9a2a' })); f.position.z = -.31; f.rotation.x = -Math.PI / 2; f.name = 'flame'; g.add(f); const f2 = new THREE.Mesh(new THREE.ConeGeometry(.025, .1, 6), new THREE.MeshBasicMaterial({ color: '#ffe27a' })); f2.position.z = -.3; f2.rotation.x = -Math.PI / 2; g.add(f2); const head = bx(.055, .055, .09, '#3a2410'); head.position.z = -.26; g.add(head); const l = new THREE.PointLight('#ff9040', 2.6, 18); l.position.z = -.35; g.add(l); break; }
    case 'flashlight': { const c = cyl(.03, .035, .18, '#333'); c.rotation.x = Math.PI / 2; g.add(c); put(cyl(.042, .042, .03, '#c9a227', 10), 0, 0, -.1).rotation.x = Math.PI / 2; put(cyl(.028, .028, .01, '#fff7c0', 10), 0, 0, -.116).rotation.x = Math.PI / 2; break; }
    case 'stone_axe': case 'metal_axe': { const met = id === 'metal_axe'; g.add(handle(.55)); put(wrap(.2, .12, LT, .024)); put(wrap(.27, .02, '#222', .026));
      put(bx(.04, .07, .06, met ? '#6b7480' : '#6f6f6a', { metalness: met ? .5 : 0 }), 0, 0, -.22);
      put(bx(.016, .14, .09, met ? '#b8c2ce' : '#8e8e86', { metalness: met ? .75 : 0 }), 0, 0, -.29); put(bx(.008, .155, .014, met ? '#eef3f8' : '#bdbdb4'), 0, 0, -.338);
      if (!met) for (const z of [-.2, -.245]) put(wrap(z, .022, '#6a4a2a', .03)); else put(bx(.05, .03, .02, '#444'), 0, .06, -.22); break; }
    case 'stone_pickaxe': case 'metal_pickaxe': { const met = id === 'metal_pickaxe', c = met ? '#aab4c0' : '#7d7d78', o = { metalness: met ? .7 : 0 }; g.add(handle(.6)); put(wrap(.22, .12, LT, .024));
      put(bx(.05, .06, .06, met ? '#6b7480' : '#6a6a66'), 0, 0, -.3);
      for (const sx of [-1, 1]) { const arm = bx(.19, .035, .035, c, o); arm.position.set(sx * .11, -.012, -.3); arm.rotation.z = -sx * .3; g.add(arm); const tp = cone(.018, .07, met ? '#e4ebf2' : '#a9a9a2'); tp.rotation.set(0, 0, 0); tp.rotation.z = sx * -Math.PI / 2 - sx * .3; tp.position.set(sx * .225, -.052, -.3); g.add(tp); }
      if (!met) put(wrap(-.28, .03, '#6a4a2a', .03)); break; }
    case 'stone_knife': case 'metal_knife': case 'combat_knife': case 'throwing_knife': { const st = id === 'stone_knife', col = st ? '#8a8a82' : '#cfd6dd', o = { metalness: st ? 0 : .8 };
      put(bx(.025, .032, .1, id === 'combat_knife' ? '#1b1b1b' : '#3a2a1a')); put(bx(.05, .012, .012, S), 0, 0, -.058); put(bx(.008, .04, .15, col, o), 0, 0, -.135); put(cone(.02, .075, col, 4, o), 0, .0, -.27).scale.set(.25, 1, 1);
      put(bx(.002, .01, .12, '#222'), .0045, .004, -.14); break; }
    case 'wood_spear': case 'metal_spear': { const met = id === 'metal_spear'; g.add(handle(1.4)); for (const z of [.1, -.45]) put(wrap(z, .05, LT, .022));
      if (met) { put(cyl(.024, .02, .07, '#555', 7), 0, 0, -.74).rotation.x = Math.PI / 2; const l = new THREE.Mesh(new THREE.OctahedronGeometry(.04, 0), mat('#cfd6dd', { metalness: .8 })); l.scale.set(.35, .8, 2.2); l.position.z = -.82; g.add(l); }
      else { const l = new THREE.Mesh(new THREE.OctahedronGeometry(.04, 0), mat('#8c8c85')); l.scale.set(.4, .8, 2); l.position.z = -.8; g.add(l); put(wrap(-.72, .04, '#6a4a2a', .024)); } break; }
    case 'machete': { put(bx(.026, .032, .11, '#222')); put(bx(.01, .014, .4, '#bfc7ce', { metalness: .8 }), 0, .03, -.28); put(bx(.006, .062, .36, '#cfd6dd', { metalness: .8 }), 0, 0, -.28); put(cone(.032, .08, '#cfd6dd', 4, { metalness: .8 }), 0, .0, -.5).scale.set(.2, 1, 1); break; }
    case 'hammer': { g.add(handle(.6)); put(wrap(.22, .14, LT, .024)); put(bx(.07, .085, .17, '#556', { metalness: .6 }), 0, 0, -.3); for (const sz of [-1, 1]) put(cyl(.05, .05, .02, '#7a8590', 10), 0, 0, -.3 + sz * .095).rotation.x = Math.PI / 2; put(bx(.012, .05, .05, '#444'), 0, -.06, -.3); break; }
    case 'makeshift_pistol': case 'pistol': gun(.22, .06, id === 'pistol' ? .08 : 0, () => slide(.22)); break;
    case 'makeshift_revolver': gun(.24, .06, 0, () => { const c = cyl(.035, .035, .06, '#333'); c.rotation.x = Math.PI / 2; c.name = 'cyl'; g.add(c); const hm = bx(.012, .035, .015, '#222'); hm.position.set(0, .045, .1); hm.name = 'hammer'; g.add(hm); put(bx(.014, .016, .12, '#555'), 0, -.026, -.08); }); break;
    case 'shotgun': gun(.7, .06, 0, () => { const p = bx(.05, .05, .3, WD); p.position.set(0, -.04, -.1); p.name = 'pump'; g.add(p); put(bx(.052, .012, .26, WD2), 0, -.066, -.1); put(cyl(.014, .014, .38, '#222', 6), 0, -.012, -.28).rotation.x = Math.PI / 2; put(bx(.04, .08, .22, WD), 0, -.02, .42).rotation.x = -.18; }); break;
    case 'ak': gun(.62, .07, .16, () => { const s = bx(.04, .09, .22, WD); s.position.z = .4; s.rotation.x = -.1; g.add(s); put(bx(.05, .05, .2, WD2), 0, -.004, -.18); put(cyl(.009, .009, .26, '#222', 6), 0, .05, -.2).rotation.x = Math.PI / 2; put(bx(.03, .016, .14, '#1d2025'), 0, .05, .02); bolt(-.05); }); break;
    case 'rifle': gun(.9, .06, .05, () => { const s = cyl(.02, .02, .18, '#111'); s.rotation.x = Math.PI / 2; s.position.set(0, .06, -.05); g.add(s); put(cyl(.024, .024, .02, '#222', 8), 0, .06, -.14).rotation.x = Math.PI / 2; put(cyl(.024, .024, .02, '#222', 8), 0, .06, .04).rotation.x = Math.PI / 2; const st = bx(.045, .09, .3, WD); st.position.z = .5; g.add(st); put(bx(.046, .04, .34, WD2), 0, -.01, -.2); bolt(.1); }); break;
    case 'bow': { const arc = new THREE.Mesh(new THREE.TorusGeometry(.28, .014, 6, 20, Math.PI), mat(WD)); arc.rotation.z = Math.PI / 2; const grp = new THREE.Group(); grp.add(arc); grp.rotation.y = -Math.PI / 2; g.add(grp); put(wrap(0, .09, LT, .022));
      const sA = bx(.003, .003, .28, '#ddd'), sB = bx(.003, .003, .28, '#ddd'); sA.name = 'strA'; sB.name = 'strB'; sA.position.set(0, .14, 0); sA.rotation.x = Math.PI / 2; sB.position.set(0, -.14, 0); sB.rotation.x = -Math.PI / 2; g.add(sA, sB);
      const ar = cyl(.006, .006, .55, '#c9a36a', 5); ar.rotation.x = Math.PI / 2; ar.name = 'arrow'; ar.visible = false; const tip = new THREE.Mesh(new THREE.ConeGeometry(.014, .05, 5), mat('#999')); tip.position.y = -.28; tip.rotation.x = Math.PI; ar.add(tip); for (const k of [.22, .26]) { const fe = bx(.002, .03, .02, '#d33'); fe.position.y = k; ar.add(fe); } g.add(ar); break; }
    case 'grenade': { g.add(new THREE.Mesh(new THREE.SphereGeometry(.05, 10, 8), mat('#3d5a2d'))); for (const y of [-.02, .0, .02]) put(cyl(.052, .052, .006, '#2e4421', 10), 0, y, 0); put(bx(.012, .03, .05, '#999'), 0, .062, .0); put(cyl(.018, .018, .02, '#555', 8), 0, .055, 0); break; }
    case 'molotov': { put(cyl(.04, .05, .2, '#2f6a3f', 8)); put(cyl(.018, .04, .06, '#2f6a3f', 8), 0, .12, 0); const r = bx(.04, .04, .08, '#d9d4c5'); r.position.y = .17; g.add(r); put(new THREE.Mesh(new THREE.SphereGeometry(.02, 6, 5), new THREE.MeshBasicMaterial({ color: '#ff9a2a' })), 0, .22, 0); break; }
    case 'smoke': { put(cyl(.04, .04, .14, '#7f858c', 10)); put(cyl(.032, .032, .012, '#c9b469', 10), 0, .076, 0); put(cyl(.042, .042, .01, '#d33', 10), 0, .03, 0); break; }
    case 'c4': { g.add(bx(.14, .05, .09, '#c9b469')); const l = bx(.03, .015, .02, '#f33'); l.position.set(0, .03, 0); g.add(l); put(bx(.05, .006, .03, '#222'), -.03, .028, .02); put(bx(.003, .003, .1, '#222'), .06, .02, 0); break; }
    case 'bandage': case 'medkit': { g.add(bx(.12, .04, .1, id === 'medkit' ? '#d33' : '#eee')); if (id === 'medkit') { put(bx(.05, .042, .012, '#fff'), 0, 0, .0); put(bx(.012, .042, .05, '#fff'), 0, 0, 0); } else put(bx(.122, .042, .03, '#d96', {}), 0, 0, 0); break; }
    case 'berries': case 'mushroom': case 'raw_meat': case 'cooked_meat': case 'canned': case 'water_bottle': { const m = id === 'canned' || id === 'water_bottle' ? cyl(.035, .035, .12, id === 'canned' ? '#aaa' : '#7cc7ff') : new THREE.Mesh(new THREE.SphereGeometry(.05, 8, 6), mat(id === 'berries' ? '#c01830' : id === 'mushroom' ? '#b87b4a' : id === 'raw_meat' ? '#b0393d' : '#7a3a1f')); g.add(m);
      if (id === 'canned') put(cyl(.036, .036, .04, '#c33', 10), 0, 0, 0); if (id === 'water_bottle') { put(cyl(.015, .02, .03, '#ddd', 8), 0, .075, 0); put(cyl(.036, .036, .03, '#2b7fc0', 10), 0, .01, 0); } if (id === 'mushroom') put(new THREE.Mesh(new THREE.SphereGeometry(.05, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), mat('#a3552b')), 0, .02, 0); break; }
    default: g.add(bx(.12, .12, .12, I_COLOR(id)));
  }
  const sk = skinId && skinById(skinId);
  if (sk) g.traverse(o => { if (o.isMesh && o.material && !o.material.isMeshBasicMaterial) { o.material = o.material.clone(); o.material.color.lerp(new THREE.Color(sk.color), .8); if (sk.emissive) { o.material.emissive = new THREE.Color(sk.emissive); o.material.emissiveIntensity = .5; } } });
  return g;
}
const I_COLOR = id => ({ foundation: '#a87', wall: '#a87' }[id] || '#b09070');
const isGun = id => ['makeshift_pistol', 'makeshift_revolver', 'pistol', 'shotgun', 'ak', 'rifle', 'bow'].includes(id);
const twoHand = id => ['shotgun', 'ak', 'rifle', 'bow', 'wood_spear', 'metal_spear', 'hammer'].includes(id);

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const mix = (a, b, u) => a + (b - a) * u;
const sstep = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
const lerp3 = (a, b, u) => [mix(a[0], b[0], u), mix(a[1], b[1], u), mix(a[2], b[2], u)];
const angD = (a, b) => ((a - b + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
// тип анимации по id предмета
export const kindOf = id => ({
  stone_axe: 'axe', metal_axe: 'axe', stone_pickaxe: 'pick', metal_pickaxe: 'pick', stone_knife: 'knife', metal_knife: 'knife', combat_knife: 'knife', machete: 'knife',
  wood_spear: 'spear', metal_spear: 'spear', hammer: 'hammer', rock: 'rock', torch: 'rock', flashlight: 'rock', fist: 'fist',
  makeshift_pistol: 'pistol', pistol: 'pistol', makeshift_revolver: 'revolver', shotgun: 'shotgun', ak: 'ak', rifle: 'rifle', bow: 'bow',
  berries: 'eat', mushroom: 'eat', raw_meat: 'eat', cooked_meat: 'eat', canned: 'eat', water_bottle: 'drink', bandage: 'heal', medkit: 'heal',
}[id] || 'other');
const R0 = [0, 0, 0, 0, 0, 0, 0];
// ключевые кадры удара: [время 0..1, x, y, z, наклон(rx), поворот(ry), крен(rz)] для правой руки; hit — момент попадания
const MELEE = {
  axe: { hit: .46, K: [R0, [.26, .05, .15, .12, 1.05, .12, -.5], [.46, -.05, -.13, -.22, -.85, -.1, .5], [.6, -.05, -.12, -.2, -.78, -.1, .45], [1, 0, 0, 0, 0, 0, 0]] },
  pick: { hit: .46, K: [R0, [.28, .02, .22, .14, 1.3, .05, -.2], [.46, -.03, -.18, -.24, -1.0, -.05, .15], [.6, -.03, -.17, -.22, -.95, -.05, .1], [1, 0, 0, 0, 0, 0, 0]] },
  knife: { hit: .36, K: [R0, [.2, .14, .03, .1, .15, -.55, -.8], [.36, -.2, -.03, -.16, -.1, .6, .8], [.55, -.2, -.03, -.14, -.08, .55, .7], [1, 0, 0, 0, 0, 0, 0]] },
  spear: { hit: .4, K: [R0, [.25, 0, .02, .2, .1, 0, 0], [.4, 0, -.01, -.42, -.05, 0, 0], [.6, 0, -.01, -.38, -.05, 0, 0], [1, 0, 0, 0, 0, 0, 0]] },
  hammer: { hit: .58, K: [R0, [.4, .04, .26, .16, 1.4, .1, -.4], [.58, -.05, -.2, -.26, -1.05, -.1, .4], [.72, -.05, -.19, -.24, -1.0, -.1, .35], [1, 0, 0, 0, 0, 0, 0]] },
  fist: { hit: .35, K: [R0, [.18, .02, 0, .1, .1, 0, 0], [.35, -.06, -.02, -.32, .05, -.15, 0], [.5, -.06, -.02, -.3, .05, -.15, 0], [1, 0, 0, 0, 0, 0, 0]] },
};
MELEE.rock = { hit: .45, K: [R0, [.28, .04, .12, .1, .8, .1, -.3], [.45, -.04, -.1, -.18, -.65, -.1, .3], [.58, -.04, -.1, -.16, -.6, -.1, .25], [1, 0, 0, 0, 0, 0, 0]] };
MELEE.other = MELEE.rock;
const kf = (K, t, hit) => {
  for (let i = 1; i < K.length; i++) if (t <= K[i][0]) { const a = K[i - 1], b = K[i]; let u = (t - a[0]) / (b[0] - a[0]); u = b[0] === hit ? u * u : u * u * (3 - 2 * u); return a.slice(1).map((v, j) => v + (b[j + 1] - v) * u); }
  return K[K.length - 1].slice(1);
};
const KICK = { pistol: [.9, 3.2], revolver: [1.1, 4.2], shotgun: [1.9, 5.5], ak: [.55, 1.7], rifle: [1.5, 4.5] }; // [назад, подброс ствола]

export class ViewModel {
  constructor(camera) {
    this.root = new THREE.Group(); camera.add(this.root); this.t = 0; this.equip = 1; this.ads = 0; this.itemId = null; this.kind = 'fist';
    this.act = null; this.alt = 0; this.rel = null; this.reloadT = 0; this.fireT = 9; this.fe1 = 0; this.sp = 0; this.draw = 0; this.snap = 0; this.cylA = 0; this.cylT = 0;
    this.kz = 0; this.kvz = 0; this.kr = 0; this.kvr = 0; this.ky = 0; this.kvy = 0; this.swX = 0; this.swY = 0; this.pyaw = null; this.pit = 0; this.wasGround = true; this.lastVy = 0;
    this.parts = {}; this.lBase = [-.24, -.3, -.45]; this.lBaseRy = 0; this.onEvent = null; this.hide = false;
    const skin = '#d9a67e', sleeve = '#3a4a5a';
    this.rArm = new THREE.Group(); const rf = cyl(.04, .05, .5, sleeve); rf.rotation.x = Math.PI / 2; rf.position.z = .25; const rh = mkHand(skin); this.rArm.add(rf, rh, mkCuff(sleeve)); this.rArm.position.set(.26, -.27, -.5); this.rArm.rotation.x = .1;
    this.lArm = new THREE.Group(); const lf = cyl(.04, .05, .5, sleeve); lf.rotation.x = Math.PI / 2; lf.position.z = .25; const lh = mkHand(skin); this.lArm.add(lf, lh, mkCuff(sleeve)); this.lArm.position.set(-.24, -.3, -.45);
    this.holder = new THREE.Group(); this.holder.position.set(0, .0, -.04); this.rArm.add(this.holder); this.root.add(this.rArm, this.lArm);
  }
  ev(n) { if (this.onEvent) this.onEvent(n); }
  setItem(id, skin) {
    if (this.item) { this.holder.remove(this.item); this.item = null; } this.itemId = id; this.kind = kindOf(id); this.equip = 1; this.act = null; this.rel = null; this.reloadT = 0; this.draw = 0; this.parts = {}; this.fireT = 9; this.fe1 = 0;
    if (id && id !== 'fist') { this.item = makeItemMesh(id, skin); this.holder.add(this.item); this.item.traverse(o => { if (o.name) this.parts[o.name] = { o, p: o.position.clone() }; }); }
    const two = twoHand(id); this.lBase = two ? [-.12, -.26, -.7] : [-.24, -.3, -.45]; this.lBaseRy = two ? .3 : 0; this.lArm.position.set(...this.lBase); this.lArm.rotation.y = this.lBaseRy;
    this.item && this.item.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
  }
  // удар/выстрел. Возвращает задержку (мс) до момента попадания для ближнего боя
  attack(spd = .5) {
    const k = this.kind;
    if (KICK[k]) { const [vz, vr] = KICK[k]; this.kvz += vz; this.kvr += vr; this.fireT = 0; this.fe1 = 0; if (k === 'revolver') this.cylT += Math.PI / 3; return 0; }
    const M = MELEE[k] || MELEE.other, dur = clamp(spd * .95, .28, 1); this.alt ^= 1;
    this.act = { type: 'melee', kind: MELEE[k] ? k : 'other', M, t: 0, dur, sw: 0, alt: this.alt };
    return M.hit * dur * 1000;
  }
  use() { const k = this.kind; this.act = { type: 'use', kind: k === 'drink' || k === 'heal' ? k : 'eat', t: 0, dur: .7 }; }
  reload(t) { if (!KICK[this.kind]) return; this.rel = { t: 0, dur: Math.max(.5, t), f: {}, sh: {}, last: -1 }; this.reloadT = t; }
  setDraw(v) { this.draw = v; }
  releaseBow(pw) { this.draw = 0; this.snap = .2; this.kvz += .5 + .4 * pw; this.kvr += 1.2; }
  update(dt, moving, running, aiming, L) {
    dt = Math.min(dt, .05); const k = this.kind, id = this.itemId, gun = isGun(id), two = twoHand(id), P = this.parts;
    this.t += dt * (running ? 11 : moving ? 7 : 1.5); this.equip = Math.max(0, this.equip - dt / .4); this.fireT += dt; this.snap = Math.max(0, this.snap - dt);
    this.ads += ((aiming && !this.rel ? 1 : 0) - this.ads) * Math.min(1, dt * 12); const ads = gun ? this.ads : 0;
    // пружины отдачи/инерции
    const K = 230, Cc = 21;
    this.kvz += (-K * this.kz - Cc * this.kvz) * dt; this.kz += this.kvz * dt; this.kvr += (-K * this.kr - Cc * this.kvr) * dt; this.kr += this.kvr * dt; this.kvy += (-K * this.ky - Cc * this.kvy) * dt; this.ky += this.kvy * dt;
    if (L) { // оружие запаздывает за поворотом камеры, проседает при приземлении
      if (this.pyaw === null) { this.pyaw = L.yaw; this.pit = L.pitch; }
      const vy = clamp(angD(L.yaw, this.pyaw) / Math.max(dt, .001), -9, 9), vp = clamp((L.pitch - this.pit) / Math.max(dt, .001), -9, 9); this.pyaw = L.yaw; this.pit = L.pitch;
      const k2 = Math.min(1, dt * 9); this.swX += (clamp(vy * .0042, -.04, .04) - this.swX) * k2; this.swY += (clamp(-vp * .0035, -.03, .03) - this.swY) * k2;
      const og = !!L.onGround; if (og && !this.wasGround && this.lastVy < -3) this.kvy -= clamp(-this.lastVy * .22, .6, 2.4); if (!og && this.wasGround && L.vel && L.vel.y > 3) this.kvy -= .8; this.wasGround = og; this.lastVy = L.vel ? L.vel.y : 0;
    }
    const eu = 1 - this.equip, c1 = 1.70158, c3 = c1 + 1, eq = 1 - (1 + c3 * Math.pow(eu - 1, 3) + c1 * Math.pow(eu - 1, 2)); // достать оружие: 1 -> 0 с лёгким перелётом
    const busy = !!(this.act || this.rel || this.draw > 0); this.sp += ((running && !aiming && !busy ? 1 : 0) - this.sp) * Math.min(1, dt * 9); const sp = this.sp;
    const bob = moving ? (running ? .02 : .012) : .004, bx2 = Math.sin(this.t) * bob * (1 - ads), by = Math.abs(Math.cos(this.t)) * bob * (1 - ads);
    let px = this.swX + bx2, py = this.swY + this.ky - by - eq * .45, pz = this.kz, rx = this.kr - eq * .9, ry = this.swX * 2.2 - eq * .45, rz = 0;
    let ax = 0, ay = 0, az = 0, arx = 0, ary = 0, arz = 0, lx = 0, ly = 0, lz = 0, lrx = 0, lry = 0, lAbs = null;
    if (sp > .01) { if (gun) { px += .07 * sp; py -= .1 * sp; pz += .04 * sp; rx -= .3 * sp; ry += .6 * sp; rz -= .15 * sp; } else { py -= .08 * sp; rx -= .3 * sp; ry += .15 * sp; } }
    // ----- ближний бой / использование -----
    const A = this.act;
    if (A) {
      A.t += dt; const u = A.t / A.dur;
      if (A.type === 'melee') {
        if (!A.sw && u >= A.M.hit - .14) { A.sw = 1; this.ev('swing'); }
        const p = kf(A.M.K, u, A.M.hit), s = A.kind === 'knife' && A.alt ? -1 : 1;
        if (A.kind === 'fist' && A.alt) { lx -= p[0]; ly += p[1]; lz += p[2]; lrx += p[3]; } else { ax += p[0] * s; ay += p[1]; az += p[2]; arx += p[3]; ary += p[4] * s; arz += p[5] * s; }
        if (two) { lx += p[0] * .9; ly += p[1] * .9; lz += p[2] * .9; lrx += p[3] * .7; }
        rx += p[3] * .05; pz += p[2] * .25;
      } else {
        const e = sstep(0, .28, u) * (1 - sstep(.72, 1, u));
        if (A.kind === 'eat') { const b = Math.sin(clamp((u - .3) / .45, 0, 1) * Math.PI * 4) * .025 * e; ax += -.15 * e; ay += .27 * e + b; az += .22 * e + b * .6; arx += 1.15 * e; ary += .3 * e; if (!A.e1 && u > .32) { A.e1 = 1; this.ev('bite'); } if (!A.e2 && u > .5) { A.e2 = 1; this.ev('bite'); } }
        else if (A.kind === 'drink') { ax += -.12 * e; ay += .24 * e; az += .2 * e; arx += 1.2 * e; arz += -.95 * e * sstep(.25, .4, u); if (!A.e1 && u > .38) { A.e1 = 1; this.ev('gulp'); } if (!A.e2 && u > .55) { A.e2 = 1; this.ev('gulp'); } }
        else { ax += -.18 * e; ay += .1 * e; az += .12 * e; arx += .5 * e; ary += .5 * e; lAbs = [mix(this.lBase[0], -.04, e) + Math.sin(A.t * 20) * .035 * e, mix(this.lBase[1], -.2, e) + Math.cos(A.t * 17) * .02 * e, mix(this.lBase[2], -.42, e)]; if (!A.e1 && u > .2) { A.e1 = 1; this.ev('bandage'); } }
      }
      if (u >= 1) this.act = null;
    }
    // ----- перезарядка по фазам -----
    const Rl = this.rel; let magY = null, magVis = true, boltZ = 0, pumpZ = 0, cylOpen = 0;
    if (Rl) {
      Rl.t += dt; const p = clamp(Rl.t / Rl.dur, 0, 1), fire = n => { if (!Rl.f[n]) { Rl.f[n] = 1; this.ev(n); } }, base = this.lBase; let pos = base;
      const w = sstep(0, .12, p) * (1 - sstep(.88, 1, p));
      if (P.mag) { // магазинное: пистолет / АК / винтовка
        arz += -.5 * w; arx += .18 * w; ay -= .03 * w; const M = [.17, -.37, -.5], Po = [-.12, -.8, -.4], B = [.22, -.21, -.68];
        if (p < .15) pos = lerp3(base, M, sstep(0, .15, p)); else if (p < .3) pos = lerp3(M, Po, sstep(.15, .3, p)); else if (p < .5) pos = Po; else if (p < .65) pos = lerp3(Po, M, sstep(.5, .65, p));
        else if (p < .75) pos = lerp3(M, B, sstep(.65, .75, p)); else if (p < .85) pos = lerp3(B, [B[0], B[1], B[2] + .05], sstep(.75, .85, p)); else pos = lerp3([B[0], B[1], B[2] + .05], base, sstep(.85, 1, p));
        const my = P.mag.p.y; magY = p < .15 ? my : p < .3 ? my - sstep(.15, .3, p) * .4 : p < .5 ? my - .4 : p < .65 ? mix(my - .4, my, sstep(.5, .65, p)) : my; magVis = !(p >= .3 && p < .5);
        boltZ = .06 * (p < .85 ? sstep(.75, .82, p) : 1 - sstep(.85, .93, p)); if (p >= .2) fire('mag_out'); if (p >= .62) fire('mag_in'); if (p >= .78) fire('bolt');
      } else if (k === 'shotgun') { // по одному патрону + передёргивание
        arx += .35 * w; arz += -.45 * w; ary += .15 * w; const Port = [.1, -.36, -.46], Pock = [-.18, -.62, -.4], Pump = [.1, -.3, -.82], n = clamp(Math.round(Rl.dur / .3), 3, 6);
        if (p < .1) pos = lerp3(base, Pock, sstep(0, .1, p));
        else if (p < .86) { const c = (p - .1) / .76 * n, f = c % 1, idx = Math.floor(c); pos = lerp3(Pock, Port, f < .55 ? sstep(0, .55, f) : 1 - sstep(.55, 1, f)); if (f >= .5 && !Rl.sh[idx]) { Rl.sh[idx] = 1; this.ev('shell'); } }
        else if (p < .9) pos = lerp3(Pock, Pump, sstep(.86, .9, p)); else if (p < .96) { pumpZ = .12 * Math.sin(clamp((p - .9) / .06, 0, 1) * Math.PI); pos = [Pump[0], Pump[1], Pump[2] + pumpZ]; if (p >= .91) fire('pump'); } else pos = lerp3(Pump, base, sstep(.96, 1, p));
      } else { // револьвер / самодельное: откидываем барабан и заряжаем
        arz += -.85 * w; arx += .1 * w; cylOpen = sstep(.1, .2, p) * (1 - sstep(.82, .9, p)); const Cy = [.08, -.3, -.5], Pock = [-.15, -.6, -.4], n = clamp(Math.round(Rl.dur / .35), 2, 4);
        if (p < .12) pos = lerp3(base, Cy, sstep(0, .12, p)); else if (p < .84) { const c = (p - .12) / .72 * n, f = c % 1, idx = Math.floor(c); pos = lerp3(Cy, Pock, f < .5 ? sstep(0, .5, f) : 1 - sstep(.5, 1, f)); if (idx !== Rl.last) { Rl.last = idx; if (idx > 0) this.ev('shell'); } } else pos = lerp3(Cy, base, sstep(.84, 1, p));
        if (p >= .16) fire('mag_out'); if (p >= .88) fire('click');
      }
      lAbs = pos; if (Rl.t >= Rl.dur) { this.rel = null; this.reloadT = 0; }
    }
    // ----- лук -----
    if (k === 'bow') { const d = this.draw; arx += .06 * d; if (d > 0 && !lAbs) lAbs = [mix(this.lBase[0], .26 - ads * .26 - .02, d), mix(this.lBase[1], -.27 + ads * .04 - .01, d), mix(this.lBase[2], -.54 + d * .3 + .02, d)]; }
    // ----- подвижные части оружия -----
    const f1 = this.fireT, cyc = (a, b) => { const u = (f1 - a) / (b - a); return u < 0 || u > 1 ? 0 : Math.sin(u * Math.PI); };
    if (P.slide) P.slide.o.position.z = P.slide.p.z + .035 * cyc(0, .1);
    if (P.bolt) P.bolt.o.position.z = P.bolt.p.z + (k === 'rifle' ? .1 * cyc(.35, .85) : .045 * cyc(0, .09)) + boltZ;
    if (P.pump) P.pump.o.position.z = P.pump.p.z + .13 * cyc(.18, .55) + pumpZ;
    if (!this.fe1 && ((k === 'shotgun' && f1 > .2) || (k === 'rifle' && f1 > .4)) && f1 < 2) { this.fe1 = 1; this.ev(k === 'shotgun' ? 'pump' : 'bolt'); }
    if (P.mag) { P.mag.o.position.y = magY === null ? P.mag.p.y : magY; P.mag.o.visible = magVis; }
    if (P.cyl) { this.cylA += (this.cylT - this.cylA) * Math.min(1, dt * 18); P.cyl.o.rotation.y = this.cylA; P.cyl.o.position.x = P.cyl.p.x - .04 * cylOpen; }
    if (P.hammer) P.hammer.o.rotation.x = f1 < .25 ? .6 * Math.sin(f1 / .25 * Math.PI) : 0;
    if (P.muzzle) { const on = f1 < (k === 'rifle' || k === 'shotgun' ? .07 : .045); P.muzzle.o.visible = on && !this.hide; if (on) { P.muzzle.o.scale.setScalar(.8 + Math.random() * .7); P.muzzle.o.rotation.y = Math.random() * 6.28; } }
    if (P.strA) { const d = this.draw * .3 - (this.snap > 0 ? Math.sin(this.snap * 70) * .025 * this.snap / .2 : 0), Ls = Math.hypot(.28, d), a = Math.atan2(.28, d); P.strA.o.scale.z = P.strB.o.scale.z = Ls / .28; P.strA.o.position.set(0, .14, d / 2); P.strA.o.rotation.x = a; P.strB.o.position.set(0, -.14, d / 2); P.strB.o.rotation.x = -a; if (P.arrow) { P.arrow.o.visible = this.draw > .02 && !this.hide; P.arrow.o.position.z = d - .275; } }
    // ----- итог -----
    this.root.position.set(px, py, pz); this.root.rotation.set(rx, ry, rz);
    this.rArm.position.set(.26 - ads * .26 + ax, -.27 + ads * .04 + ay, -.5 + az); this.rArm.rotation.set(.1 + arx, ary, arz);
    const lb = this.lBase; if (lAbs) this.lArm.position.set(lAbs[0], lAbs[1], lAbs[2]); else this.lArm.position.set(lb[0] + lx + (two ? ads * .1 : 0), lb[1] + ly, lb[2] + lz);
    this.lArm.rotation.set(lrx, this.lBaseRy + lry, 0);
    if (this.item) this.item.visible = !this.hide;
  }
}

const lerpAng = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };
export class RemotePlayers {
  constructor(scene) { this.scene = scene; this.map = new Map(); }
  make(d) {
    const g = new THREE.Group(), shirt = colorOf(d.n), body = new THREE.Group(); g.add(body); const v = Math.abs(d.n.charCodeAt(0)) % 3, skin = ['#d9a67e', '#c68c63', '#efc7a0'][v], hairC = ['#2b2018', '#6b4a2a', '#c9a24a'][v], pants = '#2f3a4a', add = (m, x, y, z, p = body) => { m.position.set(x, y, z); p.add(m); return m; };
    add(bx(.5, .5, .27, shirt), 0, 1.2, 0); add(bx(.44, .22, .25, shirt), 0, .93, 0); add(bx(.46, .05, .27, '#2a1d12'), 0, .84, 0); add(bx(.07, .06, .02, '#c9a227'), 0, .84, -.14);
    add(bx(.56, .1, .28, shirt), 0, 1.41, 0); add(bx(.18, .05, .1, shirt), 0, 1.47, -.02); // плечи и воротник
    add(cyl(.05, .06, .1, skin, 8), 0, 1.52, 0); // шея
    const head = add(new THREE.Mesh(new THREE.SphereGeometry(.15, 12, 10), mat(skin)), 0, 1.64, 0); head.scale.set(.95, 1.08, 1);
    add(new THREE.Mesh(new THREE.SphereGeometry(.162, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(hairC)), 0, 1.66, .01); add(bx(.3, .14, .06, hairC), 0, 1.62, .1);
    add(bx(.035, .03, .02, '#fff'), -.055, 1.65, -.14); add(bx(.035, .03, .02, '#fff'), .055, 1.65, -.14); add(bx(.016, .02, .02, '#1a1a1a'), -.055, 1.65, -.15); add(bx(.016, .02, .02, '#1a1a1a'), .055, 1.65, -.15);
    add(bx(.03, .04, .04, skin), 0, 1.6, -.15); add(bx(.07, .012, .02, '#8a4a3a'), 0, 1.565, -.145); add(bx(.025, .05, .03, skin), -.152, 1.63, 0); add(bx(.025, .05, .03, skin), .152, 1.63, 0);
    add(bx(.32, .4, .15, '#4a4f3a'), 0, 1.18, .21); add(bx(.3, .12, .16, '#3b3f2e'), 0, 1.4, .21); add(bx(.12, .1, .06, '#3b3f2e'), 0, 1.0, .27); // рюкзак
    const limb = (w, h, c, x, y, tail, tc) => { const p = new THREE.Group(); p.position.set(x, y, 0); const m = bx(w, h, w, c); m.position.y = -h / 2; p.add(m); if (tail === 'hand') { add(bx(.1, .1, .1, skin), 0, -h - .02, 0, p); add(bx(.125, .04, .125, '#d8d2c4'), 0, -h + .02, 0, p); } else { add(bx(.19, .13, .29, '#25201b'), 0, -h + .045, -.045, p); add(bx(.175, .1, .12, pants), 0, -h + .13, .0, p); } body.add(p); return p; };
    const la = limb(.12, .56, shirt, -.31, 1.43, 'hand'), ra = limb(.12, .56, shirt, .31, 1.43, 'hand'), ll = limb(.17, .8, pants, -.12, .8, 'boot'), rl = limb(.17, .8, pants, .12, .8, 'boot');
    const hand = new THREE.Group(); hand.position.set(0, -.6, -.05); ra.add(hand);
    const c = document.createElement('canvas'); c.width = 256; c.height = 48; const x = c.getContext('2d'); x.font = '600 28px Rubik,sans-serif'; x.textAlign = 'center'; x.fillStyle = '#000a'; x.fillText(d.n, 130, 34); x.fillStyle = colorOf(d.n); x.fillText(d.n, 128, 32);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })); sp.scale.set(1.6, .3, 1); sp.position.y = 2.05; g.add(sp);
    this.scene.add(g); g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return { g, body, la, ra, ll, rl, hand, held: null, heldId: null, tx: d.x, ty: d.y, tz: d.z, ry: d.r, phase: 0, speed: 0, ak: d.ak, act: '', actT: 9, atk: 0, dead: 0, prevX: d.x, prevZ: d.z, variant: Math.abs(d.n.charCodeAt(0)) % 3 };
  }
  sync(list) {
    const seen = new Set();
    for (const d of list) {
      seen.add(d.i); let r = this.map.get(d.i); if (!r) { r = this.make(d); r.g.position.set(d.x, d.y, d.z); this.map.set(d.i, r); }
      r.tx = d.x; r.ty = d.y; r.tz = d.z; r.try = d.r; r.anim = d.a; r.dead = d.d;
      if (d.ak !== r.ak) { r.ak = d.ak; r.act = d.ac || 'melee'; r.actT = 0; }
      if (r.heldId !== d.h || r.heldSk !== d.sk) { if (r.held) r.hand.remove(r.held); r.held = null; r.heldId = d.h; r.heldSk = d.sk; if (d.h) { r.held = makeItemMesh(d.h, d.sk); r.held.scale.setScalar(.9); const ls = []; r.held.traverse(o => o.isLight && ls.push(o)); ls.forEach(l => l.parent.remove(l)); r.hand.add(r.held); } }
    }
    for (const [id, r] of this.map) if (!seen.has(id)) { this.scene.remove(r.g); this.map.delete(id); }
  }
  update(dt) {
    for (const r of this.map.values()) {
      const k = 1 - Math.exp(-dt * 12), p = r.g.position; const ox = p.x, oz = p.z; p.x += (r.tx - p.x) * k; p.y += (r.ty - p.y) * k; p.z += (r.tz - p.z) * k; r.g.rotation.y = lerpAng(r.g.rotation.y, r.try || 0, k);
      const sp = Math.hypot(p.x - ox, p.z - oz) / Math.max(dt, .001); r.speed += (sp - r.speed) * .2; r.phase += dt * Math.min(r.speed, 8) * 1.7; const sw = Math.sin(r.phase) * Math.min(1, r.speed / 3) * .8;
      r.ll.rotation.x = sw; r.rl.rotation.x = -sw; r.la.rotation.x = -sw * .8; r.ra.rotation.x = r.heldId ? -.5 + sw * .3 : sw * .8; r.la.rotation.z = 0; r.ra.rotation.z = 0; r.body.position.z = 0;
      const hk = kindOf(r.heldId || 'fist'), gunHold = ['pistol', 'revolver', 'shotgun', 'ak', 'rifle', 'bow'].includes(hk), running = r.speed > 5.5;
      if (gunHold) { const lo = running ? .5 : 0; r.ra.rotation.x = -1.35 + lo + sw * .05; r.la.rotation.x = -1.25 + lo; r.la.rotation.z = .18; }
      r.actT += dt; const T = r.actT;
      if (r.act === 'melee' || r.act === 'throw' || r.act === 'c4') { // замах и удар
        const p = T / .5; if (p < 1) { const stab = hk === 'spear' || hk === 'knife'; const base = -.5; let a;
          if (stab) { a = -1.25 - Math.sin(Math.min(1, p) * Math.PI) * .45; r.body.position.z = -Math.sin(p * Math.PI) * .14; } else a = p < .35 ? mix(base, -2.7, sstep(0, .35, p)) : p < .55 ? mix(-2.7, -.7, Math.pow((p - .35) / .2, 2)) : mix(-.7, base, (p - .55) / .45);
          r.ra.rotation.x = a; if (!stab) r.la.rotation.x = -.4 * Math.sin(p * Math.PI); } }
      else if (r.act === 'gun') { if (T < .25) { const k = Math.exp(-T * 22); r.ra.rotation.x += .28 * k; r.la.rotation.x += .22 * k; r.body.position.z = .05 * k; } }
      else if (r.act === 'bow') { if (T < .3) { r.ra.rotation.x += .1 * Math.exp(-T * 15); r.la.rotation.x += .5 * Math.exp(-T * 10); } }
      else if (r.act === 'reload') { const dur = (DATA.combat && DATA.combat[r.heldId] && DATA.combat[r.heldId].reload) || 1.5, p = T / dur; if (p < 1) { r.la.rotation.x = -1.25 + 1.15 * sstep(0, .15, p) * (1 - sstep(.7, .88, p)) + Math.sin(p * Math.PI * 4) * .12 * sstep(0, .15, p); r.ra.rotation.x = -1.0 + Math.sin(p * Math.PI * 3) * .12; r.ra.rotation.z = -.3 * Math.sin(p * Math.PI); } }
      else if (r.act === 'eat') { const p = T / .8; if (p < 1) { const e = sstep(0, .25, p) * (1 - sstep(.7, 1, p)); r.ra.rotation.x = mix(r.ra.rotation.x, -2.2, e) + Math.sin(p * 30) * .06 * e; } }
      const cr = r.anim === 'crouch'; r.body.scale.y += ((cr ? .8 : 1) - r.body.scale.y) * k; r.body.position.y = r.anim === 'jump' ? .15 : 0;
      if (r.dead) { r.body.rotation.x += (-Math.PI / 2 * (r.variant === 1 ? -1 : 1) - r.body.rotation.x) * k; r.body.rotation.z += ((r.variant === 2 ? .5 : 0) - r.body.rotation.z) * k; r.body.position.y = .2; } else { r.body.rotation.x *= .8; r.body.rotation.z *= .8; }
    }
  }
  get(id) { return this.map.get(id); }
  clear() { for (const r of this.map.values()) this.scene.remove(r.g); this.map.clear(); }
}

// ---------- Локальный контроллер ----------
export class LocalPlayer {
  constructor(camera, world) {
    this.cam = camera; this.world = world; this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.yaw = 0; this.pitch = 0; this.eye = 1.6; this.onGround = false; this.crouch = false; this.flags = { fly: false, noclip: false, god: false };
    this.recoil = 0; this.moving = false; this.running = false; this.aiming = false; this.stepT = 0; this.anim = 'idle'; this.slow = 1; this.dead = false; this.stepCb = null;
  }
  teleport(x, y, z) { this.pos.set(x, y, z); this.vel.set(0, 0, 0); }
  update(dt, Input) {
    if (this.dead) { this.applyCam(); return; }
    const look = Input.getLookDelta(); this.yaw -= look.x; this.pitch = Math.max(-1.52, Math.min(1.52, this.pitch - look.y));
    const mv = Input.getMoveVector(), sprint = Input.isActionPressed('sprint'), f = this.flags;
    this.crouch = !f.fly && Input.isActionPressed('crouch'); this.eye += ((this.crouch ? 1.1 : 1.6) - this.eye) * Math.min(1, dt * 12);
    const speed = (f.fly ? (sprint ? 28 : 12) : this.crouch ? 2 : sprint && mv.y > 0 ? 7 : 4.2) * this.slow;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw); // вперёд = (-sin, -cos)
    const wx = (mv.x * cos - mv.y * sin), wz = (-mv.x * sin - mv.y * cos);
    const ox = this.pos.x, oz = this.pos.z;
    if (f.fly) { // полёт: Space вверх, Ctrl/Shift вниз
      const fx = -Math.sin(this.yaw) * Math.cos(this.pitch), fy = Math.sin(this.pitch), fz = -Math.cos(this.yaw) * Math.cos(this.pitch);
      this.pos.x += (wx) * speed * dt; this.pos.z += (wz) * speed * dt; let vy = 0; if (Input.isActionPressed('jump')) vy += 1; if (Input.isActionPressed('crouch') || Input.keys.has('ShiftLeft') && !Input.touch.sprint && false) vy -= 1; if (Input.keys.has('ShiftLeft') || Input.keys.has('ShiftRight')) vy = Input.isActionPressed('jump') ? 1 : -1;
      this.pos.y += vy * speed * dt; if (!f.noclip) { this.world.collide(this.pos, .35); const gy = this.world.groundY(this.pos.x, this.pos.z, this.pos.y); if (this.pos.y < gy) this.pos.y = gy; }
      this.vel.y = 0; this.onGround = false;
    } else {
      this.vel.x += (wx * speed - this.vel.x) * Math.min(1, dt * (this.onGround ? 12 : 3)); this.vel.z += (wz * speed - this.vel.z) * Math.min(1, dt * (this.onGround ? 12 : 3));
      const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt; if (heightAt(nx, nz) > -1.6) { this.pos.x = nx; this.pos.z = nz; }
      if (this.onGround && Input.isActionPressed('jump') && !this.crouch) { this.vel.y = 7.2; this.onGround = false; }
      this.vel.y -= 22 * dt; this.pos.y += this.vel.y * dt; this.world.collide(this.pos, .35);
      const gy = this.world.groundY(this.pos.x, this.pos.z, this.pos.y);
      if (this.pos.y <= gy + .02 && this.vel.y <= 0) { this.pos.y = gy; this.vel.y = 0; this.onGround = true; } else if (this.pos.y > gy + .1) this.onGround = false;
      if (heightAt(this.pos.x, this.pos.z) < -.4 && this.onGround) { /* вода: замедление */ this.vel.x *= .94; this.vel.z *= .94; }
    }
    const hv = Math.hypot(this.pos.x - ox, this.pos.z - oz) / Math.max(dt, .001); this.moving = hv > .8 && (this.onGround || f.fly); this.running = this.moving && sprint && !this.crouch;
    this.anim = !this.onGround && !f.fly ? 'jump' : this.crouch ? 'crouch' : this.running ? 'run' : this.moving ? 'walk' : 'idle';
    if (this.moving && this.onGround) { this.stepT += dt * (this.running ? 3.4 : this.crouch ? 1.5 : 2.3); if (this.stepT >= 1) { this.stepT = 0; if (this.stepCb) this.stepCb(); } }
    this.recoil *= Math.pow(.02, dt * 1.6); this.applyCam();
  }
  applyCam() { this.cam.position.set(this.pos.x, this.pos.y + this.eye, this.pos.z); this.cam.rotation.set(Math.max(-1.55, Math.min(1.55, this.pitch + this.recoil)), this.yaw, 0, 'YXZ'); }
  dir() { const d = new THREE.Vector3(); this.cam.getWorldDirection(d); return d; }
}
