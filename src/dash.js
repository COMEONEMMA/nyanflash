// Private all-sites dashboard for the owner · © 2026 냥. 플
const CF = 'https://api.cloudflare.com/client/v4';

function unauthorized() {
  return new Response('로그인이 필요해요.', {
    status: 401,
    headers: { 'www-authenticate': 'Basic realm="dashboard", charset="UTF-8"', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
  });
}
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function authed(req, env) {
  const h = req.headers.get('authorization') || '';
  if (!h.startsWith('Basic ')) return false;
  let pass = '';
  try { const dec = new TextDecoder().decode(Uint8Array.from(atob(h.slice(6)), c => c.charCodeAt(0))); pass = dec.slice(dec.indexOf(':') + 1); } catch (e) { return false; }
  return safeEqual(pass, env.DASH_PASSWORD || '');
}
const day = (d) => d.toISOString().slice(0, 10);

async function cfFetch(env, path, init) {
  const r = await fetch(CF + path, { ...init, headers: { authorization: 'Bearer ' + env.CF_API_TOKEN, 'content-type': 'application/json' } });
  const j = await r.json();
  if (!r.ok || j.success === false || j.errors && j.errors.length && !j.data) throw new Error((j.errors && j.errors[0] && j.errors[0].message) || ('HTTP ' + r.status));
  return j;
}

async function siteStats(env) {
  const zl = await cfFetch(env, '/zones?per_page=50&status=active');
  const zones = (zl.result || []).map(z => ({ id: z.id, name: z.name }));
  const until = new Date(), since = new Date(Date.now() - 13 * 86400e3);
  const q = `query($zones:[String!], $since:Date!, $until:Date!){ viewer { zones(filter:{zoneTag_in:$zones}) { zoneTag
    httpRequests1dGroups(limit:20, filter:{date_geq:$since, date_leq:$until}, orderBy:[date_ASC]) {
      dimensions { date } sum { requests pageViews countryMap { clientCountryName requests } } uniq { uniques } } } } }`;
  const g = await cfFetch(env, '/graphql', { method: 'POST', body: JSON.stringify({ query: q, variables: { zones: zones.map(z => z.id), since: day(since), until: day(until) } }) });
  const byId = {};
  for (const z of (g.data && g.data.viewer && g.data.viewer.zones) || []) byId[z.zoneTag] = z.httpRequests1dGroups || [];
  return zones.map(z => {
    const rows = byId[z.id] || [];
    const days = rows.map(r => ({ date: r.dimensions.date, visitors: r.uniq.uniques, views: r.sum.pageViews, requests: r.sum.requests }));
    const countries = {};
    rows.slice(-7).forEach(r => (r.sum.countryMap || []).forEach(c => { countries[c.clientCountryName] = (countries[c.clientCountryName] || 0) + c.requests; }));
    return { name: z.name, days, countries: Object.entries(countries).sort((a, b) => b[1] - a[1]).slice(0, 5) };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

async function gameStats(env) {
  if (!env.DB) return null;
  const now = Date.now();
  const k = new Date(now + 9 * 3600e3);
  const todayStart = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - 9 * 3600e3;
  const weekStart = todayStart - ((k.getUTCDay() + 6) % 7) * 86400e3;
  const one = async (sql, ...a) => (await env.DB.prepare(sql).bind(...a).first()) || {};
  try {
    const t = await one("SELECT COUNT(*) AS runs, COUNT(DISTINCT player_id) AS players, SUM(mode = 'hard') AS hard FROM runs WHERE started_at >= ?", todayStart);
    const w = await one("SELECT COUNT(*) AS runs, COUNT(DISTINCT player_id) AS players, SUM(mode = 'hard') AS hard FROM runs WHERE started_at >= ?", weekStart);
    const p = await one('SELECT COUNT(*) AS n FROM players');
    return { today: t, week: w, players: p.n || 0 };
  } catch (e) { return null; }
}

const PAGE = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>내 사이트 대시보드</title>
<style>
:root{--bg:#0f1714;--card:#17221d;--line:#2a3a32;--fg:#eef2ea;--muted:#93a69a;--accent:#ffc94a;--up:#6fd68c;--down:#ff7d8e;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;padding:20px max(16px,env(safe-area-inset-left)) 40px}
h1{font-size:22px;margin:0 0 4px}.sub{color:var(--muted);font-size:13px;margin-bottom:18px}
.tot{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:18px}
.k{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px}.k span{color:var(--muted);font-size:12px}.k b{display:block;font-size:26px;font-variant-numeric:tabular-nums}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px}
.site{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;min-width:0}
.site h2{font-size:17px;margin:0 0 8px;display:flex;justify-content:space-between;gap:8px}.site h2 a{color:var(--fg);text-decoration:none}
.row{display:flex;gap:16px;flex-wrap:wrap;font-variant-numeric:tabular-nums}.row div span{display:block;color:var(--muted);font-size:12px}.row div b{font-size:20px}
.d{font-size:12px;margin-left:4px}.d.up{color:var(--up)}.d.down{color:var(--down)}
svg{width:100%;height:60px;margin-top:8px;display:block}.cty{color:var(--muted);font-size:12px;margin-top:6px}
.game{margin-top:18px}.err{background:#3a1d22;border:1px solid #6b2f38;border-radius:12px;padding:14px;color:#ffd0d6}
</style></head><body>
<h1>내 사이트 대시보드</h1><div class="sub" id="sub">불러오는 중...</div>
<div class="tot" id="tot"></div><div class="grid" id="grid"></div><div class="game" id="game"></div>
<script>
const fmt = n => (n || 0).toLocaleString('ko-KR');
const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };
function delta(a, b){ if (!b) return null; return Math.round((a - b) / b * 100); }
function spark(vals){
  const w = 300, h = 60, max = Math.max(1, ...vals), n = vals.length;
  const pts = vals.map((v, i) => [n < 2 ? w : i/(n-1)*w, h - 6 - v/max*(h - 12)]);
  const ns = 'http://www.w3.org/2000/svg', s = document.createElementNS(ns, 'svg'); s.setAttribute('viewBox', '0 0 ' + w + ' ' + h); s.setAttribute('preserveAspectRatio', 'none');
  const area = document.createElementNS(ns, 'path'); area.setAttribute('d', 'M0,' + h + ' L' + pts.map(p => p.join(',')).join(' L') + ' L' + w + ',' + h + ' Z'); area.setAttribute('fill', 'rgba(255,201,74,.15)');
  const line = document.createElementNS(ns, 'polyline'); line.setAttribute('points', pts.map(p => p.join(',')).join(' ')); line.setAttribute('fill', 'none'); line.setAttribute('stroke', '#ffc94a'); line.setAttribute('stroke-width', '2'); line.setAttribute('vector-effect', 'non-scaling-stroke');
  s.append(area, line);
  if (pts.length){ const c = document.createElementNS(ns, 'circle'); const p = pts[pts.length-1]; c.setAttribute('cx', p[0]); c.setAttribute('cy', p[1]); c.setAttribute('r', '3'); c.setAttribute('fill', '#ffc94a'); s.append(c); }
  return s;
}
function stat(label, val, d){ const box = el('div'); box.append(el('span', '', label)); const b = el('b', '', fmt(val)); box.append(b); if (d != null){ const x = el('span', 'd ' + (d >= 0 ? 'up' : 'down'), (d >= 0 ? '▲' : '▼') + Math.abs(d) + '%'); x.style.display = 'inline'; b.append(x); } return box; }
fetch('/dash/data', { cache: 'no-store' }).then(r => r.json()).then(j => {
  if (j.error){ document.getElementById('sub').textContent = ''; document.getElementById('grid').append(el('div', 'err', j.error)); return; }
  document.getElementById('sub').textContent = '최근 2주 · 하루 단위(UTC) · ' + new Date(j.at).toLocaleString('ko-KR') + ' 기준';
  let tY = 0, tW = 0, tPW = 0, tV = 0;
  const grid = document.getElementById('grid');
  j.sites.forEach(s => {
    const d = s.days, last = d[d.length - 1] || {}, prev = d[d.length - 2] || {};
    const wk = d.slice(-7).reduce((a, x) => a + x.visitors, 0), pwk = d.slice(-14, -7).reduce((a, x) => a + x.visitors, 0);
    const views = d.slice(-7).reduce((a, x) => a + x.views, 0);
    tY += last.visitors || 0; tW += wk; tPW += pwk; tV += views;
    const card = el('div', 'site'); const h = el('h2'); const a = el('a', '', s.name); a.href = 'https://' + s.name; a.target = '_blank'; a.rel = 'noopener'; h.append(a); card.append(h);
    const row = el('div', 'row'); row.append(stat('오늘 방문자', last.visitors, delta(last.visitors, prev.visitors)), stat('7일 방문자', wk, delta(wk, pwk)), stat('7일 페이지뷰', views)); card.append(row);
    card.append(spark(d.map(x => x.visitors)));
    if (s.countries.length) card.append(el('div', 'cty', '국가: ' + s.countries.map(c => c[0] + ' ' + fmt(c[1])).join(' · ')));
    grid.append(card);
  });
  const tot = document.getElementById('tot');
  [['오늘 전체 방문자', tY], ['7일 전체 방문자', tW, delta(tW, tPW)], ['7일 전체 페이지뷰', tV], ['사이트 수', j.sites.length]].forEach(([l, v, dd]) => { const k = el('div', 'k'); k.append(el('span', '', l)); const b = el('b', '', fmt(v)); if (dd != null){ const x = el('span', 'd ' + (dd >= 0 ? 'up' : 'down'), (dd >= 0 ? ' ▲' : ' ▼') + Math.abs(dd) + '%'); b.append(x); } k.append(b); tot.append(k); });
  if (j.game){
    const g = document.getElementById('game'), card = el('div', 'site'); card.append(el('h2', '', '냥. 플 게임 기록 (랭킹 등록자 기준)'));
    const row = el('div', 'row'); row.append(stat('오늘 플레이 판', j.game.today.runs), stat('오늘 플레이한 사람', j.game.today.players), stat('이번 주 판', j.game.week.runs), stat('이번 주 사람', j.game.week.players), stat('하드 판(이번 주)', j.game.week.hard), stat('누적 닉네임', j.game.players));
    card.append(row); g.append(card);
  }
}).catch(() => { document.getElementById('sub').textContent = '데이터를 불러오지 못했어요.'; });
</script></body></html>`;

let cache = null;
export async function handleDash(req, env, url) {
  if (!env.DASH_PASSWORD) return new Response('대시보드 비밀번호(DASH_PASSWORD)가 아직 설정되지 않았어요.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  if (!authed(req, env)) return unauthorized();
  const headers = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer' };
  if (url.pathname === '/dash/data') {
    const j = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...headers, 'content-type': 'application/json; charset=utf-8' } });
    if (!env.CF_API_TOKEN) return j({ error: 'API 토큰(CF_API_TOKEN)이 아직 설정되지 않았어요.' });
    if (cache && Date.now() - cache.at < 5 * 60e3) return j(cache);
    try {
      const [sites, game] = await Promise.all([siteStats(env), gameStats(env)]);
      cache = { at: Date.now(), sites, game };
      return j(cache);
    } catch (e) {
      return j({ error: 'Cloudflare 데이터를 불러오지 못했어요: ' + e.message });
    }
  }
  return new Response(PAGE, { headers: { ...headers, 'content-type': 'text/html; charset=utf-8',
    'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'" } });
}
