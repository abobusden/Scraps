// Звуки синтезируются WebAudio (файлы не нужны). Свои файлы можно подключить через loadFile(name,url).
import { settings } from './ui.js';
let ctx = null, musicNode = null;
const files = {};
const ac = () => ctx || (ctx = new (window.AudioContext || window.webkitAudioContext)());
const active = () => document.visibilityState === 'visible'; // звук только активная вкладка
export function unlock() { try { ac().resume(); } catch {} }
export async function loadFile(name, url) { try { const b = await (await fetch(url)).arrayBuffer(); files[name] = await ac().decodeAudioData(b); } catch {} }
function tone({ f = 440, t = .1, type = 'sine', v = .3, slide = 0, noise = false, delay = 0 }, vol = 1) {
  if (!active()) return; const a = ac(), g = a.createGain(), now = a.currentTime + delay, master = settings.vol * settings.sfx * vol;
  g.gain.setValueAtTime(v * master, now); g.gain.exponentialRampToValueAtTime(.0001, now + t); g.connect(a.destination);
  if (noise) { const n = a.sampleRate * t, buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; const s = a.createBufferSource(); s.buffer = buf; const fl = a.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = f; s.connect(fl); fl.connect(g); s.start(now); }
  else { const o = a.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, now); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f + slide), now + t); o.connect(g); o.start(now); o.stop(now + t); }
}
const S = {
  // материалы: удары по ресурсам, телу
  hit_wood: () => { tone({ f: 800, t: .09, noise: true, v: .4 }); tone({ f: 130, t: .13, type: 'triangle', v: .35, slide: -40 }); },
  hit_stone: () => { tone({ f: 2600, t: .05, noise: true, v: .35 }); tone({ f: 1900, t: .07, type: 'square', v: .12, slide: -900 }); },
  hit_ore: () => { tone({ f: 3000, t: .05, noise: true, v: .3 }); tone({ f: 2300, t: .28, type: 'sine', v: .2, slide: -300 }); tone({ f: 3100, t: .2, type: 'sine', v: .1, slide: -200, delay: .02 }); },
  hit_metal: () => { tone({ f: 1500, t: .3, type: 'triangle', v: .25, slide: -250 }); tone({ f: 900, t: .1, type: 'square', v: .15 }); },
  hit_leaf: () => tone({ f: 3500, t: .13, noise: true, v: .22 }),
  hit_flesh: () => { tone({ f: 420, t: .12, noise: true, v: .45 }); tone({ f: 95, t: .15, type: 'sine', v: .4, slide: -40 }); },
  crit: () => { tone({ f: 1700, t: .16, type: 'sine', v: .25, slide: 900 }); tone({ f: 2500, t: .1, type: 'triangle', v: .2, delay: .03 }); },
  tree_fall: () => { tone({ f: 1500, t: .08, noise: true, v: .55 }); tone({ f: 300, t: .9, noise: true, v: .4, delay: .1 }); tone({ f: 70, t: .8, type: 'sawtooth', v: .3, slide: -40, delay: .1 }); tone({ f: 120, t: .35, noise: true, v: .8, delay: .95 }); },
  rock_break: () => { tone({ f: 1400, t: .4, noise: true, v: .6 }); tone({ f: 90, t: .3, type: 'triangle', v: .4, slide: -50 }); },
  // шаги по поверхностям
  step_sand: () => tone({ f: 1200, t: .1, noise: true, v: .12 }), step_rock: () => { tone({ f: 2200, t: .05, noise: true, v: .18 }); tone({ f: 600, t: .02, type: 'square', v: .05 }); },
  step_wood: () => { tone({ f: 160, t: .08, type: 'triangle', v: .28, slide: -40 }); tone({ f: 900, t: .05, noise: true, v: .1 }); },
  // оружие / предметы по фазам анимации
  mag_out: () => { tone({ f: 300, t: .05, type: 'square', v: .2 }); tone({ f: 1500, t: .04, noise: true, v: .2, delay: .03 }); },
  mag_in: () => { tone({ f: 250, t: .06, type: 'square', v: .24, slide: -100 }); tone({ f: 1800, t: .05, noise: true, v: .25 }); },
  bolt: () => { tone({ f: 2500, t: .05, noise: true, v: .3 }); tone({ f: 500, t: .04, type: 'square', v: .2, delay: .07 }); },
  pump: () => { tone({ f: 1600, t: .06, noise: true, v: .35 }); tone({ f: 350, t: .05, type: 'square', v: .25, delay: .12 }); },
  shell: () => tone({ f: 800, t: .05, type: 'triangle', v: .18, slide: 300 }),
  bite: () => { tone({ f: 1000, t: .06, noise: true, v: .3 }); tone({ f: 600, t: .05, noise: true, v: .2, delay: .08 }); },
  gulp: () => tone({ f: 220, t: .13, type: 'sine', v: .3, slide: -90 }),
  bandage: () => tone({ f: 3000, t: .22, noise: true, v: .25 }),
  bow_draw: () => tone({ f: 200, t: .8, type: 'triangle', v: .12, slide: 160 }),
  hurt: () => { tone({ f: 500, t: .15, noise: true, v: .5 }); tone({ f: 80, t: .2, type: 'sine', v: .5, slide: -30 }); },
  heart: vol => { tone({ f: 60, t: .12, type: 'sine', v: .55 }); tone({ f: 55, t: .12, type: 'sine', v: .4, delay: .17 }); },
  step: () => tone({ f: 500, t: .06, noise: true, v: .15 }), hit: () => tone({ f: 200, t: .12, type: 'square', v: .25, slide: -120 }), chop: () => { tone({ f: 900, t: .08, noise: true, v: .35 }); tone({ f: 140, t: .1, type: 'triangle', v: .3 }); },
  pistol: () => { tone({ f: 2500, t: .18, noise: true, v: .5 }); tone({ f: 180, t: .12, type: 'square', v: .3, slide: -140 }); }, ak: () => { tone({ f: 3000, t: .12, noise: true, v: .55 }); tone({ f: 140, t: .1, type: 'sawtooth', v: .3, slide: -100 }); }, shotgun: () => { tone({ f: 1800, t: .35, noise: true, v: .7 }); tone({ f: 90, t: .25, type: 'sawtooth', v: .4, slide: -60 }); }, rifle: () => { tone({ f: 3500, t: .4, noise: true, v: .7 }); tone({ f: 100, t: .3, type: 'sawtooth', v: .4, slide: -70 }); },
  bow: () => tone({ f: 600, t: .15, type: 'triangle', v: .25, slide: -400 }), swing: () => tone({ f: 700, t: .12, noise: true, v: .12 }), death: () => tone({ f: 300, t: .8, type: 'sawtooth', v: .3, slide: -250 }),
  headshot: () => tone({ f: 1500, t: .12, type: 'square', v: .3 }), hitmark: () => tone({ f: 1100, t: .05, type: 'square', v: .15 }), chat: () => tone({ f: 800, t: .08, type: 'sine', v: .2 }),
  reload: () => { tone({ f: 400, t: .05, type: 'square', v: .2 }); tone({ f: 600, t: .05, type: 'square', v: .2, delay: .35 }); }, boom: () => tone({ f: 400, t: .9, noise: true, v: .9 }), pick: () => tone({ f: 900, t: .1, type: 'sine', v: .2, slide: 400 }),
  click: () => tone({ f: 1200, t: .03, type: 'square', v: .15 }), fanfare: () => [523, 659, 784, 1046].forEach((f, i) => tone({ f, t: .35, type: 'triangle', v: .3, delay: i * .12 })),
};
export function play(name, vol = 1) { if (files[name] && active()) { const a = ac(), s = a.createBufferSource(), g = a.createGain(); g.gain.value = settings.vol * settings.sfx * vol; s.buffer = files[name]; s.connect(g); g.connect(a.destination); s.start(); return; } (S[name] || (() => { }))(vol); }
export function startMusic() { // тихий эмбиент-дрон
  if (musicNode) return; try { const a = ac(), g = a.createGain(); g.gain.value = 0; g.connect(a.destination);[55, 82.4, 110.3].forEach((f, i) => { const o = a.createOscillator(); o.type = 'sine'; o.frequency.value = f; const l = a.createGain(); l.gain.value = .3 / (i + 1); o.connect(l); l.connect(g); o.start(); }); musicNode = g; setInterval(() => { g.gain.value = active() ? settings.vol * settings.music * .15 : 0; }, 500); } catch {}
}
