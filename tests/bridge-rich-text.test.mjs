import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const context = vm.createContext({ Zotero: { launchURL() {} } });
for (const file of ['plugin/content/vendor/codex-markdown.js',
  'plugin/content/rich-text.js', 'plugin/content/codex-bridge.js']) {
  vm.runInContext(readFileSync(resolve(root, file), 'utf8'), context, { filename: file });
}

class Node {
  constructor(tag, value = '') {
    this.tag = tag;
    this.value = value;
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.events = {};
    this.classList = { add() {} };
  }
  append(...nodes) { this.children.push(...nodes); }
  set textContent(value) { this.value = value; this.children = []; }
  get textContent() { return this.value + this.children.map(node => node.textContent).join(''); }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, listener) { this.events[name] = listener; }
}
const doc = {
  createElement: tag => new Node(tag),
  createElementNS: (_namespace, tag) => new Node(tag),
  createTextNode: value => new Node('#text', value),
};
const flatten = node => [node, ...node.children.flatMap(flatten)];

test('discussion Markdown and formulas render as DOM nodes, never raw HTML', () => {
  const rendered = context.ZSRRichText.render(doc,
    '**注意** <img src=x onerror=alert(1)> $E=mc^2$\n\n$$\\frac{a}{b}$$');
  const nodes = flatten(rendered);
  assert.ok(nodes.some(node => node.tag === 'strong'));
  assert.ok(nodes.some(node => node.className === 'zcs-inline-math'));
  assert.ok(nodes.some(node => node.className === 'zcs-display-math'));
  assert.equal(nodes.some(node => node.tag === 'img'), false);
  assert.match(rendered.textContent, /<img src=x onerror=alert\(1\)>/u);
});

test('discussion links only open HTTP(S) targets', () => {
  const opened = [];
  context.Zotero.launchURL = target => opened.push(target);
  const rendered = context.ZSRRichText.render(doc,
    '[unsafe](javascript:alert(1)) [safe](https://example.org/paper)');
  const links = flatten(rendered).filter(node => node.tag === 'a');
  assert.equal(links[0].href, '#');
  assert.equal(links[1].href, 'https://example.org/paper');
  for (const link of links) link.events.click({ preventDefault() {} });
  assert.deepEqual(opened, ['https://example.org/paper']);
});

test('Codex handoff includes paper context and delegates without sending', async () => {
  const calls = [];
  context.Zotero.CodexSidebar = {
    externalDraftVersion: 1,
    prepareExternalDraft: (...args) => { calls.push(args); return { appended: false }; },
  };
  const result = await context.ZSRCodexBridge.prepare({ itemID: 1832, tabID: 'pdf-1' }, {
    title: 'Attention Is All You Need', pageIndex: 3,
    quote: 'Scaled Dot-Product Attention', body: '为什么除以 $\\sqrt{d_k}$?', kind: 'comment',
  });
  assert.equal(result.appended, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 1832);
  assert.equal(calls[0][2], 'pdf-1');
  assert.match(calls[0][1], /PDF 第 4 页/u);
  assert.match(calls[0][1], /Attention Is All You Need/u);
  assert.match(calls[0][1], /\\sqrt\{d_k\}/u);
});
