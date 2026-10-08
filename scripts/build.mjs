import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const version = JSON.parse(readFileSync(resolve(root, 'plugin/manifest.json'), 'utf8')).version;
const output = resolve(dist, `zotero-social-reading-${version}.xpi`);
mkdirSync(dist, { recursive: true });
rmSync(output, { force: true });
const result = spawnSync('zip', ['-q', '-r', '-X', output,
  'manifest.json', 'bootstrap.js', 'prefs.js', '_locales', 'content'],
{ cwd: resolve(root, 'plugin'), encoding: 'utf8' });
if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'zip failed');
console.log(output);
