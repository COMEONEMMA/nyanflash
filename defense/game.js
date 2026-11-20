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
for (let z = 0; z < MAP_D; z++) for (let x = 0; x < MAP_W; x++){
  const t = TILE[z][x];
  if (t.type === 'path') continue;
  let best = 99, bi = -1;
  PATH.forEach(([px, pz], i) => { const d = Math.max(Math.abs(px - x), Math.abs(pz - z)); if (d < best || (d === best && PATH_H[i] > PATH_H[bi])){ best = d; bi = i; } });
  const r = hash(x, z);
  if (best === 1 || (best === 2 && r < 0.22)){
    // platforms hug the stairs a little lower so the climb stays readable; rare tall pillars are sniper spots
    const offs = [-2, -1, -1, -1, 0, 0, 1];
    let off = offs[Math.floor(hash(z + 7, x + 3) * offs.length)];
    if (best === 2) off -= 1;
    if (r > 0.9) off = 2;
    if (r > 0.97) off = 3;
    const h = clamp(PATH_H[bi] + off, 1, 15);
    TILE[z][x] = { type:'build', h, near:bi, elev:h - PATH_H[bi] };
  }
}
{ const [bx, bz] = BASE_TILE; TILE[bz][bx] = { type:'base', h:PATH_H[PATH_H.length - 1], near:PATH.length - 1, elev:0 }; }
const CX = (MAP_W - 1) / 2, CZ = (MAP_D - 1) / 2;
const MAX_H = Math.max(...PATH_H) + 3;
const wx = x => x - CX, wz = z => z - CZ;

/* ---------------- definitions ---------------- */
const TYPES = {
  cat: { name:'고양이', cost:50, air:true, role:'연사 · 공중 가능', key:'1',
    lv:[ { dmg:6, rate:2.2, range:2.6 }, { dmg:14, rate:2.6, range:2.8 } ],
    br:{ a:{ name:'사자', dmg:55, rate:1.0, range:3.0, stun:0.25, desc:'한 방이 묵직한 맹수. 맞은 적이 잠깐 멈칫해요.' },
         b:{ name:'닌자 고양이', dmg:11, rate:5, range:2.8, crit:0.2, desc:'눈에 안 보이는 연사. 20% 확률 치명타.' } } },
  dog: { name:'강아지', cost:70, air:false, role:'근접 광역 · 넉백', key:'2',
    lv:[ { dmg:20, rate:1.0, range:1.5, kb:0.25, splash:0.6 }, { dmg:45, rate:1.1, range:1.6, kb:0.3, splash:0.7 } ],
    br:{ a:{ name:'도베르만', dmg:120, rate:1.1, range:1.7, kb:0.55, splash:0.8, desc:'강한 넉백으로 계단 아래로 밀어내요.' },
         b:{ name:'세인트버나드', dmg:55, rate:1.2, range:1.7, kb:0.2, splash:0.9, stun:0.7, desc:'물 때마다 적을 붙잡아 기절시켜요.' } } },
  rabbit: { name:'토끼', cost:90, air:true, role:'저격 · 공중 가능', key:'3',
    lv:[ { dmg:32, rate:0.6, range:4.2 }, { dmg:75, rate:0.65, range:4.6 } ],
    br:{ a:{ name:'스나이퍼 토끼', dmg:260, rate:0.5, range:6.0, desc:'맵 반대편까지 닿는 한 방.' },
         b:{ name:'연발 토끼', dmg:48, rate:2.2, range:4.6, desc:'당근을 쉴 새 없이 던져요.' } } },
  penguin: { name:'펭귄', cost:80, air:false, role:'광역 둔화', key:'4',
    lv:[ { dmg:5, rate:0.9, range:2.4, aoe:0.9, slow:0.35 }, { dmg:12, rate:1.0, range:2.6, aoe:1.0, slow:0.45 } ],
    br:{ a:{ name:'황제펭귄', dmg:20, rate:1.0, range:3.0, aoe:1.6, slow:0.55, desc:'넓은 범위를 꽁꽁 느리게.' },
         b:{ name:'얼음술사 펭귄', dmg:30, rate:1.0, range:2.8, aoe:1.0, slow:0.45, freeze:0.3, desc:'30% 확률로 적을 얼려서 멈춰요.' } } },
};
const HIDDEN = {
  moon: { base:'rabbit', name:'달토끼', desc:'하늘을 지배하는 저격수. 공중 적에게 피해 2배.', hint:'높은 곳의 토끼가 하늘의 적을 많이 잡으면…' },
  catdog: { base:'dog', name:'냥멍이', desc:'고양이 탈을 쓴 개. 강아지인데 연사도 하고 공중도 물어요.', hint:'고양이 곁을 오래 지킨 강아지는…' },
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
];

