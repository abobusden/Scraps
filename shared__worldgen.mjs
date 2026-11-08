// Общая генерация мира: одинаково работает на сервере (Node) и в браузере.
// Клиент получает монументы (РТ), дороги и ящики от сервера в событии init (см. setMonuments), поэтому
// мелкие различия вычислений в разных браузерах не могут «разъехать» мир.
export const ISLAND_R = 450;
export const TYPES = ['tree','rock','ore','sulfur','bush','scrap','barrel','crate'];
export function rng(seed){let a=seed|0;return function(){a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296}}
function hash(ix,iz){let h=Math.imul(ix,374761393)^Math.imul(iz,668265263);h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967296}
function vnoise(x,z){const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz,u=fx*fx*(3-2*fx),v=fz*fz*(3-2*fz);const a=hash(ix,iz),b=hash(ix+1,iz),c=hash(ix,iz+1),d=hash(ix+1,iz+1);return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v}
function fbm(x,z){let s=0,a=.5,f=1;for(let i=0;i<4;i++){s+=a*vnoise(x*f,z*f);f*=2;a*=.5}return s}

// ---------- рельеф ----------
// Базовая высота (без площадок РТ) — по ней выбираются места для РТ, зоны лута и ресурсы, чтобы старый мир не менялся.
function baseHeightAt(x,z){
  const d=Math.hypot(x,z)/ISLAND_R, warp=(fbm(x*.004+10,z*.004+10)-.5)*.35, m=1-(d+warp)+.0;
  let h=m*15-3.2; if(h<0)h*=1.6;
  if(h>2){const mt=Math.max(0,fbm(x*.007+50,z*.007+50)-.5)*130*Math.min(1,(h-2)/6);h+=mt}
  if(h>0)h+=(fbm(x*.06,z*.06)-.5)*1.4;
  return h;
}
const baseSlope=(x,z)=>Math.abs(baseHeightAt(x+2,z)-baseHeightAt(x-2,z))+Math.abs(baseHeightAt(x,z+2)-baseHeightAt(x,z-2));
const sstep=t=>t<=0?0:t>=1?1:t*t*(3-2*t);

let _mons=null; // монументы: [{id,n,x,z,y,pr,fall,rot}] — плоские площадки в рельефе
export function setMonuments(list){_mons=list}
export function getMonuments(){return _mons||(_mons=computeMonuments())}
// Вес площадки (0..1) в точке: 1 — ровный бетон, плавно спадает до 0 на краю насыпи.
export function padWeight(x,z){
  const P=getMonuments();let w=0;
  for(const m of P){const d=Math.hypot(x-m.x,z-m.z);if(d>=m.pr+m.fall)continue;w=Math.max(w,d<=m.pr?1:1-sstep((d-m.pr)/m.fall))}
  return w;
}
export function heightAt(x,z){
  const h=baseHeightAt(x,z),P=_mons||getMonuments();
  for(const m of P){const d=Math.hypot(x-m.x,z-m.z);if(d>=m.pr+m.fall)continue;const w=d<=m.pr?1:1-sstep((d-m.pr)/m.fall);return h+(m.y-h)*w}
  return h;
}
export function slopeAt(x,z){return Math.abs(heightAt(x+2,z)-heightAt(x-2,z))+Math.abs(heightAt(x,z+2)-heightAt(x,z-2))}
export function beachSpawn(r=Math.random){
  const a=r()*Math.PI*2, c=Math.cos(a), s=Math.sin(a);
  for(let d=ISLAND_R*1.2;d>0;d-=2){const x=c*d,z=s*d,h=heightAt(x,z);if(h>1.0&&h<2.2)return{x,z,y:h+.1}}
  return{x:0,z:0,y:heightAt(0,0)+.1};
}
export function findZone(angle,minH,maxH){
  for(let d=300;d>40;d-=4){const x=Math.cos(angle)*d,z=Math.sin(angle)*d,h=baseHeightAt(x,z);if(h>minH&&h<maxH&&baseSlope(x,z)<2)return{x,z}}
  return{x:0,z:0};
}
export const ZONES=()=>[{n:'Свалка',r:38,...findZone(.6,3,9)},{n:'Руины',r:34,...findZone(2.4,3,9)},{n:'Заброшенный лагерь',r:28,...findZone(4.2,3,9)},{n:'Промзона',r:30,...findZone(5.4,3,9)}];

