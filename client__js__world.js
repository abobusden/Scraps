// Мир: рельеф, вода, ресурсы (instancing + чанки + LOD), постройки, коллизии, небо/время суток.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { heightAt, ISLAND_R, rng, setMonuments, padWeight, monumentLayout } from '/shared/worldgen.mjs';
export { heightAt, ISLAND_R, setMonuments };

const hh = (x, y, z) => { let h = Math.imul(Math.round(x * 97), 374761393) ^ Math.imul(Math.round(y * 97), 668265263) ^ Math.imul(Math.round(z * 97), 1274126177); h = Math.imul(h ^ (h >>> 13), 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// слабая точка ресурса (формула совпадает с серверной weakPoint в game.js): красная метка, удар в неё = x2 добыча
const WPC = { tree: [.36, .8, 2.6], rock: [1.05, .25, .8], ore: [1.05, .25, .8], sulfur: [.95, .25, .7], scrap: [.75, .15, .55] };
export const WEAK_TYPES = WPC;
export function weakPoint(r, px, pz) {
  const c = WPC[r.type]; if (!c) return null;
  const sc = .8 + hh(r.z, r.x, 2) * .55, hits = r.hits || 0, s1 = hh(r.id, hits, 5), s2 = hh(hits, r.id, 9);
  const a = Math.atan2(pz - r.z, px - r.x) + (s1 - .5) * 1.3, h = c[1] + (c[2] - c[1]) * s2;
  let R = c[0] * sc; if (r.type !== 'tree') R *= Math.sqrt(Math.max(.25, 1 - Math.pow((h - .5) / .85, 2)));
  return { x: r.x + Math.cos(a) * R, y: r.y + h * sc, z: r.z + Math.sin(a) * R };
}
const sstep01 = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
function prep(geo, hex, jit = 0, vary = .12) { // деформация шумом + плоские грани + цвет по граням
  const p = geo.attributes.position;
  if (jit) for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); p.setXYZ(i, x + (hh(x, y, z) - .5) * jit, y + (hh(y, z, x) - .5) * jit, z + (hh(z, x, y) - .5) * jit); }
  geo = geo.index ? geo.toNonIndexed() : geo; const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 3) { const k = 1 + (hh(i, n, 3) - .5) * vary * 2; for (let j = 0; j < 3; j++) { a[(i + j) * 3] = c.r * k; a[(i + j) * 3 + 1] = c.g * k; a[(i + j) * 3 + 2] = c.b * k; } }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); geo.computeVertexNormals(); return geo;
}
const T = (g, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => { g.scale(sx, sy, sz); g.translate(x, y, z); return g; };
const GEO = {};
GEO.tree = [mergeGeometries([prep(T(new THREE.CylinderGeometry(.22, .42, 4.2, 7), 0, 2.1, 0), '#5b3c20', .06), prep(T(new THREE.ConeGeometry(2.3, 2.8, 8), 0, 4.4, 0), '#2f6a2f', .35), prep(T(new THREE.ConeGeometry(1.8, 2.4, 8), 0, 5.8, 0), '#38773a', .3), prep(T(new THREE.ConeGeometry(1.2, 2.1, 7), 0, 7.2, 0), '#43864a', .25)]), mergeGeometries([prep(T(new THREE.CylinderGeometry(.3, .4, 3, 5), 0, 1.5, 0), '#5b3c20', 0), prep(T(new THREE.ConeGeometry(2, 6, 5), 0, 5, 0), '#2f6a2f', 0)])];
const rockG = (hex, s = 1) => prep(T(new THREE.IcosahedronGeometry(1.1, 1), 0, .55, 0, 1.1 * s, .75 * s, 1 * s), hex, .35, .1);
GEO.rock = [rockG('#8a8c8e')];
GEO.ore = [mergeGeometries([rockG('#6d7075'), prep(T(new THREE.OctahedronGeometry(.28), .5, 1.0, .2, 1, 2, 1), '#d7e2f0', 0, .02), prep(T(new THREE.OctahedronGeometry(.22), -.4, .9, .45, 1, 2.2, 1), '#f3dca0', 0, .02), prep(T(new THREE.OctahedronGeometry(.2), .1, .95, -.5, 1, 2, 1), '#c3d1e2', 0, .02)])];
GEO.sulfur = [mergeGeometries([rockG('#5f5b3d', .9), prep(T(new THREE.IcosahedronGeometry(.5, 0), .3, .9, .2), '#e8d83a', .1, .05), prep(T(new THREE.IcosahedronGeometry(.4, 0), -.4, .8, -.3), '#f0e24a', .1, .05)])];
GEO.bush = [mergeGeometries([prep(T(new THREE.IcosahedronGeometry(.7, 1), 0, .55, 0), '#3f7a35', .25), prep(T(new THREE.IcosahedronGeometry(.55, 1), .5, .45, .3), '#4c8a3a', .2), prep(T(new THREE.IcosahedronGeometry(.5, 1), -.4, .5, -.2), '#356b30', .2), ...[0, 1, 2, 3, 4].map(i => prep(T(new THREE.IcosahedronGeometry(.07, 0), Math.cos(i * 2) * .6, .5 + (i % 2) * .3, Math.sin(i * 2) * .6), '#c01830', 0, 0))])];
GEO.scrap = [mergeGeometries([prep(T(new THREE.BoxGeometry(1.4, .3, .9), 0, .15, 0), '#6b4a36', .05), prep(T(new THREE.BoxGeometry(.9, .5, 1.1), .3, .45, .1), '#8a5238', .06), prep(T(new THREE.CylinderGeometry(.25, .25, 1.3, 7), -.4, .55, .3).rotateZ(.9), '#4b4f55', .04), prep(T(new THREE.BoxGeometry(.6, .1, 1.2), -.2, .9, -.2).rotateY(.5), '#9a6a45', .05), prep(T(new THREE.TorusGeometry(.4, .08, 5, 9), .5, .3, -.5).rotateX(1.2), '#555a60', .03)])];
GEO.barrel = [mergeGeometries([prep(T(new THREE.CylinderGeometry(.38, .4, .95, 10), 0, .475, 0), '#a8452e', .05), ...[.15, .8].map(y => prep(T(new THREE.CylinderGeometry(.42, .42, .06, 10), 0, y, 0), '#3b3f45', 0, 0)), prep(T(new THREE.CylinderGeometry(.34, .34, .04, 10), 0, .96, 0), '#7c2f20', 0, 0), prep(T(new THREE.CylinderGeometry(.405, .405, .07, 10), 0, .5, 0), '#d9b23a', 0, 0)])];
GEO.crate = [mergeGeometries([prep(T(new THREE.BoxGeometry(.9, .9, .9), 0, .45, 0), '#9a7640', .04), ...[[-.43, -.43], [.43, -.43], [-.43, .43], [.43, .43]].map(([x, z]) => prep(T(new THREE.BoxGeometry(.08, .94, .08), x, .45, z), '#5a4524', 0, 0)), prep(T(new THREE.BoxGeometry(.94, .08, .94), 0, .9, 0), '#6a5230', 0, 0), prep(T(new THREE.BoxGeometry(.07, 1.05, .03), 0, .45, .465).rotateZ(.78), '#5a4524', 0, 0), prep(T(new THREE.BoxGeometry(.07, 1.05, .03), 0, .45, -.465).rotateZ(-.78), '#5a4524', 0, 0)])];
const SPH = { tree: [2, 1.6, 6], rock: [.6, 1.3, 1.1], ore: [.7, 1.3, 1.1], sulfur: [.6, 1.2, 1], bush: [.5, 1, 0], scrap: [.5, 1.3, 1], barrel: [.45, .7, .5], crate: [.45, .8, .6] }; // [высота цели, радиус цели, радиус коллизии]
const MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const CH = 100;

function plankTex(color, line = '#00000033', stone = false) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * .08})`; g.fillRect(Math.random() * 128, Math.random() * 128, stone ? 6 : 2, stone ? 6 : 14); }
  g.strokeStyle = line; g.lineWidth = 2; if (stone) { for (let y = 0; y <= 128; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke(); for (let x = (y / 32 % 2) * 32; x < 128; x += 64) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 32); g.stroke(); } } } else for (let x = 0; x <= 128; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 128); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
const BMAT = [new THREE.MeshStandardMaterial({ map: plankTex('#8a5a2b'), roughness: .85 }), new THREE.MeshStandardMaterial({ map: plankTex('#8d8d88', '#0005', true), roughness: .95 }), new THREE.MeshStandardMaterial({ map: plankTex('#79838f', '#0007', true), roughness: .4, metalness: .7 })];
const MISC = { door: new THREE.MeshStandardMaterial({ color: '#6b4423', roughness: .8 }), cloth: new THREE.MeshStandardMaterial({ color: '#7d8f4a', roughness: 1 }), dark: new THREE.MeshStandardMaterial({ color: '#4a4f55', roughness: .6, metalness: .5 }), stone: new THREE.MeshStandardMaterial({ color: '#777', roughness: 1 }) };

export function pieces(type) { // [w,h,d,cx,cy,cz]
  switch (type) {
    case 'foundation': return [[1, .3, 1, 0, .15, 0]]; case 'foundation_high': return [[1, 1, 1, 0, .5, 0]];
    case 'wall': return [[1, 3, .2, 0, 1.5, 0]];
    case 'wall_window': return [[1, 1.2, .2, 0, .6, 0], [1, 1.3, .2, 0, 2.35, 0], [.25, .5, .2, -.375, 1.45, 0], [.25, .5, .2, .375, 1.45, 0]];
    case 'wall_door': return [[1, 1, .2, 0, 2.5, 0]];
    case 'door': return [[1, 2, .1, 0, 1, 0]]; case 'gate': return [[2, 3, .2, 0, 1.5, 0]]; case 'sliding_door': return [[1, 2, .1, 0, 1, 0]]; case 'double_door': return [[2, 2, .1, 0, 1, 0]];
    case 'roof': return [[1, .2, 1, 0, .1, 0]];
    case 'stairs': return [0, 1, 2, 3, 4, 5].map(i => [1, (i + 1) * .5, 1 / 6, 0, (i + 1) * .25, -.5 + (i + .5) / 6]);
    case 'workbench': return [[1.6, 1, .8, 0, .5, 0]]; case 'cupboard': return [[.8, 1.2, .4, 0, .6, 0]]; case 'chest': return [[.9, .6, .6, 0, .3, 0]];
    case 'sleeping_bag': return [[.8, .15, 1.8, 0, .075, 0]]; default: return [];
  }
}

// ---------- Ящики на РТ: базовый / военный / элитный ----------
const CRATE_UNIT = new THREE.BoxGeometry(1, 1, 1);
const cmat = (hex, rough = .8, metal = .1) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal, flatShading: true });
const CRATE_MATS = {
  basic: { body: cmat('#9a7640', .9, 0), trim: cmat('#5a4524', .9, 0), lid: cmat('#82643a', .9, 0) },
  military: { body: cmat('#4d5a3a', .7, .25), trim: cmat('#23271f', .6, .4), lid: cmat('#44502f', .7, .25), mark: cmat('#d8d8c0', .9, 0) },
  elite: { body: cmat('#1d2025', .4, .7), trim: cmat('#d4a62a', .3, .8), lid: cmat('#262a30', .4, .7), glow: new THREE.MeshBasicMaterial({ color: '#ff3b3b' }) },
};
export const CRATE_NAMES = { basic: 'Базовый ящик', military: 'Военный ящик', elite: 'Элитный ящик' };
export function crateMesh(kind) {
  const M = CRATE_MATS[kind] || CRATE_MATS.basic, g = new THREE.Group(), [W, H, D] = kind === 'elite' ? [1.25, .7, .8] : kind === 'military' ? [1.15, .62, .75] : [1, .6, .7];
  const part = (mat, w, h, d, x, y, z, parent = g) => { const m = new THREE.Mesh(CRATE_UNIT, mat); m.scale.set(w, h, d); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  part(M.body, W, H, D, 0, H / 2, 0);
  if (kind === 'basic') for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(M.trim, .08, H + .02, .08, sx * W / 2, H / 2, sz * D / 2);
  if (kind === 'military') { for (const sx of [-1, 1]) part(M.trim, .12, .14, .05, sx * .32, H * .72, D / 2 + .02); part(M.mark, .42, .14, .02, 0, H * .42, D / 2 + .011); part(M.trim, W + .02, .06, D + .02, 0, H * .12, 0); }
  if (kind === 'elite') { for (const sz of [-1, 1]) part(M.trim, W + .04, .06, .06, 0, H, sz * D / 2); for (const sx of [-1, 1]) part(M.trim, .06, .06, D, sx * W / 2, H, 0); part(M.glow, W * .6, .05, .02, 0, H * .5, D / 2 + .012); }
  const lid = new THREE.Group(); lid.position.set(0, H, -D / 2); g.add(lid); part(M.lid, W + .04, .1, D + .04, 0, .05, D / 2, lid);
  let beacon = null;
  if (kind === 'elite') { beacon = new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, 3.2, 8, 1, true), new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: .22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); beacon.position.y = H + 1.6; g.add(beacon); }
  g.userData = { lid, beacon, kind, size: [W, H, D] }; return g;
}
export function setCrateFull(g, full) { g.userData.lid.rotation.x = full ? 0 : -1.3; if (g.userData.beacon) g.userData.beacon.visible = !!full; }

const DOORS = ['door', 'gate', 'sliding_door', 'double_door'];
const NOCOL = ['sleeping_bag', 'campfire'];
export function buildMesh(type, tier, ghost) {
  const g = new THREE.Group(), mat = ghost || (DOORS.includes(type) ? MISC.door : BMAT[tier] || BMAT[0]); const info = { group: g, boxes: [], pivot: null };
  const add = (p, parent = g, m = mat) => { const geo = new THREE.BoxGeometry(p[0], p[1], p[2]); const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(p[0], p[2]), uv.getY(i) * p[1]); const me = new THREE.Mesh(geo, m); me.position.set(p[3], p[4], p[5]); me.castShadow = me.receiveShadow = true; parent.add(me); return me; };
  if (type === 'campfire') {
    for (let i = 0; i < 8; i++) { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(.13, 0), ghost || MISC.stone); s.position.set(Math.cos(i * .785) * .32, .1, Math.sin(i * .785) * .32); g.add(s); }
    for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(.05, .06, .7, 5), ghost || MISC.door); l.position.set(0, .18, 0); l.rotation.set(1.1, i * 2.1, 0); g.add(l); }
    if (!ghost) { const f = new THREE.Mesh(new THREE.ConeGeometry(.18, .6, 6), new THREE.MeshBasicMaterial({ color: '#ff8a1f' })); f.position.y = .5; f.name = 'flame'; g.add(f); const li = new THREE.PointLight('#ff8a3a', 2.2, 12); li.position.y = .8; g.add(li); }
    info.boxes = []; return info;
  }
  if (type === 'workbench') { add([1.6, .1, .8, 0, .95, 0]); [[-.7, -.3], [.7, -.3], [-.7, .3], [.7, .3]].forEach(([x, z]) => add([.1, .9, .1, x, .45, z])); add([1.5, .08, .7, 0, .3, 0], g, ghost || MISC.dark); info.boxes = pieces(type); return info; }
  if (type === 'sleeping_bag') { add([.8, .15, 1.8, 0, .075, 0], g, ghost || MISC.cloth); add([.7, .12, .4, 0, .2, -.6], g, ghost || new THREE.MeshStandardMaterial({ color: '#d9d4c5' })); return info; }
  if (type === 'chest') { add([.9, .45, .6, 0, .225, 0]); add([.92, .08, .62, 0, .5, 0], g, ghost || MISC.dark); add([.1, .1, .04, 0, .4, .31], g, ghost || MISC.dark); info.boxes = pieces(type); return info; }
  if (type === 'cupboard') { add([.8, 1.2, .4, 0, .6, 0]); add([.76, 1.1, .02, 0, .6, .21], g, ghost || MISC.dark); info.boxes = pieces(type); return info; }
  if (DOORS.includes(type)) { const w = pieces(type)[0][0], pv = new THREE.Group(); pv.position.x = -w / 2; g.add(pv); const m = add(pieces(type)[0], pv); m.position.x += w / 2; info.pivot = pv; info.w = w; info.boxes = pieces(type); return info; }
  pieces(type).forEach(p => add(p)); info.boxes = pieces(type); return info;
}

export class Buildings {
  constructor(scene) { this.map = new Map(); this.group = new THREE.Group(); scene.add(this.group); }
  add(b) {
    this.remove(b.id); const info = buildMesh(b.type, b.tier || 0); const rec = { ...b, info }; info.group.position.set(b.x, b.y, b.z); info.group.rotation.y = b.rot; this.group.add(info.group); this.map.set(b.id, rec); this.apply(rec); return rec;
  }
  apply(r) {
    const i = r.info; if (r.type === 'campfire') { const f = i.group.getObjectByName('flame'); if (f) f.visible = !!r.burn; }
    if (i.pivot) { i.pivot.rotation.y = r.open ? (r.type === 'sliding_door' ? 0 : -Math.PI / 2) : 0; i.pivot.position.x = r.type === 'sliding_door' ? (r.open ? -i.w / 2 + 1 : -i.w / 2) : -i.w / 2; }
  }
  update(u) {
    const r = this.map.get(u.id); if (!r) return; const oldTier = r.tier; Object.assign(r, u);
    if (u.tier !== undefined && u.tier !== oldTier) { this.group.remove(r.info.group); const info = buildMesh(r.type, r.tier); info.group.position.set(r.x, r.y, r.z); info.group.rotation.y = r.rot; this.group.add(info.group); r.info = info; }
    this.apply(r);
  }
  remove(id) { const r = this.map.get(id); if (!r) return; this.group.remove(r.info.group); this.map.delete(id); }
  clear() { [...this.map.keys()].forEach(id => this.remove(id)); }
  // Горизонтальная коллизия и высота пола (одно правило для стен, лестниц, фундаментов и крыш)
  collide(pos, rad, crouchH = 1.8) {
    for (const r of this.map.values()) {
      if (Math.abs(r.x - pos.x) > 4 || Math.abs(r.z - pos.z) > 4 || NOCOL.includes(r.type)) continue;
      if (r.open && DOORS.includes(r.type)) continue;
      const c = Math.cos(r.rot), s = Math.sin(r.rot);
      for (const [w, h, d, cx, cy, cz] of r.info.boxes) {
        const top = r.y + cy + h / 2, bot = r.y + cy - h / 2; if (top <= pos.y + .65 || bot >= pos.y + crouchH) continue;
        const dx = pos.x - r.x, dz = pos.z - r.z, lx = dx * c - dz * s - cx, lz = dx * s + dz * c - cz;
        const px = Math.max(-w / 2, Math.min(w / 2, lx)), pz = Math.max(-d / 2, Math.min(d / 2, lz)), ex = lx - px, ez = lz - pz, dd = Math.hypot(ex, ez);
        if (dd < rad) { let nx, nz; if (dd > 1e-4) { nx = ex / dd; nz = ez / dd; } else { const ox = w / 2 - Math.abs(lx), oz = d / 2 - Math.abs(lz); if (ox < oz) { nx = Math.sign(lx) || 1; nz = 0; } else { nx = 0; nz = Math.sign(lz) || 1; } }
          const push = rad - dd + (dd > 1e-4 ? 0 : (nx ? w / 2 - Math.abs(lx) : d / 2 - Math.abs(lz))); const lx2 = nx * push, lz2 = nz * push; pos.x += lx2 * c + lz2 * s; pos.z += -lx2 * s + lz2 * c; }
      }
    }
  }
  floorY(x, z, y) {
    let best = -1e9;
    for (const r of this.map.values()) {
      if (Math.abs(r.x - x) > 3 || Math.abs(r.z - z) > 3 || NOCOL.includes(r.type) || (r.open && DOORS.includes(r.type))) continue;
      const c = Math.cos(r.rot), s = Math.sin(r.rot), dx = x - r.x, dz = z - r.z, lx = dx * c - dz * s, lz = dx * s + dz * c;
      for (const [w, h, d, cx, cy, cz] of r.info.boxes) { const top = r.y + cy + h / 2; if (top > y + .65 || top < best) continue; if (Math.abs(lx - cx) <= w / 2 && Math.abs(lz - cz) <= d / 2) best = top; }
    }
    return best;
  }
  target(o, d, max) {
    let best = null;
    for (const r of this.map.values()) {
      if (Math.abs(r.x - o.x) > max + 2 || Math.abs(r.z - o.z) > max + 2) continue; const c = Math.cos(r.rot), s = Math.sin(r.rot);
      const ox = o.x - r.x, oz = o.z - r.z, L = [ox * c - oz * s, o.y, ox * s + oz * c], D = [d.x * c - d.z * s, d.y, d.x * s + d.z * c];
      for (const [w, h, dd, cx, cy, cz] of r.info.boxes) {
        const mn = [cx - w / 2, r.y + cy - h / 2, cz - dd / 2], mx = [cx + w / 2, r.y + cy + h / 2, cz + dd / 2]; let t0 = 0, t1 = max, ok = true;
        for (let i = 0; i < 3 && ok; i++) { if (Math.abs(D[i]) < 1e-9) { if (L[i] < mn[i] || L[i] > mx[i]) ok = false; } else { let a = (mn[i] - L[i]) / D[i], b = (mx[i] - L[i]) / D[i]; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) ok = false; } }
        if (ok && (!best || t0 < best.t)) best = { kind: 'build', id: r.id, t: t0, b: r };
      }
    }
    return best;
  }
}

export class World {
  constructor(scene, data, opts) {
    this.scene = scene; this.res = new Map(); this.anims = []; this.grid = new Map(); this.chunks = []; this.opts = opts;
    this.hemi = new THREE.HemisphereLight('#bcd4ff', '#4a5a3a', .6); this.amb = new THREE.AmbientLight('#ffffff', .15);
    this.sun = new THREE.DirectionalLight('#fff3d6', 1.6); this.sun.castShadow = false; scene.add(this.hemi, this.amb, this.sun, this.sun.target);
    this.buildings = new Buildings(scene); if (data.monuments) setMonuments(data.monuments);
    this.buildTerrain(); this.buildWater(); this.buildSky(); this.buildResources(data.res); this.buildRuins(data.zones); this.buildRoads(data.roads || []); this.buildMonuments(data.monuments || []);
    this.bgDay = new THREE.Color('#8fb8e8'); this.bgDusk = new THREE.Color('#e8885a'); this.bgNight = new THREE.Color('#05070d'); scene.fog = new THREE.Fog('#8fb8e8', 40, opts.view || 300); scene.background = new THREE.Color('#8fb8e8');
  }
  buildTerrain() {
    const S = ISLAND_R * 2.3, N = (this.opts && this.opts.lite) ? 170 : 240, geo = new THREE.PlaneGeometry(S, S, N, N); geo.rotateX(-Math.PI / 2); const p = geo.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color(), conc = new THREE.Color('#8e908c');
    this.hg = new Float32Array((N + 1) * (N + 1)); this.hS = S; this.hN = N;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), h = heightAt(x, z); p.setY(i, Math.max(h, -8)); this.hg[Math.round((z + S / 2) / S * N) * (N + 1) + Math.round((x + S / 2) / S * N)] = Math.max(h, -8);
      const sl = Math.abs(heightAt(x + 3, z) - h) + Math.abs(heightAt(x, z + 3) - h), n = hh(x * .1, 1, z * .1);
      if (h < .3) c.set('#9b8f66'); else if (h < 2.4) c.set('#d9c58a').lerp(new THREE.Color('#bfae75'), n * .5); else if (h > 45) c.set('#dfe5ea'); else if (sl > 3.2 || h > 28) c.set('#7c7d78').lerp(new THREE.Color('#666'), n); else c.set('#4a7a3a').lerp(new THREE.Color('#2f5c2b'), Math.min(1, (h - 4) / 20 + n * .4));
      if (h > 2.4 && h < 4) c.lerp(new THREE.Color('#d9c58a'), (4 - h) / 1.6 * .5);
      const pw = padWeight(x, z); if (pw > 0) c.lerp(conc, Math.min(1, pw * 1.15) * .92); // бетонная площадка РТ
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
    this.terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })); this.terrain.receiveShadow = true; this.scene.add(this.terrain);
  }
  buildWater() { this.water = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#2a6f9e', transparent: true, opacity: .82, roughness: .15, metalness: .2 })); this.water.position.y = -.05; this.scene.add(this.water); }
  buildSky() {
    this.sunMesh = new THREE.Mesh(new THREE.SphereGeometry(18, 12, 12), new THREE.MeshBasicMaterial({ color: '#fff0b0', fog: false })); this.moonMesh = new THREE.Mesh(new THREE.SphereGeometry(12, 12, 12), new THREE.MeshBasicMaterial({ color: '#dfe8ff', fog: false }));
    const st = new Float32Array(900); for (let i = 0; i < 300; i++) { const a = Math.random() * 6.28, b = Math.acos(Math.random() * .98), r = 900; st[i * 3] = Math.sin(b) * Math.cos(a) * r; st[i * 3 + 1] = Math.cos(b) * r; st[i * 3 + 2] = Math.sin(b) * Math.sin(a) * r; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(st, 3)); this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#fff', size: 2.2, fog: false, transparent: true, opacity: 0, sizeAttenuation: false })); this.scene.add(this.sunMesh, this.moonMesh, this.stars);
  }
  buildResources(list) {
    const by = new Map(); this.grid.clear();
    for (const [id, type, x, y, z, alive, hits] of list) {
      const r = { id, type, x, y, z, hits: hits || 0, alive: !!alive, ry: hh(x, z, 1) * 6.28, sc: .8 + hh(z, x, 2) * .55 }; this.res.set(id, r);
      const k = `${type}:${Math.floor(x / CH)}:${Math.floor(z / CH)}`; if (!by.has(k)) by.set(k, []); by.get(k).push(r);
      const gk = `${Math.floor(x / 8)}:${Math.floor(z / 8)}`; if (!this.grid.has(gk)) this.grid.set(gk, []); this.grid.get(gk).push(r);
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), po = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const [k, arr] of by) {
      const type = k.split(':')[0], cx = +k.split(':')[1], cz = +k.split(':')[2], geos = GEO[type], entry = { cx: (cx + .5) * CH, cz: (cz + .5) * CH, meshes: geos.map(g => { const im = new THREE.InstancedMesh(g, MAT, arr.length); im.castShadow = type === 'tree'; im.frustumCulled = true; this.scene.add(im); return im; }), type };
      arr.forEach((r, i) => { q.setFromAxisAngle(up, r.ry); const s = type === 'barrel' || type === 'crate' ? 1 : r.sc; sc.set(s, s * (type === 'tree' ? 1 + hh(i, 1, 1) * .3 : 1), s); po.set(r.x, r.y - .05, r.z); m.compose(po, q, sc); r.m = m.clone(); r.entry = entry; r.idx = i; entry.meshes.forEach(im => im.setMatrixAt(i, r.alive ? r.m : new THREE.Matrix4().makeScale(0, 0, 0))); });
      entry.meshes.forEach(im => { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }); this.chunks.push(entry);
    }
  }
  setAlive(id, alive) {
    const r = this.res.get(id); if (!r) return; const was = r.alive; r.alive = !!alive; r.hits = 0; this.anims = this.anims.filter(a => a.r !== r);
    if (!alive && was) { // анимация разрушения: дерево падает от удара, камни/кусты схлопываются
      this._base(r); const dir = r.lastDir || { x: Math.cos(r.ry), z: Math.sin(r.ry) };
      this.anims.push({ r, kind: r.type === 'tree' ? 'fall' : 'pop', t: 0, dur: r.type === 'tree' ? 1.2 : .3, dx: dir.x, dz: dir.z }); return;
    }
    const z = new THREE.Matrix4().makeScale(0, 0, 0); r.entry.meshes.forEach(im => { im.setMatrixAt(r.idx, alive ? r.m : z); im.instanceMatrix.needsUpdate = true; });
  }
  _base(r) { if (!r.q0) { r.p0 = new THREE.Vector3(); r.q0 = new THREE.Quaternion(); r.s0 = new THREE.Vector3(); r.m.decompose(r.p0, r.q0, r.s0); } }
  _put(r, q, s, p) { const m = this._m || (this._m = new THREE.Matrix4()); m.compose(p, q, s); for (const im of r.entry.meshes) { im.setMatrixAt(r.idx, m); im.instanceMatrix.needsUpdate = true; } }
  onHit(d) { // удар по ресурсу (от любого игрока): дрожание в сторону от бьющего
    const r = this.res.get(d.id); if (!r) return; r.hits = d.h; if (!r.alive) return; this._base(r);
    let dx = r.x - d.px, dz = r.z - d.pz; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L; r.lastDir = { x: dx, z: dz };
    this.anims = this.anims.filter(a => a.r !== r);
    this.anims.push({ r, kind: 'shake', t: 0, dur: r.type === 'tree' ? .55 : .32, amp: (r.type === 'tree' ? .045 : r.type === 'bush' ? .09 : .03) * (d.wp ? 1.7 : 1), dx, dz });
  }
  updateAnims(dt) {
    if (!this.anims.length) return; const q = new THREE.Quaternion(), s = new THREE.Vector3(), ax = new THREE.Vector3(), zero = new THREE.Vector3(0, 0, 0);
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i], r = a.r; a.t += dt; const u = Math.min(1, a.t / a.dur); this._base(r); ax.set(a.dz, 0, -a.dx);
      if (a.kind === 'shake') { const f = 1 - u; q.setFromAxisAngle(ax, a.amp * (Math.sin(a.t * 40) * f * f + .5 * f)).multiply(r.q0); this._put(r, q, r.s0, r.p0); if (u >= 1) { this._put(r, r.q0, r.s0, r.p0); this.anims.splice(i, 1); } }
      else if (a.kind === 'fall') { q.setFromAxisAngle(ax, Math.PI / 2 * Math.pow(u, 2.2)).multiply(r.q0); s.copy(r.s0).multiplyScalar(1 - sstep01(.8, 1, u)); this._put(r, q, s, r.p0); if (u >= 1) { this._put(r, r.q0, zero, r.p0); this.anims.splice(i, 1); } }
      else { const k = u < .3 ? 1 + u * .5 : Math.max(0, 1 - (u - .3) / .7) * 1.15; s.copy(r.s0).multiplyScalar(k); this._put(r, r.q0, s, r.p0); if (u >= 1) { this._put(r, r.q0, zero, r.p0); this.anims.splice(i, 1); } }
    }
  }
  terrainY(x, z) { // высота именно меша рельефа (для укладки дорог вплотную к земле)
    const N = this.hN, S = this.hS, fx = Math.max(0, Math.min(N - .001, (x + S / 2) / S * N)), fz = Math.max(0, Math.min(N - .001, (z + S / 2) / S * N)), ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz, g = this.hg, W = N + 1;
    const a = g[iz * W + ix], b = g[iz * W + ix + 1], c = g[(iz + 1) * W + ix], d = g[(iz + 1) * W + ix + 1]; return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  buildRoads(roads) { // асфальтовая лента вдоль дороги: обочина, полотно, жёлтая осевая
    const pos = [], colr = [], idx = [], K = { edge: new THREE.Color('#6a6250'), asph: new THREE.Color('#3a3d41'), line: new THREE.Color('#cdb85a') };
    const OFF = [-3.3, -2.7, -.09, .09, 2.7, 3.3], COL = [K.edge, K.asph, K.line, K.line, K.asph, K.edge];
    for (const road of roads) {
      const pts = []; for (let i = 0; i < road.length - 1; i++) { const [ax, az] = road[i], [bx, bz] = road[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 3)); for (let k = 0; k < n; k++) pts.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]); } pts.push(road[road.length - 1]);
      if (pts.length < 2) continue; const base = pos.length / 3;
      pts.forEach((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l; const nx = -tz, nz = tx;
        OFF.forEach((o, j) => { const x = p[0] + nx * o, z = p[1] + nz * o; pos.push(x, this.terrainY(x, z) + .09, z); colr.push(COL[j].r, COL[j].g, COL[j].b); }); });
      for (let i = 0; i < pts.length - 1; i++) for (let j = 0; j < 5; j++) { const a = base + i * 6 + j, b = a + 1, c = a + 6, d = c + 1; idx.push(a, b, c, b, d, c); }
    }
    if (!idx.length) return;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    this.roadMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); this.roadMesh.receiveShadow = true; this.scene.add(this.roadMesh);
  }
  buildMonuments(list) { // постройки РТ: один склеенный меш на РТ + невидимые коллайдеры (режутся на куски ≤5 м — коллизия ищет объекты в радиусе 4 м)
    let id = -1000; this.monuments = list;
    for (const m of list) {
      const { boxes } = monumentLayout(m), geos = [], col = new THREE.Color();
      for (const b of boxes) {
        const geo = new THREE.BoxGeometry(b.w, b.h, b.d); geo.rotateY(b.r); geo.translate(b.x, b.y + b.h / 2, b.z);
        col.set(b.c); const n = geo.attributes.position.count, ca = new Float32Array(n * 3), k = .93 + hh(b.x, b.y, b.z) * .14; for (let i = 0; i < n; i++) { ca[i * 3] = col.r * k; ca[i * 3 + 1] = col.g * k; ca[i * 3 + 2] = col.b * k; }
        geo.setAttribute('color', new THREE.BufferAttribute(ca, 3)); geos.push(geo);
        if (!b.s) continue; const nx = Math.max(1, Math.ceil(b.w / 5)), nz = Math.max(1, Math.ceil(b.d / 5)), cw = b.w / nx, cd = b.d / nz, c = Math.cos(b.r), s = Math.sin(b.r);
        for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const lx = -b.w / 2 + cw * (i + .5), lz = -b.d / 2 + cd * (j + .5), rid = id--; this.buildings.map.set(rid, { id: rid, type: 'static', tier: 0, x: b.x + lx * c + lz * s, y: b.y, z: b.z - lx * s + lz * c, rot: b.r, info: { group: new THREE.Group(), boxes: [[cw, b.h, cd, 0, b.h / 2, 0]] } }); }
      }
      if (!geos.length) continue; const mesh = new THREE.Mesh(mergeGeometries(geos), MAT); mesh.castShadow = mesh.receiveShadow = true; this.scene.add(mesh); geos.forEach(g => g.dispose());
    }
  }
  buildRuins(zones) { // разрушенные постройки в зонах лута (статичные, с коллизией)
    const r = rng(77); let id = -1;
    for (const z of zones) for (let i = 0; i < 9; i++) { const a = r() * 6.28, d = r() * z.r * .8, x = z.x + Math.cos(a) * d, zz = z.z + Math.sin(a) * d; this.buildings.add({ id: id--, type: i % 3 === 0 ? 'wall_window' : i % 3 === 1 ? 'wall_door' : 'wall', tier: 1 + (i % 2), x, y: heightAt(x, zz), z: zz, rot: Math.floor(r() * 4) * Math.PI / 2 + (r() - .5) * .3 }); }
  }
  collide(pos, rad) {
    const gx = Math.floor(pos.x / 8), gz = Math.floor(pos.z / 8);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const a = this.grid.get(`${gx + i}:${gz + j}`); if (!a) continue; for (const r of a) { const cr = SPH[r.type][2]; if (!cr || !r.alive) continue; const rr = cr * (r.type === 'tree' ? .35 : r.sc) + rad, dx = pos.x - r.x, dz = pos.z - r.z, d = Math.hypot(dx, dz); if (d < rr && d > 1e-4 && pos.y < r.y + (r.type === 'tree' ? 6 : 1.2)) { pos.x += dx / d * (rr - d); pos.z += dz / d * (rr - d); } } }
    this.buildings.collide(pos, rad);
  }
  groundY(x, z, y) { return Math.max(heightAt(x, z), this.buildings.floorY(x, z, y)); }
  target(o, d, max = 4.5) {
    let best = null; const gx = Math.floor(o.x / 8), gz = Math.floor(o.z / 8), n = Math.ceil(max / 8) + 1;
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) { const a = this.grid.get(`${gx + i}:${gz + j}`); if (!a) continue; for (const r of a) { if (!r.alive) continue; const [h, rad] = SPH[r.type], cx = r.x - o.x, cy = r.y + h - o.y, cz = r.z - o.z, t = cx * d.x + cy * d.y + cz * d.z; if (t < 0 || t > max + rad) continue; const px = cx - d.x * t, py = cy - d.y * t, pz = cz - d.z * t; if (px * px + py * py + pz * pz < rad * rad && (!best || t < best.t)) best = { kind: 'res', id: r.id, t, type: r.type, r }; } }
    const b = this.buildings.target(o, d, max); if (b && (!best || b.t < best.t)) best = b; return best;
  }
  updateLOD(cam, view) {
    for (const c of this.chunks) { const d = Math.hypot(c.cx - cam.x, c.cz - cam.z) - CH * .7, hi = d < (c.type === 'tree' ? 100 : 160), lo = d < view; c.meshes[0].visible = hi || (c.meshes.length === 1 && lo); if (c.meshes[1]) c.meshes[1].visible = !hi && lo; }
  }
  setTime(t, weather, cam, fogFar) { // t: 0..1, 0.25 — восход, 0.5 — полдень
    const ang = (t - .25) * Math.PI * 2, el = Math.sin(ang), day = Math.max(0, Math.min(1, el * 3 + .3)), dusk = Math.max(0, 1 - Math.abs(el) * 4) * (el > -.2 ? 1 : 0);
    const dir = (this._dir ||= new THREE.Vector3()).set(Math.cos(ang), el, .3).normalize(); this.sun.position.copy(cam).addScaledVector(dir, 150); this.sun.target.position.copy(cam);
    this.sun.intensity = Math.max(.05, day * 1.7) * (weather === 'rain' ? .5 : 1); this.sun.color.set(el > .15 ? 0xfff3d6 : el > -.1 ? 0xff9a55 : 0x6677aa); this.hemi.intensity = .12 + day * .55; this.amb.intensity = .05 + day * .12;
    const bg = (this._bg ||= new THREE.Color()).copy(this.bgNight).lerp(this.bgDay, day).lerp(this.bgDusk, dusk * .6); if (weather === 'rain') bg.lerp(this._rainC ||= new THREE.Color('#4a5560'), .6 * Math.max(day, .3));
    this.scene.background.copy(bg); this.scene.fog.color.copy(bg); this.scene.fog.far = fogFar * (weather === 'rain' ? .55 : 1); this.scene.fog.near = 20;
    this.sunMesh.position.copy(cam).addScaledVector(dir, 800); this.moonMesh.position.copy(cam).addScaledVector(dir, -800); this.stars.position.copy(cam); this.stars.material.opacity = Math.max(0, 1 - day * 2); this.sunMesh.visible = el > -.1; this.moonMesh.visible = el < .1; this.water.material.color.set(day > .3 ? 0x2a6f9e : 0x10304a);
    return day;
  }
}
export function makeMapImage(size = 512, data = {}) { // карта острова для мини- и большой карты
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'), im = g.createImageData(size, size), S = ISLAND_R * 2.3;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) { const x = (i / size - .5) * S, z = (j / size - .5) * S, h = heightAt(x, z); let col; if (h < 0) col = [40, 90, 140]; else if (h < 2.4) col = [217, 197, 138]; else if (h > 28) col = [124, 125, 120]; else col = [56 + (h * 2) % 20, 110 - h, 56]; if (h > 0) { const sh = heightAt(x - 6, z - 6) - h; const k = 1 + Math.max(-.3, Math.min(.3, sh * .05)); col = col.map(v => v * k); } const pw = padWeight(x, z); if (pw > 0 && h > 0) col = col.map(v => v * (1 - pw * .8) + 150 * pw * .8); const o = (j * size + i) * 4; im.data[o] = col[0]; im.data[o + 1] = col[1]; im.data[o + 2] = col[2]; im.data[o + 3] = 255; }
  g.putImageData(im, 0, 0);
  const mx = v => (v / S + .5) * size; g.lineCap = g.lineJoin = 'round'; g.strokeStyle = 'rgba(238,228,190,.95)'; g.lineWidth = Math.max(1.5, size / 256 * 1.5);
  for (const r of data.roads || []) { g.beginPath(); r.forEach(([x, z], i) => i ? g.lineTo(mx(x), mx(z)) : g.moveTo(mx(x), mx(z))); g.stroke(); }
  return c;
}
export const MAP_SPAN = ISLAND_R * 2.3;
