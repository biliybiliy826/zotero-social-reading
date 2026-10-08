import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const files = [
  'plugin/bootstrap.js', 'plugin/content/main.js', 'plugin/content/geometry.js',
  'plugin/content/api.js', 'plugin/content/style.js', 'plugin/content/reader-ui.js',
  'server/index.mjs', 'server/store.mjs', 'server/ai.mjs',
  'scripts/build.mjs', 'scripts/check.mjs',
];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', resolve(root, file)], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${file}: ${result.stderr || result.stdout}`);
}
const manifest = JSON.parse(readFileSync(resolve(root, 'plugin/manifest.json'), 'utf8'));
if (manifest.applications?.zotero?.id !== 'social-reading@zotero.local') {
  throw new Error('Unexpected extension ID');
}
if (!manifest.applications?.zotero?.update_url) throw new Error('Zotero 10 requires update_url');
for (const locale of ['en_US', 'zh_CN']) {
  const messages = JSON.parse(readFileSync(resolve(root, `plugin/_locales/${locale}/messages.json`), 'utf8'));
  if (!messages.extensionName?.message || !messages.extensionDescription?.message) {
    throw new Error(`Incomplete ${locale} localization`);
  }
}
console.log('Static checks passed');