// ---------- РТ (монументы) ----------
const MON_DEFS=[
  {id:'military',n:'Военная база',pr:42,fall:20,relief:6,minH:3.5,maxH:18},
  {id:'shop',n:'Магазин',pr:27,fall:14,relief:4,minH:3,maxH:18},
  {id:'gas',n:'Заправка',pr:25,fall:14,relief:4,minH:3,maxH:18},
];
function computeMonuments(){
  const zones=ZONES(),chosen=[];
  for(const d of MON_DEFS){
    let best=null;
    for(let gx=-360;gx<=360;gx+=10)for(let gz=-360;gz<=360;gz+=10){
      const dc=Math.hypot(gx,gz);if(dc>ISLAND_R*.78||dc<70)continue;
      const hc=baseHeightAt(gx,gz);if(hc<d.minH||hc>d.maxH)continue;
      if(zones.some(q=>Math.hypot(q.x-gx,q.z-gz)<q.r+d.pr+30))continue;
      if(chosen.some(q=>Math.hypot(q.x-gx,q.z-gz)<190))continue;
      let mn=1e9,mx=-1e9,sum=0,n=0,ok=true;
      for(const f of [0,.5,1])for(let k=0;k<(f?12:1)&&ok;k++){const a=k/12*Math.PI*2,h=baseHeightAt(gx+Math.cos(a)*d.pr*f,gz+Math.sin(a)*d.pr*f);mn=Math.min(mn,h);mx=Math.max(mx,h);sum+=h;n++}
      if(mx-mn>d.relief)continue;
      for(let k=0;k<16&&ok;k++){const a=k/16*Math.PI*2,h=baseHeightAt(gx+Math.cos(a)*(d.pr+d.fall),gz+Math.sin(a)*(d.pr+d.fall));if(h<1.7||h>hc+10)ok=false}
      if(!ok)continue;
      const score=(mx-mn)+dc*.004;
      if(!best||score<best.score)best={score,x:gx,z:gz,y:Math.max(2.8,sum/n)};
    }
    if(!best)continue;
    const dx=-best.x,dz=-best.z,rot=Math.round(Math.atan2(dx,dz)/(Math.PI/2))*(Math.PI/2); // вход «смотрит» к центру острова
    chosen.push({id:d.id,n:d.n,x:+best.x.toFixed(1),z:+best.z.toFixed(1),y:+best.y.toFixed(2),pr:d.pr,fall:d.fall,rot:+rot.toFixed(4)});
  }
  return chosen;
}

// ---------- Дороги ----------
class Heap{constructor(){this.a=[]}get size(){return this.a.length}
  push(k,v){const a=this.a;a.push([k,v]);let i=a.length-1;while(i>0){const p=(i-1)>>1;if(a[p][0]<=a[i][0])break;[a[p],a[i]]=[a[i],a[p]];i=p}}
  pop(){const a=this.a,t=a[0],l=a.pop();if(a.length){a[0]=l;let i=0;for(;;){let c=i*2+1;if(c>=a.length)break;if(c+1<a.length&&a[c+1][0]<a[c][0])c++;if(a[i][0]<=a[c][0])break;[a[i],a[c]]=[a[c],a[i]];i=c}}return t}}