/* ---------------- state ---------------- */
const G = {};
function resetState(){
  Object.assign(G, { coins:150, hp:20, maxHp:20, wave:0, state:'build', kills:0, speed:1, paused:false, modal:false,
    mods:{ catspd:1, rabrng:1, dogkb:1, dogdmg:1, pengslow:0, pengaoe:1, alldmg:1, coin:1, height:1, interest:false, discount:1 },
    taken:{}, spawnQ:[], waveT:0, leaks:0, armed:null, selTile:null, selUnit:null, hover:null, drag:null });
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
let camAngle = Math.PI / 4, camAngleTarget = camAngle, zoom = 1.05;
const camTarget = new THREE.Vector3(0, MAX_H * 0.36, 0.5);
let PIX = 2;
function resize(){
  const w = innerWidth, h = innerHeight;
  PIX = w < 700 ? 1.6 : 2.2;
  renderer.setPixelRatio(1 / PIX * Math.min(2, devicePixelRatio || 1));
  renderer.setSize(w, h, false);
  const aspect = w / h;
  const viewH = (aspect < 0.9 ? 32 : 25) / zoom;
  camera.left = -viewH * aspect / 2; camera.right = viewH * aspect / 2;
  camera.top = viewH / 2; camera.bottom = -viewH / 2;
  camera.updateProjectionMatrix();
}
function placeCamera(){
  const R = 40;
  camera.position.set(camTarget.x + Math.cos(camAngle) * R, camTarget.y + R * 0.82, camTarget.z + Math.sin(camAngle) * R);
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
function blockTexture(edge = 0.78, noise = 0.12, stripes = false){
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
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const blockMat = new THREE.MeshLambertMaterial({ map: blockTexture() });
const stepMat = new THREE.MeshLambertMaterial({ map: blockTexture(0.7, 0.08, true) });
let wallCount = 0, stepCount = 0;
for (let z = 0; z < MAP_D; z++) for (let x = 0; x < MAP_W; x++){
  const t = TILE[z][x]; if (t.type === 'void') continue;
  wallCount += t.h - (t.type === 'path' ? 1 : 0);
  if (t.type === 'path') stepCount++;
}
const walls = new THREE.InstancedMesh(boxGeo, blockMat, wallCount);
const steps = new THREE.InstancedMesh(boxGeo, stepMat, stepCount);
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
        steps.setMatrixAt(si, m); steps.setColorAt(si, col); instTile.steps[si] = [x, z]; si++;
      } else {
        if (y === top) col.set(t.type === 'base' ? '#ffe58a' : TOP_COLS[Math.floor(hash(x * 3, z * 5) * TOP_COLS.length)]);
        else col.copy(y % 2 ? WALL_A : WALL_B);
        walls.setMatrixAt(wi, m); walls.setColorAt(wi, col); instTile.walls[wi] = [x, z]; wi++;
      }
    }
  }
}
scene.add(walls, steps);

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

