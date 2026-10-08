import http from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SocialStore } from './store.mjs';
import { generateSuggestions } from './ai.mjs';

const DOCUMENT = /^\/api\/documents\/([a-f0-9]{64})(?:\/(marks|drafts))?$/u;
const MARK_REPLIES = /^\/api\/marks\/([0-9a-f-]{36})\/replies$/u;
const DRAFT_PUBLISH = /^\/api\/drafts\/([0-9a-f-]{36})\/publish$/u;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function requiredString(value, field, max = 500) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new HttpError(400, `${field} must be a non-empty string of at most ${max} characters`);
  }
  return value.trim();
}

function optionalString(value, field, max = 5000) {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > max) throw new HttpError(400, `${field} is invalid`);
  return value.trim();
}

function positionFrom(body) {
  const pageIndex = body?.pageIndex;
  const rects = body?.rects;
  if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex > 10_000) {
    throw new HttpError(400, 'pageIndex is invalid');
  }
  if (!Array.isArray(rects) || rects.length < 1 || rects.length > 30 || !rects.every(
    rect => Array.isArray(rect) && rect.length === 4 && rect.every(n => Number.isFinite(n) && n >= -100 && n <= 10_000)
      && rect[2] > rect[0] && rect[3] > rect[1],
  )) throw new HttpError(400, 'rects must contain PDF-space rectangles');
  return { pageIndex, rects };
}

async function readJSON(request) {
  let text = '';
  for await (const chunk of request) {
    text += chunk;
    if (text.length > 100_000) throw new HttpError(413, 'Request body is too large');
  }
  try { return JSON.parse(text || '{}'); }
  catch { throw new HttpError(400, 'Invalid JSON'); }
}

