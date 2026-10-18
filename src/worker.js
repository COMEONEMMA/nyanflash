// 냥. 플 (Nyan Flash) weekly ranking API · © 2026 냥. 플. All rights reserved.
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
});
const TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;
const NICK_RE = /^[가-힣A-Za-z0-9_]{2,12}$/;
const BANNED = ['시발', '씨발', 'ㅅㅂ', '병신', 'ㅂㅅ', '개새', '좆', '지랄', '느금', '니애미', '섹스', '야동', 'fuck', 'shit', 'bitch', 'admin', '운영자', '관리자', 'nyanflash'];

let ready = false;
async function init(db) {
  if (ready) return;
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, nickname TEXT NOT NULL UNIQUE COLLATE NOCASE, created_at INTEGER NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, player_id TEXT NOT NULL, started_at INTEGER NOT NULL, finished INTEGER NOT NULL DEFAULT 0)'),
    db.prepare('CREATE INDEX IF NOT EXISTS runs_player ON runs (player_id, started_at)'),
    db.prepare('CREATE TABLE IF NOT EXISTS scores (week TEXT NOT NULL, player_id TEXT NOT NULL, score INTEGER NOT NULL, stage INTEGER NOT NULL, boss_kills INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (week, player_id))'),
    db.prepare('CREATE INDEX IF NOT EXISTS scores_rank ON scores (week, score DESC)'),
  ]);
  ready = true;
}
async function sha256(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function weekKey(now = Date.now()) {
  const k = new Date(now + 9 * 3600e3);
  const day = (k.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() - day)).toISOString().slice(0, 10);
}
async function playerOf(req, db) {
  const t = req.headers.get('x-player-token') || '';
  if (!TOKEN_RE.test(t)) return null;
  const id = await sha256('nyanflash:' + t);
  const row = await db.prepare('SELECT id, nickname FROM players WHERE id = ?').bind(id).first();
  return { id, nickname: row ? row.nickname : null };
}
async function readBody(req) {
  const text = await req.text();
  if (text.length > 2000) throw new Error('too large');
  return text ? JSON.parse(text) : {};
}
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

async function rankOf(db, week, score) {
  const r = await db.prepare('SELECT COUNT(*) AS n FROM scores WHERE week = ? AND score > ?').bind(week, score).first();
  return (r ? r.n : 0) + 1;
}