function makeAnimal(type, level = 1, branch = null, hidden = null){
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body); g.userData.body = body;
  const legs = [];
  const leg = (c, x, z) => { const l = vox(body, 0.09, 0.12, 0.09, c, x, 0.06, z); legs.push(l); };
  if (type === 'cat'){
    let c = '#f2a65a', d = '#d9803a', belly = '#fff1df';
    if (branch === 'a'){ c = '#f0c060'; d = '#c9952b'; }
    if (branch === 'b'){ c = '#4a4058'; d = '#2e2738'; belly = '#bdb3cc'; }
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
  // level dressing: bandana for 2, crown for 3
  if (level === 2) vox(body, 0.3, 0.06, 0.08, '#6fa8ff', 0, 0.4, 0.2);
  if (level >= 3){
    const crownY = type === 'rabbit' ? 1.1 : type === 'penguin' ? (branch === 'b' ? 1.18 : 0.9) : 0.86;
    if (!(type === 'rabbit')){
      vox(body, 0.22, 0.06, 0.22, '#ffcf3f', 0, crownY, 0.06, '#5a4200');
      [-1, 0, 1].forEach(i => vox(body, 0.05, 0.07, 0.05, '#ffcf3f', i * 0.08, crownY + 0.06, 0.15, '#5a4200'));
    } else vox(body, 0.36, 0.05, 0.05, '#ffcf3f', 0, 0.75, 0.24, '#5a4200');
  }
  g.userData.legs = legs;
  const s = [0, 1.18, 1.32, 1.48][level] || 1.18;
  g.scale.setScalar(hidden ? s * 1.06 : s);
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
  const g = new THREE.Group();
  vox(g, 0.9, 0.55, 0.8, '#a8d8f7', 0, 0.28, 0);
  vox(g, 1.0, 0.12, 0.9, '#ff6b81', 0, 0.6, 0);
  vox(g, 0.8, 0.12, 0.7, '#ff6b81', 0, 0.72, 0);
  vox(g, 0.5, 0.12, 0.5, '#ff6b81', 0, 0.84, 0);
  vox(g, 0.24, 0.3, 0.04, '#7a4a2a', 0, 0.16, 0.41);
  const fish = new THREE.Group();
  vox(fish, 0.26, 0.12, 0.04, '#ffcf3f', 0, 0, 0); vox(fish, 0.08, 0.14, 0.04, '#ffcf3f', -0.16, 0, 0); vox(fish, 0.03, 0.03, 0.02, '#2a1d2a', 0.08, 0.02, 0.025);
  fish.position.set(0, 1.08, 0); g.add(fish); g.userData.fish = fish;
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
  model.rotation.y = -0.45; s.add(model);
  const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
  const half = Math.max(size.x, size.y) * 0.62;
  const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 20);
  cam.position.set(ctr.x + 1.2, ctr.y + 1.0, ctr.z + 4); cam.lookAt(ctr);
  r.render(s, cam);
  icons[key] = r.domElement.toDataURL('image/png');
  return icons[key];
}
const iconKey = (type, level, branch, hidden) => hidden || (type + (level >= 3 ? '-' + branch : ''));
function iconFor(type, level = 1, branch = null, hidden = null){
  const k = iconKey(type, level, branch, hidden);
  return icons[k] || renderIcon(k, makeAnimal(hidden ? HIDDEN[hidden].base : type, Math.max(level, 1), branch, hidden));
}

/* ---------------- entities ---------------- */
const units = [], foes = [], shots = [], bits = [];
const unitAt = (x, z) => units.find(u => u.x === x && u.z === z);
const unitRoot = new THREE.Group(), foeRoot = new THREE.Group(), fxRoot = new THREE.Group();
scene.add(unitRoot, foeRoot, fxRoot);