const R_CELL=8,R_HALF=Math.ceil(ISLAND_R*1.05/R_CELL),R_W=R_HALF*2+1;
let _rg=null;
function roadGrid(){
  if(_rg)return _rg;const H=new Float32Array(R_W*R_W);
  for(let j=-R_HALF;j<=R_HALF;j++)for(let i=-R_HALF;i<=R_HALF;i++)H[(j+R_HALF)*R_W+i+R_HALF]=baseHeightAt(i*R_CELL,j*R_CELL);
  return _rg=H;
}
function planRoad(a,b){
  const H=roadGrid(),pass=k=>H[k]>=1.9&&H[k]<=22,cell=p=>[Math.round(p.x/R_CELL),Math.round(p.z/R_CELL)];
  const near=p=>{let[ci,cj]=cell(p),best=null;for(let r=0;r<=6&&!best;r++)for(let j=cj-r;j<=cj+r;j++)for(let i=ci-r;i<=ci+r;i++){if(Math.max(Math.abs(i-ci),Math.abs(j-cj))!==r)continue;if(Math.abs(i)>R_HALF||Math.abs(j)>R_HALF)continue;const k=(j+R_HALF)*R_W+i+R_HALF;if(pass(k)){best=[i,j];break}}return best};
  const s=near(a),g=near(b);if(!s||!g)return null;
  const N=R_W*R_W,dist=new Float32Array(N).fill(1e9),prev=new Int32Array(N).fill(-1),idx=(i,j)=>(j+R_HALF)*R_W+i+R_HALF;
  const hp=new Heap(),sk=idx(s[0],s[1]),gk=idx(g[0],g[1]);dist[sk]=0;hp.push(0,sk);
  const done=new Uint8Array(N);
  while(hp.size){
    const[,k]=hp.pop();if(done[k])continue;done[k]=1;if(k===gk)break;
    const ci=k%R_W-R_HALF,cj=Math.floor(k/R_W)-R_HALF;
    for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){
      if(!di&&!dj)continue;const ni=ci+di,nj=cj+dj;if(Math.abs(ni)>R_HALF||Math.abs(nj)>R_HALF)continue;
      const nk=idx(ni,nj);if(done[nk]||!pass(nk))continue;
      const len=Math.hypot(di,dj)*R_CELL,sl=Math.abs(H[nk]-H[k])/len,c=len*(1+14*sl*sl+(H[nk]>12?.6:0)+(H[nk]<3?.4:0));
      if(dist[k]+c<dist[nk]){dist[nk]=dist[k]+c;prev[nk]=k;hp.push(dist[nk]+Math.hypot(ni-g[0],nj-g[1])*R_CELL,nk)}
    }
  }
  if(!done[gk])return null;
  let pts=[];for(let k=gk;k!==-1;k=prev[k])pts.push([(k%R_W-R_HALF)*R_CELL,(Math.floor(k/R_W)-R_HALF)*R_CELL]);pts.reverse();
  pts=[[a.x,a.z],...pts,[b.x,b.z]];
  for(let it=0;it<3;it++){const q=[pts[0]];for(let i=0;i<pts.length-1;i++){const p=pts[i],n=pts[i+1];q.push([p[0]*.75+n[0]*.25,p[1]*.75+n[1]*.25],[p[0]*.25+n[0]*.75,p[1]*.25+n[1]*.75])}q.push(pts[pts.length-1]);pts=q}
  const out=[pts[0]];let acc=0;for(let i=1;i<pts.length;i++){const p=out[out.length-1];const d=Math.hypot(pts[i][0]-p[0],pts[i][1]-p[1]);if(d>=6||i===pts.length-1){out.push(pts[i]);acc=0}else acc+=d}
  return out;
}
// Кольцевая дорога: РТ и зоны лута, отсортированные по углу вокруг центра острова, соединены дорогами по рельефу (A*).
export function generateRoads(mons){
  const zones=ZONES(),nodes=[...mons.map(m=>({x:m.x,z:m.z,cut:m.pr*.85})),...zones.map(q=>({x:q.x,z:q.z,cut:q.r*.4}))];
  nodes.sort((p,q)=>Math.atan2(p.z,p.x)-Math.atan2(q.z,q.x));
  const roads=[];
  for(let i=0;i<nodes.length;i++){
    const a=nodes[i],b=nodes[(i+1)%nodes.length];if(nodes.length<2)break;
    let pts=planRoad(a,b);if(!pts)continue;
    pts=pts.filter(p=>Math.hypot(p[0]-a.x,p[1]-a.z)>a.cut&&Math.hypot(p[0]-b.x,p[1]-b.z)>b.cut);
    if(pts.length>=2)roads.push(pts.map(p=>[+p[0].toFixed(1),+p[1].toFixed(1)]));
  }
  return roads;
}
export function distToRoads(roads,x,z){
  let best=1e9;
  for(const r of roads)for(let i=0;i<r.length-1;i++){
    const ax=r[i][0],az=r[i][1],bx=r[i+1][0],bz=r[i+1][1],dx=bx-ax,dz=bz-az,l2=dx*dx+dz*dz||1,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/l2));
    best=Math.min(best,Math.hypot(x-(ax+dx*t),z-(az+dz*t)));
  }
  return best;
}

