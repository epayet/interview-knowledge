// Uploads dist/ with rsync to DEPLOY_TARGET (set in .env or the environment).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(HERE, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const target = process.env.DEPLOY_TARGET;
if (!target) {
  console.error('DEPLOY_TARGET is not set. Copy .env.example to .env and set it (e.g. user@host:/var/www/site/interviewing/),\nor upload the contents of dist/ to your host manually.');
  process.exit(1);
}
if (!fs.existsSync(path.join(HERE, 'dist/index.html'))) { console.error('dist/ is empty; run `npm run build` first.'); process.exit(1); }
console.log(`Deploying dist/ -> ${target}`);
const r = spawnSync('rsync', ['-avz', '--delete', 'dist/', target], { cwd: HERE, stdio: 'inherit' });
process.exit(r.status ?? 1);
