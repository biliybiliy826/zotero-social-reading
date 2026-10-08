import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const [base, tokenFile] = process.argv.slice(2);
if (!base || !tokenFile) throw new Error('Usage: node scripts/smoke-worker.mjs URL TOKEN_FILE');
const token = (await readFile(tokenFile, 'utf8')).trim();
const digest = randomBytes(32).toString('hex');
const send = async (method, path, body, authenticated = false) => {
  const response = await fetch(base + path, { method, headers: {
    'Content-Type': 'application/json', ...(authenticated ? { Authorization: `Bearer ${token}` } : {}),
  }, body: body == null ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
};

assert.equal((await send('GET', '/v1/health')).status, 200);
assert.deepEqual((await send('GET', `/v1/documents/${digest}/marks`)).data.marks, []);
assert.equal((await send('GET', `/v1/documents/${digest}/guides?tier=beginner`)).data.guide, null);
assert.equal((await send('POST', '/v1/identify', { sha256: digest, title: 'Paper' })).status, 401);
assert.equal((await send('POST', '/v1/identify', { filePath: '/secret.pdf', sha256: digest, title: 'Paper' }, true)).status, 400);
assert.equal((await send('POST', '/v1/identify', { sha256: digest, title: 'Paper' }, true)).status, 200);
assert.deepEqual((await send('GET', `/v1/documents/${digest}/marks`)).data.marks, []);
assert.equal((await send('GET', `/v1/documents/${digest}/guides?tier=beginner`)).data.guide, null);
const mark = { id: randomUUID(), pageIndex: 0, rects: [[1, 2, 3, 4]],
  quote: 'An exact quotation in the PDF', comment: 'A reader comment', authorKind: 'human' };
assert.equal((await send('POST', `/v1/documents/${digest}/marks`, mark)).status, 401);
const posted = await send('POST', `/v1/documents/${digest}/marks`, mark, true);
assert.equal(posted.status, 201, JSON.stringify(posted.data));
assert.equal((await send('POST', `/v1/documents/${digest}/marks`, mark, true)).status, 200);
assert.equal((await send('GET', `/v1/documents/${digest}/marks`)).data.marks.length, 1);
const reply = await send('POST', `/v1/marks/${mark.id}/replies`, { id: randomUUID(), body: 'A reply' }, true);
assert.equal(reply.status, 201, JSON.stringify(reply.data));
assert.equal((await send('GET', `/v1/marks/${mark.id}/replies`)).data.replies.length, 1);
const guide = { id: randomUUID(), tier: 'beginner', promptVersion: 1,
  overview: 'The study asks a question, uses a method, and reports a finding.',
  suggestions: [{ pageIndex: 0, quote: 'An exact quotation in the PDF',
    comment: 'This explains the question in terms a beginner can understand.', kind: 'key_point' }] };
assert.equal((await send('POST', `/v1/documents/${digest}/guides`,
  { ...guide, suggestions: [null] }, true)).status, 400);
assert.equal((await send('POST', `/v1/documents/${digest}/guides`, guide)).status, 401);
assert.equal((await send('POST', `/v1/documents/${digest}/guides`, guide, true)).status, 201);
const reused = await send('POST', `/v1/documents/${digest}/guides`, { ...guide, id: randomUUID() }, true);
assert.equal(reused.data.reused, true);
const shared = (await send('GET', `/v1/documents/${digest}/guides?tier=beginner`)).data.guide;
assert.equal(shared.suggestions.length, 1);
assert.equal(shared.overview, guide.overview);
const immersive = { ...guide, id: randomUUID(), promptVersion: 2,
  suggestions: Array.from({ length: 21 }, (_, pageIndex) => ({ ...guide.suggestions[0], pageIndex })) };
assert.equal((await send('POST', `/v1/documents/${digest}/guides`, immersive, true)).status, 201);
assert.equal((await send('GET', `/v1/documents/${digest}/guides?tier=beginner&version=2`)).data.guide.suggestions.length, 21);
assert.equal((await send('GET', `/v1/documents/${digest}/guides?tier=beginner`)).data.guide.promptVersion, 1);
console.log('Worker smoke passed: anonymous reading, authenticated publishing, and guide reuse.');