function unitName(u){ return u.hidden ? HIDDEN[u.hidden].name : u.level >= 3 ? TYPES[u.type].br[u.branch].name : TYPES[u.type].name; }
function statsOf(u){
  const T = TYPES[u.type];
  const base = u.level >= 3 ? T.br[u.branch] : T.lv[u.level - 1];
  const s = { ...base, air:T.air };
  const elev = clamp(TILE[u.z][u.x].elev, 0, 3) * G.mods.height;
  s.range *= 1 + 0.12 * elev; s.dmg *= 1 + 0.1 * elev;
  s.dmg *= G.mods.alldmg;
  if (u.type === 'cat') s.rate *= G.mods.catspd;
  if (u.type === 'rabbit') s.range *= G.mods.rabrng;
  if (u.type === 'dog'){ s.kb = (s.kb || 0) * G.mods.dogkb; s.dmg *= G.mods.dogdmg; }
  if (u.type === 'penguin'){ s.slow = Math.min(0.8, (s.slow || 0) + G.mods.pengslow); s.aoe *= G.mods.pengaoe; }
  if (u.hidden === 'moon'){ s.dmg *= 1.7; s.range += 1; s.airMult = 2; }
  if (u.hidden === 'catdog'){ s.rate *= 2.2; s.air = true; }
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
function rebuildUnit(u){
  const pos = u.mesh.position.clone(), yaw = u.mesh.rotation.y;
  unitRoot.remove(u.mesh);
  u.mesh = makeAnimal(u.type, u.level, u.branch, u.hidden);
  u.mesh.position.copy(pos); u.mesh.rotation.y = yaw;
  u.mesh.traverse(o => { o.userData.unit = u; });
  unitRoot.add(u.mesh);
  u.punch = 1;
}
function removeUnit(u){ unitRoot.remove(u.mesh); units.splice(units.indexOf(u), 1); }
function dropIn(m){ m.userData.drop = 0.35; }

function spawnFoe(type){
  const def = FOES[type];
  const w = G.wave - 1, scale = 1 + 0.3 * w + 0.035 * w * w;
  const e = { type, def, hp:def.hp * scale, maxHp:def.hp * scale, s:0, u:0, slowT:0, slowP:0, freezeT:0, stunT:0, dead:false, summonT:5, walk:Math.random() * TAU };
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
  let d = Math.max(1, dmg - (e.def.armor || 0));
  if (opts.air && e.def.fly) d *= opts.air;
  let cls = '';
  if (opts.crit){ d *= 3; cls = 'crit'; }
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
  const kind = u.type === 'penguin' ? 'snow' : u.type === 'rabbit' ? 'carrot' : 'fish';
  const m = new THREE.Group();
  if (kind === 'fish'){ vox(m, 0.16, 0.08, 0.05, u.hidden === 'catdog' ? '#ffe58a' : '#a8d8f7', 0, 0, 0); vox(m, 0.05, 0.09, 0.05, '#7fb6dc', -0.1, 0, 0); }
  if (kind === 'carrot'){ vox(m, 0.07, 0.07, 0.24, u.hidden === 'moon' ? '#fff3a0' : '#ff9f3f', 0, 0, 0, u.hidden === 'moon' ? '#6a5a00' : undefined); vox(m, 0.08, 0.06, 0.06, '#6cc47a', 0, 0, -0.14); }
  if (kind === 'snow') vox(m, 0.18, 0.18, 0.18, '#ffffff', 0, 0, 0);
  m.position.copy(from);
  fxRoot.add(m);
  shots.push({ kind, m, u, e, s, last: e.mesh.position.clone(), t:0, from: from.clone(), speed: kind === 'snow' ? 7 : kind === 'carrot' ? 14 : 11, crit: s.crit && Math.random() < s.crit });
  SFX.shoot();
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
        hurt(o, s.dmg, p.u, { sure:true });
      }
    }
    burst(at, ['#ffffff', '#cdeafc'], 8, 1.6);
    return;
  }
  if (!p.e.dead){
    if (s.stun) p.e.stunT = Math.max(p.e.stunT, s.stun);
    hurt(p.e, s.dmg, p.u, { crit:p.crit, air:s.airMult });
    SFX.hit();
  }
}

/* ---------------- hidden jobs ---------------- */
function checkHidden(u){
  if (u.hidden) return;
  if (u.type === 'rabbit' && u.level >= 2 && u.hawkKills >= 12) becomeHidden(u, 'moon');
}
function waveEndHidden(){
  for (const u of units){
    if (u.type === 'dog' && !u.hidden){
      const nearCat = units.some(o => o.type === 'cat' && Math.max(Math.abs(o.x - u.x), Math.abs(o.z - u.z)) === 1);
      u.catWaves = nearCat ? u.catWaves + 1 : 0;
      if (u.catWaves >= 3) becomeHidden(u, 'catdog');
    }
  }
}
function becomeHidden(u, key){
  u.hidden = key;
  rebuildUnit(u);
  discover(key);
  burst(u.mesh.position.clone().add(new THREE.Vector3(0, 0.6, 0)), ['#ffe58a', '#c9b6f2', '#ffffff'], 30, 3);
  SFX.hidden();
  toast('히든 전직! ' + HIDDEN[key].name, HIDDEN[key].desc, true);
  if (G.selUnit === u) showInfo(u);
}

