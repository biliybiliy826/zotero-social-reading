import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const [name, tokenPath, sqlPath] = process.argv.slice(2);
if (!name?.trim() || name.length > 80 || !tokenPath || !sqlPath) {
  throw new Error('Usage: node scripts/provision-user.mjs "Display name" TOKEN_FILE SQL_FILE');
}
const token = randomBytes(32).toString('hex');
const hash = createHash('sha256').update(token).digest('hex');
const userId = randomUUID();
const displayName = name.trim().replaceAll("'", "''");
await mkdir(dirname(resolve(tokenPath)), { recursive: true, mode: 0o700 });
await writeFile(tokenPath, `${token}\n`, { flag: 'wx', mode: 0o600 });
await writeFile(sqlPath,
  `INSERT INTO users (id, display_name, token_hash, role, disabled, created_at) VALUES ('${userId}', '${displayName}', '${hash}', 'reader', 0, '${new Date().toISOString()}');\n`,
  { flag: 'wx', mode: 0o600 });
console.log(`Created private token at ${resolve(tokenPath)} and D1 seed SQL at ${resolve(sqlPath)}.`);
