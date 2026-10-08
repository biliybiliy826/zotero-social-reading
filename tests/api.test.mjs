import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../plugin/content/api.js', import.meta.url), 'utf8');
const Api = runInNewContext(`${source}\nZSRApi;`, {
  PathUtils: { join: (...parts) => parts.join('/'), parent: path => path.slice(0, path.lastIndexOf('/')) },
  Services: { uuid: { generateUUID: () => ({ toString: () => '{11111111-1111-4111-8111-111111111111}' }) } },
});

test('anonymous cloud open only reads; first publication registers the PDF with a token', async () => {
  const api = new Api('/zotero', 'https://worker.example');
  const calls = [];
  const digest = 'a'.repeat(64);
  api.pdfSHA256 = async () => digest;
  api.request = async (method, path, body) => {
    calls.push({ method, path, body });
    return path === '/health' ? { ok: true } : { guide: null };
  };
  assert.equal((await api.identify('/zotero/storage/paper.pdf', 'Paper')).document.id, digest);
  assert.deepEqual(calls.map(call => [call.method, call.path]), [['GET', '/health']]);
  await api.guide(digest, 'beginner');
  assert.equal(calls[1].method, 'GET');
  await api.publishGuide(digest, 'beginner', { overview: 'Overview', suggestions: [{
    pageIndex: 0, quote: 'Quoted paper text', comment: 'Explanation', kind: 'key_point',
  }] });
  assert.deepEqual(calls.slice(2).map(call => [call.method, call.path]), [
    ['POST', '/identify'], ['POST', `/documents/${digest}/guides`],
  ]);
  assert.equal(calls[2].body.title, 'Paper');
  assert.equal(calls[3].body.tier, 'beginner');
});