/* ---------------- waves ---------------- */
function startWave(){
  if (G.state !== 'build' || G.wave >= WAVES.length) return;
  audio();
  G.wave++;
  if (G.mods.interest){ const add = Math.min(40, Math.floor(G.coins * 0.1)); if (add > 0){ G.coins += add; toast('저금통 이자 +' + add); } }
  G.state = 'wave'; G.waveT = 0;
  G.spawnQ = [];
  for (const grp of WAVES[G.wave - 1]){
    for (let i = 0; i < grp.n; i++) G.spawnQ.push({ t:(grp.at || 0) + i * grp.gap, type:grp.t });
  }
  G.spawnQ.sort((a, b) => a.t - b.t);
  SFX.wave();
  playBgm(G.wave === WAVES.length);
  if (G.wave === WAVES.length) toast('늑대왕이 나타났다!', '부하 늑대를 불러내요. 계단 꼭대기를 지켜 주세요!');
  ui();
}
function endWave(){
  G.state = 'build';
  const bonus = 25 + G.wave * 6;
  G.coins += bonus;
  for (const u of units){ u.spent = 0; }
  if (G.wave >= WAVES.length){ finish(true); return; }
  toast('웨이브 ' + G.wave + ' 클리어!', '보너스 코인 +' + bonus);
  waveEndHidden();
  if (G.wave % 2 === 0) setTimeout(openCards, 600);
  ui();
}
function finish(win){
  G.state = win ? 'win' : 'over';
  stopBgm();
  const score = win ? 10000 + G.hp * 500 + G.kills * 20 + G.coins : G.wave * 800 + G.kills * 20;
  const best = store.get('nyandef-best', 0);
  if (score > best) store.set('nyandef-best', score);
  $('endTitle').textContent = win ? '🎉 생선 창고를 지켜냈어요!' : '창고가 털렸어요…';
  $('endScore').textContent = score.toLocaleString('ko-KR');
  $('endInfo').innerHTML = '';
  const info = [`웨이브 ${G.wave}/${WAVES.length}`, `처치 ${G.kills}`, `남은 체력 ${Math.max(0, G.hp)}`, score > best ? '최고 기록 갱신!' : `최고 기록 ${best.toLocaleString('ko-KR')}`];
  $('endInfo').textContent = info.join(' · ');
  setTimeout(() => $('endOv').classList.add('on'), win ? 1200 : 600);
  if (win) [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => blip(f, f, 0.15, 'triangle', 0.05), 400 + i * 110));
}

/* ---------------- cards ---------------- */
function openCards(){
  const pool = CARDS.filter(c => !(G.taken[c.id] && ['height', 'interest'].includes(c.id)));
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
  $('cardOv').classList.remove('on'); G.modal = false;
  SFX.merge();
  toast(c.icon + ' ' + c.name, c.desc);
  buildCards(); ui();
}

/* ---------------- merge & branch ---------------- */
let pendingBranch = null;
function tryMerge(src, dst){
  if (src === dst || src.type !== dst.type || src.level !== dst.level || src.level >= 3) return false;
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
  burst(u.mesh.position.clone().add(new THREE.Vector3(0, 0.5, 0)), ['#ffe58a', '#ffffff', '#f7a8c4'], 18, 2.5);
  SFX.merge();
  floatText(u.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 'LV ' + u.level, 'big', 0.9);
  if (G.selUnit === u) showInfo(u);
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
    const t = h.object === walls ? instTile.walls[h.instanceId] : instTile.steps[h.instanceId];
    if (t) return { x:t[0], z:t[1] };
  }
  return null;
}
function pickUnit(){
  const hits = ray.intersectObjects(unitRoot.children, true);
  return hits.length ? hits[0].object.userData.unit : null;
}
const hoverBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.04, 1.04, 1.04)), new THREE.LineBasicMaterial({ color:0xffffff }));
hoverBox.visible = false; scene.add(hoverBox);
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