async function handle(req, env, url) {
  const db = env.DB;
  const path = url.pathname;

  if (path === '/api/leaderboard' && req.method === 'GET') {
    const week = weekKey();
    const top = await db.prepare(
      'SELECT p.nickname, s.score, s.stage, s.boss_kills AS bossKills FROM scores s JOIN players p ON p.id = s.player_id WHERE s.week = ? ORDER BY s.score DESC, s.updated_at ASC LIMIT 50'
    ).bind(week).all();
    const total = await db.prepare('SELECT COUNT(*) AS n FROM scores WHERE week = ?').bind(week).first();
    let me = null;
    const p = await playerOf(req, db);
    if (p && p.nickname) {
      const mine = await db.prepare('SELECT score FROM scores WHERE week = ? AND player_id = ?').bind(week, p.id).first();
      me = { nickname: p.nickname, score: mine ? mine.score : 0, rank: mine ? await rankOf(db, week, mine.score) : null };
    }
    return json({ week, top: top.results || [], total: total ? total.n : 0, me });
  }

  if (req.method !== 'POST') return json({ error: '지원하지 않는 요청이에요.' }, 405);
  const p = await playerOf(req, db);
  if (!p) return json({ error: '잘못된 요청이에요.' }, 400);
  let body;
  try { body = await readBody(req); } catch (e) { return json({ error: '잘못된 요청이에요.' }, 400); }
  const now = Date.now();

  if (path === '/api/register') {
    const nick = String(body.nickname || '').trim();
    if (!NICK_RE.test(nick)) return json({ error: '닉네임은 한글, 영문, 숫자, _ 로 2~12자예요.' }, 400);
    const low = nick.toLowerCase();
    if (BANNED.some(w => low.includes(w))) return json({ error: '쓸 수 없는 닉네임이에요.' }, 400);
    const taken = await db.prepare('SELECT id FROM players WHERE nickname = ? COLLATE NOCASE').bind(nick).first();
    if (taken && taken.id !== p.id) return json({ error: '이미 누가 쓰고 있는 닉네임이에요.' }, 409);
    await db.prepare('INSERT INTO players (id, nickname, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET nickname = excluded.nickname')
      .bind(p.id, nick, now).run();
    return json({ ok: true, nickname: nick });
  }

  if (!p.nickname) return json({ error: '먼저 닉네임을 등록해 주세요.' }, 403);

  if (path === '/api/run/start') {
    const last = await db.prepare('SELECT started_at FROM runs WHERE player_id = ? ORDER BY started_at DESC LIMIT 1').bind(p.id).first();
    if (last && now - last.started_at < 2500) return json({ error: '너무 빨라요.' }, 429);
    const runId = crypto.randomUUID();
    await db.prepare('INSERT INTO runs (id, player_id, started_at) VALUES (?, ?, ?)').bind(runId, p.id, now).run();
    if (Math.random() < 0.02) await db.prepare('DELETE FROM runs WHERE started_at < ?').bind(now - 2 * 86400e3).run();
    return json({ runId });
  }

  if (path === '/api/run/finish') {
    const { runId, score, stage, bossKills, durationMs } = body;
    if (typeof runId !== 'string' || runId.length > 64 || !isInt(score, 0, 1e9) || !isInt(stage, 1, 500) || !isInt(bossKills, 0, 500) || !isInt(durationMs, 0, 6 * 3600e3)) {
      return json({ error: '잘못된 기록이에요.' }, 400);
    }
    const run = await db.prepare('UPDATE runs SET finished = 1 WHERE id = ? AND player_id = ? AND finished = 0 RETURNING started_at').bind(runId, p.id).first();
    if (!run) return json({ ok: false, reason: '이 판은 랭킹에 반영되지 않았어요.' }, 409);
    const elapsed = now - run.started_at;
    const sec = Math.min(durationMs, elapsed + 3000) / 1000;
    const plausible = durationMs <= elapsed + 3000
      && stage <= 1 + sec / 10
      && bossKills <= stage - 1
      && score <= Math.max(3000, sec * 1200 * stage);
    if (!plausible) return json({ ok: false, reason: '기록이 비정상이라 랭킹에 반영되지 않았어요.' });
    const week = weekKey(now);
    const before = await db.prepare('SELECT score FROM scores WHERE week = ? AND player_id = ?').bind(week, p.id).first();
    const improved = !before || score > before.score;
    if (improved) {
      await db.prepare(
        'INSERT INTO scores (week, player_id, score, stage, boss_kills, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(week, player_id) DO UPDATE SET score = excluded.score, stage = excluded.stage, boss_kills = excluded.boss_kills, updated_at = excluded.updated_at'
      ).bind(week, p.id, score, stage, bossKills, now).run();
    }
    const best = improved ? score : before.score;
    const total = await db.prepare('SELECT COUNT(*) AS n FROM scores WHERE week = ?').bind(week).first();
    return json({ ok: true, improved, best, rank: await rankOf(db, week, best), total: total ? total.n : 1 });
  }

  return json({ error: '없는 주소예요.' }, 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    if (!env.DB) return json({ error: '랭킹 서버를 준비하고 있어요. 조금만 기다려 주세요.' }, 503);
    if (req.method === 'POST') {
      const origin = req.headers.get('origin');
      if (origin && origin !== url.origin) return json({ error: '허용되지 않은 요청이에요.' }, 403);
    }
    try {
      await init(env.DB);
      return await handle(req, env, url);
    } catch (e) {
      return json({ error: '서버 오류가 났어요. 잠시 뒤에 다시 해 주세요.' }, 500);
    }
  },
};
