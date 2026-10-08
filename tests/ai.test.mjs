import test from 'node:test';
import assert from 'node:assert/strict';
import { beginnerReadingPages, makeReadingPrompt, missingBeginnerPages, missingBeginnerSteps,
  prioritizeBeginnerCoverage,
  splitPdfPages, validateSuggestions } from '../server/ai.mjs';

test('AI suggestions must cite exact PDF text on the asserted page', () => {
  const pages = splitPdfPages('Introduction. The study had no average efficiency gains.\fResults. Novices lost debugging skill.\f');
  assert.equal(pages.length, 2);
  assert.match(makeReadingPrompt('Paper', pages), /PDF pageIndex 1/);
  assert.match(makeReadingPrompt('Paper', pages, 'beginner'), /complete beginner/);
  assert.match(makeReadingPrompt('Paper', pages, 'beginner'), /0, 1/);
  assert.match(makeReadingPrompt('Paper', pages, 'concise'), /3–5/);
  const valid = validateSuggestions({ suggestions: [
    { pageIndex: 0, quote: 'The study had no average efficiency gains.', comment: '平均效率并未提高，值得注意。', kind: 'key_point' },
    { pageIndex: 0, quote: 'Novices lost debugging skill.', comment: '页码错误的评论不应出现。', kind: 'question' },
    { pageIndex: 1, quote: 'This was never in the paper.', comment: '编造的引用不应出现。', kind: 'question' },
  ] }, pages);
  assert.equal(valid.length, 1);
  assert.equal(valid[0].pageIndex, 0);
});

test('beginner guide covers content and figure appendix while skipping bibliography-only pages', () => {
  const pages = ['Introduction to method', '1 Results',
    '[1] First cited work\n[2] Second\n[3] Third\n[4] Fourth\n[5] Fifth',
    'Figure 3: attention visualization'];
  assert.deepEqual(beginnerReadingPages(pages), [0, 1, 3]);
  assert.deepEqual(missingBeginnerPages([{ pageIndex: 0 }, { pageIndex: 3 }], pages), [1]);
});

test('beginner guide gives an equation and the training/results transitions extra steps', () => {
  const pages = ['Attention(Q, K, V) = softmax(QK) V', '5 Training\nOptimizer settings',
    '6 Results\nBLEU score'];
  assert.deepEqual(missingBeginnerSteps([{ pageIndex: 0 }, { pageIndex: 1 }], pages), [
    { pageIndex: 0, needed: 1 }, { pageIndex: 1, needed: 1 }, { pageIndex: 2, needed: 2 },
  ]);
});

test('repair keeps a late-page anchor when the combined response exceeds thirty comments', () => {
  const pages = ['Intro text', 'Appendix figure'];
  const suggestions = Array.from({ length: 30 }, (_, index) => ({ pageIndex: 0, quote: `Intro ${index}` }));
  suggestions.push({ pageIndex: 1, quote: 'Figure caption' });
  const selected = prioritizeBeginnerCoverage(suggestions, pages);
  assert.equal(selected.length, 30);
  assert.equal(selected.at(-1).pageIndex, 1);
});
