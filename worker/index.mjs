import { ApiError, requiredString, optionalString, sha256, uuid, normalizeDOI, position,
  pageIndex } from './validation.mjs';

const DIGEST = '[a-f0-9]{64}';
const ID = '[0-9a-f-]{36}';
const documentsPath = new RegExp(`^/v1/documents/(${DIGEST})/(marks|guides)$`, 'u');
const repliesPath = new RegExp(`^/v1/marks/(${ID})/replies$`, 'u');
const tiers = new Set(['beginner', 'standard', 'concise']);

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' },
});

async function readBody(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) {
    throw new ApiError(415, 'Expected application/json');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'JSON body is required');
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 64_000) {
      await reader.cancel();
      throw new ApiError(413, 'Request body exceeds 64 KB');
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  try {
    const body = JSON.parse(text);
    if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error('object required');
    return body;
  } catch { throw new ApiError(400, 'Invalid JSON object'); }
}

async function tokenHash(token) {
  const data = new TextEncoder().encode(token);
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function author(request, db) {
  const match = /^Bearer ([a-f0-9]{64})$/u.exec(request.headers.get('Authorization') || '');
  if (!match) throw new ApiError(401, 'A personal publishing token is required');
  const user = await db.prepare('SELECT id, display_name FROM users WHERE token_hash = ? AND disabled = 0')
    .bind(await tokenHash(match[1])).first();
  if (!user) throw new ApiError(401, 'Invalid publishing token');
  return user;
}

async function document(db, id) {
  const row = await db.prepare('SELECT id, title FROM documents WHERE id = ?').bind(id).first();
  if (!row) throw new ApiError(404, 'Unknown PDF');
  return row;
}

function markFrom(row) {
  return { id: row.id, documentId: row.document_id, pageIndex: row.page_index,
    rects: JSON.parse(row.rects_json), quote: row.quote, comment: row.comment,
    authorName: row.author_kind === 'ai' ? 'AI 阅读助手' : row.display_name,
    authorKind: row.author_kind, ownerId: row.author_id, createdAt: row.created_at };
}

function validateGuide(body) {
  const tier = requiredString(body.tier, 'tier', 20);
  if (!tiers.has(tier)) throw new ApiError(400, 'Unknown guide tier');
  if (body.promptVersion !== 1) throw new ApiError(400, 'Unsupported guide prompt version');
  if (!Array.isArray(body.suggestions) || body.suggestions.length < 1 || body.suggestions.length > 20) {
    throw new ApiError(400, 'Guide needs 1–20 comments');
  }
  const suggestions = body.suggestions.map(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new ApiError(400, 'Guide comment is invalid');
    }
    return { pageIndex: pageIndex(raw.pageIndex),
      quote: requiredString(raw.quote, 'quote', 300),
      comment: requiredString(raw.comment, 'comment', 1500),
      kind: ['key_point', 'question'].includes(raw.kind) ? raw.kind : 'key_point' };
  });
  return { tier, overview: requiredString(body.overview, 'overview', 5000), suggestions };
}