function respond(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

function authorized(request, token) {
  const given = request.headers['x-social-reading-token'];
  if (typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function hashPDF(filePath, storageRoot) {
  if (typeof filePath !== 'string' || !filePath.toLowerCase().endsWith('.pdf')) {
    throw new HttpError(400, 'A stored Zotero PDF path is required');
  }
  let actual;
  try { actual = await realpath(filePath); }
  catch { throw new HttpError(404, 'PDF file was not found'); }
  const inside = relative(storageRoot, actual);
  if (inside.startsWith(`..${sep}`) || inside === '..' || inside.startsWith(sep) || !inside) {
    throw new HttpError(403, 'PDF must be inside Zotero storage');
  }
  const info = await stat(actual);
  if (!info.isFile() || info.size > 100_000_000) throw new HttpError(400, 'PDF exceeds prototype file limit');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(actual)) hash.update(chunk);
  return { id: hash.digest('hex'), path: actual };
}

export async function createApp({ dataDir, port = 34241, host = '127.0.0.1',
  codexPath = 'codex', model = 'gpt-6-luna', aiGenerator = generateSuggestions } = {}) {
  if (host !== '127.0.0.1') throw new Error('The prototype service must bind to loopback');
  const root = resolve(dataDir || process.env.ZOTERO_DATA_DIR || join(homedir(), 'Zotero'));
  const storageRoot = await realpath(join(root, 'storage'));
  const runtimeDir = join(root, 'social-reading');
  await mkdir(runtimeDir, { recursive: true, mode: 0o700 });
  const tokenPath = join(runtimeDir, 'dev-token');
  let token;
  try { token = (await readFile(tokenPath, 'utf8')).trim(); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    token = randomBytes(32).toString('hex');
    await writeFile(tokenPath, `${token}\n`, { flag: 'wx', mode: 0o600 });
  }
  const store = new SocialStore(join(runtimeDir, 'social.sqlite'));
  const handler = async (request, response) => {
    try {
      if (!authorized(request, token)) throw new HttpError(401, 'Invalid local service token');
      const url = new URL(request.url, `http://${host}`);
      const method = request.method;
      if (method === 'GET' && url.pathname === '/api/health') {
        return respond(response, 200, { ok: true, service: 'zotero-social-reading', version: 1 });
      }
      if (method === 'POST' && url.pathname === '/api/identify') {
        const body = await readJSON(request);
        const pdf = await hashPDF(body.filePath, storageRoot);
        const document = store.ensureDocument(pdf.id, requiredString(body.title, 'title', 400));
        return respond(response, 200, { document: { id: document.id, title: document.title } });
      }
      const match = url.pathname.match(DOCUMENT);
      if (match) {
        const [, documentId, section] = match;
        if (!store.getDocument(documentId)) throw new HttpError(404, 'Unknown PDF');
        if (method === 'GET' && section === 'marks') {
          const pageParam = url.searchParams.get('pageIndex');
          const pageIndex = pageParam === null ? null : Number(pageParam);
          if (pageIndex !== null && (!Number.isInteger(pageIndex) || pageIndex < 0)) throw new HttpError(400, 'Invalid pageIndex');
          return respond(response, 200, { marks: store.listMarks(documentId, pageIndex) });
        }
        if (method === 'POST' && section === 'marks') {
          const body = await readJSON(request);
          const position = positionFrom(body);
          const mark = store.addMark({ documentId, ...position,
            quote: requiredString(body.quote, 'quote', 500),
            comment: optionalString(body.comment, 'comment'),
            authorName: requiredString(body.authorName, 'authorName', 80),
            ownerId: requiredString(body.ownerId, 'ownerId', 100), authorKind: 'human',
          });
          return respond(response, 201, { mark });
        }
        if (method === 'GET' && section === 'drafts') {
          const ownerId = requiredString(url.searchParams.get('ownerId'), 'ownerId', 100);
          return respond(response, 200, { drafts: store.listDrafts(documentId, ownerId) });
        }
        if (method === 'POST' && section === 'drafts') {
          const body = await readJSON(request);
          const ownerId = requiredString(body.ownerId, 'ownerId', 100);
          const pdf = await hashPDF(body.filePath, storageRoot);
          if (pdf.id !== documentId) throw new HttpError(409, 'PDF does not match this document');
          const suggestions = await aiGenerator({ pdfPath: pdf.path, title: store.getDocument(documentId).title,
            runtimeDir, codexPath, model });
          return respond(response, 201, { drafts: store.addDrafts(documentId, ownerId, suggestions) });
        }
      }
      const replyMatch = url.pathname.match(MARK_REPLIES);
      if (replyMatch && store.getMark(replyMatch[1])) {
        if (method === 'GET') return respond(response, 200, { replies: store.listReplies(replyMatch[1]) });
        if (method === 'POST') {
          const body = await readJSON(request);
          const reply = store.addReply({ markId: replyMatch[1],
            body: requiredString(body.body, 'body', 5000),
            authorName: requiredString(body.authorName, 'authorName', 80),
            ownerId: requiredString(body.ownerId, 'ownerId', 100),
          });
          return respond(response, 201, { reply });
        }
      }
      const draftMatch = url.pathname.match(DRAFT_PUBLISH);
      if (draftMatch && method === 'POST') {
        const body = await readJSON(request);
        const draft = store.getDraft(draftMatch[1]);
        if (!draft) throw new HttpError(404, 'Unknown AI draft');
        if (draft.publishedMarkId) throw new HttpError(409, 'AI draft is already published');
        const ownerId = requiredString(body.ownerId, 'ownerId', 100);
        if (ownerId !== draft.ownerId) throw new HttpError(403, 'This AI draft belongs to another local reader');
        const position = positionFrom(body);
        if (position.pageIndex !== draft.pageIndex) throw new HttpError(400, 'AI quote page does not match');
        const mark = store.addMark({ documentId: draft.documentId, ...position,
          quote: draft.quote, comment: draft.comment, authorName: 'AI 阅读助手',
          authorKind: 'ai', ownerId,
        });
        store.publishDraft(draft.id, mark.id);
        return respond(response, 201, { mark });
      }
      throw new HttpError(404, 'Endpoint not found');
    } catch (error) {
      const status = error.status || 500;
      if (status === 500) console.error('Social reading request failed:', error);
      respond(response, status, { error: status === 500 ? 'Local service failed; check its logs' : error.message });
    }
  };
  const server = http.createServer((request, response) => { void handler(request, response); });
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolveListen);
  });
  return { server, store, tokenPath, address: server.address(), close: () => new Promise(resolveClose => {
    server.close(() => { store.close(); resolveClose(); });
  }) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await createApp();
  console.log(`Zotero Social Reading development service: http://127.0.0.1:${app.address.port}`);
  console.log(`Local token file: ${app.tokenPath}`);
}