// ---------- Постройки РТ и места ящиков ----------
// Возвращает: boxes — блоки (x,z — центр, y — низ, w×h×d, r — поворот, c — цвет, s — есть ли коллизия) и crates — места ящиков.
// Типы ящиков: basic (базовый), military (военный), elite (элитный) — появляются ТОЛЬКО здесь.
export function monumentLayout(m){
  const boxes=[],crates=[],c=Math.cos(m.rot),s=Math.sin(m.rot),W=(lx,lz)=>[m.x+lx*c+lz*s,m.z-lx*s+lz*c];
  const f=v=>+v.toFixed(2);
  const box=(lx,lz,w,d,h,col,o={})=>{const[x,z]=W(lx,lz);boxes.push({x:f(x),z:f(z),y:f(m.y+(o.y||0)),w,h,d,r:+(m.rot+(o.r||0)).toFixed(4),c:col,s:o.s===false?0:1})};
  // стена по отрезку (x1,z1)->(x2,z2) с проёмами: gaps=[{s,w,lo,hi}] — s от начала, lo/hi — низ/верх проёма
  const wall=(x1,z1,x2,z2,h,t,col,gaps=[])=>{
    const dx=x2-x1,dz=z2-z1,L=Math.hypot(dx,dz),ux=dx/L,uz=dz/L,r=Math.atan2(-dz,dx),at=u=>[x1+ux*u,z1+uz*u];
    const put=(u0,u1,y0,y1)=>{if(u1-u0<.05||y1-y0<.05)return;const[px,pz]=at((u0+u1)/2);box(px,pz,u1-u0,t,y1-y0,col,{y:y0,r})};
    let u=0;for(const g of [...gaps].sort((p,q)=>p.s-q.s)){const lo=g.lo||0,hi=g.hi==null?2.4:g.hi;put(u,g.s,0,h);put(g.s,g.s+g.w,0,lo);put(g.s,g.s+g.w,hi,h);u=g.s+g.w}
    put(u,L,0,h);
  };
  const room=(x1,z1,x2,z2,h,t,col,gs={})=>{ // прямоугольное здание: стороны N(z1), E(x2), S(z2), W(x1); gs: {N:[],E:[],S:[],W:[]}
    wall(x1,z1,x2,z1,h,t,col,gs.N||[]);wall(x2,z1,x2,z2,h,t,col,gs.E||[]);wall(x2,z2,x1,z2,h,t,col,gs.S||[]);wall(x1,z2,x1,z1,h,t,col,gs.W||[]);
  };
  const roof=(x1,z1,x2,z2,y,col,th=.35)=>box((x1+x2)/2,(z1+z2)/2,Math.abs(x2-x1)+.6,Math.abs(z2-z1)+.6,th,col,{y});
  const crate=(k,lx,lz,ry=0)=>{const[x,z]=W(lx,lz);crates.push({k,x:f(x),y:f(m.y),z:f(z),r:+(m.rot+ry).toFixed(3)})};
  const car=(lx,lz,col,ry=0)=>{box(lx,lz,4.4,1.9,1.0,col,{y:.35,r:ry});box(lx-.2*Math.cos(ry),lz+.2*Math.sin(ry),2.2,1.7,.75,'#2a2f33',{y:1.35,r:ry});};
  if(m.id==='gas'){
    // магазинчик 11x7, вход с юга (+z)
    room(-12.5,-11.5,-1.5,-4.5,3.3,.3,'#c9c4b4',{S:[{s:2,w:2,hi:2.4},{s:5.5,w:3,lo:1,hi:2.3},{s:9,w:1.6,lo:1,hi:2.3}],E:[{s:2,w:2.5,lo:1,hi:2.3}],W:[{s:2,w:2.5,lo:1,hi:2.3}]});
    roof(-12.5,-11.5,-1.5,-4.5,3.3,'#a33a2e');
    box(-5,-9.6,4,.8,1.1,'#6b4a2e');box(-9.3,-10.7,4,.6,1.8,'#7a7f86');box(-9.3,-8.3,4,.6,1.8,'#7a7f86');
    crate('basic',-11.2,-5.6,2.4);crate('basic',-3,-5.6,-2.4);crate('basic',-11.3,-10.9,.8);crate('military',-2.4,-10.9,3.9);
    // навес над колонками
    roof(0,0,16,8,5.2,'#e1e1da',.45);
    for(const[px,pz]of[[1,.8],[15,.8],[1,7.2],[15,7.2]])box(px,pz,.6,.6,5.2,'#c8c8c0');
    for(const ix of[5,11]){box(ix,4,7,1.3,.28,'#9a9a96');for(const dx of[-1.8,1.8]){box(ix+dx,4,.7,.55,1.6,'#c42a2a',{y:.28});box(ix+dx,4,.74,.58,.2,'#eeeeee',{y:1.88})}}
    crate('basic',-7,-13.4,0);crate('basic',17.5,-2,1.2);
    box(-14.5,6,.5,.5,11,'#555');box(-14.5,6,3.2,.5,2.2,'#d6b020',{y:9.4});
    box(-17,-6,2,1.2,1.3,'#2f5a3a');car(-12,13,'#7a3b2a',.3);car(14,-12,'#4f5b66',-.5);
    // детали: красная полоса навеса, товары на полках, фонари, бочки, шины, вывеска
    for(const[x1,z1,x2,z2]of[[0,0,16,0],[16,0,16,8],[16,8,0,8],[0,8,0,0]]){const dx=x2-x1,dz=z2-z1;box((x1+x2)/2,(z1+z2)/2,Math.hypot(dx,dz)+.6,.3,.5,'#c42a2a',{y:4.7,r:Math.atan2(-dz,dx),s:false})}
    for(let i=0;i<7;i++){box(-10.6+i*.55,-10.7,.4,.3,.35,['#c33','#3a8','#e8b92a','#39c'][i%4],{y:1.8,s:false});box(-10.6+i*.55,-8.3,.4,.3,.35,['#e8b92a','#c33','#39c','#3a8'][i%4],{y:1.8,s:false})}
    for(const px of[-3,19]){box(px,-2,.25,.25,7,'#444');box(px,-1.5,.9,.4,.3,'#fff6c8',{y:7,s:false})}
    for(let i=0;i<3;i++)box(-17.5,-2+i*1.2,.9,.9,.9,'#b0472a');
    for(let i=0;i<4;i++)box(-15.2,3,.9,.9,.3,'#222',{y:i*.32});
    box(-7,-4.2,6,.25,.7,'#d93030',{y:3.3,s:false});box(-7,-4.35,5.4,.1,.4,'#fff',{y:3.45,s:false});
  }
  else if(m.id==='shop'){
    room(-11,-14,11,-1,3.8,.3,'#d6d0c0',{S:[{s:2,w:4,lo:.9,hi:2.6},{s:9,w:4,hi:2.7},{s:16,w:4,lo:.9,hi:2.6}],N:[{s:18,w:1.6,hi:2.3}],W:[{s:5,w:3,lo:1,hi:2.4}],E:[{s:5,w:3,lo:1,hi:2.4}]});
    wall(-11,-11,11,-11,3.8,.25,'#c2bcae',[{s:10,w:1.6,hi:2.3}]);
    roof(-11,-14,11,-1,3.8,'#8a3b2e',.4);
    box(0,-.6,9,.3,1.3,'#d93030',{y:4.15,s:false});
    for(const sx of[-8,-4.5,4.5,8])box(sx,-6.7,.7,5,1.8,'#7a7f86');
    box(-6,-2.8,2.4,1,1,'#6b4a2e');box(6,-2.8,2.4,1,1,'#6b4a2e');
    crate('basic',-6.2,-9.2,1.57);crate('basic',6.2,-9.2,1.57);crate('basic',-6.2,-3.8,1.57);crate('basic',6.2,-4,1.57);crate('basic',-9.8,-9.4,.4);
    crate('basic',-9.5,-12.6,0);crate('military',9.5,-12.6,0);
    box(14,-8,2,1.3,1.4,'#2f5a3a');box(-14,-8,2,1.3,1.4,'#2f5a3a');car(-15,8,'#7a3b2a',.2);car(14,9,'#4f5b66',-.3);
    for(const px of[-19,19])box(px,5,.3,.3,7,'#555');
    crate('basic',15.5,-3,.5);
    // детали: товары на полках, навес над входом, столбики, тележки, АС на крыше, пилон
    for(const sx of[-8,-4.5,4.5,8])for(let k=0;k<7;k++)for(let lv=0;lv<3;lv++)box(sx,-8.7+k*.62,.55,.5,.3,['#c33','#3a8','#e8b92a','#39c','#d77','#8a5'][(k+lv*2)%6],{y:.3+lv*.55,s:false});
    box(0,.4,9,2.4,.15,'#d93030',{y:3.2,s:false});for(const px of[-4.3,4.3])box(px,1.4,.15,.15,3.2,'#aaa');
    for(let x=-6;x<=6;x+=3)box(x,2.2,.3,.3,.9,'#e8b92a');
    for(let i=0;i<3;i++)box(-13+i*1.1,3.5,.6,.9,.9,'#aab',{s:false});
    box(-5,-7,2,1.6,.9,'#b8b8b0',{y:4.2});box(5,-9,2,1.6,.9,'#b8b8b0',{y:4.2});
    box(-17,3,.5,.5,9,'#555');box(-17,3,3,.4,2.2,'#d93030',{y:9});
  }
  else if(m.id==='military'){
    const P=28;
    wall(-P,-P,P,-P,3.2,.5,'#7d806f');wall(P,-P,P,P,3.2,.5,'#7d806f');wall(P,P,-P,P,3.2,.5,'#7d806f',[{s:2*P/2-3.5,w:7,hi:3.2}]);wall(-P,P,-P,-P,3.2,.5,'#7d806f');
    box(-4,P,1.2,1.2,3.8,'#555');box(4,P,1.2,1.2,3.8,'#555');
    for(const[tx,tz]of[[-26,-26],[26,-26],[26,26],[-26,26]]){ // вышки
      for(const[ox,oz]of[[-1.6,-1.6],[1.6,-1.6],[1.6,1.6],[-1.6,1.6]])box(tx+ox,tz+oz,.45,.45,6.6,'#5a5f52');
      box(tx,tz,4.4,4.4,.4,'#6a6f60',{y:6.6});room(tx-2.2,tz-2.2,tx+2.2,tz+2.2,1.2,.2,'#6a6f60');
      for(const[ox,oz]of[[-2,-2],[2,-2],[2,2],[-2,2]])box(tx+ox,tz+oz,.3,.3,2.6,'#5a5f52',{y:7});
      box(tx,tz,5,5,.3,'#4d5246',{y:9.6});
    }
    // казарма
    room(-26,-23.5,-10,-14.5,3.2,.3,'#6f7a5a',{S:[{s:3,w:2,hi:2.3},{s:11,w:2,hi:2.3},{s:6.5,w:2.5,lo:1,hi:2.2}],N:[{s:4,w:2.5,lo:1,hi:2.2},{s:10,w:2.5,lo:1,hi:2.2}]});
    roof(-26,-23.5,-10,-14.5,3.2,'#4f5646');
    for(const bz of[-22,-20])for(const bx of[-24,-20,-16])box(bx,bz,2,.9,.6,'#8a8f7a');
    crate('basic',-24.6,-16,1.57);crate('basic',-11.6,-22.4,0);crate('basic',-18,-15.4,3.14);
    // арсенал (толстые стены)
    room(10,-23.5,26,-14.5,3.2,.5,'#5b6068',{S:[{s:7,w:2.2,hi:2.4}]});roof(10,-23.5,26,-14.5,3.2,'#3d4147');
    for(const rx of[13,17,21,24])box(rx,-21,.5,4,1.8,'#33373c');
    crate('military',12.4,-16,3.14);crate('military',23.6,-16,3.14);crate('military',18,-22.6,0);
    // командный бункер
    room(-6,-28,6,-16,3.5,.6,'#4a4f55',{S:[{s:5,w:2,hi:2.4}]});
    wall(-6,-24,6,-24,3.5,.4,'#4a4f55',[{s:5.2,w:1.6,hi:2.3}]);roof(-6,-28,6,-16,3.5,'#33373c',.5);
    crate('elite',-3.5,-26.5,0);crate('elite',3.5,-26.5,0);crate('military',-4.6,-18.8,1.57);crate('military',4.6,-18.8,-1.57);
    // навес с техникой
    box(-20,8,.5,.5,4,'#5a5f52');box(-20,18,.5,.5,4,'#5a5f52');box(-10,8,.5,.5,4,'#5a5f52');box(-10,18,.5,.5,4,'#5a5f52');
    roof(-20,8,-10,18,4,'#4f5646',.3);wall(-20,7.7,-10,7.7,3.6,.3,'#6f7a5a');
    box(-15,13,6,2.4,1.6,'#5f6a4a',{y:.5});box(-15,13,2.2,2.2,.9,'#2a2f33',{y:2.1});
    crate('military',-18.8,9.2,0);
    // вертолётная площадка, мачта, бочки с топливом, укрытия
    box(16,12,13,13,.12,'#3d4147',{s:false});box(16,12,5,1,.14,'#e8e8e8',{y:.12,s:false});box(16,12,1,5,.14,'#e8e8e8',{y:.12,s:false});
    box(24,-4,.5,.5,15,'#777');box(-24,-3,3,3,2.4,'#5a5f52');box(-24,2,3,3,2.4,'#5a5f52');
    box(-9,23,4,1,1.2,'#8b8260');box(9,23,4,1,1.2,'#8b8260');box(-14,3,4,1,1.2,'#8b8260',{r:.3});
    car(22,4,'#4f5b66',1.57);
    // детали: колючая проволока, шлагбаум, бетонные блоки, мешки, контейнеры, прожекторы, флаг
    box(0,-P,2*P,.15,.3,'#2a2a2a',{y:3.2,s:false});box(-P,0,.15,2*P,.3,'#2a2a2a',{y:3.2,s:false});box(P,0,.15,2*P,.3,'#2a2a2a',{y:3.2,s:false});box(-15.75,P,24.5,.15,.3,'#2a2a2a',{y:3.2,s:false});box(15.75,P,24.5,.15,.3,'#2a2a2a',{y:3.2,s:false});
    for(let i=0;i<6;i++){box(-4,P,.3,1.2,.6,i%2?'#e8b92a':'#222',{y:3.8+i*0,s:false})}
    for(const[bx0,bz0,r0]of[[-9,22,.4],[-3,19,-.4],[3,22,.4],[9,19,-.4]])box(bx0,bz0,2.2,.55,.85,'#9a9a94',{r:r0});
    for(const[sx,sz]of[[-6,24],[6,24],[-12,3],[-9,-10]])for(let r=0;r<3;r++)for(let k=0;k<4;k++)box(sx+k*.9-1.35,sz,.85,.5,.3,'#8b8260',{y:r*.3,s:r<1&&k%2===0});
    box(25,-11,6,2.4,2.6,'#7a3b2a',{r:1.5708});box(25,-11,6,2.4,2.6,'#2f4f6f',{r:1.5708,y:2.6});box(25,-16,6,2.4,2.6,'#3d5a3a',{r:1.5708});
    for(const[tx,tz]of[[-26,-26],[26,-26],[26,26],[-26,26]])box(tx,tz,.45,.45,.45,'#ffeea0',{y:9.9,s:false});
    box(0,17,.2,.2,10,'#bbb');box(1.1,17,2,.06,1.2,'#7a1c1c',{y:8.5,s:false});
  }
  return{boxes,crates};
}
export function allCrateSpots(mons){return mons.flatMap(m=>monumentLayout(m).crates.map(c=>({...c,mon:m.id})))}

