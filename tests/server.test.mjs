import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/index.mjs';

test('two local readers share explicitly published marks, while AI stays draft until published', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zsr-test-'));
  const pdfPath = join(root, 'storage', 'ABCD1234', 'paper.pdf');
  await mkdir(join(root, 'storage', 'ABCD1234'), { recursive: true });
  await writeFile(pdfPath, '%PDF-1.7\nprototype\n');
  const aiGenerator = async () => [{ pageIndex: 0, quote: 'A test statement in the PDF',
    comment: '这是 AI 提出的关键点，供读者确认。', kind: 'key_point' }];
  const guideGenerator = async ({ tier }) => ({ overview: `Guide for ${tier} readers.`,
    suggestions: [{ pageIndex: 0, quote: 'A test statement in the PDF',
      comment: '这是本机预览的导读。', kind: 'key_point' }] });
  const app = await createApp({ dataDir: root, port: 0, aiGenerator, guideGenerator });
  try {
    const token = (await readFile(app.tokenPath, 'utf8')).trim();
    const base = `http://127.0.0.1:${app.address.port}`;
    const request = async (path, method = 'GET', body, auth = token) => {
      const response = await fetch(base + path, { method,
        headers: { 'X-Social-Reading-Token': auth, 'Content-Type': 'application/json' },
        body: body && JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    };
    assert.equal((await request('/api/health', 'GET', null, 'bad')).status, 401);
    assert.equal((await request('/api/identify', 'POST', { filePath: '/tmp/outside.pdf', title: 'Outside' })).status, 404);
    const identified = await request('/api/identify', 'POST', { filePath: pdfPath, title: 'Test paper' });
    assert.equal(identified.status, 200);
    const id = identified.body.document.id;
    assert.equal(id.length, 64);
    assert.deepEqual((await request(`/api/documents/${id}/marks`)).body.marks, []);

    const position = { pageIndex: 0, rects: [[10, 20, 100, 30]] };
    const published = await request(`/api/documents/${id}/marks`, 'POST', {
      ...position, quote: 'A useful finding', comment: '需要讨论这个结论。',
      authorName: 'Reader A', ownerId: 'reader-a', authorKind: 'ai',
    });
    assert.equal(published.status, 201);
    assert.equal(published.body.mark.authorKind, 'human');
    const readerB = await request(`/api/documents/${id}/marks?pageIndex=0`);
    assert.equal(readerB.body.marks.length, 1);
    assert.equal(readerB.body.marks[0].comment, '需要讨论这个结论。');
    const reply = await request(`/api/marks/${published.body.mark.id}/replies`, 'POST', {
      body: '我认为样本量还需要解释。', authorName: 'Reader B', ownerId: 'reader-b',
    });
    assert.equal(reply.status, 201);
    assert.equal((await request(`/api/marks/${published.body.mark.id}/replies`)).body.replies.length, 1);

    const generated = await request(`/api/documents/${id}/drafts`, 'POST', { filePath: pdfPath, ownerId: 'reader-a' });
    assert.equal(generated.status, 201);
    assert.equal(generated.body.drafts.length, 1);
    assert.equal((await request(`/api/documents/${id}/marks`)).body.marks.length, 1);
    assert.equal((await request(`/api/documents/${id}/drafts?ownerId=reader-b`)).body.drafts.length, 0);
    const draftId = generated.body.drafts[0].id;
    assert.equal((await request(`/api/drafts/${draftId}/publish`, 'POST', { ...position, ownerId: 'reader-b' })).status, 403);
    const aiMark = await request(`/api/drafts/${draftId}/publish`, 'POST', { ...position, ownerId: 'reader-a' });
    assert.equal(aiMark.status, 201);
    assert.equal(aiMark.body.mark.authorKind, 'ai');
    assert.equal(aiMark.body.mark.authorName, 'AI 阅读助手');
    assert.equal((await request(`/api/documents/${id}/marks`)).body.marks.length, 2);
    assert.equal((await request(`/api/drafts/${draftId}/publish`, 'POST', { ...position, ownerId: 'reader-a' })).status, 409);
    const guide = await request('/api/guides/generate', 'POST', {
      filePath: pdfPath, title: 'Test paper', tier: 'beginner',
    });
    assert.equal(guide.status, 200);
    assert.equal(guide.body.guide.suggestions.length, 1);
    assert.equal((await request('/api/guides/generate', 'POST', {
      filePath: pdfPath, title: 'Test paper', tier: 'not-a-tier',
    })).status, 400);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
