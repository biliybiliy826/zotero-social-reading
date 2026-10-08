import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../plugin/content/api.js', import.meta.url), 'utf8');
const files = new Map();
const Api = runInNewContext(`${source}\nZSRApi;`, {
  PathUtils: { join: (...parts) => parts.join('/'), parent: path => path.slice(0, path.lastIndexOf('/')) },
  Services: { uuid: { generateUUID: () => ({ toString: () => '{11111111-1111-4111-8111-111111111111}' }) } },
  IOUtils: { exists: async path => files.has(path), readUTF8: async path => files.get(path),
    makeDirectory: async () => {}, writeUTF8: async (path, content) => { files.set(path, content); } },
  Components: { classes: { '@mozilla.org/file/local;1': { createInstance: () => ({ initWithPath() {}, permissions: 0 }) } },
    interfaces: { nsIFile: {} } },
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
  assert.match(calls[1].path, /version=2$/u);
  await api.publishGuide(digest, 'beginner', { overview: 'Overview', suggestions: [{
    pageIndex: 0, quote: 'Quoted paper text', comment: 'Explanation', kind: 'key_point',
  }] });
  assert.deepEqual(calls.slice(2).map(call => [call.method, call.path]), [
    ['POST', '/identify'], ['POST', `/documents/${digest}/guides`],
  ]);
  assert.equal(calls[2].body.title, 'Paper');
  assert.equal(calls[3].body.tier, 'beginner');
  assert.equal(calls[3].body.promptVersion, 2);
});

test('private beginner preview survives a fresh API instance without a cloud write', async () => {
  const digest = 'b'.repeat(64);
  const guide = { overview: 'A private reading path', suggestions: [{ pageIndex: 0,
    quote: 'Quoted paper text', comment: 'A beginner explanation', kind: 'key_point' }] };
  const first = new Api('/zotero', 'https://worker.example');
  await first.savePrivateGuide(digest, 'beginner', guide);
  assert.match(first.privateGuidePath(digest, 'beginner'), /-beginner-v2\.json$/u);
  const reopened = new Api('/zotero', 'https://worker.example');
  assert.deepEqual(JSON.parse(JSON.stringify(await reopened.loadPrivateGuide(digest, 'beginner'))), guide);
  assert.equal(await reopened.loadPrivateGuide(digest, 'standard'), null);
});
