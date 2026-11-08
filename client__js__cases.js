// Анимация открытия кейса: 3D-кейс → крышка → вылет предмета → название и редкость → «Забрать».
import * as THREE from 'three';
import { $ } from './ui.js';
import { play } from './audio.js';
const COL = { common: '#aab', uncommon: '#6fd16f', rare: '#4aa3ff', epic: '#b266ff', legendary: '#ffb020' };
const NAME = { common: 'Обычный', uncommon: 'Необычный', rare: 'Редкий', epic: 'Эпический', legendary: 'Легендарный' };
export function openCaseAnimation(res) {
  return new Promise(done => {
    const stage = $('#case-stage'), cv = $('#case-canvas'), info = $('#case-info'), take = $('#case-take'), skip = $('#case-skip');
    stage.classList.remove('hidden'); take.classList.add('hidden'); skip.classList.remove('hidden'); info.innerHTML = '';
    const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true }); r.setSize(innerWidth, innerHeight, false); r.setPixelRatio(Math.min(devicePixelRatio, 2));
    const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, .1, 50); cam.position.set(0, 1.6, 4.2); cam.lookAt(0, .7, 0);
    sc.add(new THREE.AmbientLight('#fff', .6)); const dl = new THREE.DirectionalLight('#fff', 1.4); dl.position.set(2, 4, 3); sc.add(dl);
    const wood = new THREE.MeshStandardMaterial({ color: '#5a3a1e', roughness: .7 }), metal = new THREE.MeshStandardMaterial({ color: '#c7a24a', metalness: .8, roughness: .3 });
    const box = new THREE.Group(); const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, .8, 1), wood); base.position.y = .4; box.add(base);
    [-.7, .7].forEach(x => { const b = new THREE.Mesh(new THREE.BoxGeometry(.1, .82, 1.02), metal); b.position.set(x, .4, 0); box.add(b); });
    const lid = new THREE.Group(); lid.position.set(0, .8, -.5); const lm = new THREE.Mesh(new THREE.BoxGeometry(1.6, .2, 1), wood); lm.position.set(0, .1, .5); lid.add(lm); box.add(lid); sc.add(box);
    const color = COL[res.rarity] || '#fff', glow = new THREE.PointLight(color, 0, 8); glow.position.set(0, 1.2, 0); sc.add(glow);
    const item = new THREE.Mesh(new THREE.OctahedronGeometry(.3), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2 })); item.visible = false; item.position.set(0, .8, 0); sc.add(item);
    const t0 = performance.now(); let raf, finished = false, sfx = false;
    const finish = () => { if (finished) return; finished = true; item.visible = true; item.position.set(0, 1.6, 1.6); lid.rotation.x = -1.9; glow.intensity = 3; if (!sfx) { play(['epic', 'legendary', 'rare'].includes(res.rarity) ? 'fanfare' : 'click'); sfx = true; }
      info.innerHTML = `<div style="color:${color};font-size:28px">${res.skin ? res.skin.name : 'Награда'}</div><div style="color:${color}">${NAME[res.rarity]}</div><div style="font-size:16px;font-weight:400;margin-top:6px">${res.rewards.join(' • ')}</div>`; skip.classList.add('hidden'); take.classList.remove('hidden'); };
    const loop = () => {
      const t = (performance.now() - t0) / 1000; box.rotation.y = Math.sin(t) * .15;
      if (!finished) {
        if (t < 1) box.position.y = Math.sin(t * 30) * .02 * (t < .6 ? 1 : 0);
        if (t > 1 && t < 2) lid.rotation.x = -((t - 1)) * 1.9; else if (t >= 2) lid.rotation.x = -1.9;
        if (t > 1.3) { item.visible = true; const k = Math.min(1, (t - 1.3) / 1.4); item.position.set(0, .8 + Math.sin(k * Math.PI) * 1.4 + k * .8, k * 1.6); glow.intensity = k * 3; }
        if (t > 2.7) finish();
      }
      item.rotation.y += .05; item.rotation.x += .02; r.render(sc, cam); raf = requestAnimationFrame(loop);
    };
    play('click'); loop(); skip.onclick = finish;
    take.onclick = () => { cancelAnimationFrame(raf); r.dispose(); stage.classList.add('hidden'); done(); };
  });
}