let down = null;
canvas.addEventListener('pointerdown', e => {
  audio();
  if (G.modal || G.state === 'over' || G.state === 'win') return;
  if (e.button === 2){ cancelSel(); return; }
  pointerRay(e);
  const u = pickUnit();
  down = { x:e.clientX, y:e.clientY, px:e.clientX, py:e.clientY, u, moved:false, id:e.pointerId };
  try { canvas.setPointerCapture(e.pointerId); } catch(err){}
});
canvas.addEventListener('pointermove', e => {
  pointerRay(e);
  const t = pickTile();
  G.hover = t;
  if (down && down.u && !down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8){
    down.moved = true; G.drag = { u:down.u };
    down.u.mesh.position.y += 0.4;
  }
  if (down && !down.u && !G.drag && (down.pan || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8)){
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
  if (d.pan) return;
  pointerRay(e);
  const t = pickTile();
  if (G.drag){
    const u = G.drag.u; G.drag = null;
    const target = t ? unitAt(t.x, t.z) : null;
    if (target && target !== u && tryMerge(u, target)){ /* merged */ }
    else if (t && canBuild(t.x, t.z)){ u.x = t.x; u.z = t.z; SFX.place(); }
    else if (target && target !== u){ toast('합성은 같은 동물·같은 레벨끼리만!'); }
    if (units.includes(u)){ u.mesh.position.set(wx(u.x), TILE[u.z][u.x].h, wz(u.z)); dropIn(u.mesh); }
    ui();
    return;
  }
  if (d.u){ selectUnit(d.u); return; }
  if (!t) { cancelSel(); return; }
  if (canBuild(t.x, t.z)){
    if (G.armed){ build(G.armed, t.x, t.z); return; }
    G.selUnit = null; G.selTile = t; $('info').style.display = 'none';
    toast('어떤 동물을 놓을까요?', '아래 카드를 누르세요');
    ui();
    return;
  }
  cancelSel();
});
canvas.addEventListener('wheel', e => { zoom = clamp(zoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.6, 2.2); resize(); }, { passive:true });
document.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('keydown', e => {
  if (e.repeat && !e.key.startsWith('Arrow')) return;
  const k = e.key;
  if (G.modal) return;
  if (k === 'Escape'){ cancelSel(); return; }
  const tk = Object.keys(TYPES).find(t => TYPES[t].key === k);
  if (tk){ arm(tk); return; }
  if (k === ' ' || k === 'Enter'){ e.preventDefault(); startWave(); return; }
  if (k === 'q' || k === 'Q') rotate(-1);
  const pan = { ArrowLeft:[-1, 0], ArrowRight:[1, 0], ArrowUp:[0, 1], ArrowDown:[0, -1], a:[-1, 0], d:[1, 0], w:[0, 1], s:[0, -1] }[k];
  if (pan){ const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1); camTarget.addScaledVector(right, pan[0] * 1.5).addScaledVector(up, pan[1] * 1.5); }
  if (k === 'e' || k === 'E') rotate(1);
});
function rotate(d){ camAngleTarget += d * Math.PI / 2; }
function cancelSel(){ G.armed = null; G.selTile = null; G.selUnit = null; $('info').style.display = 'none'; buildCards(); ui(); }
function arm(type){
  audio();
  if (G.selTile && canBuild(G.selTile.x, G.selTile.z)){ build(type, G.selTile.x, G.selTile.z); G.selTile = null; return; }
  G.armed = G.armed === type ? null : type;
  G.selUnit = null; $('info').style.display = 'none';
  buildCards();
}
function build(type, x, z){
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
function sellValue(u){ return Math.round(TYPES[u.type].cost * (u.level === 1 ? 0.6 : u.level === 2 ? 1.2 : 2.4)); }
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
  if (u.level < 3) hint.textContent = `같은 ${TYPES[u.type].name} ${u.level}레벨을 끌어다 겹치면 ${u.level + 1}레벨!` + (u.level === 2 ? ' 3레벨에서 전직해요.' : '');
  else hint.textContent = '최고 레벨이에요.';
  const hk = Object.keys(HIDDEN).find(k => HIDDEN[k].base === u.type);
  if (hk && !u.hidden){ hint.textContent += ' · 히든: ' + (discovered.has(hk) ? HIDDEN[hk].name : '???'); }
  el.append(hint);
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
  Object.entries(TYPES).forEach(([k, T]) => {
    const b = document.createElement('button'); b.className = 'card' + (G.armed === k ? ' armed' : '') + (G.coins < costOf(k) ? ' poor' : '');
    const kk = document.createElement('span'); kk.className = 'k'; kk.textContent = T.key;
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
  wb.textContent = G.state === 'wave' ? `웨이브 ${G.wave} 진행 중` : G.wave >= WAVES.length ? '끝!' : `▶ 웨이브 ${G.wave + 1}`;
  if (G.coins !== lastCoins){ lastCoins = G.coins; [...$('cards').children].forEach((b, i) => b.classList.toggle('poor', G.coins < costOf(Object.keys(TYPES)[i]))); }
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
    entries.push({ key:t, name:TYPES[t].name, img:iconFor(t), sub:'기본' });
    ['a', 'b'].forEach(k => entries.push({ key:t + '-' + k, name:TYPES[t].br[k].name, img:iconFor(t, 3, k), sub:TYPES[t].name + ' 전직' }));
  });
  Object.entries(HIDDEN).forEach(([k, h]) => entries.push({ key:k, name:h.name, img:iconFor(h.base, 2, null, k), sub:'히든 전직', hint:h.hint, hidden:true }));
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
$('startBtn').onclick = () => { audio(); $('introOv').classList.remove('on'); G.modal = false; };
$('retryBtn').onclick = () => restart();
G.modal = true;

function restart(){
  for (const u of [...units]) removeUnit(u);
  for (const e of foes) foeRoot.remove(e.mesh);
  foes.length = 0;
  for (const s of shots) fxRoot.remove(s.m);
  shots.length = 0;
  resetState();
  $('endOv').classList.remove('on');
  G.modal = false;
  baseMesh.visible = true;
  buildCards(); ui();
}

/* ---------------- main loop ---------------- */
let last = performance.now(), shake = 0, simT = 0;
document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'wave'){ G.paused = true; $('pauseBtn').textContent = '▶'; } });
function update(dt){
  if (G.state === 'wave'){
    G.waveT += dt;
    while (G.spawnQ.length && G.spawnQ[0].t <= G.waveT) spawnFoe(G.spawnQ.shift().type);
  }
  // foes
  for (const e of foes){
    if (e.dead) continue;
    e.slowT -= dt; e.freezeT -= dt; e.stunT -= dt;
    let sp = e.def.speed;
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
    const tgt = pickTarget(u, s);
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
  // camera rotation tween
  let da = camAngleTarget - camAngle; camAngle += da * Math.min(1, rdt * 8);
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
    if (u.mesh.userData.tail) u.mesh.userData.tail.rotation.z = Math.sin(t * 5 + u.x) * 0.4;
    if (u.mesh.userData.wings){ u.mesh.userData.wings[0].rotation.z = 0.2 + Math.sin(t * 6) * 0.2; u.mesh.userData.wings[1].rotation.z = -0.2 - Math.sin(t * 6) * 0.2; }
    if (u.mesh.userData.halo) u.mesh.userData.halo.rotation.z = t * 0.8;
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
  baseMesh.userData.fish.rotation.y = t * 2;
  baseMesh.userData.fish.position.y = 1.08 + Math.sin(t * 3) * 0.05;
  clouds.forEach(c => { c.userData.a += c.userData.v * rdt * 0.1; c.position.x = Math.cos(c.userData.a) * c.userData.r; c.position.z = Math.sin(c.userData.a) * c.userData.r; });
  updateBits(dt > 0 ? dt : rdt * 0.25);
  // hover / range preview
  hoverBox.visible = false; rangeViz.visible = false;
  const tile = G.drag ? G.hover : (G.selTile || G.hover);
  if (G.selUnit){ const s = statsOf(G.selUnit); showRange(G.selUnit.x, G.selUnit.z, s.range); }
  else if (tile && !G.modal){
    const t2 = TILE[tile.z][tile.x];
    if (t2.type === 'build' || unitAt(tile.x, tile.z)){
      hoverBox.visible = true;
      hoverBox.position.set(wx(tile.x), t2.h - 0.5, wz(tile.z));
      const ok = canBuild(tile.x, tile.z);
      hoverBox.material.color.set(ok ? 0xffffff : 0xffcf3f);
      if (G.armed && ok){
        const fake = { type:G.armed, level:1, x:tile.x, z:tile.z };
        showRange(tile.x, tile.z, statsOf(fake).range, G.coins >= costOf(G.armed));
      }
    }
  }
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
window.__nd = { step:(dt) => update(dt), endWave, G, units, foes, TILE, PATH, startWave, build, tryMerge, placeUnit, openCards, takeCard, chooseBranch, becomeHidden, spawnFoe, statsOf, canBuild };