async function route(request, env) {
  const db = env.DB;
  if (!db) throw new Error('D1 binding DB is missing');
  const url = new URL(request.url);
  const { method } = request;
  if (method === 'GET' && url.pathname === '/v1/health') {
    return json({ ok: true, service: 'zotero-social-reading', version: 1 });
  }
  if (method === 'POST' && url.pathname === '/v1/identify') {
    await author(request, db);
    const body = await readBody(request);
    if ('filePath' in body || 'pdf' in body || 'content' in body) {
      throw new ApiError(400, 'Only a PDF digest and metadata may be sent');
    }
    const id = sha256(body.sha256);
    const title = requiredString(body.title, 'title', 400);
    const doi = normalizeDOI(body.doi);
    await db.prepare('INSERT OR IGNORE INTO documents (id, title, doi, created_at) VALUES (?, ?, ?, ?)')
      .bind(id, title, doi, new Date().toISOString()).run();
    return json({ document: await document(db, id) });
  }
  const docMatch = documentsPath.exec(url.pathname);
  if (docMatch) {
    const [, id, section] = docMatch;
    const knownDocument = await db.prepare('SELECT id FROM documents WHERE id = ?').bind(id).first();
    if (!knownDocument) {
      if (method === 'GET' && section === 'marks') return json({ marks: [] });
      if (method === 'GET' && section === 'guides') return json({ guide: null });
      throw new ApiError(404, 'Unknown PDF');
    }
    if (section === 'marks') {
      if (method === 'GET') {
        const page = url.searchParams.get('pageIndex');
        const pageIndex = page === null ? null : Number(page);
        if (pageIndex !== null && (!Number.isInteger(pageIndex) || pageIndex < 0)) {
          throw new ApiError(400, 'Invalid pageIndex');
        }
        const query = `SELECT m.*, u.display_name FROM marks m JOIN users u ON u.id = m.author_id
          WHERE m.document_id = ? AND m.deleted_at IS NULL ${pageIndex === null ? '' : 'AND m.page_index = ?'}
          ORDER BY m.page_index, m.created_at, m.id`;
        const rows = (await db.prepare(query).bind(...(pageIndex === null ? [id] : [id, pageIndex])).all()).results;
        return json({ marks: rows.map(markFrom) });
      }
      if (method === 'POST') {
        const user = await author(request, db);
        const body = await readBody(request);
        const markId = uuid(body.id);
        const prior = await db.prepare('SELECT m.*, u.display_name FROM marks m JOIN users u ON u.id = m.author_id WHERE m.id = ?')
          .bind(markId).first();
        if (prior) {
          if (prior.author_id !== user.id || prior.document_id !== id) throw new ApiError(409, 'Mark ID already used');
          return json({ mark: markFrom(prior) });
        }
        const anchor = position(body);
        const kind = body.authorKind === 'ai' ? 'ai' : 'human';
        await db.prepare(`INSERT INTO marks
          (id, document_id, page_index, rects_json, quote, prefix, suffix, comment, author_id, author_kind, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
          markId, id, anchor.pageIndex, JSON.stringify(anchor.rects),
          requiredString(body.quote, 'quote', 500), optionalString(body.prefix, 'prefix', 200),
          optionalString(body.suffix, 'suffix', 200), optionalString(body.comment, 'comment', 5000),
          user.id, kind, new Date().toISOString(),
        ).run();
        const row = await db.prepare('SELECT m.*, u.display_name FROM marks m JOIN users u ON u.id = m.author_id WHERE m.id = ?')
          .bind(markId).first();
        return json({ mark: markFrom(row) }, 201);
      }
    }
    if (section === 'guides') {
      if (method === 'GET') {
        const tier = url.searchParams.get('tier');
        if (!tiers.has(tier)) throw new ApiError(400, 'Unknown guide tier');
        const row = await db.prepare(`SELECT g.*, u.display_name FROM guides g JOIN users u ON u.id = g.author_id
          WHERE g.document_id = ? AND g.tier = ? AND g.prompt_version = 1 AND g.deleted_at IS NULL`)
          .bind(id, tier).first();
        return json({ guide: row ? { id: row.id, tier: row.tier, promptVersion: row.prompt_version,
          ...JSON.parse(row.content_json), authorName: row.display_name, createdAt: row.created_at } : null });
      }
      if (method === 'POST') {
        const user = await author(request, db);
        const body = await readBody(request);
        const guide = validateGuide(body);
        const guideId = uuid(body.id);
        await db.prepare(`INSERT OR IGNORE INTO guides
          (id, document_id, tier, prompt_version, content_json, author_id, created_at)
          VALUES (?, ?, ?, 1, ?, ?, ?)`).bind(guideId, id, guide.tier,
          JSON.stringify({ overview: guide.overview, suggestions: guide.suggestions }),
          user.id, new Date().toISOString()).run();
        const row = await db.prepare('SELECT id FROM guides WHERE document_id = ? AND tier = ? AND prompt_version = 1')
          .bind(id, guide.tier).first();
        return json({ id: row.id, reused: row.id !== guideId }, row.id === guideId ? 201 : 200);
      }
    }
  }
  const replyMatch = repliesPath.exec(url.pathname);
  if (replyMatch) {
    const markId = uuid(replyMatch[1]);
    const mark = await db.prepare('SELECT id FROM marks WHERE id = ? AND deleted_at IS NULL').bind(markId).first();
    if (!mark) throw new ApiError(404, 'Unknown mark');
    if (method === 'GET') {
      const rows = (await db.prepare(`SELECT r.*, u.display_name FROM replies r JOIN users u ON u.id = r.author_id
        WHERE r.mark_id = ? AND r.deleted_at IS NULL ORDER BY r.created_at, r.id`).bind(markId).all()).results;
      return json({ replies: rows.map(row => ({ id: row.id, markId: row.mark_id, body: row.body,
        authorName: row.display_name, ownerId: row.author_id, createdAt: row.created_at })) });
    }
    if (method === 'POST') {
      const user = await author(request, db);
      const body = await readBody(request);
      const id = uuid(body.id);
      const prior = await db.prepare('SELECT id, author_id, mark_id FROM replies WHERE id = ?').bind(id).first();
      if (prior) {
        if (prior.author_id !== user.id || prior.mark_id !== markId) throw new ApiError(409, 'Reply ID already used');
        return json({ id });
      }
      await db.prepare('INSERT INTO replies (id, mark_id, body, author_id, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(id, markId, requiredString(body.body, 'body', 5000), user.id, new Date().toISOString()).run();
      return json({ id }, 201);
    }
  }
  throw new ApiError(404, 'Endpoint not found');
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type' } });
    try { return await route(request, env); }
    catch (error) {
      const status = error.status || 500;
      if (status === 500) console.error('Social reading Worker request failed', error);
      return json({ error: status === 500 ? 'Service failed' : error.message }, status);
    }
  },
};
