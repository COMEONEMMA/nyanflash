import * as THREE from './three.module.min.js';

/* =========================================================
   냥플 디펜스 (prototype)
   pastel voxel staircase, animal towers vs wild predators
   ========================================================= */
const $ = id => document.getElementById(id);
const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------------- map ---------------- */
const MAP_W = 11, MAP_D = 16;
const WAYPOINTS = [[1, 15], [1, 11], [9, 11], [9, 7], [1, 7], [1, 3], [5, 3], [5, 1]];
const BASE_TILE = [5, 0];
function expandPath(wp){
  const out = [];
  for (let i = 0; i < wp.length - 1; i++){
    const [x0, z0] = wp[i], [x1, z1] = wp[i + 1];
    const dx = Math.sign(x1 - x0), dz = Math.sign(z1 - z0);
    let x = x0, z = z0;
    while (x !== x1 || z !== z1){ out.push([x, z]); x += dx; z += dz; }
  }
  out.push(wp[wp.length - 1]);
  return out;
}
const PATH = expandPath(WAYPOINTS);
const PATH_H = PATH.map((_, i) => 1 + Math.floor(i / 3));
const hash = (x, z) => { let h = (x * 374761393 + z * 668265263) ^ 0x5bd1e995; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

const TILE = [];   // TILE[z][x] = { type, h, near (path index), elev }
for (let z = 0; z < MAP_D; z++){
  TILE.push([]);
  for (let x = 0; x < MAP_W; x++) TILE[z].push({ type:'void', h:0, near:-1, elev:0 });
}
PATH.forEach(([x, z], i) => { TILE[z][x] = { type:'path', h:PATH_H[i], near:i, elev:0, step:i }; });
const CX = (MAP_W - 1) / 2, CZ = (MAP_D - 1) / 2;
/* winding mountain road: the ground climbs with the road like a hill-climb course.
   Everything on the downhill (front) or outer side of the road is always LOWER than the road,
   so from the default view nothing ever stands in front of the route. Uphill ground overlooks the road below. */
{
  const isPath = (x, z) => z >= 0 && z < MAP_D && x >= 0 && x < MAP_W && TILE[z][x].type === 'path';
  const H = [];
  const baseH = PATH_H[PATH_H.length - 1];
  for (let z = 0; z < MAP_D; z++){ H.push([]); for (let x = 0; x < MAP_W; x++) H[z].push(null); }
  for (let x = 0; x < MAP_W; x++) for (let z = 0; z < MAP_D; z++){
    if (isPath(x, z)){ H[z][x] = TILE[z][x].h; continue; }
    let f = null, df = 0, b = null, db = 0;
    for (let k = z + 1; k < MAP_D; k++) if (isPath(x, k)){ f = TILE[k][x].h; df = k - z; break; }
    for (let k = z - 1; k >= 0; k--) if (isPath(x, k)){ b = TILE[k][x].h; db = z - k; break; }
    // the slope climbs steeply right above each road (overlook spots), then the next road's rule trims it
    if (f != null && b != null) H[z][x] = Math.max(f + (b - f) * df / (df + db), f + 2 * df);
    else if (b != null) H[z][x] = b - db * 1.1;                 // below the lowest road: falls away toward the viewer
    else if (f != null) H[z][x] = Math.min(baseH + 1, f + df * 1.3); // above the top road: rises to the summit
  }
  // columns with no road at all are the valley edges
  for (let z = 0; z < MAP_D; z++) for (let x = 0; x < MAP_W; x++){
    if (H[z][x] != null) continue;
    let n = null, bd = 99;
    for (let k = 0; k < MAP_W; k++) if (H[z][k] != null && Math.abs(k - x) < bd){ bd = Math.abs(k - x); n = H[z][k]; }
    H[z][x] = (n ?? 1) - 1.5 * bd;
  }
  // hard rule: never higher than a road that sits behind it, or beside it on the inner side
  for (let z = 0; z < MAP_D; z++) for (let x = 0; x < MAP_W; x++){
    if (isPath(x, z)) continue;
    let h = Math.round(H[z][x]);
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++){
      const px = x + dx, pz = z + dz;
      if (!isPath(px, pz)) continue;
      const ph = TILE[pz][px].h, d = Math.max(Math.abs(dx), Math.abs(dz));
      const behind = pz < z, outer = pz === z && Math.abs(x - CX) > Math.abs(px - CX);
      if ((behind || outer) && d === 1) h = Math.min(h, ph - 1);
      else if (behind && d === 2) h = Math.min(h, ph + 1);   // two rows ahead it may peek one block above: still can't hide the road at this pitch
    }
    // ...and a little jitter so it reads as a hillside, not a ramp
    if (hash(x * 5 + 1, z * 3 + 2) > 0.8) h -= 1;
    H[z][x] = clamp(h, 1, 15);
  }
  for (let z = 0; z < MAP_D; z++) for (let x = 0; x < MAP_W; x++){
    if (isPath(x, z)) continue;
    let best = 99;
    PATH.forEach(([px, pz]) => { best = Math.min(best, Math.max(Math.abs(px - x), Math.abs(pz - z))); });
    // height bonus = how far it looks DOWN onto any road within two blocks
    let elev = -9, near = -1;
    PATH.forEach(([px, pz], i) => { if (Math.max(Math.abs(px - x), Math.abs(pz - z)) <= Math.max(2, best) && H[z][x] - PATH_H[i] > elev){ elev = H[z][x] - PATH_H[i]; near = i; } });
    const r = hash(x, z);
    const type = best === 1 || (best === 2 && r < 0.35) ? 'build' : 'land';
    TILE[z][x] = { type, h:H[z][x], near, elev, dist:best };
  }
}
{ const [bx, bz] = BASE_TILE; TILE[bz][bx] = { type:'base', h:PATH_H[PATH_H.length - 1], near:PATH.length - 1, elev:0 }; }
const MAX_H = Math.max(...PATH_H) + 3;
const wx = x => x - CX, wz = z => z - CZ;

/* ---------------- definitions ---------------- */
const TYPES = {
  cat: { name:'고양이', cost:50, air:true, role:'연사 · 공중 가능',
    lv:[ { dmg:6, rate:2.2, range:2.6 }, { dmg:14, rate:2.6, range:2.8 } ],
    br:{ a:{ name:'사자', dmg:55, rate:1.0, range:3.0, stun:0.25, desc:'한 방이 묵직한 맹수. 맞은 적이 잠깐 멈칫해요.' },
         b:{ name:'닌자 고양이', dmg:11, rate:5, range:2.8, crit:0.2, desc:'눈에 안 보이는 연사. 20% 확률 치명타.' } } },
  dog: { name:'강아지', cost:70, air:false, role:'근접 광역 · 넉백',
    lv:[ { dmg:20, rate:1.0, range:1.5, kb:0.25, splash:0.6 }, { dmg:45, rate:1.1, range:1.6, kb:0.3, splash:0.7 } ],
    br:{ a:{ name:'도베르만', dmg:120, rate:1.1, range:1.7, kb:0.55, splash:0.8, desc:'강한 넉백으로 계단 아래로 밀어내요.' },
         b:{ name:'세인트버나드', dmg:55, rate:1.2, range:1.7, kb:0.2, splash:0.9, stun:0.7, desc:'물 때마다 적을 붙잡아 기절시켜요.' } } },
  rabbit: { name:'토끼', cost:90, air:true, role:'저격 · 공중 가능',
    lv:[ { dmg:32, rate:0.6, range:4.2 }, { dmg:75, rate:0.65, range:4.6 } ],
    br:{ a:{ name:'스나이퍼 토끼', dmg:260, rate:0.5, range:6.0, desc:'맵 반대편까지 닿는 한 방.' },
         b:{ name:'연발 토끼', dmg:48, rate:2.2, range:4.6, desc:'당근을 쉴 새 없이 던져요.' } } },
  penguin: { name:'펭귄', cost:80, air:false, role:'광역 둔화',
    lv:[ { dmg:5, rate:0.9, range:2.4, aoe:0.9, slow:0.35 }, { dmg:12, rate:1.0, range:2.6, aoe:1.0, slow:0.45 } ],
    br:{ a:{ name:'황제펭귄', dmg:20, rate:1.0, range:3.0, aoe:1.6, slow:0.55, desc:'넓은 범위를 꽁꽁 느리게.' },
         b:{ name:'얼음술사 펭귄', dmg:30, rate:1.0, range:2.8, aoe:1.0, slow:0.45, freeze:0.3, desc:'30% 확률로 적을 얼려서 멈춰요.' } } },
};
/* specialists unlocked by progress; picked into a 5-slot deck before each run */
Object.assign(TYPES, {
  hamster: { name:'햄스터', cost:60, air:false, role:'경제 · 웨이브마다 코인', special:true, lvName:['햄스터', '저금 햄스터', '부자 햄스터'],
    lv:[ { dmg:4, rate:1.2, range:2.0, income:12 }, { dmg:8, rate:1.3, range:2.1, income:28 }, { dmg:16, rate:1.4, range:2.2, income:60 } ],
    unlock:{ text:'아무 모드 4웨이브 도달', check:(m, w) => w >= 4 } },
  owl: { name:'부엉이', cost:100, air:true, role:'지원 · 주변 강화', special:true, lvName:['부엉이', '박사 부엉이', '현자 부엉이'],
    lv:[ { dmg:10, rate:1.0, range:3.2, aura:[0.12, 0.10] }, { dmg:22, rate:1.1, range:3.5, aura:[0.18, 0.15] }, { dmg:48, rate:1.2, range:3.9, aura:[0.25, 0.22] } ],
    unlock:{ text:'아무 모드 7웨이브 도달', check:(m, w) => w >= 7 } },
  bear: { name:'곰', cost:120, air:false, role:'광역 내려찍기 · 기절', special:true, lvName:['곰', '불곰', '대왕곰'],
    lv:[ { dmg:40, rate:0.6, range:1.6, aoe:1.0, stun:0.4 }, { dmg:90, rate:0.65, range:1.7, aoe:1.2, stun:0.6 }, { dmg:210, rate:0.7, range:1.8, aoe:1.5, stun:0.9 } ],
    unlock:{ text:'노말 클리어', check:(m, w, win) => win && m === 'normal' } },
  hedgehog: { name:'고슴도치', cost:70, air:false, role:'계단 위 가시 함정', special:true, onPath:true, lvName:['고슴도치', '밤송이 고슴도치', '강철 고슴도치'],
    lv:[ { dmg:14, rate:4, range:0.75, slow:0.2 }, { dmg:32, rate:4, range:0.8, slow:0.3 }, { dmg:75, rate:4, range:0.85, slow:0.4 } ],
    unlock:{ text:'하드 5웨이브 도달', check:(m, w) => m === 'hard' && w >= 5 } },
  raccoon: { name:'너구리 딜러', cost:90, air:true, role:'주사위 공격 · 옆 동물 대박 치명타', special:true, lvName:['너구리 딜러', '타짜 너구리', '카지노 너구리'],
    lv:[ { dmg:10, rate:1.2, range:2.8, luck:0.05 }, { dmg:22, rate:1.3, range:3.0, luck:0.08 }, { dmg:40, rate:1.4, range:3.2, luck:0.12, lucky:true } ],
    unlock:{ text:'룰렛 누적 8번 돌리기', check:() => spinCount >= 8 } },
});
const BASIC = ['cat', 'dog', 'rabbit', 'penguin'];
const unlocked = new Set(store0('nyandef-unlock', []));
let spinCount = store0('nyandef-spins', 0);
function store0(k, d){ try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch(e){ return d; } }
const isOpen = t => !TYPES[t].special || unlocked.has(t);
let deck = store0('nyandef-deck', BASIC.slice()).filter(t => TYPES[t] && isOpen(t)).slice(0, 5);
if (deck.length < 3) deck = BASIC.slice();
function checkUnlocks(win){
  Object.entries(TYPES).forEach(([k, T]) => {
    if (!T.special || unlocked.has(k)) return;
    if (T.unlock.check(G.mode, G.wave, win)){
      unlocked.add(k);
      try { localStorage.setItem('nyandef-unlock', JSON.stringify([...unlocked])); } catch(e){}
      setTimeout(() => { toast('새 동물 해금! ' + T.name, T.role + ' · 다음 판부터 덱에 넣을 수 있어요', true); SFX.hidden(); }, 1400);
    }
  });
}

const HIDDEN = {
  moon: { base:'rabbit', name:'달토끼', desc:'하늘을 지배하는 저격수. 공중 적에게 피해 2배.', hint:'높은 곳의 토끼가 하늘의 적을 많이 잡으면…' },
  catdog: { base:'dog', name:'냥멍이', desc:'고양이 탈을 쓴 개. 강아지인데 연사도 하고 공중도 물어요.', hint:'고양이 곁을 오래 지킨 강아지는…' },
  witch: { base:'cat', name:'마녀냥', desc:'저주 마법 고양이. 맞은 적이 받는 피해가 늘어나요.', hint:'가장 높은 곳에서 오래 버틴 고양이는…' },
  aurora: { base:'penguin', name:'오로라 펭귄', desc:'극지방의 빛. 범위와 둔화가 크게 늘어나요.', hint:'수많은 적에게 눈덩이를 맞힌 펭귄은…' },
};
/* secret second transformation: feed the right partner to a hidden unit */
const AWAKE = {
  moon: { name:'은하토끼', mat:'penguin', minLv:2, desc:'별똥별을 떨어뜨려 주변을 한꺼번에 날려요.', hint:'달토끼가 차가운 친구를 만나면…' },
  catdog: { name:'냥멍대장', mat:'cat', minLv:3, desc:'짖을 때마다 주변 적까지 기절. 공격속도 더 빠르게.', hint:'냥멍이가 최강의 고양이를 만나면…' },
  witch: { name:'대마녀냥', mat:'penguin', minLv:3, desc:'강력한 저주. 맞은 적은 피해를 훨씬 더 받아요.', hint:'마녀냥이 얼음 마법사를 만나면…' },
  aurora: { name:'극광 황제', mat:'rabbit', minLv:2, desc:'거대한 오로라로 넓은 범위를 얼려요.', hint:'오로라 펭귄이 하늘을 보는 친구를 만나면…' },
};
const FOES = {
  fox:  { name:'여우', hp:30, speed:1.7, reward:6, dmg:1, dodge:0.2 },
  wolf: { name:'늑대', hp:55, speed:1.1, reward:8, dmg:1, pack:true },
  croc: { name:'악어', hp:230, speed:0.55, reward:18, dmg:3, armor:4 },
  hawk: { name:'매', hp:42, speed:1.35, reward:9, dmg:1, fly:true },
  boss: { name:'늑대왕', hp:2600, speed:0.42, reward:200, dmg:10, armor:3, boss:true },
};
const WAVES = [
  [{ t:'fox', n:8, gap:1.1 }],
  [{ t:'fox', n:10, gap:0.9 }, { t:'wolf', n:4, gap:1.2, at:4 }],
  [{ t:'wolf', n:10, gap:0.55 }],
  [{ t:'fox', n:12, gap:0.7 }, { t:'croc', n:2, gap:3, at:3 }],
  [{ t:'hawk', n:6, gap:1.4 }, { t:'fox', n:8, gap:0.8, at:1 }],
  [{ t:'wolf', n:12, gap:0.5 }, { t:'croc', n:3, gap:2.5, at:2 }],
  [{ t:'hawk', n:10, gap:0.9 }, { t:'wolf', n:8, gap:0.6, at:3 }],
  [{ t:'croc', n:5, gap:1.8 }, { t:'fox', n:16, gap:0.5, at:1 }],
  [{ t:'wolf', n:12, gap:0.45 }, { t:'hawk', n:8, gap:0.9, at:2 }, { t:'croc', n:4, gap:2, at:5 }],
  [{ t:'boss', n:1, gap:1 }, { t:'fox', n:12, gap:0.7, at:3 }, { t:'hawk', n:6, gap:1, at:8 }],
];
const CARDS = [
  { id:'catspd', icon:'🐱', name:'발톱 갈기', desc:'고양이 공격속도 +25%' },
  { id:'rabrng', icon:'🐰', name:'망원 당근', desc:'토끼 사거리 +20%' },
  { id:'dogkb', icon:'🐶', name:'든든한 뒷발', desc:'강아지 넉백 +60%, 공격력 +15%' },
  { id:'pengslow', icon:'🐧', name:'눈보라', desc:'펭귄 둔화 +12%p, 범위 +15%' },
  { id:'alldmg', icon:'⚔', name:'다 같이 힘내!', desc:'모든 동물 공격력 +12%' },
  { id:'coin', icon:'🪙', name:'보물 냄새', desc:'처치 코인 +25%' },
  { id:'hp', icon:'❤', name:'창고 보강', desc:'기지 체력 +6 (최대치도 +6)' },
  { id:'height', icon:'⛰', name:'높은 곳이 좋아', desc:'높이 보너스 2배' },
  { id:'interest', icon:'🏦', name:'저금통', desc:'웨이브 시작마다 보유 코인 10% 이자 (최대 40)' },
  { id:'discount', icon:'🏷', name:'단골 할인', desc:'배치 비용 -15%' },
  { id:'charm', icon:'🧿', name:'보호 부적', desc:'강화 실패 때 단계 하락·파괴를 막는 부적 2장' },
  { id:'luck', icon:'🍀', name:'행운의 동전', desc:'강화 성공 확률 +8%p' },
];

/* ---------------- state ---------------- */
const G = {};
function resetState(){
  const mode = G.mode || 'normal';
  Object.assign(G, { mode, coins: mode === 'hard' ? 130 : 140, hp:20, maxHp:20, wave:0, state:'build', kills:0, speed:1, paused:false, modal:false, autoT: 15,
    mods:{ catspd:1, rabrng:1, dogkb:1, dogdmg:1, pengslow:0, pengaoe:1, alldmg:1, coin:1, height:1, interest:false, discount:1 },
    taken:{}, spawnQ:[], waveT:0, leaks:0, armed:null, selTile:null, selUnit:null, hover:null, drag:null,
    spun:false, buffWave:0, curseWave:0, charms:1, useCharm:true, enhBonus:0, group:[] });
}
resetState();
const store = {
  get(k, d){ try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} },
};
const discovered = new Set(store.get('nyandef-found', []));
function discover(key){ if (!discovered.has(key)){ discovered.add(key); store.set('nyandef-found', [...discovered]); } }

/* ---------------- renderer / scene ---------------- */
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:false, alpha:true, powerPreference:'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
const PITCH0 = 0.78;
let camAngle = Math.PI / 4, camAngleTarget = camAngle, zoom = 1.05, camPitch = PITCH0, camPitchTarget = PITCH0;
const camTarget = new THREE.Vector3(0, MAX_H * 0.36, 0.5);
let PIX = 2;
// dot size in CSS px (1 sharp · 2 normal · 3 retro). Each render pixel always covers a whole number of
// device pixels, so dots stay perfectly square and crisp at any window size instead of smearing.
let pixLevel = 2;
try { const v = +localStorage.getItem('nyandef-pix'); if (v >= 1 && v <= 3) pixLevel = v; } catch(e){}
function resize(){
  const w = innerWidth, h = innerHeight, dpr = devicePixelRatio || 1;
  const s = Math.max(1, Math.round(pixLevel * (w < 700 ? 0.75 : 1) * dpr));
  PIX = s / dpr;
  const bw = Math.ceil(w * dpr / s), bh = Math.ceil(h * dpr / s);
  renderer.setPixelRatio(1);
  renderer.setSize(bw, bh, false);
  canvas.style.width = (bw * s / dpr) + 'px'; canvas.style.height = (bh * s / dpr) + 'px';
  const aspect = bw / bh;
  const viewH = (aspect < 0.9 ? 32 : 25) / zoom;
  camera.left = -viewH * aspect / 2; camera.right = viewH * aspect / 2;
  camera.top = viewH / 2; camera.bottom = -viewH / 2;
  camera.updateProjectionMatrix();
}
function placeCamera(){
  const R = 40;
  const hr = Math.cos(camPitch) * R;
  camera.position.set(camTarget.x + Math.cos(camAngle) * hr, camTarget.y + Math.sin(camPitch) * R, camTarget.z + Math.sin(camAngle) * hr);
  camera.lookAt(camTarget);
}
addEventListener('resize', resize);
resize(); placeCamera();

