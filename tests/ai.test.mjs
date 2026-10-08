import test from 'node:test';
import assert from 'node:assert/strict';
import { makeReadingPrompt, splitPdfPages, validateSuggestions } from '../server/ai.mjs';

test('AI suggestions must cite exact PDF text on the asserted page', () => {
  const pages = splitPdfPages('Introduction. The study had no average efficiency gains.\fResults. Novices lost debugging skill.\f');
  assert.equal(pages.length, 2);
  assert.match(makeReadingPrompt('Paper', pages), /PDF pageIndex 1/);
  assert.match(makeReadingPrompt('Paper', pages, 'beginner'), /complete beginner/);
  assert.match(makeReadingPrompt('Paper', pages, 'concise'), /3–5/);
  const valid = validateSuggestions({ suggestions: [
    { pageIndex: 0, quote: 'The study had no average efficiency gains.', comment: '平均效率并未提高，值得注意。', kind: 'key_point' },
    { pageIndex: 0, quote: 'Novices lost debugging skill.', comment: '页码错误的评论不应出现。', kind: 'question' },
    { pageIndex: 1, quote: 'This was never in the paper.', comment: '编造的引用不应出现。', kind: 'question' },
  ] }, pages);
  assert.equal(valid.length, 1);
  assert.equal(valid[0].pageIndex, 0);
});