// ---------- Ресурсы ----------
// Ресурсы: [id,type,x,y,z]; детерминированно (seed). Новые ресурсы (у дорог) добавляются В КОНЕЦ, чтобы id старых не менялись.
export function generateWorld(seed=1337){
  const r=rng(seed),out=[],zones=ZONES();let id=1;
  const mons=getMonuments(),roads=generateRoads(mons);
  for(const m of mons){ // вход РТ смотрит в сторону ближайшей дороги
    let best=null,bd=1e9;
    for(const rd of roads)for(const q of [rd[0],rd[rd.length-1]]){const d=Math.hypot(q[0]-m.x,q[1]-m.z);if(d<bd&&d<m.pr+m.fall+40){bd=d;best=q}}
    if(best)m.rot=+(Math.round(Math.atan2(best[0]-m.x,best[1]-m.z)/(Math.PI/2))*(Math.PI/2)).toFixed(4);
  }
  const place=(type,count,minH,maxH,zone)=>{
    let n=0,tries=0;
    while(n<count&&tries<count*80){tries++;let x,z;
      if(zone){const a=r()*Math.PI*2,d=Math.sqrt(r())*zone.r;x=zone.x+Math.cos(a)*d;z=zone.z+Math.sin(a)*d}
      else{const a=r()*Math.PI*2,d=Math.sqrt(r())*ISLAND_R*.95;x=Math.cos(a)*d;z=Math.sin(a)*d}
      const h=baseHeightAt(x,z);if(h<minH||h>maxH)continue;if(baseSlope(x,z)>(type==='tree'?3.2:6))continue;
      if(!zone&&type!=='scrap'&&zones.some(q=>Math.hypot(q.x-x,q.z-z)<q.r*.7&&(type==='tree'||type==='bush')))continue;
      out.push([id++,type,+x.toFixed(2),+heightAt(x,z).toFixed(2),+z.toFixed(2)]);n++}
  };
  place('tree',500,3,30);place('rock',300,1.5,60);place('ore',50,8,80);place('sulfur',40,8,80);place('bush',120,2.8,25);
  zones.forEach((q,i)=>{place('scrap',25,1,60,q);place('barrel',9,1,60,q);place('crate',6,1,60,q)});
  // очистка площадок РТ и проезжей части от деревьев/камней
  const clear=new Set(['tree','bush','rock','ore','sulfur','scrap']);
  const res=out.filter(([,t,x,,z])=>{
    if(mons.some(m=>Math.hypot(x-m.x,z-m.z)<m.pr+6))return false;
    if(clear.has(t)&&distToRoads(roads,x,z)<5.5&&!zones.some(q=>Math.hypot(q.x-x,q.z-z)<q.r))return false;
    return true;
  });
  // Бочки и ящики вдоль дороги (на проезжей части и обочине)
  const rr=rng(seed+4242);
  for(const road of roads){
    let next=rr()*20; // расстояние до следующей группы
    for(let i=0;i<road.length-1;i++){
      const ax=road[i][0],az=road[i][1],bx=road[i+1][0],bz=road[i+1][1],L=Math.hypot(bx-ax,bz-az)||1,ux=(bx-ax)/L,uz=(bz-az)/L;
      while(next<L){
        const cx=ax+ux*next,cz=az+uz*next,n=1+(rr()<.45?1:0)+(rr()<.15?1:0);
        for(let k=0;k<n;k++){
          const side=(rr()<.5?-1:1)*(.8+rr()*3.8),al=(rr()-.5)*2.4,x=cx-uz*side+ux*al,z=cz+ux*side+uz*al,h=heightAt(x,z);
          if(h<1.4||mons.some(m=>Math.hypot(x-m.x,z-m.z)<m.pr))continue;
          res.push([id++,rr()<.62?'barrel':'crate',+x.toFixed(2),+h.toFixed(2),+z.toFixed(2)]);
        }
        next+=16+rr()*22;
      }
      next-=L;
    }
  }
  return{res,zones,monuments:mons,roads,crates:allCrateSpots(mons).map((c,i)=>({id:i+1,...c}))};
}