scene.add(new THREE.HemisphereLight(0xfff4fb, 0xb9a6c9, 1.35));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(14, 30, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
const sc = sun.shadow.camera; sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 80;
sun.shadow.bias = -0.0015;
scene.add(sun, sun.target);

/* pixel noise texture: gives every block a hand-placed "block game" grain */
function blockTexture(edge = 0.8, noise = 0.05, stripes = false){
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const g = c.getContext('2d');
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++){
    let v = 1 - Math.random() * noise;
    if (stripes && (y === 5 || y === 10)) v *= 0.9;
    if (x === 0 || y === 0 || x === 15 || y === 15) v *= edge;
    const k = Math.round(v * 255);
    g.fillStyle = `rgb(${k},${k},${k})`; g.fillRect(x, y, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------------- world blocks ---------------- */
// stairs are vivid candy colours; platforms stay creamy white so the climbing route reads at a glance
const STEP_COLS = ['#ff8fb8', '#ffd84d', '#5fd4a8', '#a98bf0', '#5fb8f0', '#ff9f6b'];
const TOP_COLS = ['#fffaf2', '#f7f0e6', '#f1ecf7', '#eef6f1'];
const WALL_A = new THREE.Color('#f4e7d4'), WALL_B = new THREE.Color('#ead9c1');
const LAND_COLS = ['#b9e3a0', '#a9dc95', '#c4e8ad', '#b2deb0'];
const ROCK_A = new THREE.Color('#d8cbb8'), ROCK_B = new THREE.Color('#cdbfa9');
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const blockMat = new THREE.MeshLambertMaterial({ map: blockTexture() });
const stepMat = new THREE.MeshLambertMaterial({ map: blockTexture(0.72, 0.04, true) });
/* screen-door see-through: blocks standing between the camera and the stairs/animals get dithered away
   (pixel checkerboard, no sorting needed) so nothing important is ever hidden behind a tall column */
function ditherable(m){
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFade;\nvarying float vFade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vFade;
float bayer4(vec2 q){ q = mod(floor(q), 4.0); int i = int(q.x) + int(q.y) * 4;
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.); return (m[i] + 0.5) / 16.0; }`)
      .replace('void main() {', 'void main() {\n  if (vFade > 0.01 && bayer4(gl_FragCoord.xy) < vFade * 0.78) discard;');
  };
}
ditherable(blockMat); ditherable(stepMat);
let wallCount = 0, stepCount = 0;
for (let z = 0; z < MAP_D; z++) for (let x = 0; x < MAP_W; x++){
  const t = TILE[z][x]; if (t.type === 'void') continue;
  wallCount += t.h - (t.type === 'path' ? 1 : 0);
  if (t.type === 'path') stepCount++;
}
const walls = new THREE.InstancedMesh(boxGeo.clone(), blockMat, wallCount);
const steps = new THREE.InstancedMesh(boxGeo.clone(), stepMat, stepCount);
const fadeAttr = { w: new THREE.InstancedBufferAttribute(new Float32Array(wallCount), 1), s: new THREE.InstancedBufferAttribute(new Float32Array(stepCount), 1) };
walls.geometry.setAttribute('aFade', fadeAttr.w); steps.geometry.setAttribute('aFade', fadeAttr.s);
const fadeGoal = { w: new Float32Array(wallCount), s: new Float32Array(stepCount) };
const colBlocks = [];   // per column (z*MAP_W+x): [[kind 'w'|'s', instance, y], ...]
const instY = { w: new Int16Array(wallCount), s: new Int16Array(stepCount) };
walls.castShadow = walls.receiveShadow = steps.castShadow = steps.receiveShadow = true;
const instTile = { walls:[], steps:[] };
{
  const m = new THREE.Matrix4(), col = new THREE.Color();
  let wi = 0, si = 0;
  for (let z = 0; z < MAP_D; z++) for (let x = 0; x < MAP_W; x++){
    const t = TILE[z][x]; if (t.type === 'void') continue;
    const top = t.h - 1;
    for (let y = 0; y <= top; y++){
      m.makeTranslation(wx(x), y + 0.5, wz(z));
      if (t.type === 'path' && y === top){
        col.set(STEP_COLS[Math.floor(t.step / 3) % STEP_COLS.length]);
        steps.setMatrixAt(si, m); steps.setColorAt(si, col); instTile.steps[si] = [x, z];
        (colBlocks[z * MAP_W + x] ||= []).push(['s', si, y]); instY.s[si] = y; si++;
      } else {
        if (y === top) col.set(t.type === 'base' ? '#ffe58a' : t.type === 'land' ? LAND_COLS[Math.floor(hash(x * 7, z * 2) * LAND_COLS.length)] : TOP_COLS[Math.floor(hash(x * 3, z * 5) * TOP_COLS.length)]);
        else if (t.type === 'land') col.copy(y % 2 ? ROCK_A : ROCK_B);
        else col.copy(y % 2 ? WALL_A : WALL_B);
        walls.setMatrixAt(wi, m); walls.setColorAt(wi, col); instTile.walls[wi] = [x, z];
        (colBlocks[z * MAP_W + x] ||= []).push(['w', wi, y]); instY.w[wi] = y; wi++;
      }
    }
  }
}
scene.add(walls, steps);

/* hillside dressing: little voxel pines and flowers on the grass (never on the downhill side of a road) */
{
  const trunkM = new THREE.MeshLambertMaterial({ color:'#a9714a' });
  const leafCols = ['#5fbf7a', '#4fae6c', '#7fd08a'];
  const flowerCols = ['#ff8fb8', '#ffd84d', '#ffffff', '#a98bf0'];
  for (let z = 0; z < MAP_D; z++) for (let x = 0; x < MAP_W; x++){
    const t = TILE[z][x]; if (t.type !== 'land') continue;
    const r = hash(x * 11 + 3, z * 13 + 7);
    let inFront = false;
    PATH.forEach(([px, pz]) => { if (pz < z && Math.abs(px - x) <= 3 && z - pz <= 4) inFront = true; });
    const g = new THREE.Group(); g.position.set(wx(x), t.h, wz(z));
    if (!inFront && r < 0.45){
      const tr = new THREE.Mesh(boxGeo, trunkM); tr.scale.set(0.16, 0.3, 0.16); tr.position.y = 0.15; g.add(tr);
      const lc = leafCols[Math.floor(r * 10) % 3];
      [[0.62, 0.34, 0.42], [0.44, 0.3, 0.7], [0.24, 0.24, 0.95]].forEach(([w, hh, y]) => { const m = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color:lc })); m.scale.set(w, hh, w); m.position.y = y; m.castShadow = true; g.add(m); });
      g.rotation.y = r * 6; g.scale.setScalar(0.75 + r * 0.6);
    } else if (r > 0.6){
      for (let i = 0; i < 3; i++){ const m = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color:flowerCols[(i + Math.floor(r * 7)) % 4] })); m.scale.setScalar(0.09); m.position.set(Math.cos(i * 2.1 + r * 9) * 0.25, 0.05, Math.sin(i * 2.1 + r * 9) * 0.25); g.add(m); }
    } else continue;
    scene.add(g);
  }
}

/* outline rails along both edges of the climbing route, plus little arrows showing direction */
{
  const railMat = new THREE.MeshLambertMaterial({ color:'#2b2147' });
  const arrowMat = new THREE.MeshBasicMaterial({ color:'#ffffff', transparent:true, opacity:0.85 });
  const rails = [], arrows = [];
  PATH.forEach(([x, z], i) => {
    const h = PATH_H[i];
    const prev = PATH[i - 1], next = PATH[i + 1];
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dz]) => {
      const nx = x + dx, nz = z + dz;
      const open = (prev && prev[0] === nx && prev[1] === nz) || (next && next[0] === nx && next[1] === nz) || (i === 0 && dz === 1) || (i === PATH.length - 1 && dz === -1);
      if (open) return;
      rails.push([wx(x) + dx * 0.47, h + 0.05, wz(z) + dz * 0.47, dx !== 0]);
    });
    if (next && i % 2 === 0){
      const dx = next[0] - x, dz = next[1] - z;
      arrows.push([wx(x), h + 0.02, wz(z), Math.atan2(dx, dz)]);
    }
  });
  const ri = new THREE.InstancedMesh(boxGeo, railMat, rails.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  rails.forEach(([x, y, z, vert], i) => { sc.set(vert ? 0.07 : 1.0, 0.1, vert ? 1.0 : 0.07); m.compose(pos.set(x, y, z), q.identity(), sc); ri.setMatrixAt(i, m); });
  ri.castShadow = false; ri.receiveShadow = true; scene.add(ri);
  const ai = new THREE.InstancedMesh(boxGeo, arrowMat, arrows.length * 2);
  arrows.forEach(([x, y, z, yaw], i) => {
    [-1, 1].forEach((side, j) => {
      q.setFromEuler(new THREE.Euler(0, yaw + side * 0.75, 0));
      const off = new THREE.Vector3(side * 0.09, 0, -0.05).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      m.compose(pos.set(x + off.x, y, z + off.z), q, sc.set(0.06, 0.02, 0.3));
      ai.setMatrixAt(i * 2 + j, m);
    });
  });
  scene.add(ai);
}
/* coverage overlay: path tiles inside the range light up while placing */
const coverMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ color:0x22e06a, transparent:true, opacity:0.72, depthWrite:false }), PATH.length);
coverMesh.renderOrder = 5; coverMesh.frustumCulled = false; scene.add(coverMesh);
const coverM = new THREE.Matrix4(), coverQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), coverS = new THREE.Vector3(), coverP = new THREE.Vector3();
let coverKey = '';
function showCover(x, z, range){
  const key = x + ',' + z + ',' + range.toFixed(2);
  if (key === coverKey) return;
  coverKey = key;
  let n = 0;
  PATH.forEach(([px, pz], i) => {
    const inR = range > 0 && Math.hypot(px - x, pz - z) <= range;
    if (inR) n++;
    coverS.setScalar(inR ? 1 : 0.0001);
    coverM.compose(coverP.set(wx(px), PATH_H[i] + 0.07, wz(pz)), coverQ, coverS);
    coverMesh.setMatrixAt(i, coverM);
  });
  coverMesh.instanceMatrix.needsUpdate = true;
  coverMesh.visible = range > 0;
  return n;
}
function coverCount(x, z, range){ return PATH.reduce((a, [px, pz]) => a + (Math.hypot(px - x, pz - z) <= range ? 1 : 0), 0); }
/* height / sweet-spot badges shown only while placing */
const badgeTex = {};
function badgeTexture(label, color){
  const k = label + color;
  if (badgeTex[k]) return badgeTex[k];
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 34px Galmuri, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = '#2b2147'; g.strokeText(label, 32, 34);
  g.fillStyle = color; g.fillText(label, 32, 34);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  return (badgeTex[k] = t);
}
const badges = [];
const badgeLayer = document.createElement('div'); badgeLayer.id = 'badges'; document.body.appendChild(badgeLayer);
for (let z = 0; z < MAP_D; z++) for (let x = 0; x < MAP_W; x++){
  const t = TILE[z][x]; if (t.type !== 'build') continue;
  const el = document.createElement('span'); el.className = 'bdg'; badgeLayer.appendChild(el);
  badges.push({ el, x, z, elev:t.elev, pos: new THREE.Vector3(wx(x), t.h + 0.15, wz(z)), sp:{ visible:false, material:{} } });
}
let badgeType = null, badgesOn = false;
const bv = new THREE.Vector3();
function updateBadges(show, type){
  if (!show){ if (badgesOn){ badgeLayer.style.display = 'none'; badgesOn = false; } badgeType = null; return; }
  if (!badgesOn){ badgeLayer.style.display = 'block'; badgesOn = true; }
  if (type !== badgeType){
    badgeType = type;
    const T = TYPES[type || 'cat'];
    const free = badges.filter(b => !unitAt(b.x, b.z));
    const scored = free.map(b => ({ b, c: coverCount(b.x, b.z, T.lv[0].range * (1 + 0.12 * clamp(b.elev, 0, 3) * G.mods.height)) }));
    scored.sort((a, c) => c.c - a.c);
    const stars = new Set(T.onPath ? [] : scored.slice(0, 5).map(o => o.b));
    badges.forEach(b => {
      const star = stars.has(b), lab = star ? '★' + (b.elev > 0 ? '+' + Math.min(3, b.elev) : '') : b.elev > 0 ? '+' + Math.min(3, b.elev) : '';
      b.el.textContent = lab;
      b.el.className = 'bdg' + (star ? ' star' : b.elev >= 3 ? ' e3' : b.elev === 2 ? ' e2' : '');
      b.label = lab;
    });
  }
  const onPath = TYPES[type || 'cat'].onPath;
  badges.forEach(b => {
    const vis = !!b.label && !unitAt(b.x, b.z) && !onPath;
    if (!vis){ if (b.shown){ b.el.style.display = 'none'; b.shown = false; } return; }
    bv.copy(b.pos).project(camera);
    b.el.style.display = 'block'; b.shown = true;
    b.el.style.transform = `translate(${(bv.x * 0.5 + 0.5) * innerWidth}px, ${(-bv.y * 0.5 + 0.5) * innerHeight}px) translate(-50%,-50%)`;
  });
}

/* ---------------- voxel model helpers ---------------- */
const matCache = {};
function mat(color, emissive){
  const k = color + (emissive || '');
  if (!matCache[k]) matCache[k] = new THREE.MeshLambertMaterial({ color, emissive: emissive || 0x000000 });
  return matCache[k];
}
function vox(group, w, h, d, color, x, y, z, emissive){
  const m = new THREE.Mesh(boxGeo, mat(color, emissive));
  m.scale.set(w, h, d); m.position.set(x, y, z);
  m.castShadow = true;
  group.add(m);
  return m;
}
/* cute face on a head whose front is +z: eyes, blush, nose */
function face(g, hy, hz, hw, opt = {}){
  const ex = hw * 0.24, ey = hy + (opt.eyeY || 0.02);
  [-1, 1].forEach(s => {
    vox(g, 0.075, 0.1, 0.03, opt.eye || '#2a1d2a', s * ex, ey, hz);
    vox(g, 0.03, 0.03, 0.02, '#ffffff', s * ex - 0.015 * s, ey + 0.03, hz + 0.012);
    if (opt.blush !== false) vox(g, 0.07, 0.035, 0.02, '#ff9fbf', s * (ex + 0.07), ey - 0.07, hz);
  });
  if (opt.nose) vox(g, 0.05, 0.035, 0.03, opt.nose, 0, ey - 0.06, hz + 0.01);
}

function makeAnimal(type, level = 1, branch = null, hidden = null, awake = false){
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body); g.userData.body = body;
  const legs = [];
  const leg = (c, x, z) => { const l = vox(body, 0.09, 0.12, 0.09, c, x, 0.06, z); legs.push(l); };
  if (type === 'cat'){
    let c = '#f2a65a', d = '#d9803a', belly = '#fff1df';
    if (branch === 'a'){ c = '#f0c060'; d = '#c9952b'; }
    if (branch === 'b'){ c = '#4a4058'; d = '#2e2738'; belly = '#bdb3cc'; }
    if (hidden === 'witch'){ c = '#3a2f4a'; d = '#241c30'; belly = '#cdbbe8'; branch = null; }
    vox(body, 0.36, 0.26, 0.42, c, 0, 0.25, -0.02);
    vox(body, 0.22, 0.18, 0.04, belly, 0, 0.23, 0.19);
    vox(body, 0.44, 0.38, 0.38, c, 0, 0.56, 0.06);
    if (branch === 'a') vox(body, 0.6, 0.52, 0.2, '#b5651d', 0, 0.56, -0.08);
    vox(body, 0.11, 0.12, 0.08, c, -0.15, 0.8, 0.06); vox(body, 0.11, 0.12, 0.08, c, 0.15, 0.8, 0.06);
    vox(body, 0.05, 0.06, 0.03, '#ff9fbf', -0.15, 0.79, 0.105); vox(body, 0.05, 0.06, 0.03, '#ff9fbf', 0.15, 0.79, 0.105);
    if (branch !== 'b'){ vox(body, 0.06, 0.03, 0.2, d, 0, 0.755, 0.08); vox(body, 0.06, 0.03, 0.14, d, -0.1, 0.755, 0.05); vox(body, 0.06, 0.03, 0.14, d, 0.1, 0.755, 0.05); }
    if (branch === 'b') vox(body, 0.46, 0.08, 0.4, '#e04a5a', 0, 0.62, 0.06);
    vox(body, 0.18, 0.09, 0.03, belly, 0, 0.47, 0.255);
    face(body, 0.58, 0.255, 0.44, { nose:'#ff7aa2', eye: branch === 'b' ? '#ffe14d' : undefined });
    const tail = vox(body, 0.08, 0.32, 0.08, c, 0.08, 0.42, -0.26); tail.rotation.x = -0.4; g.userData.tail = tail;
    leg(belly, -0.11, 0.12); leg(belly, 0.11, 0.12); leg(c, -0.11, -0.14); leg(c, 0.11, -0.14);
  } else if (type === 'dog'){
    let c = '#c98a4b', d = '#7a4a2a', muz = '#f6e2c4';
    if (branch === 'a'){ c = '#3a2a24'; d = '#a8592c'; muz = '#a8592c'; }
    if (branch === 'b'){ c = '#f4ece0'; d = '#b5651d'; }
    if (hidden === 'catdog'){ c = '#f2a65a'; d = '#c98a4b'; }
    vox(body, 0.4, 0.28, 0.46, c, 0, 0.26, -0.02);
    if (branch === 'b'){ vox(body, 0.42, 0.18, 0.2, d, 0, 0.32, -0.08); vox(body, 0.14, 0.14, 0.1, '#c98a4b', 0, 0.36, 0.22); }
    vox(body, 0.44, 0.38, 0.38, c, 0, 0.58, 0.06);
    vox(body, 0.22, 0.14, 0.12, muz, 0, 0.5, 0.29);
    vox(body, 0.08, 0.06, 0.04, '#2a1d2a', 0, 0.55, 0.355);
    if (hidden === 'catdog' || branch === 'a'){
      vox(body, 0.11, 0.14, 0.08, hidden === 'catdog' ? '#f2a65a' : c, -0.15, 0.82, 0.06); vox(body, 0.11, 0.14, 0.08, hidden === 'catdog' ? '#f2a65a' : c, 0.15, 0.82, 0.06);
      if (hidden === 'catdog'){ vox(body, 0.06, 0.03, 0.2, '#d9803a', 0, 0.775, 0.08); vox(body, 0.06, 0.03, 0.14, '#d9803a', -0.1, 0.775, 0.05); }
    } else {
      vox(body, 0.1, 0.24, 0.16, d, -0.25, 0.56, 0.04); vox(body, 0.1, 0.24, 0.16, d, 0.25, 0.56, 0.04);
    }
    face(body, 0.64, 0.255, 0.44, {});
    vox(body, 0.07, 0.06, 0.03, '#ff7aa2', 0.04, 0.44, 0.33);
    const tail = vox(body, 0.08, 0.08, 0.2, c, 0, 0.42, -0.3); tail.rotation.x = 0.7; g.userData.tail = tail;
    leg(c, -0.12, 0.13); leg(c, 0.12, 0.13); leg(c, -0.12, -0.15); leg(c, 0.12, -0.15);
  } else if (type === 'rabbit'){
    let c = '#f7f3ec', inner = '#ffb3cb';
    if (branch === 'a') c = '#e9e2d4';
    if (branch === 'b') c = '#f2ddb8';
    if (hidden === 'moon'){ c = '#d9ccff'; inner = '#fff3a0'; }
    vox(body, 0.34, 0.26, 0.36, c, 0, 0.24, -0.02);
    vox(body, 0.42, 0.36, 0.36, c, 0, 0.54, 0.05);
    vox(body, 0.1, 0.34, 0.08, c, -0.1, 0.9, 0.02); vox(body, 0.1, 0.34, 0.08, c, 0.1, 0.9, 0.02);
    vox(body, 0.05, 0.26, 0.02, inner, -0.1, 0.9, 0.065); vox(body, 0.05, 0.26, 0.02, inner, 0.1, 0.9, 0.065);
    face(body, 0.55, 0.235, 0.42, { nose:'#ff7aa2' });
    vox(body, 0.12, 0.1, 0.1, '#ffffff', 0, 0.22, -0.24);
    if (branch === 'a'){ vox(body, 0.46, 0.12, 0.4, '#5f7d3a', 0, 0.76, 0.05); vox(body, 0.06, 0.06, 0.3, '#2a2a2a', 0.2, 0.55, 0.12); }
    if (branch === 'b') vox(body, 0.44, 0.07, 0.38, '#e04a5a', 0, 0.68, 0.05);
    if (hidden === 'moon'){
      const moon = new THREE.Group();
      for (let i = 0; i < 7; i++){ const a = -1.1 + i * 0.37; vox(moon, 0.1, 0.1, 0.06, '#fff3a0', Math.cos(a) * 0.32, Math.sin(a) * 0.32, 0, '#7a6a10'); }
      moon.position.set(0, 0.62, -0.28); body.add(moon); g.userData.halo = moon;
    }
    leg(c, -0.1, 0.12); leg(c, 0.1, 0.12);
  } else if (type === 'penguin'){
    let c = '#2f3446', belly = '#fbfbff';
    if (branch === 'a'){ c = '#3a4058'; }
    if (branch === 'b'){ c = '#3a5f9c'; }
    if (hidden === 'aurora'){ c = '#2f7f86'; branch = null; }
    vox(body, 0.4, 0.5, 0.36, c, 0, 0.33, 0);
    vox(body, 0.3, 0.38, 0.04, belly, 0, 0.3, 0.18);
    vox(body, 0.42, 0.32, 0.36, c, 0, 0.7, 0.02);
    vox(body, 0.3, 0.22, 0.04, belly, 0, 0.68, 0.2);
    if (branch === 'a') vox(body, 0.34, 0.1, 0.05, '#ffcf3f', 0, 0.55, 0.2);
    face(body, 0.72, 0.225, 0.42, { eyeY: 0 });
    vox(body, 0.1, 0.06, 0.1, '#ff9f3f', 0, 0.64, 0.26);
    const wl = vox(body, 0.06, 0.3, 0.2, c, -0.23, 0.38, 0); const wr = vox(body, 0.06, 0.3, 0.2, c, 0.23, 0.38, 0);
    g.userData.wings = [wl, wr];
    vox(body, 0.12, 0.04, 0.14, '#ff9f3f', -0.1, 0.02, 0.06); vox(body, 0.12, 0.04, 0.14, '#ff9f3f', 0.1, 0.02, 0.06);
    if (branch === 'b'){ vox(body, 0.36, 0.08, 0.36, '#6fa8ff', 0, 0.9, 0.02); vox(body, 0.22, 0.12, 0.22, '#6fa8ff', 0, 0.99, 0.02); vox(body, 0.1, 0.12, 0.1, '#bfe0ff', 0, 1.1, 0.02); }
  }
  if (type === 'hamster'){
    const c = '#f5c27a', w2 = '#fff6e6';
    vox(body, 0.4, 0.3, 0.38, c, 0, 0.22, 0);
    vox(body, 0.28, 0.22, 0.04, w2, 0, 0.22, 0.19);
    vox(body, 0.46, 0.34, 0.36, c, 0, 0.5, 0.04);
    vox(body, 0.12, 0.1, 0.1, w2, -0.2, 0.42, 0.18); vox(body, 0.12, 0.1, 0.1, w2, 0.2, 0.42, 0.18);
    vox(body, 0.1, 0.1, 0.06, '#e0a060', -0.15, 0.71, 0.04); vox(body, 0.1, 0.1, 0.06, '#e0a060', 0.15, 0.71, 0.04);
    face(body, 0.53, 0.225, 0.46, { nose:'#ff7aa2' });
    const coin = vox(body, 0.16, 0.16, 0.05, '#ffcf3f', 0, 0.28, 0.25, '#6a4a00'); g.userData.coin = coin;
    leg(w2, -0.12, 0.12); leg(w2, 0.12, 0.12);
  }
  if (type === 'owl'){
    const c = '#9a6a44', f2 = '#ecd7b5';
    vox(body, 0.4, 0.52, 0.36, c, 0, 0.32, 0);
    vox(body, 0.26, 0.34, 0.04, '#d7b98e', 0, 0.28, 0.18);
    vox(body, 0.44, 0.34, 0.36, c, 0, 0.72, 0.02);
    vox(body, 0.36, 0.24, 0.04, f2, 0, 0.72, 0.2);
    [-1, 1].forEach(sd => { vox(body, 0.13, 0.13, 0.03, '#ffffff', sd * 0.09, 0.74, 0.215); vox(body, 0.07, 0.08, 0.03, '#2a1d2a', sd * 0.09, 0.74, 0.23); vox(body, 0.08, 0.12, 0.06, c, sd * 0.15, 0.94, 0.02); });
    vox(body, 0.06, 0.07, 0.06, '#ff9f3f', 0, 0.66, 0.23);
    const wl = vox(body, 0.06, 0.34, 0.24, '#7a5032', -0.23, 0.36, 0); const wr = vox(body, 0.06, 0.34, 0.24, '#7a5032', 0.23, 0.36, 0);
    g.userData.wings = [wl, wr];
    vox(body, 0.1, 0.04, 0.12, '#ff9f3f', -0.09, 0.02, 0.06); vox(body, 0.1, 0.04, 0.12, '#ff9f3f', 0.09, 0.02, 0.06);
    if (level >= 2) vox(body, 0.3, 0.06, 0.04, '#2a2a2a', 0, 0.8, 0.24);
  }
  if (type === 'bear'){
    const c = level >= 3 ? '#6a3f24' : level === 2 ? '#a0522d' : '#8a5a3a', m2 = '#e6c79c';
    vox(body, 0.5, 0.36, 0.5, c, 0, 0.3, -0.02);
    vox(body, 0.3, 0.24, 0.04, m2, 0, 0.3, 0.24);
    vox(body, 0.5, 0.42, 0.42, c, 0, 0.7, 0.06);
    vox(body, 0.13, 0.12, 0.08, c, -0.18, 0.95, 0.04); vox(body, 0.13, 0.12, 0.08, c, 0.18, 0.95, 0.04);
    vox(body, 0.07, 0.06, 0.03, '#ffb3cb', -0.18, 0.94, 0.085); vox(body, 0.07, 0.06, 0.03, '#ffb3cb', 0.18, 0.94, 0.085);
    vox(body, 0.22, 0.14, 0.1, m2, 0, 0.62, 0.3);
    vox(body, 0.08, 0.06, 0.03, '#2a1d2a', 0, 0.67, 0.355);
    face(body, 0.74, 0.275, 0.5, {});
    leg(c, -0.15, 0.14); leg(c, 0.15, 0.14); leg(c, -0.15, -0.16); leg(c, 0.15, -0.16);
  }
  if (type === 'hedgehog'){
    const c = '#e8c9a0', sp = level >= 3 ? '#8a9aa8' : level === 2 ? '#6a4a2a' : '#7a5a3a';
    vox(body, 0.42, 0.2, 0.42, c, 0, 0.12, 0);
    for (let i = 0; i < 9; i++){ const a = (i % 3) - 1, b2 = Math.floor(i / 3) - 1; const spk = vox(body, 0.09, 0.16, 0.09, sp, a * 0.13, 0.28, b2 * 0.12 - 0.04); spk.rotation.x = -0.3 + b2 * 0.3; spk.rotation.z = -a * 0.3; }
    vox(body, 0.2, 0.14, 0.08, c, 0, 0.16, 0.24);
    vox(body, 0.05, 0.04, 0.03, '#2a1d2a', 0, 0.17, 0.29);
    face(body, 0.2, 0.25, 0.3, { blush:true });
  }
  if (type === 'raccoon'){
    const c = '#8d8a92', d = '#3a3640', w2 = '#ece8ef';
    vox(body, 0.4, 0.3, 0.4, c, 0, 0.24, -0.02);
    vox(body, 0.24, 0.22, 0.04, w2, 0, 0.24, 0.19);
    vox(body, 0.46, 0.36, 0.38, c, 0, 0.56, 0.05);
    vox(body, 0.47, 0.1, 0.05, d, 0, 0.6, 0.23);          // bandit mask
    vox(body, 0.2, 0.1, 0.06, w2, 0, 0.5, 0.25);
    vox(body, 0.06, 0.05, 0.03, '#2a1d2a', 0, 0.53, 0.285);
    vox(body, 0.12, 0.12, 0.08, c, -0.16, 0.8, 0.04); vox(body, 0.12, 0.12, 0.08, c, 0.16, 0.8, 0.04);
    vox(body, 0.06, 0.06, 0.03, d, -0.16, 0.8, 0.085); vox(body, 0.06, 0.06, 0.03, d, 0.16, 0.8, 0.085);
    face(body, 0.6, 0.26, 0.45, { eye:'#ffffff' });
    vox(body, 0.16, 0.07, 0.04, level >= 3 ? '#ffcf3f' : '#e04a5a', 0, 0.38, 0.215);   // bow tie
    if (level >= 2){ vox(body, 0.5, 0.04, 0.22, '#2fb36a', 0, 0.76, 0.18); }            // dealer visor
    const tail = new THREE.Group();
    for (let i = 0; i < 4; i++) vox(tail, 0.13, 0.13, 0.1, i % 2 ? d : c, 0, i * 0.02, -i * 0.1);
    tail.position.set(0, 0.3, -0.26); tail.rotation.x = 0.5; body.add(tail); g.userData.tail = tail;
    const die = vox(body, 0.13, 0.13, 0.13, '#ffffff', 0.24, 0.34, 0.14, '#888888');
    vox(body, 0.04, 0.04, 0.02, '#e04a5a', 0.24, 0.34, 0.21);
    leg(c, -0.12, 0.12); leg(c, 0.12, 0.12); leg(c, -0.12, -0.14); leg(c, 0.12, -0.14);
  }
  // hidden / awakened accessories
  if (hidden === 'witch'){
    vox(body, 0.56, 0.05, 0.5, '#5a3a8a', 0, 0.78, 0.06);
    vox(body, 0.32, 0.14, 0.3, '#5a3a8a', 0, 0.86, 0.06); vox(body, 0.2, 0.14, 0.18, '#5a3a8a', 0.03, 0.98, 0.04); vox(body, 0.1, 0.12, 0.1, '#5a3a8a', 0.07, 1.09, 0.02);
    vox(body, 0.33, 0.04, 0.31, awake ? '#ffcf3f' : '#ff9fd6', 0, 0.81, 0.06, awake ? '#5a4200' : undefined);
    vox(body, 0.46, 0.3, 0.06, '#5a3a8a', 0, 0.3, -0.24);
    if (awake){ const orb = new THREE.Group(); vox(orb, 0.16, 0.16, 0.16, '#c9a8ff', 0, 0, 0, '#5a2a9a'); orb.position.set(0.34, 0.75, 0.1); body.add(orb); g.userData.orb = orb; }
  }
  if (hidden === 'aurora'){
    const crest = ['#7af0c8', '#7ac8ff', '#c89aff', '#ff9ad6'];
    crest.forEach((cc, i) => vox(body, 0.07, 0.12 + i * 0.03, 0.07, cc, -0.12 + i * 0.08, 0.92 + i * 0.015, 0.0, '#333333'));
    if (awake){ for (let i = 0; i < 5; i++){ const sh = vox(body, 0.08, 0.16, 0.08, '#bfe8ff', Math.cos(i * 1.26) * 0.45, 0.6 + (i % 2) * 0.15, Math.sin(i * 1.26) * 0.45, '#4a7a9a'); sh.rotation.y = i; } }
  }
  if (hidden === 'moon' && awake){
    body.children.forEach(m => { if (m.material && m.material.color && m.material.color.getHexString() === 'd9ccff') m.material = mat('#4a4a9a'); });
    for (let i = 0; i < 6; i++) vox(body, 0.05, 0.05, 0.05, '#fff3a0', rnd(-0.18, 0.18), rnd(0.2, 0.7), 0.2, '#a08a00');
  }
  if (hidden === 'catdog' && awake){
    vox(body, 0.5, 0.36, 0.05, '#e04a5a', 0, 0.38, -0.27);
  }
  if (awake){
    const aura = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 24), new THREE.MeshBasicMaterial({ color: hidden === 'aurora' ? 0x7af0c8 : hidden === 'witch' ? 0xc9a8ff : hidden === 'moon' ? 0xfff3a0 : 0xffb347, transparent:true, opacity:0.75, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide }));
    aura.rotation.x = -Math.PI / 2; aura.position.y = 0.02; g.add(aura); g.userData.aura = aura;
  }
  // level dressing: bandana for 2, crown for 3
  if (level === 2 && !hidden) vox(body, 0.3, 0.06, 0.08, '#6fa8ff', 0, 0.4, 0.2);
  if (level >= 3 && hidden !== 'witch' && hidden !== 'aurora'){
    const crownY = type === 'rabbit' ? 1.1 : type === 'penguin' ? (branch === 'b' ? 1.18 : 0.9) : type === 'bear' ? 1.0 : type === 'owl' ? 1.0 : type === 'hamster' ? 0.76 : type === 'hedgehog' ? 0.44 : type === 'raccoon' ? 0.86 : 0.86;
    if (!(type === 'rabbit')){
      vox(body, 0.22, 0.06, 0.22, '#ffcf3f', 0, crownY, 0.06, '#5a4200');
      [-1, 0, 1].forEach(i => vox(body, 0.05, 0.07, 0.05, '#ffcf3f', i * 0.08, crownY + 0.06, 0.15, '#5a4200'));
    } else vox(body, 0.36, 0.05, 0.05, '#ffcf3f', 0, 0.75, 0.24, '#5a4200');
  }
  g.userData.legs = legs;
  const s = [0, 1.18, 1.32, 1.48][level] || 1.18;
  g.scale.setScalar(awake ? s * 1.16 : hidden ? s * 1.06 : s);
  return g;
}

function makeFoe(type){
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body); g.userData.body = body;
  const legs = [];
  const leg = (c, x, z, h = 0.14) => { const l = vox(body, 0.08, h, 0.08, c, x, h / 2, z); legs.push(l); };
  if (type === 'fox'){
    const c = '#ee7a2c';
    vox(body, 0.3, 0.22, 0.46, c, 0, 0.24, 0);
    vox(body, 0.18, 0.12, 0.05, '#fff4e6', 0, 0.22, 0.23);
    vox(body, 0.34, 0.28, 0.3, c, 0, 0.48, 0.18);
    vox(body, 0.18, 0.12, 0.14, '#fff4e6', 0, 0.42, 0.37);
    vox(body, 0.05, 0.04, 0.03, '#2a1d2a', 0, 0.46, 0.445);
    vox(body, 0.1, 0.14, 0.06, c, -0.11, 0.68, 0.16); vox(body, 0.1, 0.14, 0.06, c, 0.11, 0.68, 0.16);
    vox(body, 0.05, 0.05, 0.02, '#2a1d2a', -0.11, 0.74, 0.19); vox(body, 0.05, 0.05, 0.02, '#2a1d2a', 0.11, 0.74, 0.19);
    face(body, 0.52, 0.335, 0.34, { blush:false, eye:'#3a1a10' });
    const tail = vox(body, 0.16, 0.16, 0.34, c, 0, 0.34, -0.36); tail.rotation.x = 0.5; g.userData.tail = tail;
    vox(tail, 1, 0.9, 0.35, '#fff4e6', 0, 0, -0.55);
    leg('#3a2a2a', -0.09, 0.15); leg('#3a2a2a', 0.09, 0.15); leg('#3a2a2a', -0.09, -0.15); leg('#3a2a2a', 0.09, -0.15);
  } else if (type === 'wolf' || type === 'boss'){
    const c = type === 'boss' ? '#5b5f6b' : '#8d939c', d = type === 'boss' ? '#3a3d46' : '#666b74';
    vox(body, 0.34, 0.26, 0.52, c, 0, 0.28, 0);
    vox(body, 0.36, 0.08, 0.4, d, 0, 0.42, -0.02);
    vox(body, 0.36, 0.3, 0.32, c, 0, 0.52, 0.22);
    vox(body, 0.18, 0.12, 0.16, '#d8dbe0', 0, 0.45, 0.42);
    vox(body, 0.06, 0.05, 0.03, '#1a1a1a', 0, 0.49, 0.505);
    vox(body, 0.1, 0.14, 0.07, c, -0.12, 0.73, 0.2); vox(body, 0.1, 0.14, 0.07, c, 0.12, 0.73, 0.2);
    face(body, 0.56, 0.385, 0.36, { blush:false, eye: type === 'boss' ? '#ff3b3b' : '#ffd24a' });
    const tail = vox(body, 0.12, 0.12, 0.3, d, 0, 0.38, -0.36); tail.rotation.x = 0.4; g.userData.tail = tail;
    leg(d, -0.1, 0.17, 0.16); leg(d, 0.1, 0.17, 0.16); leg(d, -0.1, -0.17, 0.16); leg(d, 0.1, -0.17, 0.16);
    if (type === 'boss'){
      vox(body, 0.3, 0.07, 0.3, '#ffcf3f', 0, 0.71, 0.22, '#5a4200');
      [-1, 0, 1].forEach(i => vox(body, 0.06, 0.09, 0.06, '#ffcf3f', i * 0.11, 0.79, 0.34, '#5a4200'));
      vox(body, 0.42, 0.16, 0.12, '#c23a3a', 0, 0.42, 0.1);
    }
  } else if (type === 'croc'){
    const c = '#5c9a4a', d = '#3f7434';
    vox(body, 0.36, 0.2, 0.7, c, 0, 0.18, 0);
    for (let i = 0; i < 4; i++) vox(body, 0.08, 0.06, 0.08, d, 0, 0.31, -0.22 + i * 0.15);
    vox(body, 0.3, 0.14, 0.34, c, 0, 0.17, 0.48);
    vox(body, 0.28, 0.04, 0.3, '#f4f0d8', 0, 0.1, 0.5);
    vox(body, 0.09, 0.09, 0.09, c, -0.1, 0.3, 0.38); vox(body, 0.09, 0.09, 0.09, c, 0.1, 0.3, 0.38);
    vox(body, 0.05, 0.05, 0.02, '#f8e45a', -0.1, 0.32, 0.43); vox(body, 0.05, 0.05, 0.02, '#f8e45a', 0.1, 0.32, 0.43);
    vox(body, 0.025, 0.025, 0.02, '#1a1a1a', -0.1, 0.32, 0.445); vox(body, 0.025, 0.025, 0.02, '#1a1a1a', 0.1, 0.32, 0.445);
    const tail = vox(body, 0.2, 0.12, 0.42, c, 0, 0.14, -0.52); g.userData.tail = tail;
    leg(d, -0.2, 0.2, 0.1); leg(d, 0.2, 0.2, 0.1); leg(d, -0.2, -0.2, 0.1); leg(d, 0.2, -0.2, 0.1);
  } else if (type === 'hawk'){
    const c = '#8a5a3a';
    vox(body, 0.26, 0.22, 0.4, c, 0, 0, 0);
    vox(body, 0.26, 0.24, 0.24, '#f6f1e6', 0, 0.1, 0.24);
    vox(body, 0.08, 0.07, 0.12, '#ffcf3f', 0, 0.06, 0.4);
    face(body, 0.13, 0.365, 0.26, { blush:false, eye:'#2a1d2a' });
    const wl = new THREE.Group(), wr = new THREE.Group();
    vox(wl, 0.46, 0.05, 0.26, c, -0.23, 0, 0); vox(wl, 0.2, 0.04, 0.2, '#5e3a24', -0.4, 0, -0.05);
    vox(wr, 0.46, 0.05, 0.26, c, 0.23, 0, 0); vox(wr, 0.2, 0.04, 0.2, '#5e3a24', 0.4, 0, -0.05);
    wl.position.set(-0.12, 0.05, 0); wr.position.set(0.12, 0.05, 0);
    body.add(wl, wr); g.userData.wings = [wl, wr];
    vox(body, 0.18, 0.04, 0.2, '#5e3a24', 0, 0, -0.28);
  }
  g.userData.legs = legs;
  g.scale.setScalar(type === 'boss' ? 2.3 : type === 'croc' ? 1.25 : 1.15);
  return g;
}

function makeBase(){
  // a loud candy castle so the goal is obvious from any angle
  const g = new THREE.Group();
  const wall = '#ff3d6e', trim = '#ffd23f', roof = '#3d5cff', dark = '#2a1d3a';
  vox(g, 1.0, 0.7, 0.9, wall, 0, 0.35, 0);
  for (let i = -2; i <= 2; i++){ vox(g, 0.14, 0.14, 0.14, trim, i * 0.21, 0.77, 0.38, '#3a2a00'); vox(g, 0.14, 0.14, 0.14, trim, i * 0.21, 0.77, -0.38, '#3a2a00'); }
  vox(g, 0.3, 0.38, 0.05, dark, 0, 0.19, 0.46);
  vox(g, 0.34, 0.06, 0.06, trim, 0, 0.4, 0.47, '#3a2a00');
  [[-0.55, -0.45], [0.55, -0.45], [-0.55, 0.45], [0.55, 0.45]].forEach(([x, z]) => {
    vox(g, 0.32, 1.15, 0.32, wall, x, 0.58, z);
    vox(g, 0.38, 0.08, 0.38, trim, x, 1.18, z, '#3a2a00');
    vox(g, 0.3, 0.16, 0.3, roof, x, 1.3, z, '#0a1450'); vox(g, 0.2, 0.16, 0.2, roof, x, 1.45, z, '#0a1450'); vox(g, 0.1, 0.16, 0.1, roof, x, 1.6, z, '#0a1450');
    vox(g, 0.08, 0.1, 0.03, '#a8e0ff', x, 0.78, z + 0.17, '#335577');
  });
  vox(g, 0.5, 0.5, 0.5, wall, 0, 1.0, 0);
  vox(g, 0.56, 0.08, 0.56, trim, 0, 1.28, 0, '#3a2a00');
  vox(g, 0.44, 0.18, 0.44, roof, 0, 1.41, 0, '#0a1450'); vox(g, 0.3, 0.18, 0.3, roof, 0, 1.58, 0, '#0a1450'); vox(g, 0.16, 0.18, 0.16, roof, 0, 1.75, 0, '#0a1450');
  vox(g, 0.03, 0.5, 0.03, '#ffffff', 0, 2.05, 0);
  const fish = new THREE.Group();
  vox(fish, 0.34, 0.2, 0.03, '#ff9fd6', 0.18, 0, 0, '#552244'); vox(fish, 0.14, 0.08, 0.035, '#ffd23f', 0.2, 0, 0, '#443300');
  fish.position.set(0, 2.18, 0); g.add(fish); g.userData.fish = fish;
  const glow = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 32), new THREE.MeshBasicMaterial({ color:0xffd23f, transparent:true, opacity:0.6, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.03; g.add(glow); g.userData.glow = glow;
  g.scale.setScalar(1.25);
  return g;
}
function makeGate(){
  const g = new THREE.Group();
  vox(g, 0.25, 1.2, 0.3, '#6b5a7a', -0.6, 0.6, 0); vox(g, 0.25, 1.2, 0.3, '#6b5a7a', 0.6, 0.6, 0);
  vox(g, 1.45, 0.3, 0.3, '#6b5a7a', 0, 1.3, 0);
  vox(g, 0.95, 1.05, 0.1, '#2a1d2a', 0, 0.55, -0.05);
  vox(g, 0.2, 0.08, 0.02, '#ff3b3b', -0.18, 0.75, 0.01, '#ff0000'); vox(g, 0.2, 0.08, 0.02, '#ff3b3b', 0.18, 0.75, 0.01, '#ff0000');
  return g;
}

/* path geometry in world space */
const PATH_PTS = [new THREE.Vector3(wx(PATH[0][0]), PATH_H[0], wz(PATH[0][1]) + 1.4)]
  .concat(PATH.map(([x, z], i) => new THREE.Vector3(wx(x), PATH_H[i], wz(z))));
const PATH_LEN = PATH_PTS.length - 1;
const baseMesh = makeBase();
{ const [bx, bz] = BASE_TILE; baseMesh.position.set(wx(bx), TILE[bz][bx].h, wz(bz)); scene.add(baseMesh); }
const gate = makeGate(); gate.position.copy(PATH_PTS[0]).add(new THREE.Vector3(0, 0, 0.35)); scene.add(gate);
{ // gate platform
  const p = new THREE.Mesh(boxGeo, mat('#c9b6f2')); p.scale.set(1.6, 1, 1.4); p.position.copy(PATH_PTS[0]).add(new THREE.Vector3(0, -0.5, 0)); p.receiveShadow = true; scene.add(p);
}
/* floating voxel clouds */
const clouds = [];
for (let i = 0; i < 9; i++){
  const c = new THREE.Group();
  const n = 3 + Math.floor(Math.random() * 3);
  for (let j = 0; j < n; j++) vox(c, rnd(0.8, 1.6), rnd(0.4, 0.7), rnd(0.8, 1.4), '#ffffff', j * 0.8 - n * 0.4, rnd(-0.1, 0.2), rnd(-0.3, 0.3)).castShadow = false;
  const a = rnd(0, TAU), r = rnd(15, 21);
  c.position.set(Math.cos(a) * r, rnd(-7, 1), Math.sin(a) * r);
  c.userData.v = rnd(0.05, 0.15); c.userData.a = a; c.userData.r = r;
  scene.add(c); clouds.push(c);
}

/* ---------------- UI icons rendered from the same voxel models ---------------- */
const icons = {};
let iconR = null;
function renderIcon(key, model){
  if (!iconR){ iconR = new THREE.WebGLRenderer({ antialias:false, alpha:true, preserveDrawingBuffer:true }); iconR.setSize(48, 48); iconR.outputColorSpace = THREE.SRGBColorSpace; }
  const r = iconR;
  const s = new THREE.Scene();
  s.add(new THREE.HemisphereLight(0xffffff, 0xb9a6c9, 1.6));
  const l = new THREE.DirectionalLight(0xffffff, 1.4); l.position.set(2, 3, 4); s.add(l);
  if (model.userData.aura) model.remove(model.userData.aura);
  model.rotation.y = -0.45; s.add(model);
  const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
  const half = Math.max(size.x, size.y) * 0.62;
  const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 20);
  cam.position.set(ctr.x + 1.2, ctr.y + 1.0, ctr.z + 4); cam.lookAt(ctr);
  r.render(s, cam);
  icons[key] = r.domElement.toDataURL('image/png');
  return icons[key];
}
const iconKey = (type, level, branch, hidden, awake) => hidden ? hidden + (awake ? '+' : '') : (type + (level >= 3 ? '-' + branch : ''));
function iconFor(type, level = 1, branch = null, hidden = null, awake = false){
  const k = iconKey(type, level, branch, hidden, awake);
  return icons[k] || renderIcon(k, makeAnimal(hidden ? HIDDEN[hidden].base : type, Math.max(level, 1), branch, hidden, awake));
}

/* ---------------- 냥냥 룰렛 (prep-time casino) ---------------- */
// little voxel prize models, rendered to icons with the same pipeline as the animals
function prizeModel(id){
  const g = new THREE.Group();
  const coin = (x, y, z) => { vox(g, 0.42, 0.1, 0.42, '#ffcf3f', x, y, z, '#4a3400'); vox(g, 0.3, 0.02, 0.3, '#ffe58a', x, y + 0.06, z); };
  if (id === 'x2'){ for (let i = 0; i < 3; i++) coin(-0.18, 0.05 + i * 0.11, 0); for (let i = 0; i < 2; i++) coin(0.22, 0.05 + i * 0.11, 0.1);
    vox(g, 0.36, 0.36, 0.08, '#ffcf3f', 0.05, 0.55, 0.15, '#4a3400'); vox(g, 0.14, 0.2, 0.03, '#b88a10', 0.05, 0.55, 0.2); }
  if (id === 'x5'){ for (let i = 0; i < 5; i++) coin(-0.25 + (i % 3) * 0.25, 0.05 + Math.floor(i / 3) * 0.11, (i % 2) * 0.15);
    vox(g, 0.6, 0.18, 0.28, '#ffd84d', 0, 0.36, -0.05, '#5a4200'); vox(g, 0.5, 0.12, 0.2, '#fff3a0', 0, 0.5, -0.05, '#5a4200');
    [-0.2, 0, 0.2].forEach((x, i) => vox(g, 0.1, 0.16 + (i === 1 ? 0.08 : 0), 0.1, '#ffcf3f', x, 0.66, -0.05, '#5a4200')); vox(g, 0.08, 0.08, 0.05, '#ff3d6e', 0, 0.5, 0.06); }
  if (id === 'miss'){ vox(g, 0.3, 0.26, 0.22, '#d8d2dc', 0.34, 0.3, 0); vox(g, 0.06, 0.06, 0.03, '#2a1d2a', 0.4, 0.34, 0.12); vox(g, 0.62, 0.06, 0.06, '#d8d2dc', -0.06, 0.3, 0);
    for (let i = 0; i < 4; i++){ vox(g, 0.05, 0.28, 0.05, '#d8d2dc', -0.28 + i * 0.13, 0.3, 0); } vox(g, 0.2, 0.3, 0.06, '#d8d2dc', -0.44, 0.3, 0); }
  if (id === 'unit1' || id === 'unit2'){ const c = id === 'unit2' ? '#ffcf3f' : '#ff5c8a', r = id === 'unit2' ? '#ff3d6e' : '#ffd84d';
    vox(g, 0.62, 0.48, 0.62, c, 0, 0.24, 0); vox(g, 0.68, 0.14, 0.68, c, 0, 0.52, 0);
    vox(g, 0.14, 0.62, 0.7, r, 0, 0.3, 0); vox(g, 0.7, 0.62, 0.14, r, 0, 0.3, 0); vox(g, 0.16, 0.16, 0.16, r, -0.12, 0.66, 0); vox(g, 0.16, 0.16, 0.16, r, 0.12, 0.66, 0);
    if (id === 'unit2'){ vox(g, 0.1, 0.1, 0.1, '#ffffff', 0.3, 0.7, 0.3, '#888888'); vox(g, 0.08, 0.08, 0.08, '#ffffff', -0.3, 0.6, 0.32, '#888888'); } }
  if (id === 'charm'){ vox(g, 0.66, 0.66, 0.1, '#2f6fd6', 0, 0.36, 0); vox(g, 0.46, 0.46, 0.12, '#ffffff', 0, 0.36, 0.01); vox(g, 0.3, 0.3, 0.14, '#7ac8ff', 0, 0.36, 0.02); vox(g, 0.14, 0.14, 0.16, '#1d1d3a', 0, 0.36, 0.03);
    vox(g, 0.06, 0.16, 0.06, '#ffcf3f', 0, 0.76, 0); }
  if (id === 'buff'){ const sw = new THREE.Group(); vox(sw, 0.12, 0.6, 0.06, '#e8eef8', 0, 0.42, 0, '#333333'); vox(sw, 0.06, 0.1, 0.06, '#e8eef8', 0, 0.76, 0, '#333333');
    vox(sw, 0.36, 0.08, 0.1, '#ffcf3f', 0, 0.1, 0, '#4a3400'); vox(sw, 0.08, 0.2, 0.08, '#8a5a3a', 0, -0.04, 0); sw.rotation.z = -0.7; sw.position.set(-0.1, 0.1, 0); g.add(sw);
    vox(g, 0.12, 0.12, 0.05, '#ff5c8a', 0.3, 0.62, 0.05); vox(g, 0.08, 0.08, 0.05, '#ffd84d', 0.38, 0.4, 0.05); }
  if (id === 'heart'){ const rows = ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000'];
    rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === '1') vox(g, 0.1, 0.1, 0.16, y === 1 && x === 1 ? '#ffb3cb' : '#ff3d6e', (x - 3) * 0.1, 0.62 - y * 0.1, 0); })); }
  if (id === 'curse'){ vox(g, 0.56, 0.46, 0.5, '#f4f0ea', 0, 0.42, 0); vox(g, 0.4, 0.14, 0.4, '#f4f0ea', 0, 0.14, 0.02);
    vox(g, 0.14, 0.14, 0.04, '#2a1d2a', -0.13, 0.44, 0.25); vox(g, 0.14, 0.14, 0.04, '#2a1d2a', 0.13, 0.44, 0.25); vox(g, 0.06, 0.08, 0.04, '#2a1d2a', 0, 0.3, 0.25);
    [-0.12, -0.04, 0.04, 0.12].forEach(x => vox(g, 0.05, 0.08, 0.04, '#2a1d2a', x, 0.13, 0.23)); vox(g, 0.1, 0.1, 0.1, '#a98bf0', 0.32, 0.72, 0); }
  return g;
}
// weights add to 100 and are shown on the panel, so the odds are honest
const ROUL = [
  { id:'x2', name:'코인 2배', w:10, col:'#d42a4c' }, { id:'miss', name:'꽝', w:12, col:'#241830' },
  { id:'unit1', name:'랜덤 동물', w:15, col:'#d42a4c' }, { id:'charm', name:'보호 부적', w:10, col:'#241830' },
  { id:'x5', name:'잭팟 5배', w:4, col:'#e8a800' }, { id:'miss', name:'꽝', w:12, col:'#241830' },
  { id:'buff', name:'공격력 +25%', w:10, col:'#d42a4c' }, { id:'heart', name:'체력 +3', w:7, col:'#241830' },
  { id:'curse', name:'저주: 적 +15% 속도', w:5, col:'#1f9e5a' }, { id:'unit2', name:'2레벨 동물', w:5, col:'#e8a800' },
  { id:'x2', name:'코인 2배', w:10, col:'#241830' },
];
{ let a = -Math.PI / 2; for (const r of ROUL){ r.a0 = a; a += r.w / 100 * TAU; r.a1 = a; } }
const czCost = () => 25 + 10 * (G.wave + 1);
let czOpenNow = false, czSpinning = false, czPending = 0, czRot = 0;
const prizeImg = {};
function drawWheel(){
  const cv = $('wheel'); if (!cv) return;
  const g = cv.getContext('2d'), W = cv.width, R = W / 2;
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, W, W);
  // gold rim with bulbs
  g.fillStyle = '#7a4a00'; g.beginPath(); g.arc(R, R, R - 1, 0, TAU); g.fill();
  g.fillStyle = '#ffcf3f'; g.beginPath(); g.arc(R, R, R - 4, 0, TAU); g.fill();
  for (let i = 0; i < 24; i++){ const a = i / 24 * TAU; g.fillStyle = i % 2 ? '#fff6c8' : '#ff5c8a'; g.fillRect(Math.round(R + Math.cos(a) * (R - 8)) - 2, Math.round(R + Math.sin(a) * (R - 8)) - 2, 4, 4); }
  const rr = R - 13;
  for (const s of ROUL){
    g.fillStyle = s.col; g.beginPath(); g.moveTo(R, R); g.arc(R, R, rr, s.a0, s.a1); g.closePath(); g.fill();
    g.strokeStyle = '#ffcf3f'; g.lineWidth = 2; g.beginPath(); g.moveTo(R, R); g.lineTo(R + Math.cos(s.a0) * rr, R + Math.sin(s.a0) * rr); g.stroke();
    const img = prizeImg[s.id];
    if (img && img.complete){
      const mid = (s.a0 + s.a1) / 2, sz = s.w <= 5 ? 20 : 28, d = rr * 0.64;
      g.save(); g.translate(R + Math.cos(mid) * d, R + Math.sin(mid) * d); g.rotate(mid + Math.PI / 2);
      g.drawImage(img, -sz / 2, -sz / 2, sz, sz); g.restore();
    }
  }
  // hub
  g.fillStyle = '#7a4a00'; g.beginPath(); g.arc(R, R, 17, 0, TAU); g.fill();
  g.fillStyle = '#ffcf3f'; g.beginPath(); g.arc(R, R, 14, 0, TAU); g.fill();
  g.fillStyle = '#ff3d6e'; g.fillRect(R - 6, R - 6, 12, 12); g.fillStyle = '#fff6c8'; g.fillRect(R - 3, R - 3, 6, 6);
}
function buildCasino(){
  ROUL.forEach(s => { if (!prizeImg[s.id]){ const im = new Image(); im.onload = drawWheel; im.src = renderIcon('prize-' + s.id, prizeModel(s.id)); prizeImg[s.id] = im; } });
  const odds = $('czOdds'); odds.textContent = '';
  const seen = {};
  ROUL.forEach(s => { seen[s.id] = seen[s.id] || { s, w:0 }; seen[s.id].w += s.w; });
  Object.values(seen).forEach(({ s, w }) => {
    const d = document.createElement('span'); const im = document.createElement('img'); im.src = prizeImg[s.id].src; im.alt = '';
    d.append(im, ` ${s.name} ${w}%`); odds.append(d);
  });
  drawWheel();
}
function openCasino(){
  if (G.state !== 'build' || G.wave >= WAVES.length || G.modal) return;
  if (!$('czOdds').childElementCount) buildCasino();
  czOpenNow = true;
  const el = $('casino'); el.hidden = false; el.classList.remove('done');
  $('czResult').textContent = G.spun ? '이번 준비 시간엔 이미 돌렸어요' : '준비 시간에 딱 한 번! 돌릴까요?';
  $('czSpin').disabled = G.spun || czSpinning; $('czPass').textContent = G.spun ? '닫기' : '패스';
  $('czSpin').textContent = `🎰 돌리기  🪙${czCost()}`;
  blip(700, 1100, 0.08, 'square', 0.025);
  updateCasinoChip();
}
function closeCasino(force){
  if (czSpinning && !force) return;
  czOpenNow = false; $('casino').hidden = true; updateCasinoChip();
}
function updateCasinoChip(){
  const c = $('czChip'); if (!c) return;
  c.hidden = !(G.state === 'build' && !G.spun && !czOpenNow && G.wave < WAVES.length && (G.wave > 0 || G.coins > 0));
}
function spinWheel(){
  if (czSpinning || G.spun || G.state !== 'build') return;
  const cost = czCost();
  if (G.coins < cost){ toast('코인이 부족해요', '룰렛 ' + cost + '코인'); blip(200, 150, 0.12, 'square', 0.03); return; }
  G.coins -= cost; G.spun = true; czSpinning = true; ui();
  spinCount++; store.set('nyandef-spins', spinCount);
  $('czSpin').disabled = true; $('casino').classList.add('spinning');
  $('czResult').textContent = '두구두구두구…';
  // pick by weight, then land somewhere inside that slice under the pointer (top = -90°)
  let r = Math.random() * 100, pick = ROUL[0];
  for (const s of ROUL){ if ((r -= s.w) < 0){ pick = s; break; } }
  const inside = pick.a0 + (pick.a1 - pick.a0) * (0.2 + Math.random() * 0.6);
  // a slice at local angle θ shows at θ + rotation, so the winner needs rotation ≡ -90° - θ
  const start = czRot, want = -Math.PI / 2 - inside, target = start + TAU * 5 + (((want - start) % TAU) + TAU) % TAU;
  const dur = 4200, t0 = performance.now(), cv = $('wheel');
  let lastSeg = -1;
  const frame = (now) => {
    const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 4);
    czRot = start + (target - start) * e;
    cv.style.transform = `rotate(${czRot}rad)`;
    // tick whenever a slice boundary passes the pointer
    const under = -Math.PI / 2 - czRot;
    const seg = ROUL.findIndex(s => { const a = ((under - s.a0) % TAU + TAU) % TAU; return a < s.a1 - s.a0; });
    if (seg !== lastSeg){ lastSeg = seg; blip(1400 - k * 600, 900, 0.025, 'square', 0.02); }
    if (k < 1) requestAnimationFrame(frame);
    else { czSpinning = false; $('casino').classList.remove('spinning'); payout(pick, cost); checkUnlocks(false); }
  };
  requestAnimationFrame(frame);
}
function payout(p, cost){
  const el = $('casino'); el.classList.add('done');
  const say = (t, sub, special) => { $('czResult').textContent = t; toast(t, sub || '', special); };
  const target = G.state === 'wave' ? G.wave : G.wave + 1;
  if (p.id === 'miss'){ say('꽝… 생선 뼈만 남았어요'); blip(400, 90, 0.5, 'sawtooth', 0.04); }
  if (p.id === 'x2'){ G.coins += cost * 2; say('코인 2배! +' + cost * 2); [660, 990].forEach((f, i) => setTimeout(() => blip(f, f, 0.1, 'square', 0.035), i * 90)); }
  if (p.id === 'x5'){ G.coins += cost * 5; say('🎉 잭팟! +' + cost * 5, '룰렛 5배 당첨', true); shake = 0.3; SFX.hidden(); [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => blip(f, f, 0.12, 'triangle', 0.05), i * 90)); }
  if (p.id === 'charm'){ G.charms++; say('🧿 보호 부적 +1', '강화 실패 때 하락·파괴를 막아요'); blip(800, 1200, 0.15, 'triangle', 0.04); }
  if (p.id === 'buff'){ G.buffWave = target; say('⚔ 다음 웨이브 공격력 +25%'); blip(500, 1000, 0.15, 'square', 0.035); }
  if (p.id === 'heart'){ G.hp += 3; G.maxHp = Math.max(G.maxHp, G.hp); say('❤ 체력 +3'); blip(600, 900, 0.15, 'triangle', 0.04); }
  if (p.id === 'curse'){ G.curseWave = target; say('💀 저주! 다음 웨이브 적이 빨라져요'); blip(300, 60, 0.6, 'sawtooth', 0.05); shake = 0.2; }
  if (p.id === 'unit1' || p.id === 'unit2'){
    const lv = p.id === 'unit2' ? 2 : 1;
    const pool = deck.filter(t => isOpen(t));
    const type = pool[Math.floor(Math.random() * pool.length)];
    const T = TYPES[type], rng = T.lv[lv - 1].range;
    let best = null, bc = -1;
    for (let z = 0; z < MAP_D; z++) for (let x = 0; x < MAP_W; x++){ if (!canPlace(type, x, z)) continue; const c = coverCount(x, z, rng) + Math.random() * 0.5; if (c > bc){ bc = c; best = { x, z }; } }
    if (best){
      const u = placeUnit(type, best.x, best.z, lv); discover(type);
      setTimeout(() => transformFx(u, lv, '룰렛 선물!'), 200);
      say('🎁 ' + (T.lvName ? T.lvName[lv - 1] : T.name) + (lv > 1 ? ' 2레벨' : '') + ' 당첨!', '좋은 자리에 놓아 뒀어요. 옮겨도 돼요');
    } else { G.coins += cost * 2; say('자리가 없어서 코인으로 +' + cost * 2); }
  }
  $('czSpin').textContent = '다음 준비 시간에 또!'; $('czPass').textContent = '닫기';
  buildCards(); ui();
  setTimeout(() => { if (czOpenNow && !czSpinning) closeCasino(); }, 2600);
}
$('czSpin').onclick = () => { audio(); spinWheel(); };
$('czPass').onclick = () => closeCasino();
$('czChip').onclick = () => openCasino();

/* ---------------- entities ---------------- */
const units = [], foes = [], shots = [], bits = [];
const unitAt = (x, z) => units.find(u => u.x === x && u.z === z);
const unitRoot = new THREE.Group(), foeRoot = new THREE.Group(), fxRoot = new THREE.Group();
scene.add(unitRoot, foeRoot, fxRoot);

function unitName(u){ return (u.plus ? '+' + u.plus + ' ' : '') + baseName(u); }
function baseName(u){ const T = TYPES[u.type]; return u.awake ? AWAKE[u.hidden].name : u.hidden ? HIDDEN[u.hidden].name : (u.level >= 3 && T.br) ? T.br[u.branch].name : T.lvName ? T.lvName[u.level - 1] : T.name; }
function statsOf(u){
  const T = TYPES[u.type];
  const base = (u.level >= 3 && T.br) ? T.br[u.branch] : T.lv[Math.min(u.level, T.lv.length) - 1];
  const s = { ...base, air:T.air };
  const elev = clamp(TILE[u.z][u.x].elev, 0, 3) * G.mods.height;
  s.range *= 1 + 0.12 * elev; s.dmg *= 1 + 0.1 * elev;
  s.dmg *= G.mods.alldmg;
  if (u.type === 'cat') s.rate *= G.mods.catspd;
  if (u.type === 'rabbit') s.range *= G.mods.rabrng;
  if (u.type === 'dog'){ s.kb = (s.kb || 0) * G.mods.dogkb; s.dmg *= G.mods.dogdmg; }
  if (u.type === 'penguin'){ s.slow = Math.min(0.8, (s.slow || 0) + G.mods.pengslow); s.aoe *= G.mods.pengaoe; }
  if (u.hidden === 'moon'){ s.dmg *= 1.7; s.range += 1; s.airMult = 2; if (u.awake){ s.dmg *= 1.6; s.star = 3.2; } }
  if (u.hidden === 'catdog'){ s.rate *= 2.2; s.air = true; if (u.awake){ s.rate *= 1.5; s.dmg *= 1.4; s.splash = 0.9; s.stun = 0.3; } }
  if (u.hidden === 'witch'){ s.dmg *= 1.5; s.curse = 0.25; if (u.awake){ s.dmg *= 1.8; s.curse = 0.5; s.range += 0.6; } }
  if (u.hidden === 'aurora'){ s.dmg *= 2; s.aoe *= 1.4; s.slow = Math.min(0.85, s.slow + 0.15); if (u.awake){ s.dmg *= 1.6; s.aoe = Math.max(s.aoe, 2.1); s.freeze = 0.35; s.slow = Math.min(0.85, s.slow + 0.1); } }
  if (G.buffWave && G.buffWave === G.wave) s.dmg *= 1.25;
  if (u.plus){ s.dmg *= 1 + 0.18 * u.plus; s.rate *= 1 + 0.03 * u.plus; if (s.income) s.income = Math.round(s.income * (1 + 0.15 * u.plus)); }
  // raccoon dealers share luck: neighbours get a chance at a triple-damage jackpot hit
  for (const o of units){
    if (o === u || o.type !== 'raccoon' || Math.max(Math.abs(o.x - u.x), Math.abs(o.z - u.z)) !== 1) continue;
    s.luck = (s.luck || 0) + TYPES.raccoon.lv[o.level - 1].luck;
  }
  // owls buff neighbours (not themselves)
  for (const o of units){
    if (o === u || o.type !== 'owl' || Math.max(Math.abs(o.x - u.x), Math.abs(o.z - u.z)) !== 1) continue;
    const a = TYPES.owl.lv[o.level - 1].aura;
    s.range *= 1 + a[0]; s.rate *= 1 + a[1]; s.owl = true;
  }
  s.elev = elev;
  return s;
}
function costOf(type){ return Math.round(TYPES[type].cost * G.mods.discount); }

function placeUnit(type, x, z, level = 1, branch = null, hidden = null){
  const t = TILE[z][x];
  const u = { type, level, branch, hidden, x, z, cd:0.3, kills:0, hawkKills:0, catWaves:0, yaw:0, punch:0, spent:0 };
  u.mesh = makeAnimal(type, level, branch, hidden);
  u.mesh.position.set(wx(x), t.h, wz(z));
  u.mesh.userData.unit = u;
  u.mesh.traverse(o => { o.userData.unit = u; });
  unitRoot.add(u.mesh);
  units.push(u);
  dropIn(u.mesh);
  return u;
}
const PLUS_COLS = [null, '#9fe8ff', '#7af0a0', '#ffd84d', '#ff8fb8', '#c89aff'];
function plusDecor(u){
  if (!u.plus) return;
  const r = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.6 + u.plus * 0.015, 4, 1), new THREE.MeshBasicMaterial({ color:PLUS_COLS[u.plus], transparent:true, opacity:0.85, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide }));
  r.rotation.x = -Math.PI / 2; r.position.y = 0.03; r.userData.unit = u;
  u.mesh.add(r); u.mesh.userData.plusRing = r;
  if (u.plus >= 4){ for (let i = 0; i < u.plus - 2; i++){ const sp = vox(u.mesh, 0.06, 0.06, 0.06, PLUS_COLS[u.plus], Math.cos(i * 2.1) * 0.42, 0.5 + i * 0.12, Math.sin(i * 2.1) * 0.42); sp.userData.unit = u; } }
}
function rebuildUnit(u){
  const pos = u.mesh.position.clone(), yaw = u.mesh.rotation.y;
  unitRoot.remove(u.mesh);
  u.mesh = makeAnimal(u.type, u.level, u.branch, u.hidden, u.awake);
  u.mesh.position.copy(pos); u.mesh.rotation.y = yaw;
  u.mesh.traverse(o => { o.userData.unit = u; });
  unitRoot.add(u.mesh);
  plusDecor(u);
  u.punch = 1;
}
function removeUnit(u){ unitRoot.remove(u.mesh); units.splice(units.indexOf(u), 1); }
function dropIn(m){ m.userData.drop = 0.35; }

function spawnFoe(type){
  const def = FOES[type];
  const w = G.wave - 1, scale = (1 + 0.5 * w + 0.07 * w * w) * 1.06 * (G.mode === 'hard' ? 1.12 + 0.045 * w : 1);
  const e = { type, def, hp:def.hp * scale, maxHp:def.hp * scale, s:0, u:0, spd: G.mode === 'hard' ? 1.07 : 1, curseT:0, curseP:0, slowT:0, slowP:0, freezeT:0, stunT:0, dead:false, summonT:5, walk:Math.random() * TAU };
  if (G.curseWave && G.curseWave === G.wave) e.spd *= 1.15;
  e.mesh = makeFoe(type);
  e.bar = makeBar(def.boss ? 1.6 : 0.7);
  e.mesh.add(e.bar);
  e.bar.position.y = def.boss ? 1.75 : def.fly ? 0.55 : 0.95;
  foeRoot.add(e.mesh);
  foes.push(e);
  placeFoe(e, 0);
  return e;
}
function makeBar(w){
  const g = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.08, 0.16), new THREE.MeshBasicMaterial({ color:0x3b2a3a, depthTest:false }));
  const fg = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.09), new THREE.MeshBasicMaterial({ color:0xff6b81, depthTest:false }));
  fg.position.z = 0.001; bg.renderOrder = 10; fg.renderOrder = 11;
  g.add(bg, fg); g.userData.fg = fg; g.userData.w = w; g.visible = false;
  return g;
}
const FLY_FROM = new THREE.Vector3(wx(PATH[0][0]) + 2, PATH_H[0] + 3, wz(PATH[0][1]) + 3);
const FLY_TO = new THREE.Vector3(wx(BASE_TILE[0]), PATH_H[PATH_H.length - 1] + 1.8, wz(BASE_TILE[1]));
const FLY_LEN = FLY_FROM.distanceTo(FLY_TO);
function placeFoe(e, dt){
  if (e.def.fly){
    const p = new THREE.Vector3().lerpVectors(FLY_FROM, FLY_TO, e.u);
    p.y += Math.sin(e.walk * 0.5) * 0.15;
    const dir = new THREE.Vector3().subVectors(FLY_TO, FLY_FROM);
    e.mesh.position.copy(p);
    e.mesh.rotation.y = Math.atan2(dir.x, dir.z);
    e.prog = e.u;
    return;
  }
  const k = clamp(Math.floor(e.s), 0, PATH_LEN - 1), t = clamp(e.s - k, 0, 1);
  const a = PATH_PTS[k], b = PATH_PTS[k + 1];
  const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
  let y;
  if (b.y !== a.y){ const st = t * t * (3 - 2 * t); y = a.y + (b.y - a.y) * st + Math.sin(t * Math.PI) * 0.28; }
  else y = a.y + Math.abs(Math.sin(e.walk)) * 0.05;
  e.mesh.position.set(x, y, z);
  const yaw = Math.atan2(b.x - a.x, b.z - a.z);
  let dy = yaw - e.mesh.rotation.y; while (dy > Math.PI) dy -= TAU; while (dy < -Math.PI) dy += TAU;
  e.mesh.rotation.y += dy * Math.min(1, dt * 12 || 1);
  e.prog = e.s / PATH_LEN;
}

/* ---------------- floating text (pixel font, sparse) ---------------- */
const floatsEl = $('floats');
const floats = [];
const v3 = new THREE.Vector3();
function floatText(pos, text, cls = '', life = 0.8){
  if (floats.length > 36){ const f = floats.shift(); f.el.remove(); }
  const el = document.createElement('div'); el.className = 'fl ' + cls; el.textContent = text;
  floatsEl.appendChild(el);
  floats.push({ el, pos: pos.clone(), t:0, life, dx: rnd(-8, 8) });
}
function updateFloats(dt){
  for (let i = floats.length - 1; i >= 0; i--){
    const f = floats[i]; f.t += dt;
    if (f.t >= f.life){ f.el.remove(); floats.splice(i, 1); continue; }
    v3.copy(f.pos).project(camera);
    const sx = (v3.x * 0.5 + 0.5) * innerWidth + f.dx, sy = (-v3.y * 0.5 + 0.5) * innerHeight;
    const k = f.t / f.life;
    const pop = k < 0.15 ? 0.6 + k / 0.15 * 0.6 : 1.2 - Math.min(0.2, (k - 0.15) * 0.6);
    f.el.style.transform = `translate(${sx}px,${sy - 30 * k - 10}px) translate(-50%,-50%) scale(${pop})`;
    f.el.style.opacity = k > 0.7 ? (1 - (k - 0.7) / 0.3) : 1;
  }
}

/* ---------------- fx: voxel bits ---------------- */
function burst(pos, colors, n = 10, power = 2.5){
  for (let i = 0; i < n; i++){
    if (bits.length > 220){ const b = bits.shift(); fxRoot.remove(b.m); }
    const m = new THREE.Mesh(boxGeo, mat(colors[i % colors.length]));
    const s = rnd(0.06, 0.13); m.scale.setScalar(s);
    m.position.copy(pos);
    fxRoot.add(m);
    bits.push({ m, v: new THREE.Vector3(rnd(-1, 1) * power, rnd(1.5, 3.5), rnd(-1, 1) * power), t:0, life:rnd(0.5, 0.9), spin:rnd(-10, 10) });
  }
}
function updateBits(dt){
  for (let i = bits.length - 1; i >= 0; i--){
    const b = bits[i]; b.t += dt;
    if (b.t > b.life){ fxRoot.remove(b.m); bits.splice(i, 1); continue; }
    b.v.y -= 9 * dt; b.m.position.addScaledVector(b.v, dt);
    b.m.rotation.x += b.spin * dt; b.m.rotation.y += b.spin * dt;
    const k = 1 - b.t / b.life; b.m.scale.setScalar(Math.max(0.01, b.m.scale.x * (0.985)));
    if (k < 0.3) b.m.scale.multiplyScalar(0.92);
  }
}
const FOE_COLS = { fox:['#ee7a2c', '#fff4e6'], wolf:['#8d939c', '#666b74'], croc:['#5c9a4a', '#3f7434'], hawk:['#8a5a3a', '#f6f1e6'], boss:['#5b5f6b', '#ffcf3f', '#c23a3a'] };

/* ---------------- audio (tiny synth) ---------------- */
let actx = null, muted = store.get('nyandef-mute', false), bgm = null;
function audio(){ if (!actx){ try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){} } if (actx && actx.state === 'suspended') actx.resume(); }
function blip(f0, f1, dur, type = 'square', vol = 0.04){
  if (muted || !actx) return;
  const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
}
let sfxBudget = 0;
const SFX = {
  shoot(){ if (sfxBudget > 6) return; sfxBudget++; blip(900, 600, 0.05, 'square', 0.012); },
  hit(){ if (sfxBudget > 6) return; sfxBudget++; blip(300, 120, 0.06, 'square', 0.015); },
  kill(){ blip(520, 1040, 0.08, 'square', 0.025); },
  place(){ blip(330, 660, 0.09, 'triangle', 0.05); },
  merge(){ [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, f, 0.09, 'square', 0.035), i * 60)); },
  leak(){ blip(200, 70, 0.3, 'sawtooth', 0.05); },
  wave(){ [392, 523, 659].forEach((f, i) => setTimeout(() => blip(f, f, 0.12, 'triangle', 0.05), i * 90)); },
  hidden(){ [659, 831, 988, 1319, 1661].forEach((f, i) => setTimeout(() => blip(f, f, 0.14, 'triangle', 0.05), i * 90)); },
};
function playBgm(boss){
  if (muted) return;
  const src = boss ? '/bgm/boss.mp3' : '/bgm/stage' + (1 + (Math.floor((G.wave - 1) / 3) % 4)) + '.mp3';
  if (bgm && bgm.dataset.src === src) return;
  if (bgm){ bgm.pause(); }
  bgm = new Audio(src); bgm.dataset.src = src; bgm.loop = true; bgm.volume = 0.28;
  bgm.play().catch(() => {});
}
function stopBgm(){ if (bgm){ bgm.pause(); bgm = null; } }

/* ---------------- combat ---------------- */
function inRange(u, e, range){
  const dx = e.mesh.position.x - u.mesh.position.x, dz = e.mesh.position.z - u.mesh.position.z;
  return dx * dx + dz * dz <= range * range;
}
function pickTarget(u, s){
  let best = null, bv = -1;
  for (const e of foes){
    if (e.dead || (e.def.fly && !s.air) || !inRange(u, e, s.range)) continue;
    const v = u.type === 'rabbit' ? e.hp + e.prog * 10 : e.prog;
    if (v > bv){ bv = v; best = e; }
  }
  return best;
}
function hurt(e, dmg, u, opts = {}){
  if (e.dead) return;
  if (e.def.dodge && !opts.sure && Math.random() < e.def.dodge){ if (Math.random() < 0.35) floatText(e.mesh.position.clone().add(new THREE.Vector3(0, 0.9, 0)), 'MISS', 'miss', 0.45); return; }
  let d = Math.max(1, dmg - (e.def.armor || 0)) * (e.curseT > 0 ? 1 + e.curseP : 1);
  if (opts.air && e.def.fly) d *= opts.air;
  let cls = '';
  if (opts.crit || (u && u.luck && Math.random() < u.luck)){ d *= 3; cls = 'crit'; }
  e.hp -= d;
  if (cls || d >= 150) floatText(e.mesh.position.clone().add(new THREE.Vector3(0, 1.1, 0)), Math.round(d).toString(), cls || 'big', 0.6);
  e.mesh.userData.flash = 0.08;
  if (e.hp <= 0) killFoe(e, u);
}
function killFoe(e, u){
  e.dead = true;
  G.kills++;
  const coins = Math.round(e.def.reward * G.mods.coin);
  G.coins += coins;
  floatText(e.mesh.position.clone().add(new THREE.Vector3(0, 0.8, 0)), '+' + coins, 'coin', 0.55);
  burst(e.mesh.position.clone().add(new THREE.Vector3(0, 0.3, 0)), FOE_COLS[e.type], e.def.boss ? 40 : 10, e.def.boss ? 4 : 2.2);
  SFX.kill();
  foeRoot.remove(e.mesh);
  if (u){
    u.kills++;
    if (e.def.fly && u.type === 'rabbit' && TILE[u.z][u.x].elev >= 2) u.hawkKills++;
    checkHidden(u);
  }
  if (e.def.boss){ shake = 0.6; toast('늑대왕 격파!', '계단 꼭대기를 지켜냈어요'); }
  ui();
}
function fire(u, s, e){
  u.punch = 1;
  const from = u.mesh.position.clone().add(new THREE.Vector3(0, 0.55 * u.mesh.scale.y, 0));
  if (u.type === 'bear'){
    const at = e.mesh.position.clone();
    for (const o of foes){ if (!o.dead && !o.def.fly && o.mesh.position.distanceTo(at) < s.aoe){ o.stunT = Math.max(o.stunT, s.stun); hurt(o, s.dmg, u, { sure:true }); } }
    burst(at.clone().add(new THREE.Vector3(0, 0.1, 0)), ['#8a5a3a', '#e6c79c', '#ffffff'], 12, 2.4);
    shake = Math.max(shake, 0.12); blip(120, 50, 0.18, 'square', 0.05);
    return;
  }
  if (u.type === 'dog' && u.hidden !== 'catdog'){
    // bite: instant splash + knockback
    const hitPos = e.mesh.position.clone();
    for (const o of foes){
      if (o.dead) continue;
      if (o === e || (!o.def.fly && o.mesh.position.distanceTo(hitPos) < s.splash)){
        if (!o.def.fly && s.kb && !o.def.boss) o.s = Math.max(0, o.s - s.kb);
        else if (o.def.boss && s.kb) o.s = Math.max(0, o.s - s.kb * 0.2);
        if (s.stun) o.stunT = Math.max(o.stunT, s.stun);
        hurt(o, s.dmg, u, { sure:true });
      }
    }
    burst(hitPos.clone().add(new THREE.Vector3(0, 0.3, 0)), ['#ffffff', '#ffe58a'], 5, 1.4);
    SFX.hit();
    return;
  }
  if (u.type === 'rabbit' && u.branch === 'a' && u.level >= 3){
    // sniper: instant beam
    const to = e.mesh.position.clone().add(new THREE.Vector3(0, 0.3, 0));
    tracer(from, to, '#fff3a0');
    hurt(e, s.dmg, u, { sure:true, air:s.airMult });
    blip(1400, 300, 0.12, 'sawtooth', 0.03);
    return;
  }
  const kind = u.type === 'penguin' ? 'snow' : u.type === 'rabbit' ? 'carrot' : u.type === 'raccoon' ? 'dice' : 'fish';
  const m = new THREE.Group();
  if (kind === 'dice'){ vox(m, 0.17, 0.17, 0.17, '#ffffff', 0, 0, 0, '#777777'); vox(m, 0.05, 0.05, 0.19, '#e04a5a', 0, 0, 0); }
  if (kind === 'fish'){ vox(m, 0.16, 0.08, 0.05, u.hidden === 'catdog' ? '#ffe58a' : '#a8d8f7', 0, 0, 0); vox(m, 0.05, 0.09, 0.05, '#7fb6dc', -0.1, 0, 0); }
  if (kind === 'carrot'){ vox(m, 0.07, 0.07, 0.24, u.hidden === 'moon' ? '#fff3a0' : '#ff9f3f', 0, 0, 0, u.hidden === 'moon' ? '#6a5a00' : undefined); vox(m, 0.08, 0.06, 0.06, '#6cc47a', 0, 0, -0.14); }
  if (kind === 'snow') vox(m, 0.18, 0.18, 0.18, '#ffffff', 0, 0, 0);
  m.position.copy(from);
  fxRoot.add(m);
  shots.push({ kind, m, u, e, s, last: e.mesh.position.clone(), t:0, from: from.clone(), speed: kind === 'snow' ? 7 : kind === 'carrot' ? 14 : kind === 'dice' ? 9 : 11, crit: s.crit && Math.random() < s.crit });
  SFX.shoot();
}
function starStrike(u, s, e){
  const m = new THREE.Group();
  vox(m, 0.3, 0.3, 0.3, '#fff3a0', 0, 0, 0, '#a08a00'); vox(m, 0.12, 0.5, 0.12, '#ffffff', 0, 0.3, 0, '#888888');
  const from = e.mesh.position.clone().add(new THREE.Vector3(1.5, 7, 1.5));
  m.position.copy(from); fxRoot.add(m);
  shots.push({ kind:'star', m, u, e, s, last:e.mesh.position.clone(), t:0, from, speed:16 });
}
function tracer(a, b, color){
  const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent:true, opacity:1 }));
  fxRoot.add(line);
  tracers.push({ line, t:0 });
}
const tracers = [];
function updateShots(dt){
  for (let i = shots.length - 1; i >= 0; i--){
    const p = shots[i]; p.t += dt;
    if (!p.e.dead) p.last.copy(p.e.mesh.position).add(new THREE.Vector3(0, p.e.def.fly ? 0 : 0.3, 0));
    const to = p.last;
    const d = p.m.position.distanceTo(to);
    const step = p.speed * dt;
    if (d <= step || p.t > 2){
      fxRoot.remove(p.m); shots.splice(i, 1);
      impact(p, to);
      continue;
    }
    p.m.position.lerp(to, step / d);
    if (p.kind === 'snow') p.m.position.y += Math.sin(Math.min(1, p.t * 2) * Math.PI) * 0.06;
    p.m.lookAt(to);
    p.m.rotation.z += dt * 12;
  }
  for (let i = tracers.length - 1; i >= 0; i--){
    const t = tracers[i]; t.t += dt; t.line.material.opacity = 1 - t.t / 0.18;
    if (t.t > 0.18){ fxRoot.remove(t.line); tracers.splice(i, 1); }
  }
}
function impact(p, at){
  const s = p.s;
  if (p.kind === 'snow'){
    for (const o of foes){
      if (o.dead || o.def.fly) continue;
      if (o.mesh.position.distanceTo(at) < s.aoe){
        o.slowP = Math.max(o.slowP * (o.slowT > 0 ? 1 : 0), s.slow); o.slowT = 1.6;
        if (s.freeze && Math.random() < s.freeze){ o.freezeT = 0.8; }
        p.u.hits = (p.u.hits || 0) + 1;
        hurt(o, s.dmg, p.u, { sure:true });
      }
    }
    burst(at, ['#ffffff', '#cdeafc'], 8, 1.6);
    return;
  }
  if (p.kind === 'dice'){
    if (p.e.dead) return;
    const r = 1 + Math.floor(Math.random() * 6), jackpot = r === 6 || (s.lucky && r === 5);
    const pos = p.e.mesh.position.clone().add(new THREE.Vector3(0, 1.05, 0));
    if (jackpot){
      hurt(p.e, s.dmg * 6, p.u, { sure:true });
      floatText(pos, '🎲' + r + ' 대박!', 'crit', 0.8);
      burst(at, ['#ffd84d', '#ffffff', '#e04a5a'], 10, 2.2);
      blip(1200, 1800, 0.12, 'square', 0.035);
    } else if (r === 1){
      if (Math.random() < 0.5) floatText(pos, '🎲1 꽝', 'miss', 0.5);
      burst(at, ['#ffffff'], 3, 0.8);
    } else { hurt(p.e, s.dmg * r / 3.5, p.u, { sure:true }); SFX.hit(); }
    return;
  }
  if (p.kind === 'star'){
    for (const o of foes){ if (!o.dead && o.mesh.position.distanceTo(at) < 1.4) hurt(o, s.dmg * 3, p.u, { sure:true, air:1 }); }
    burst(at, ['#fff3a0', '#c9b6f2', '#ffffff'], 18, 3); shake = Math.max(shake, 0.15);
    blip(1600, 200, 0.25, 'triangle', 0.04);
    return;
  }
  if (s.splash && p.u.type !== 'dog' || (s.splash && p.u.hidden === 'catdog')){
    for (const o of foes){ if (!o.dead && o !== p.e && o.mesh.position.distanceTo(at) < s.splash){ if (s.stun) o.stunT = Math.max(o.stunT, s.stun); hurt(o, s.dmg * 0.6, p.u, { sure:true }); } }
  }
  if (!p.e.dead){
    if (s.stun) p.e.stunT = Math.max(p.e.stunT, s.stun);
    if (s.curse){ p.e.curseT = 3; p.e.curseP = Math.max(p.e.curseP, s.curse); }
    hurt(p.e, s.dmg, p.u, { crit:p.crit, air:s.airMult });
    SFX.hit();
  }
}

/* ---------------- hidden jobs ---------------- */
function checkHidden(u){
  if (u.hidden) return;
  if (u.type === 'rabbit' && u.level >= 2 && u.hawkKills >= 12) becomeHidden(u, 'moon');
  if (u.type === 'penguin' && u.level >= 2 && (u.hits || 0) >= 400) becomeHidden(u, 'aurora');
}
function waveEndHidden(){
  for (const u of units){
    if (u.type === 'dog' && !u.hidden){
      const nearCat = units.some(o => o.type === 'cat' && Math.max(Math.abs(o.x - u.x), Math.abs(o.z - u.z)) === 1);
      u.catWaves = nearCat ? u.catWaves + 1 : 0;
      if (u.catWaves >= 3) becomeHidden(u, 'catdog');
    }
    if (u.type === 'cat' && !u.hidden && u.level >= 2){
      u.highWaves = TILE[u.z][u.x].elev >= 3 ? (u.highWaves || 0) + 1 : 0;
      if (u.highWaves >= 3) becomeHidden(u, 'witch');
    }
    if (u.type === 'penguin') checkHidden(u);
  }
}
function becomeHidden(u, key){
  u.hidden = key;
  rebuildUnit(u);
  discover(key);
  transformFx(u, 3, '히든! ' + HIDDEN[key].name);
  SFX.hidden();
  toast('히든 전직! ' + HIDDEN[key].name, HIDDEN[key].desc, true);
  if (G.selUnit === u) showInfo(u);
}
function canAwaken(h, m){ const a = h.hidden && !h.awake && AWAKE[h.hidden]; return !!a && !m.hidden && m.type === a.mat && m.level >= a.minLv; }
function awaken(h, m, stay){
  const tx = m.x, tz = m.z, moveTo = !stay;
  removeUnit(m);
  if (moveTo){ h.x = tx; h.z = tz; h.mesh.position.set(wx(tx), TILE[tz][tx].h, wz(tz)); }
  h.awake = true;
  rebuildUnit(h);
  discover(h.hidden + '+');
  transformFx(h, 4, '각성! ' + AWAKE[h.hidden].name);
  SFX.hidden(); setTimeout(() => SFX.hidden(), 260);
  toast('각성! ' + AWAKE[h.hidden].name, AWAKE[h.hidden].desc, true);
  if (G.selUnit === h) showInfo(h);
}

/* ---------------- waves ---------------- */
function startWave(auto){
  if (G.state !== 'build' || G.wave >= WAVES.length) return;
  audio();
  if (G.mode === 'hard' && !auto && G.autoT > 1){ const early = Math.floor(G.autoT) * 2; G.coins += early; floatText(baseMesh.position.clone().add(new THREE.Vector3(0, 1.6, 0)), '빨리 시작 +' + early, 'coin', 0.9); }
  G.wave++;
  checkUnlocks(false);
  if (G.mods.interest){ const add = Math.min(40, Math.floor(G.coins * 0.1)); if (add > 0){ G.coins += add; toast('저금통 이자 +' + add); } }
  G.state = 'wave'; G.waveT = 0;
  closeCasino(true);
  if (G.buffWave === G.wave) setTimeout(() => toast('⚔ 룰렛 버프', '이번 웨이브 공격력 +25%'), 300);
  if (G.curseWave === G.wave) setTimeout(() => toast('💀 룰렛 저주', '이번 웨이브 적이 15% 빨라요'), 300);
  G.spawnQ = [];
  for (const grp of WAVES[G.wave - 1]){
    const n = G.mode === 'hard' ? Math.ceil(grp.n * 1.15) : grp.n, gap = grp.gap * (G.mode === 'hard' ? 0.85 : 1);
    for (let i = 0; i < n; i++) G.spawnQ.push({ t:(grp.at || 0) + i * gap, type:grp.t });
  }
  G.spawnQ.sort((a, b) => a.t - b.t);
  SFX.wave();
  playBgm(G.wave === WAVES.length);
  if (G.wave === WAVES.length) toast('늑대왕이 나타났다!', '부하 늑대를 불러내요. 계단 꼭대기를 지켜 주세요!');
  ui();
}
function endWave(){
  G.state = 'build';
  const bonus = 18 + G.wave * 4;
  G.coins += bonus;
  for (const u of units){
    u.spent = 0;
    if (u.type === 'hamster'){ const inc = statsOf(u).income; G.coins += inc; floatText(u.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0)), '+' + inc, 'coin', 1.1); u.punch = 1; }
  }
  if (G.wave >= WAVES.length){ finish(true); return; }
  toast('웨이브 ' + G.wave + ' 클리어!', '보너스 코인 +' + bonus + (G.mode === 'hard' ? ' · 다음 웨이브 자동 시작' : ''));
  G.autoT = 10;
  waveEndHidden();
  if (G.wave % 2 === 0) setTimeout(openCards, 600);
  G.spun = false; czPending = performance.now() + 1100;
  ui();
}
function finish(win){
  G.state = win ? 'win' : 'over';
  stopBgm();
  checkUnlocks(win);
  const score = Math.round((win ? 10000 + G.hp * 500 + G.kills * 20 + G.coins : G.wave * 800 + G.kills * 20) * (G.mode === 'hard' ? 1.5 : 1));
  const bestKey = 'nyandef-best-' + G.mode, best = store.get(bestKey, 0);
  if (score > best) store.set(bestKey, score);
  $('endTitle').textContent = (G.mode === 'hard' ? '[하드] ' : '') + (win ? '🎉 생선 창고를 지켜냈어요!' : '창고가 털렸어요…');
  $('endScore').textContent = score.toLocaleString('ko-KR');
  $('endInfo').innerHTML = '';
  const info = [`웨이브 ${G.wave}/${WAVES.length}`, `처치 ${G.kills}`, `남은 체력 ${Math.max(0, G.hp)}`, score > best ? '최고 기록 갱신!' : `최고 기록 ${best.toLocaleString('ko-KR')}`];
  $('endInfo').textContent = info.join(' · ');
  setTimeout(() => $('endOv').classList.add('on'), win ? 1200 : 600);
  if (win) [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => blip(f, f, 0.15, 'triangle', 0.05), 400 + i * 110));
}

/* ---------------- cards ---------------- */
function openCards(){
  const pool = CARDS.filter(c => !(G.taken[c.id] && ['height', 'interest'].includes(c.id)) && !(c.id === 'luck' && G.enhBonus >= 0.24));
  const pick = [];
  while (pick.length < 3 && pool.length) pick.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  const box = $('cardChoices'); box.textContent = '';
  pick.forEach((c, i) => {
    const b = document.createElement('button'); b.className = 'choice';
    b.innerHTML = `<span class="ic"></span><b></b><span></span>`;
    b.children[0].textContent = c.icon; b.children[1].textContent = c.name; b.children[2].textContent = c.desc;
    b.onclick = () => takeCard(c);
    box.appendChild(b);
  });
  G.modal = true;
  $('cardOv').classList.add('on');
}
function takeCard(c){
  const M = G.mods;
  G.taken[c.id] = (G.taken[c.id] || 0) + 1;
  if (c.id === 'catspd') M.catspd *= 1.25;
  if (c.id === 'rabrng') M.rabrng *= 1.2;
  if (c.id === 'dogkb'){ M.dogkb *= 1.6; M.dogdmg *= 1.15; }
  if (c.id === 'pengslow'){ M.pengslow += 0.12; M.pengaoe *= 1.15; }
  if (c.id === 'alldmg') M.alldmg *= 1.12;
  if (c.id === 'coin') M.coin *= 1.25;
  if (c.id === 'hp'){ G.maxHp += 6; G.hp += 6; }
  if (c.id === 'height') M.height = 2;
  if (c.id === 'interest') M.interest = true;
  if (c.id === 'discount') M.discount *= 0.85;
  if (c.id === 'charm') G.charms += 2;
  if (c.id === 'luck') G.enhBonus = Math.min(0.24, G.enhBonus + 0.08);
  $('cardOv').classList.remove('on'); G.modal = false;
  SFX.merge();
  toast(c.icon + ' ' + c.name, c.desc);
  buildCards(); ui();
}

/* ---------------- merge & branch ---------------- */
let pendingBranch = null;
function tryMerge(src, dst){
  if (src === dst) return false;
  if (canAwaken(dst, src)){ awaken(dst, src, true); return true; }
  if (canAwaken(src, dst)){ awaken(src, dst, false); return true; }
  if (src.type !== dst.type || src.level !== dst.level || src.level >= 3) return false;
  if (!TYPES[dst.type].br && dst.level === 2){ removeUnit(src); dst.level = 3; dst.hidden = dst.hidden || src.hidden; dst.kills += src.kills; rebuildUnit(dst); mergeFx(dst); return true; }
  const hidden = dst.hidden || src.hidden;
  removeUnit(src);
  if (dst.level === 1){
    dst.level = 2; dst.hidden = hidden;
    dst.kills += src.kills; dst.hawkKills += src.hawkKills; dst.catWaves = Math.max(dst.catWaves, src.catWaves);
    rebuildUnit(dst); mergeFx(dst);
    checkHidden(dst);
  } else {
    dst.hawkKills += src.hawkKills; dst.kills += src.kills; dst.catWaves = Math.max(dst.catWaves, src.catWaves); dst.hidden = hidden;
    pendingBranch = dst;
    openBranch(dst);
  }
  return true;
}
function mergeFx(u){
  const br = u.level >= 3 && TYPES[u.type].br;
  transformFx(u, br ? 2 : 1, br ? '전직! ' + unitName(u) : '★'.repeat(u.level) + ' ' + (TYPES[u.type].lvName ? unitName(u) : '레벨 ' + u.level));
  if (G.selUnit === u) showInfo(u);
}
/* "슉" transformation: shrink-spin-pop with a light pillar, ground ring and rising sparkles */
const tfx = [];
const TF_COLS = { 1:['#ffffff', '#ffe58a'], 2:['#ffe58a', '#ffb347'], 3:['#c9b6f2', '#ffe58a'], 4:['#9ad8ff', '#ff9fd6'] };
function transformFx(u, tier, label){
  const [c1, c2] = TF_COLS[tier];
  const base = u.mesh.position.clone();
  u.tf = { t:0, dur: tier >= 3 ? 1.25 : 0.9 };
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 7, 12, 1, true),
    new THREE.MeshBasicMaterial({ color:c1, transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide }));
  pillar.position.copy(base).add(new THREE.Vector3(0, 3.5, 0));
  const ringM = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 32), new THREE.MeshBasicMaterial({ color:c2, transparent:true, opacity:0.9, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide }));
  ringM.rotation.x = -Math.PI / 2; ringM.position.copy(base).add(new THREE.Vector3(0, 0.05, 0));
  fxRoot.add(pillar, ringM);
  const sparks = [];
  const n = tier >= 3 ? 26 : 14;
  for (let i = 0; i < n; i++){
    const m = new THREE.Mesh(boxGeo, mat(i % 2 ? c1 : c2, i % 2 ? '#555555' : '#665500'));
    m.scale.setScalar(rnd(0.05, 0.1)); fxRoot.add(m);
    sparks.push({ m, a:rnd(0, TAU), r:rnd(0.35, 0.75), y:rnd(0, 0.4), v:rnd(1.6, 3.2), w:rnd(4, 8) });
  }
  tfx.push({ base, pillar, ring:ringM, sparks, t:0, dur:u.tf.dur + 0.3, tier });
  if (tier >= 2) screenFlash(tier >= 3 ? 'rgba(201,182,242,.55)' : 'rgba(255,240,180,.45)');
  floatText(base.clone().add(new THREE.Vector3(0, 1.7, 0)), label, tier >= 3 ? 'crit' : 'big', tier >= 3 ? 1.6 : 1.1);
  // whoosh: rising sweep plus sparkle notes
  blip(220, 1400, 0.32, 'triangle', 0.05);
  const notes = tier >= 3 ? [988, 1319, 1568, 1976] : [784, 1047, 1319];
  notes.forEach((f, i) => setTimeout(() => blip(f, f * 1.01, 0.1, 'square', 0.03), 260 + i * 70));
}
function updateTfx(rdt){
  for (let i = tfx.length - 1; i >= 0; i--){
    const f = tfx[i]; f.t += rdt;
    const k = f.t / f.dur;
    f.pillar.material.opacity = k < 0.2 ? k / 0.2 * 0.7 : Math.max(0, 0.7 * (1 - (k - 0.2) / 0.8));
    const sx = k < 0.3 ? 0.4 + k * 2 : Math.max(0.05, 1 - (k - 0.3) * 1.3);
    f.pillar.scale.set(sx, 1, sx);
    f.ring.scale.setScalar(0.3 + k * (f.tier >= 3 ? 2.6 : 1.8));
    f.ring.material.opacity = Math.max(0, 0.9 * (1 - k));
    f.sparks.forEach(sp => {
      sp.a += sp.w * rdt; sp.y += sp.v * rdt;
      sp.m.position.set(f.base.x + Math.cos(sp.a) * sp.r * (1 + k), f.base.y + sp.y, f.base.z + Math.sin(sp.a) * sp.r * (1 + k));
      sp.m.rotation.y += rdt * 8;
      sp.m.visible = k < 0.95;
    });
    if (f.t >= f.dur){
      fxRoot.remove(f.pillar, f.ring); f.sparks.forEach(sp => fxRoot.remove(sp.m));
      f.pillar.geometry.dispose(); f.ring.geometry.dispose();
      tfx.splice(i, 1);
    }
  }
}
function screenFlash(color){
  let el = document.getElementById('flashFx');
  if (!el){ el = document.createElement('div'); el.id = 'flashFx'; el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:4;transition:opacity .45s ease-out;opacity:0'; document.body.appendChild(el); }
  el.style.transition = 'none'; el.style.background = `radial-gradient(circle at 50% 50%, rgba(255,255,255,0) 30%, ${color} 100%)`; el.style.opacity = '1';
  requestAnimationFrame(() => { el.style.transition = 'opacity .45s ease-out'; el.style.opacity = '0'; });
}
function openBranch(u){
  const T = TYPES[u.type];
  $('branchTitle').textContent = T.name + ' 전직 선택';
  const box = $('branchChoices'); box.textContent = '';
  ['a', 'b'].forEach(k => {
    const br = T.br[k];
    const b = document.createElement('button'); b.className = 'choice';
    const img = document.createElement('img'); img.src = iconFor(u.type, 3, k, null); img.alt = '';
    const nm = document.createElement('b'); nm.textContent = br.name;
    const ds = document.createElement('span'); ds.textContent = br.desc;
    const st = document.createElement('span'); st.style.opacity = '.7';
    st.textContent = `공격 ${br.dmg} · 초당 ${br.rate}회 · 사거리 ${br.range}`;
    b.append(img, nm, ds, st);
    b.onclick = () => chooseBranch(k);
    box.appendChild(b);
  });
  G.modal = true;
  $('branchOv').classList.add('on');
}
function chooseBranch(k){
  const u = pendingBranch; pendingBranch = null;
  $('branchOv').classList.remove('on'); G.modal = false;
  if (!u) return;
  u.level = 3; u.branch = k;
  discover(u.type + '-' + k);
  rebuildUnit(u); mergeFx(u);
  checkHidden(u);
}

/* ---------------- input ---------------- */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pointerRay(e){
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
}
function pickTile(){
  const hits = ray.intersectObjects([walls, steps], false);
  for (const h of hits){
    const k = h.object === walls ? 'w' : 's';
    const t = k === 'w' ? instTile.walls[h.instanceId] : instTile.steps[h.instanceId];
    if (!t) continue;
    if (fadeAttr[k].array[h.instanceId] > 0.35 && !(h.face && h.face.normal.y > 0.5 && instY[k][h.instanceId] === TILE[t[1]][t[0]].h - 1)) continue;
    return { x:t[0], z:t[1] };
  }
  return null;
}
function pickUnit(){
  const hits = ray.intersectObjects(unitRoot.children, true);
  return hits.length ? hits[0].object.userData.unit : null;
}
const hoverBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.04, 1.04, 1.04)), new THREE.LineBasicMaterial({ color:0xffffff, depthTest:false }));
hoverBox.visible = false; hoverBox.renderOrder = 10; scene.add(hoverBox);

/* ---- occlusion: which blocks hide a stair top or an animal from the camera? ---- */
let occKey = '', occWait = 0;
const occDir = new THREE.Vector3();
function updateOcclusion(rdt){
  occWait -= rdt;
  const key = camAngle.toFixed(2) + camPitch.toFixed(2) + camTarget.x.toFixed(1) + camTarget.y.toFixed(1) + camTarget.z.toFixed(1) + '|' + units.map(u => u.x + u.z * MAP_W).join(',');
  if (key !== occKey && occWait <= 0){
    occKey = key; occWait = 0.08;
    fadeGoal.w.fill(0); fadeGoal.s.fill(0);
    camera.getWorldDirection(occDir).negate();
    const STEP = 0.18;
    // stair tops never fade (they ARE the route); everything else in the way of a stair or an animal does,
    // and plain platforms only clear away for really tall pillars so the map doesn't turn to static
    const mark = (tx, tz, y0) => {
      const list = colBlocks[tz * MAP_W + tx]; if (!list) return;
      for (const [k, i, y] of list) if (y >= y0 && k === 'w') fadeGoal[k][i] = 1;
    };
    const cast = (x, z, y, minRise = 0) => {
      let qx = wx(x), qy = y, qz = wz(z);
      for (let n = 0; n < 160; n++){
        qx += occDir.x * STEP; qy += occDir.y * STEP; qz += occDir.z * STEP;
        if (qy > MAX_H + 0.5) return;
        const tx = Math.round(qx + CX), tz = Math.round(qz + CZ);
        if (tx < 0 || tz < 0 || tx >= MAP_W || tz >= MAP_D) return;
        if (tx === x && tz === z) continue;
        const c = TILE[tz][tx];
        if (c.type !== 'void' && qy < c.h - 0.02 && c.h - y >= minRise) mark(tx, tz, Math.floor(qy));
      }
    };
    for (let z = 0; z < MAP_D; z++) for (let x = 0; x < MAP_W; x++){
      const t = TILE[z][x]; if (t.type === 'void' || t.type === 'land') continue;
      const key = t.type === 'path' || t.type === 'base' || unitAt(x, z);
      cast(x, z, t.h + 0.05, key ? 0 : 2);
      if (key) cast(x, z, t.h + 0.8);
    }
  }
  let dirty = false;
  for (const k of ['w', 's']){
    const a = fadeAttr[k].array, g = fadeGoal[k], sp = Math.min(1, rdt * 9);
    for (let i = 0; i < a.length; i++){
      const d = g[i] - a[i];
      if (d > 0.002 || d < -0.002){ a[i] += d * sp; dirty = true; } else if (d !== 0){ a[i] = g[i]; dirty = true; }
    }
    if (dirty) fadeAttr[k].needsUpdate = true;
  }
}

/* ---- selection markers (always on top): green = selected, yellow = where right-click will send them ---- */
const markGeo = (() => { const sh = new THREE.Shape(); sh.moveTo(-0.5, -0.5); sh.lineTo(0.5, -0.5); sh.lineTo(0.5, 0.5); sh.lineTo(-0.5, 0.5); sh.lineTo(-0.5, -0.5);
  const hole = new THREE.Path(); hole.moveTo(-0.38, -0.38); hole.lineTo(-0.38, 0.38); hole.lineTo(0.38, 0.38); hole.lineTo(0.38, -0.38); hole.lineTo(-0.38, -0.38); sh.holes.push(hole);
  const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); return g; })();
const markMats = { sel: new THREE.MeshBasicMaterial({ color:'#3cf08a', depthTest:false, transparent:true }), dst: new THREE.MeshBasicMaterial({ color:'#ffd84d', depthTest:false, transparent:true, opacity:0.9 }) };
const markPool = [];
function setMarks(list){
  while (markPool.length < list.length){ const m = new THREE.Mesh(markGeo, markMats.sel); m.renderOrder = 11; scene.add(m); markPool.push(m); }
  markPool.forEach((m, i) => {
    const it = list[i];
    m.visible = !!it; if (!it) return;
    m.material = markMats[it.kind];
    m.position.set(wx(it.x), TILE[it.z][it.x].h + 0.04, wz(it.z));
    m.scale.setScalar(it.kind === 'dst' ? 0.86 + Math.sin(performance.now() / 160) * 0.05 : 1.02);
  });
}
const ringMat = new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0.35, depthWrite:false, side:THREE.DoubleSide });
const ring = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 48), ringMat);
const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0.12, depthWrite:false }));
ring.rotation.x = disc.rotation.x = -Math.PI / 2;
const rangeViz = new THREE.Group(); rangeViz.add(ring, disc); rangeViz.visible = false; scene.add(rangeViz);
function showRange(x, z, range, ok = true){
  rangeViz.visible = true;
  rangeViz.position.set(wx(x), TILE[z][x].h + 0.05, wz(z));
  rangeViz.scale.setScalar(range);
  ringMat.color.set(ok ? 0xffffff : 0xff6b81);
}
function canBuild(x, z){ const t = TILE[z][x]; return t.type === 'build' && !unitAt(x, z); }
function tileFits(type, x, z){
  const t = TILE[z][x];
  if (TYPES[type].onPath) return t.type === 'path' && t.step >= 2 && t.step <= PATH.length - 3;
  return t.type === 'build';
}
function canPlace(type, x, z){ return !unitAt(x, z) && tileFits(type, x, z); }

/* group orders: everyone heads for the clicked block and fans out to the nearest free blocks around it */
G.group = [];
function selList(){ G.group = G.group.filter(u => units.includes(u)); return G.group.length ? G.group : (G.selUnit && units.includes(G.selUnit) ? [G.selUnit] : []); }
function planMove(list, t){
  const moving = new Set(list), taken = new Set(), plan = [];
  const order = list.slice().sort((a, b) => Math.hypot(a.x - t.x, a.z - t.z) - Math.hypot(b.x - t.x, b.z - t.z));
  for (const u of order){
    let best = null, bd = 1e9;
    for (let z = 0; z < MAP_D; z++) for (let x = 0; x < MAP_W; x++){
      if (!tileFits(u.type, x, z) || taken.has(x + z * MAP_W)) continue;
      const o = unitAt(x, z); if (o && !moving.has(o)) continue;
      const d = Math.hypot(x - t.x, z - t.z) - (TYPES[u.type].onPath ? 0 : Math.max(0, TILE[z][x].elev) * 0.01);
      if (d < bd){ bd = d; best = { x, z }; }
    }
    if (best && bd <= 5){ taken.add(best.x + best.z * MAP_W); plan.push({ u, x:best.x, z:best.z }); }
  }
  return plan;
}
function moveGroup(list, t){
  list = list.filter(u => units.includes(u));
  if (!t || !list.length) return;
  const target = unitAt(t.x, t.z);
  if (target && !list.includes(target)){
    // right-click on an animal: whoever matches merges into it, the rest gather around
    const m = list.find(u => tryMerge(u, target));
    if (m){ list = list.filter(u => u !== m && units.includes(u)); G.group = G.group.filter(u => units.includes(u)); ui(); if (!list.length) return; }
    else if (list.length === 1){ toast('합성은 같은 동물·같은 레벨끼리만!'); return; }
  }
  const plan = planMove(list, t);
  let moved = 0;
  for (const p of plan){
    if (p.u.x === p.x && p.u.z === p.z) continue;
    p.u.x = p.x; p.u.z = p.z;
    p.u.mesh.position.set(wx(p.x), TILE[p.z][p.x].h, wz(p.z)); dropIn(p.u.mesh); moved++;
  }
  if (moved) SFX.place(); else if (!plan.length) toast('근처에 놓을 자리가 없어요');
  if (G.selUnit && list.length === 1) showInfo(G.selUnit);
  ui();
}
function setGroup(list, add){
  const s = new Set(add ? selList() : []);
  list.forEach(u => s.add(u));
  const arr = [...s];
  if (arr.length === 1){ G.group = []; selectUnit(arr[0]); return; }
  G.armed = null; G.selTile = null; G.selUnit = null; $('info').style.display = 'none';
  G.group = arr; buildCards(); ui();
  if (arr.length) toast(arr.length + '마리 선택', '우클릭한 곳으로 모여요 · 같은 동물 위면 합성');
}
function screenXY(pos){
  const v = pos.clone().project(camera), r = canvas.getBoundingClientRect();
  return [r.left + (v.x * 0.5 + 0.5) * r.width, r.top + (-v.y * 0.5 + 0.5) * r.height];
}
function boxSelect(x0, y0, x1, y1, add){
  const l = Math.min(x0, x1), rr = Math.max(x0, x1), tp = Math.min(y0, y1), bt = Math.max(y0, y1);
  const hit = units.filter(u => { const [sx, sy] = screenXY(u.mesh.position.clone().add(new THREE.Vector3(0, 0.45, 0))); return sx >= l && sx <= rr && sy >= tp && sy <= bt; });
  setGroup(hit, add);
}
function rightClick(e){
  pointerRay(e);
  const tu = pickUnit(), tl = pickTile();
  const t = tu ? { x:tu.x, z:tu.z } : tl;
  if (G.drag){ dropDrag(t); return; }
  const list = selList();
  if (list.length){ moveGroup(list, t); return; }
  if (G.armed && t){ build(G.armed, t.x, t.z); return; }
  cancelSel();
}
let lastClick = { u:null, t:0 };
const selBoxEl = $('selBox');

let down = null;
canvas.addEventListener('pointerdown', e => {
  audio();
  if (G.modal || G.state === 'over' || G.state === 'win') return;
  if (e.button === 2){ rightClick(e); return; }
  if (G.drag && G.drag.key){ pointerRay(e); const tu = pickUnit(); dropDrag(tu ? { x:tu.x, z:tu.z } : pickTile()); return; }
  if (e.button === 1){
    // wheel-button drag: slide the view north/south/east/west
    e.preventDefault();
    down = { orbit:true, px:e.clientX, py:e.clientY, x:e.clientX, y:e.clientY, id:e.pointerId };
    try { canvas.setPointerCapture(e.pointerId); } catch(err){}
    canvas.style.cursor = 'grabbing';
    return;
  }
  pointerRay(e);
  const u = pickUnit();
  down = { x:e.clientX, y:e.clientY, px:e.clientX, py:e.clientY, u, moved:false, id:e.pointerId, touch: e.pointerType !== 'mouse', shift:e.shiftKey };
  try { canvas.setPointerCapture(e.pointerId); } catch(err){}
});
canvas.addEventListener('pointermove', e => {
  lastPtr = { clientX:e.clientX, clientY:e.clientY };
  pointerRay(e);
  const t = pickTile();
  G.hover = t;
  if (down && down.u && !down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8){
    down.moved = true; G.drag = { u:down.u };
    down.u.mesh.position.y += 0.4;
  }
  if (down && down.orbit){
    panBy(-(e.clientX - down.px), e.clientY - down.py);
    down.px = e.clientX; down.py = e.clientY;
    return;
  }
  if (down && !down.touch && !down.u && !G.drag && (down.box || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6)){
    // left-drag on empty ground: rubber-band box to grab a whole group
    down.box = true; down.moved = true;
    const st = selBoxEl.style; st.display = 'block';
    st.left = Math.min(down.x, e.clientX) + 'px'; st.top = Math.min(down.y, e.clientY) + 'px';
    st.width = Math.abs(e.clientX - down.x) + 'px'; st.height = Math.abs(e.clientY - down.y) + 'px';
    return;
  }
  if (down && down.touch && !down.u && !G.drag && (down.pan || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8)){
    down.pan = true; down.moved = true;
    const wpp = (camera.top - camera.bottom) / innerHeight;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
    camTarget.addScaledVector(right, -(e.clientX - down.px) * wpp).addScaledVector(up, (e.clientY - down.py) * wpp);
    camTarget.x = clamp(camTarget.x, -9, 9); camTarget.z = clamp(camTarget.z, -10, 10); camTarget.y = clamp(camTarget.y, -2, MAX_H + 2);
    down.px = e.clientX; down.py = e.clientY;
    return;
  }
  if (G.drag && t){
    const u = G.drag.u;
    u.mesh.position.set(wx(t.x), TILE[t.z][t.x].h + 0.4, wz(t.z));
  }
});
canvas.addEventListener('pointerup', e => {
  if (!down) return;
  const d = down; down = null;
  if (d.orbit){ canvas.style.cursor = ''; return; }
  if (d.pan) return;
  if (d.box){ selBoxEl.style.display = 'none'; boxSelect(d.x, d.y, e.clientX, e.clientY, d.shift || e.shiftKey); return; }
  pointerRay(e);
  const t = pickTile();
  if (G.drag && !G.drag.key){ const tu = pickUnit(); dropDrag(tu && tu !== G.drag.u ? { x:tu.x, z:tu.z } : t); return; }
  if (d.u){
    const now = performance.now();
    if (lastClick.u === d.u && now - lastClick.t < 320){
      // double-click: grab every animal of the same kind and level (handy for merging)
      setGroup(units.filter(o => o.type === d.u.type && o.level === d.u.level && !!o.hidden === !!d.u.hidden), false);
      lastClick.u = null; return;
    }
    lastClick = { u:d.u, t:now };
    if (d.shift || e.shiftKey){ setGroup([d.u], true); return; }
    G.group = []; selectUnit(d.u); return;
  }
  G.group = [];
  if (!t) { cancelSel(); return; }
  if (G.armed && canPlace(G.armed, t.x, t.z)){ build(G.armed, t.x, t.z); return; }
  if (canBuild(t.x, t.z)){
    G.selUnit = null; G.selTile = t; $('info').style.display = 'none';
    toast('어떤 동물을 놓을까요?', '아래 카드를 누르세요');
    ui();
    return;
  }
  cancelSel();
});
canvas.addEventListener('wheel', e => { zoom = clamp(zoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.6, 2.2); resize(); }, { passive:true });
document.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
canvas.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });
let lastPtr = null;
function dropDrag(t){
  const u = G.drag.u; G.drag = null;
  const target = t ? unitAt(t.x, t.z) : null;
  if (target && target !== u && tryMerge(u, target)){ /* merged or awakened */ }
  else if (t && canPlace(u.type, t.x, t.z)){ u.x = t.x; u.z = t.z; SFX.place(); }
  else if (target && target !== u){ toast('합성은 같은 동물·같은 레벨끼리만!'); }
  if (units.includes(u)){ u.mesh.position.set(wx(u.x), TILE[u.z][u.x].h, wz(u.z)); dropIn(u.mesh); }
  ui();
}
function hoveredUnit(){ if (!lastPtr) return null; pointerRay(lastPtr); return pickUnit(); }
function sellUnit(u){
  if (!u || !units.includes(u)) return;
  const v = sellValue(u);
  G.coins += v;
  floatText(u.mesh.position.clone().add(new THREE.Vector3(0, 1.1, 0)), '판매 +' + v, 'coin', 0.9);
  burst(u.mesh.position.clone().add(new THREE.Vector3(0, 0.3, 0)), ['#ffcf3f', '#ffffff'], 10, 1.6);
  blip(880, 440, 0.12, 'triangle', 0.04);
  if (G.drag && G.drag.u === u) G.drag = null;
  removeUnit(u);
  if (G.selUnit === u) cancelSel(); else { buildCards(); ui(); }
}
const keysDown = {};
let rotSpeed = store0('nyandef-rotspd', 90);
let preTopAngle = null;
function setTopView(on){
  G.topView = on; camPitchTarget = on ? 1.5 : 0.69; $('topBtn').classList.toggle('on', on);
  if (on){ preTopAngle = camAngleTarget; camAngleTarget = Math.round((camAngleTarget - Math.PI / 2) / (Math.PI / 2)) * (Math.PI / 2) + Math.PI / 2; }
  else if (preTopAngle != null){ camAngleTarget = preTopAngle; preTopAngle = null; }
}
function panBy(px, py){
  const wpp = (camera.top - camera.bottom) / innerHeight;
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
  camTarget.addScaledVector(right, px * wpp).addScaledVector(up, py * wpp);
  camTarget.x = clamp(camTarget.x, -9, 9); camTarget.z = clamp(camTarget.z, -10, 10); camTarget.y = clamp(camTarget.y, -2, MAX_H + 2);
}
addEventListener('keydown', e => {
  const code = e.code;
  if (code === 'Tab'){ e.preventDefault(); if (!e.repeat && !G.modal) setTopView(!G.topView); return; }
  if (code === 'KeyQ' || code === 'KeyR'){ keysDown[code] = true; return; }
  if (e.repeat && !code.startsWith('Arrow')) return;
  if (G.modal) return;
  if (code === 'KeyA' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); setGroup(units.slice(), false); return; }
  if (code === 'Escape'){
    if (G.drag){ const u = G.drag.u; G.drag = null; u.mesh.position.set(wx(u.x), TILE[u.z][u.x].h, wz(u.z)); dropIn(u.mesh); return; }
    cancelSel(); return;
  }
  const m = /^Digit([1-5])$/.exec(code) || /^Numpad([1-5])$/.exec(code);
  if (m && deck[+m[1] - 1]){ arm(deck[+m[1] - 1]); return; }
  if (code === 'Space' || code === 'Enter'){ e.preventDefault(); startWave(); return; }
  if (code === 'KeyW'){ keyGrab(); return; }
  if (code === 'KeyE'){ sellUnit(hoveredUnit() || G.selUnit); return; }
  if (code === 'KeyF'){ enhance(hoveredUnit() || G.selUnit); return; }
  if (code === 'KeyC'){ if (czOpenNow) closeCasino(); else openCasino(); return; }
  const pan = { ArrowLeft:[-1, 0], ArrowRight:[1, 0], ArrowUp:[0, 1], ArrowDown:[0, -1] }[code];
  if (pan){ e.preventDefault(); panBy(pan[0] * 60, pan[1] * 60); }
});
addEventListener('keyup', e => { keysDown[e.code] = false; });
addEventListener('blur', () => { keysDown.KeyQ = keysDown.KeyR = false; });
/* W acts like a left click under the cursor: pick an animal up, W again to put it down */
function keyGrab(){
  if (G.state === 'over' || G.state === 'win') return;
  if (G.drag){ if (lastPtr) pointerRay(lastPtr); dropDrag(pickTile()); return; }
  const u = hoveredUnit();
  if (u){ G.drag = { u, key:true }; G.selUnit = null; $('info').style.display = 'none'; u.mesh.position.y += 0.4; blip(500, 900, 0.06, 'triangle', 0.03); return; }
  if (!lastPtr) return;
  pointerRay(lastPtr);
  const t = pickTile();
  if (t && G.armed && canPlace(G.armed, t.x, t.z)) build(G.armed, t.x, t.z);
  else if (t && canBuild(t.x, t.z)){ G.selTile = t; toast('어떤 동물을 놓을까요?', '숫자 키나 아래 카드를 누르세요'); }
}
function rotate(d){ camAngleTarget += d * Math.PI / 2; }
function placing(){ return !!(G.armed || G.drag || G.topView); }
function cancelSel(){ G.armed = null; G.selTile = null; G.selUnit = null; G.group = []; $('info').style.display = 'none'; buildCards(); ui(); }
function arm(type){
  audio();
  if (G.selTile && canPlace(type, G.selTile.x, G.selTile.z)){ build(type, G.selTile.x, G.selTile.z); G.selTile = null; return; }
  G.armed = G.armed === type ? null : type;
  G.selUnit = null; $('info').style.display = 'none';
  buildCards();
}
function build(type, x, z){
  if (!canPlace(type, x, z)){ toast(TYPES[type].onPath ? '고슴도치는 계단(이동 경로) 위에만 놓아요' : '여기엔 놓을 수 없어요'); return; }
  const c = costOf(type);
  if (G.coins < c){ toast('코인이 부족해요', TYPES[type].name + ' ' + c + '코인 필요'); blip(200, 150, 0.12, 'square', 0.03); return; }
  G.coins -= c;
  const u = placeUnit(type, x, z);
  u.spent = c;
  discover(type);
  SFX.place();
  burst(u.mesh.position.clone().add(new THREE.Vector3(0, 0.2, 0)), ['#ffffff', '#f4e7d4'], 6, 1.2);
  if (G.coins < c) G.armed = null;
  buildCards(); ui();
}
function selectUnit(u){
  G.selUnit = u; G.selTile = null; G.armed = null;
  buildCards(); showInfo(u);
}
function sellValue(u){ return Math.round(TYPES[u.type].cost * (u.level === 1 ? 0.6 : u.level === 2 ? 1.2 : 2.4) + (u.enhSpent || 0) * 0.4); }
/* enhancement gamble: +1..+5 on max-level animals. fail can knock a step down, and from +4 it can break */
const ENH = [ { p:0.9, fail:'keep' }, { p:0.75, fail:'keep' }, { p:0.55, fail:'drop' }, { p:0.4, fail:'drop', boom:0.25 }, { p:0.25, fail:'drop', boom:0.4 } ];
function canEnhance(u){ return !!u && units.includes(u) && (u.level >= 3 || !!u.awake) && (u.plus || 0) < 5; }
function enhCost(u){ return Math.round(TYPES[u.type].cost * (0.6 + 0.4 * ((u.plus || 0) + 1))); }
function enhChance(u){ return Math.min(0.95, ENH[u.plus || 0].p + G.enhBonus); }
let enhBusy = false;
function enhance(u){
  if (enhBusy || G.state === 'over' || G.state === 'win') return;
  if (!canEnhance(u)){ if (u && units.includes(u)) toast((u.plus || 0) >= 5 ? '이미 +5 최고 강화예요' : '강화는 3레벨(전직)부터 할 수 있어요'); return; }
  const c = enhCost(u);
  if (G.coins < c){ toast('코인이 부족해요', '강화 ' + c + '코인 필요'); blip(200, 150, 0.12, 'square', 0.03); return; }
  G.coins -= c; u.enhSpent = (u.enhSpent || 0) + c;
  const step = ENH[u.plus || 0], chance = enhChance(u);
  enhBusy = true; ui(); if (G.selUnit === u) showInfo(u);
  floatText(u.mesh.position.clone().add(new THREE.Vector3(0, 1.5, 0)), '두근두근…', 'big', 0.9);
  let k = 0;
  const roll = setInterval(() => {
    blip(260 + k * 70, 260 + k * 70, 0.05, 'square', 0.025);
    if (units.includes(u)){ u.punch = 1; burst(u.mesh.position.clone().add(new THREE.Vector3(0, 0.5, 0)), ['#ffd84d', '#ffffff'], 2, 1); }
    k++;
  }, 110);
  setTimeout(() => {
    clearInterval(roll); enhBusy = false;
    if (!units.includes(u)) return;
    const pos = u.mesh.position.clone().add(new THREE.Vector3(0, 1.4, 0));
    if (Math.random() < chance){
      u.plus = (u.plus || 0) + 1; rebuildUnit(u);
      transformFx(u, u.plus >= 4 ? 3 : 2, '강화 성공! +' + u.plus);
      SFX.merge();
      if (u.plus === 5){ toast('+5 달성!', baseName(u) + ' 최고 강화', true); SFX.hidden(); }
    } else if (step.fail === 'keep'){
      floatText(pos, '강화 실패… (유지)', 'miss', 1); blip(300, 120, 0.3, 'sawtooth', 0.04);
    } else if (G.useCharm && G.charms > 0){
      G.charms--; floatText(pos, '실패! 🧿부적이 막았어요', 'big', 1.1); blip(500, 300, 0.25, 'triangle', 0.04);
      burst(pos, ['#7ac8ff', '#ffffff'], 10, 1.6);
    } else if (step.boom && Math.random() < step.boom){
      const name = unitName(u);
      burst(u.mesh.position.clone().add(new THREE.Vector3(0, 0.4, 0)), ['#555555', '#ff6b81', '#ffcf3f', '#ffffff'], 30, 3.2);
      shake = Math.max(shake, 0.5); blip(140, 40, 0.6, 'sawtooth', 0.06);
      removeUnit(u); if (G.selUnit === u) cancelSel();
      toast('펑! 강화 실패로 부서졌어요…', name);
    } else {
      u.plus--; rebuildUnit(u);
      floatText(pos, '강화 실패 -1', 'miss', 1.1); blip(300, 100, 0.35, 'sawtooth', 0.045);
      burst(pos, ['#888888', '#ffffff'], 8, 1.4);
    }
    if (G.selUnit === u && units.includes(u)) showInfo(u);
    buildCards(); ui();
  }, 950);
}
function showInfo(u){
  const s = statsOf(u), el = $('info');
  el.style.display = 'block';
  el.innerHTML = '';
  const h = document.createElement('h3'); h.textContent = unitName(u);
  const sub = document.createElement('div'); sub.className = 'sub';
  sub.textContent = `레벨 ${u.level}${u.hidden ? ' · 히든 전직' : ''} · ${TYPES[u.type].role}`;
  const tb = document.createElement('table');
  const rows = [['공격력', Math.round(s.dmg)], ['초당 공격', s.rate.toFixed(1)], ['사거리', s.range.toFixed(1)], ['높이 보너스', s.elev > 0 ? `+${s.elev}칸 (사거리 +${Math.round(12 * s.elev)}%)` : '없음'], ['처치', u.kills]];
  if (s.slow) rows.splice(3, 0, ['둔화', Math.round(s.slow * 100) + '%']);
  if (s.kb) rows.splice(3, 0, ['넉백', s.kb.toFixed(2) + '칸']);
  rows.forEach(([a, b]) => { const tr = document.createElement('tr'); const t1 = document.createElement('td'); t1.textContent = a; const t2 = document.createElement('td'); t2.textContent = b; tr.append(t1, t2); tb.append(tr); });
  el.append(h, sub, tb);
  const hint = document.createElement('div'); hint.className = 'hint';
  if (u.level < 3) hint.textContent = `우클릭한 블록으로 이동 · 같은 ${TYPES[u.type].name} ${u.level}레벨 위에 우클릭하면 ${u.level + 1}레벨!` + (u.level === 2 ? ' 3레벨에서 전직해요.' : '');
  else hint.textContent = '최고 레벨이에요.';
  const hk = Object.keys(HIDDEN).find(k => HIDDEN[k].base === u.type);
  if (hk && !u.hidden){ hint.textContent += ' · 히든: ' + (discovered.has(hk) ? HIDDEN[hk].name : '???'); }
  if (u.hidden && !u.awake) hint.textContent = '숨겨진 각성이 있어요. ' + AWAKE[u.hidden].hint;
  if (u.awake) hint.textContent = '각성 완료! ' + AWAKE[u.hidden].desc;
  el.append(hint);
  if (u.level >= 3 || u.awake){
    const ex = document.createElement('div'); ex.className = 'enh';
    const p = u.plus || 0;
    if (p < 5){
      const st = ENH[p];
      const b = document.createElement('button'); b.className = 'btn pink'; b.disabled = enhBusy;
      b.textContent = `⚒ 강화 +${p}→+${p + 1} · ${Math.round(enhChance(u) * 100)}% · 🪙${enhCost(u)}`;
      b.onclick = () => enhance(u);
      const fr = document.createElement('div'); fr.className = 'sub';
      fr.textContent = st.fail === 'keep' ? '실패해도 그대로 · 단축키 F' : (st.boom ? `실패 시 -1 · ${Math.round(st.boom * 100)}% 확률로 파괴!` : '실패 시 -1') + ' · 단축키 F';
      ex.append(b, fr);
      if (st.fail !== 'keep'){
        const lb = document.createElement('label'); const cb = document.createElement('input'); cb.type = 'checkbox';
        cb.checked = G.useCharm; cb.disabled = !G.charms; cb.onchange = () => { G.useCharm = cb.checked; };
        lb.append(cb, ` 🧿 보호 부적 사용 (보유 ${G.charms})`); ex.append(lb);
      }
    } else { const d = document.createElement('div'); d.className = 'sub'; d.textContent = '✨ +5 최고 강화!'; ex.append(d); }
    el.append(ex);
  }
  const row = document.createElement('div'); row.className = 'row';
  const sell = document.createElement('button'); sell.className = 'btn ghost'; sell.textContent = `판매 +${sellValue(u)}`;
  sell.onclick = () => { G.coins += sellValue(u); burst(u.mesh.position.clone(), ['#ffcf3f'], 8, 1.5); removeUnit(u); cancelSel(); };
  const close = document.createElement('button'); close.className = 'btn ghost'; close.textContent = '닫기';
  close.onclick = cancelSel;
  row.append(sell, close);
  el.append(row);
}

/* ---------------- UI ---------------- */
function buildCards(){
  const box = $('cards'); box.textContent = '';
  deck.forEach((k, i) => {
    const T = TYPES[k];
    const b = document.createElement('button'); b.className = 'card' + (G.armed === k ? ' armed' : '') + (G.coins < costOf(k) ? ' poor' : '') + (T.special ? ' sp' : '');
    const kk = document.createElement('span'); kk.className = 'k'; kk.textContent = String(i + 1);
    const img = document.createElement('img'); img.src = iconFor(k); img.alt = '';
    const nm = document.createElement('b'); nm.textContent = T.name;
    const cs = document.createElement('span'); cs.textContent = '🪙' + costOf(k);
    const rl = document.createElement('small'); rl.textContent = T.role;
    b.append(kk, img, nm, cs, rl);
    b.onclick = () => arm(k);
    box.appendChild(b);
  });
}
let lastCoins = -1;
function ui(){
  $('hpText').textContent = Math.max(0, G.hp);
  $('hpFill').style.width = clamp(G.hp / G.maxHp, 0, 1) * 100 + '%';
  $('coinText').textContent = G.coins;
  $('waveText').textContent = `${G.wave}/${WAVES.length}`;
  const wb = $('waveBtn');
  wb.disabled = G.state !== 'build' || G.wave >= WAVES.length;
  wb.textContent = G.state === 'wave' ? `웨이브 ${G.wave} 진행 중` : G.wave >= WAVES.length ? '끝!' : G.mode === 'hard' ? `▶ 지금 시작 (${Math.max(0, Math.ceil(G.autoT))})` : `▶ 웨이브 ${G.wave + 1}`;
  updateCasinoChip();
  if (G.coins !== lastCoins){ lastCoins = G.coins; [...$('cards').children].forEach((b, i) => deck[i] && b.classList.toggle('poor', G.coins < costOf(deck[i]))); }
}
let toastT = 0;
function toast(title, sub = '', special = false){
  const el = $('toast');
  el.className = 'px' + (special ? ' hidden-job' : '');
  el.textContent = title;
  if (sub){ const s = document.createElement('small'); s.textContent = sub; el.appendChild(s); }
  el.style.display = 'block';
  toastT = special ? 3.2 : 1.8;
}
function openCodex(){
  const grid = $('codexGrid'); grid.textContent = '';
  const entries = [];
  Object.keys(TYPES).forEach(t => {
    const T = TYPES[t];
    entries.push({ key:t, name:T.name, img:iconFor(t), sub: T.special ? (unlocked.has(t) ? '특화' : '해금: ' + T.unlock.text) : '기본', hidden: T.special && !unlocked.has(t), hint: T.special ? '해금: ' + T.unlock.text : '' });
    if (T.br) ['a', 'b'].forEach(k => entries.push({ key:t + '-' + k, name:T.br[k].name, img:iconFor(t, 3, k), sub:T.name + ' 전직' }));
  });
  Object.entries(HIDDEN).forEach(([k, h]) => {
    entries.push({ key:k, name:h.name, img:iconFor(h.base, 2, null, k), sub:'히든 전직', hint:h.hint, hidden:true });
    entries.push({ key:k + '+', name:AWAKE[k].name, img:iconFor(h.base, 2, null, k, true), sub:'각성', hint: discovered.has(k) ? AWAKE[k].hint : '???', hidden:true });
  });
  entries.forEach(en => {
    const found = discovered.has(en.key);
    const d = document.createElement('div'); d.className = 'cx' + (found ? '' : ' locked');
    const img = document.createElement('img'); img.src = en.img; img.alt = '';
    const b = document.createElement('b'); b.textContent = found ? en.name : '???';
    const s = document.createElement('span'); s.textContent = found ? en.sub : (en.hidden ? en.hint : en.sub);
    d.append(img, b, s); grid.appendChild(d);
  });
  G.modal = true; $('codexOv').classList.add('on');
}

$('waveBtn').onclick = () => startWave();
$('speedBtn').onclick = () => { G.speed = G.speed === 1 ? 2 : G.speed === 2 ? 3 : 1; $('speedBtn').textContent = 'x' + G.speed; };
$('pauseBtn').onclick = () => { G.paused = !G.paused; $('pauseBtn').textContent = G.paused ? '▶' : 'Ⅱ'; };
$('rotL').onclick = () => rotate(-1);
$('rotR').onclick = () => rotate(1);
$('codexBtn').onclick = openCodex;
$('codexClose').onclick = () => { $('codexOv').classList.remove('on'); G.modal = false; };
$('muteBtn').onclick = () => { muted = !muted; store.set('nyandef-mute', muted); $('muteBtn').textContent = muted ? '✕' : '♪'; if (muted) stopBgm(); else if (G.state === 'wave') playBgm(G.wave === WAVES.length); };
$('muteBtn').textContent = muted ? '✕' : '♪';
function renderDeck(){
  const box = $('deckGrid'); if (!box) return;
  box.textContent = '';
  Object.keys(TYPES).forEach(k => {
    const T = TYPES[k], open = isOpen(k), on = deck.includes(k);
    const b = document.createElement('button'); b.type = 'button';
    b.className = 'dk' + (on ? ' on' : '') + (open ? '' : ' locked');
    const img = document.createElement('img'); img.src = iconFor(k); img.alt = '';
    const nm = document.createElement('b'); nm.textContent = open ? T.name : '???';
    const sm = document.createElement('small'); sm.textContent = open ? T.role : '🔒 ' + T.unlock.text;
    b.append(img, nm, sm);
    b.onclick = () => {
      if (!open){ toast('아직 잠겨 있어요', T.unlock.text); return; }
      if (on){ if (deck.length <= 3){ toast('덱에는 최소 3마리!'); return; } deck = deck.filter(x => x !== k); }
      else { if (deck.length >= 5){ toast('덱은 최대 5마리!', '하나를 빼고 넣어 주세요'); return; } deck.push(k); }
      try { localStorage.setItem('nyandef-deck', JSON.stringify(deck)); } catch(e){}
      renderDeck(); buildCards();
    };
    box.appendChild(b);
  });
  $('deckCount').textContent = deck.length + ' / 5';
}
function begin(mode){ audio(); G.mode = mode; resetState(); $('introOv').classList.remove('on'); G.modal = false; buildCards(); ui(); czPending = performance.now() + 1500;
  if (mode === 'hard') toast('하드 모드', '웨이브가 자동으로 시작돼요. 15초 안에 배치하세요!'); }
$('startBtn').onclick = () => begin('normal');
$('startHard').onclick = () => begin('hard');
$('retryBtn').onclick = () => restart();
$('topBtn').onclick = () => setTopView(!G.topView);
$('setBtn').onclick = () => { const p = $('setPanel'); p.hidden = !p.hidden; };
document.querySelectorAll('#pixSeg button').forEach(b => {
  b.classList.toggle('on', +b.dataset.v === pixLevel);
  b.onclick = () => { pixLevel = +b.dataset.v; try { localStorage.setItem('nyandef-pix', String(pixLevel)); } catch(err){} document.querySelectorAll('#pixSeg button').forEach(x => x.classList.toggle('on', x === b)); resize(); };
});
$('rotSpd').value = rotSpeed; $('rotSpdVal').textContent = rotSpeed + '°/초';
$('rotSpd').oninput = e => { rotSpeed = +e.target.value; $('rotSpdVal').textContent = rotSpeed + '°/초'; try { localStorage.setItem('nyandef-rotspd', String(rotSpeed)); } catch(err){} };
renderDeck();
G.modal = true;

function restart(){
  for (const u of [...units]) removeUnit(u);
  for (const e of foes) foeRoot.remove(e.mesh);
  foes.length = 0;
  for (const s of shots) fxRoot.remove(s.m);
  shots.length = 0;
  resetState();
  $('endOv').classList.remove('on');
  G.modal = true; renderDeck(); $('introOv').classList.add('on');
  baseMesh.visible = true;
  buildCards(); ui();
}

/* ---------------- main loop ---------------- */
let last = performance.now(), shake = 0, simT = 0;
document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'wave'){ G.paused = true; $('pauseBtn').textContent = '▶'; } });
function update(dt){
  if (G.state === 'build' && G.mode === 'hard' && G.wave < WAVES.length){
    if (!czSpinning) G.autoT -= dt;
    if (G.autoT <= 0) startWave(true);
    else if (Math.floor(G.autoT + dt) !== Math.floor(G.autoT)) ui();
  }
  if (G.state === 'wave'){
    G.waveT += dt;
    while (G.spawnQ.length && G.spawnQ[0].t <= G.waveT) spawnFoe(G.spawnQ.shift().type);
  }
  // foes
  for (const e of foes){
    if (e.dead) continue;
    e.slowT -= dt; e.freezeT -= dt; e.stunT -= dt; e.curseT -= dt;
    let sp = e.def.speed * e.spd;
    if (e.slowT > 0) sp *= 1 - e.slowP; else e.slowP = 0;
    if (e.freezeT > 0 || e.stunT > 0) sp = 0;
    if (e.def.pack && foes.some(o => o !== e && !o.dead && o.type === 'wolf' && Math.abs(o.s - e.s) < 1.2)) sp *= 1.25;
    e.walk += dt * sp * 9;
    if (e.def.fly){ e.u += sp * dt / FLY_LEN; if (e.u >= 1) leak(e); }
    else { e.s += sp * dt; if (e.s >= PATH_LEN) leak(e); }
    if (e.def.boss && !e.dead){
      e.summonT -= dt;
      if (e.summonT <= 0){
        e.summonT = 6;
        for (let i = 0; i < 2; i++){ const w = spawnFoe('wolf'); w.s = Math.max(0, e.s - 0.4 - i * 0.4); placeFoe(w, 0); }
        floatText(e.mesh.position.clone().add(new THREE.Vector3(0, 2.2, 0)), '아우우~!', 'big', 0.9);
        blip(300, 600, 0.4, 'sawtooth', 0.04);
      }
    }
    if (!e.dead) placeFoe(e, dt);
  }
  for (let i = foes.length - 1; i >= 0; i--) if (foes[i].dead) foes.splice(i, 1);
  // units
  for (const u of units){
    if (G.drag && G.drag.u === u) continue;
    u.cd -= dt;
    const s = statsOf(u);
    u.luck = s.luck || 0;
    if (u.type === 'hedgehog'){
      if (u.cd <= 0){
        u.cd = 1 / s.rate;
        let hit = false;
        for (const o of foes){
          if (o.dead || o.def.fly) continue;
          const dx = o.mesh.position.x - u.mesh.position.x, dz = o.mesh.position.z - u.mesh.position.z;
          if (dx * dx + dz * dz <= s.range * s.range && Math.abs(o.mesh.position.y - u.mesh.position.y) < 1.2){
            o.slowP = Math.max(o.slowT > 0 ? o.slowP : 0, s.slow); o.slowT = Math.max(o.slowT, 0.4);
            hurt(o, s.dmg / s.rate, u, { sure:true }); hit = true;
          }
        }
        if (hit) u.punch = 1;
      }
      continue;
    }
    const tgt = pickTarget(u, s);
    if (s.star){
      u.starT = (u.starT == null ? s.star : u.starT) - dt;
      if (u.starT <= 0 && foes.length){
        const big = foes.filter(o => !o.dead && inRange(u, o, s.range + 1)).sort((a, b) => b.hp - a.hp)[0];
        if (big){ u.starT = s.star; starStrike(u, s, big); }
      }
    }
    if (tgt){
      const dx = tgt.mesh.position.x - u.mesh.position.x, dz = tgt.mesh.position.z - u.mesh.position.z;
      u.yawT = Math.atan2(dx, dz);
      if (u.cd <= 0){ u.cd = 1 / s.rate; fire(u, s, tgt); }
    }
  }
  updateShots(dt);
  if (G.state === 'wave' && !G.spawnQ.length && !foes.length) endWave();
}
function leak(e){
  e.dead = true;
  foeRoot.remove(e.mesh);
  G.hp -= e.def.dmg; G.leaks++;
  shake = Math.max(shake, e.def.boss ? 0.8 : 0.25);
  SFX.leak();
  burst(baseMesh.position.clone().add(new THREE.Vector3(0, 0.6, 0)), ['#ff6b81', '#ffffff'], 8, 2);
  floatText(baseMesh.position.clone().add(new THREE.Vector3(0, 1.4, 0)), '-' + e.def.dmg + ' ❤', 'big', 0.9);
  ui();
  if (G.hp <= 0 && G.state === 'wave'){ baseMesh.visible = false; burst(baseMesh.position.clone().add(new THREE.Vector3(0, 0.5, 0)), ['#a8d8f7', '#ff6b81', '#ffcf3f'], 40, 4); finish(false); }
}
function animate(rdt, dt){
  const t = performance.now() / 1000;
  // camera rotation: hold Q / R to turn at the chosen speed, buttons snap 90°
  const rs = rotSpeed * Math.PI / 180 * rdt;
  if (keysDown.KeyQ){ camAngleTarget -= rs; camAngle = camAngleTarget; }
  if (keysDown.KeyR){ camAngleTarget += rs; camAngle = camAngleTarget; }
  let da = camAngleTarget - camAngle; camAngle += da * Math.min(1, rdt * 10);
  camPitch += (camPitchTarget - camPitch) * Math.min(1, rdt * 10);
  const sh = shake > 0 ? shake * 0.25 : 0; shake = Math.max(0, shake - rdt);
  placeCamera();
  if (sh){ camera.position.x += rnd(-sh, sh); camera.position.y += rnd(-sh, sh); }
  // units: idle bob, aim, attack punch, drop-in
  for (const u of units){
    const b = u.mesh.userData.body;
    if (u.yawT != null){ let d = u.yawT - u.mesh.rotation.y; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; u.mesh.rotation.y += d * Math.min(1, rdt * 10); }
    u.punch = Math.max(0, u.punch - rdt * 6);
    const bob = Math.abs(Math.sin(t * 2.4 + u.x + u.z)) * 0.03;
    b.position.y = bob; b.position.z = u.punch * 0.12;
    b.scale.set(1 + u.punch * 0.08, 1 - u.punch * 0.08, 1 + u.punch * 0.08);
    if (u.tf){
      u.tf.t += rdt;
      const k = Math.min(1, u.tf.t / u.tf.dur);
      // shrink & lift, spin fast, then pop past full size and settle
      const scl = k < 0.35 ? 1 - (k / 0.35) * 0.75 : k < 0.6 ? 0.25 + ((k - 0.35) / 0.25) * 1.15 : 1.4 - Math.sin(((k - 0.6) / 0.4) * Math.PI * 1.5) * 0.12 * (1 - k) - ((k - 0.6) / 0.4) * 0.4;
      b.scale.setScalar(Math.max(0.05, scl));
      b.position.y = Math.sin(k * Math.PI) * 0.9;
      b.rotation.y = (1 - k) * (1 - k) * TAU * 3;
      if (k >= 1){ u.tf = null; b.rotation.y = 0; }
    }
    if (u.mesh.userData.tail) u.mesh.userData.tail.rotation.z = Math.sin(t * 5 + u.x) * 0.4;
    if (u.mesh.userData.wings){ u.mesh.userData.wings[0].rotation.z = 0.2 + Math.sin(t * 6) * 0.2; u.mesh.userData.wings[1].rotation.z = -0.2 - Math.sin(t * 6) * 0.2; }
    if (u.mesh.userData.halo) u.mesh.userData.halo.rotation.z = t * 0.8;
    if (u.mesh.userData.plusRing){ const pr = u.mesh.userData.plusRing; pr.rotation.z = t * 1.2; pr.material.opacity = 0.6 + Math.sin(t * 4 + u.x) * 0.25; }
    if (u.mesh.userData.orb){ u.mesh.userData.orb.position.y = 0.75 + Math.sin(t * 3) * 0.06; u.mesh.userData.orb.rotation.y = t * 2; }
    if (u.mesh.userData.aura){ u.mesh.userData.aura.rotation.z = t; u.mesh.userData.aura.material.opacity = 0.5 + Math.sin(t * 4) * 0.25; }
    const dr = u.mesh.userData.drop;
    if (dr > 0){ u.mesh.userData.drop = Math.max(0, dr - rdt); const k = u.mesh.userData.drop / 0.35; u.mesh.position.y = TILE[u.z][u.x].h + k * k * 1.2; }
  }
  // foes: legs, wings, hit flash, bars
  for (const e of foes){
    const ud = e.mesh.userData, sw = Math.sin(e.walk) * 0.5;
    if (ud.legs) ud.legs.forEach((l, i) => { l.rotation.x = (i % 2 ? sw : -sw); });
    if (ud.wings){ ud.wings[0].rotation.z = Math.sin(t * 14) * 0.6; ud.wings[1].rotation.z = -Math.sin(t * 14) * 0.6; }
    if (ud.tail) ud.tail.rotation.y = Math.sin(t * 6 + e.walk) * 0.3;
    const frozen = e.freezeT > 0, slowed = e.slowT > 0;
    if (ud.flash > 0){ ud.flash -= rdt; ud.body.scale.setScalar(1.12); } else ud.body.scale.setScalar(1);
    ud.body.children.forEach(c => { if (c.material){ c.material = c.userData.mat0 || (c.userData.mat0 = c.material); if (frozen) c.material = mat('#bfe0ff'); } });
    if (slowed && !frozen && Math.random() < rdt * 6) burst(e.mesh.position.clone().add(new THREE.Vector3(0, 0.4, 0)), ['#ffffff'], 1, 0.4);
    const bar = e.bar;
    bar.visible = e.hp < e.maxHp;
    bar.quaternion.copy(camera.quaternion);
    const inv = 1 / e.mesh.scale.x; bar.scale.setScalar(inv);
    bar.quaternion.premultiply(e.mesh.quaternion.clone().invert());
    const k = clamp(e.hp / e.maxHp, 0, 1);
    bar.userData.fg.scale.x = Math.max(0.001, k);
    bar.userData.fg.position.x = -(1 - k) * bar.userData.w / 2;
  }
  baseMesh.userData.fish.rotation.y = Math.sin(t * 2) * 0.5;
  baseMesh.userData.glow.material.opacity = 0.4 + Math.sin(t * 3) * 0.25; baseMesh.userData.glow.scale.setScalar(1 + Math.sin(t * 3) * 0.06);
  clouds.forEach(c => { c.userData.a += c.userData.v * rdt * 0.1; c.position.x = Math.cos(c.userData.a) * c.userData.r; c.position.z = Math.sin(c.userData.a) * c.userData.r; });
  updateBits(dt > 0 ? dt : rdt * 0.25);
  updateTfx(rdt);
  updateOcclusion(rdt);
  {
    const list = G.modal ? [] : selList();
    const marks = (G.group.length ? list : []).map(u => ({ kind:'sel', x:u.x, z:u.z }));
    if (list.length && G.hover && !G.drag && !down){
      const hu = unitAt(G.hover.x, G.hover.z);
      if (!(hu && list.includes(hu))) planMove(list, G.hover).forEach(p => { if (p.u.x !== p.x || p.u.z !== p.z) marks.push({ kind:'dst', x:p.x, z:p.z }); });
    }
    setMarks(marks);
  }
  // hover / range + coverage preview
  hoverBox.visible = false; rangeViz.visible = false;
  let cover = -1, coverRange = 0, cx = 0, cz = 0, tipElev = 0;
  const tile = G.drag ? G.hover : (G.selTile || G.hover);
  const ptype = G.drag ? G.drag.u.type : G.armed;
  if (G.selUnit && !G.drag && !G.group.length){ const s = statsOf(G.selUnit); showRange(G.selUnit.x, G.selUnit.z, s.range); cx = G.selUnit.x; cz = G.selUnit.z; coverRange = s.range; }
  else if (tile && !G.modal){
    const t2 = TILE[tile.z][tile.x];
    const ok = ptype ? canPlace(ptype, tile.x, tile.z) : canBuild(tile.x, tile.z);
    if (t2.type === 'build' || unitAt(tile.x, tile.z) || (ptype && TYPES[ptype].onPath && t2.type === 'path')){
      hoverBox.visible = true;
      hoverBox.position.set(wx(tile.x), t2.h - 0.5, wz(tile.z));
      hoverBox.material.color.set(ok ? 0xffffff : 0xffcf3f);
      if (ptype && ok){
        const u0 = G.drag ? G.drag.u : null;
        const fake = { type:ptype, level: u0 ? u0.level : 1, branch: u0 ? u0.branch : null, hidden: u0 ? u0.hidden : null, awake: u0 ? u0.awake : false, x:tile.x, z:tile.z };
        const r = statsOf(fake).range;
        showRange(tile.x, tile.z, r, G.drag || G.coins >= costOf(ptype));
        cx = tile.x; cz = tile.z; coverRange = r; tipElev = TYPES[ptype].onPath ? 0 : Math.max(0, t2.elev);
      }
    }
  }
  if (coverRange > 0) cover = showCover(cx, cz, coverRange) ?? coverCount(cx, cz, coverRange);
  else { if (coverKey !== ''){ coverKey = ''; coverMesh.visible = false; } }
  const tip = $('coverTip');
  if (cover >= 0 && lastPtr && !G.selUnit){
    tip.style.display = 'block';
    tip.textContent = `계단 ${cover}칸 커버` + (tipElev > 0 ? ` · 높이 +${Math.min(3, tipElev)}` : '');
    tip.style.transform = `translate(${lastPtr.clientX + 16}px, ${lastPtr.clientY + 14}px)`;
  } else tip.style.display = 'none';
  updateBadges(placing() && !G.modal, ptype || (G.topView ? 'cat' : null));
  if (czPending && performance.now() > czPending && !G.modal && G.state === 'build' && !G.spun && G.wave < WAVES.length){ czPending = 0; openCasino(); }
  if (toastT > 0){ toastT -= rdt; if (toastT <= 0) $('toast').style.display = 'none'; }
}
function loop(now){
  const rdt = Math.min(0.05, (now - last) / 1000); last = now;
  sfxBudget = 0;
  const dt = (G.paused || G.modal || G.state === 'over' || G.state === 'win') ? 0 : rdt * G.speed;
  if (dt > 0){
    // sub-step at high speed for stable combat
    const n = Math.ceil(dt / 0.034);
    for (let i = 0; i < n; i++) update(dt / n);
    simT += dt;
  }
  animate(rdt, dt);
  renderer.render(scene, camera);
  updateFloats(rdt);
  requestAnimationFrame(loop);
}
buildCards(); ui();
requestAnimationFrame(loop);

/* test hook for automated checks */
window.__nd = { screenOf:(u) => screenXY(u.mesh.position.clone().add(new THREE.Vector3(0, 0.5, 0))), tileXY:(x, z) => screenXY(new THREE.Vector3(wx(x), TILE[z][x].h, wz(z))), fadeCount:() => fadeGoal.w.reduce((a, b) => a + b, 0) + fadeGoal.s.reduce((a, b) => a + b, 0), setGroup, moveGroup, selList, enhance, ENH, spinCount:() => spinCount, openCasino, closeCasino, spinWheel, ROUL, setPix:(v) => { pixLevel = v; resize(); }, step:(dt) => update(dt), endWave, begin, awaken, canAwaken, canPlace, keyGrab, sellUnit, setTopView, deck:() => deck, unlocked, G, units, foes, TILE, PATH, startWave, build, tryMerge, placeUnit, openCards, takeCard, chooseBranch, becomeHidden, spawnFoe, statsOf, canBuild };
