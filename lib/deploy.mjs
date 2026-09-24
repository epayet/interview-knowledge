// Publishes dist/.
//   node lib/deploy.mjs          rsync dist/ to DEPLOY_TARGET (your own server)
//   node lib/deploy.mjs --pages  push dist/ to the gh-pages branch for GitHub Pages
// Settings come from .env or the environment (see .env.example).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(HERE, 'dist');

const envFile = path.join(HERE, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
const out = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts }).stdout.trim();

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/ is empty; run `npm run build` first.');
  process.exit(1);
}

if (process.argv.includes('--pages')) {
  // Publish dist/ as the single commit of the gh-pages branch (force-pushed each time),
  // so the branch only ever contains the built site, never the vault.
  const branch = process.env.PAGES_BRANCH || 'gh-pages';
  const remote = process.env.PAGES_REMOTE || 'origin';
  // PAGES_REMOTE is a remote name (default origin) or a repository URL/path.
  const url = out('git', ['remote', 'get-url', remote], { cwd: HERE, stdio: ['ignore', 'pipe', 'ignore'] }) || (/[:/]/.test(remote) ? remote : '');
  if (!url) {
    console.error(`No git remote "${remote}". Add your GitHub repository first:\n  git remote add origin git@github.com:<you>/<repo>.git`);
    process.exit(1);
  }
  const name = out('git', ['config', 'user.name'], { cwd: HERE });
  const email = out('git', ['config', 'user.email'], { cwd: HERE });
  const source = out('git', ['rev-parse', '--short', 'HEAD'], { cwd: HERE }) || 'unknown';

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-'));
  fs.cpSync(DIST, tmp, { recursive: true });
  fs.writeFileSync(path.join(tmp, '.nojekyll'), ''); // serve files as-is (no Jekyll processing)
  if (process.env.PAGES_CNAME) fs.writeFileSync(path.join(tmp, 'CNAME'), process.env.PAGES_CNAME + '\n');

  const git = args => run('git', args, { cwd: tmp });
  git(['init', '-q', '-b', branch]);
  if (name) git(['config', 'user.name', name]);
  if (email) git(['config', 'user.email', email]);
  git(['add', '-A']);
  git(['commit', '-q', '-m', `Deploy site built from ${source}`]);
  console.log(`Pushing dist/ to ${remote} (${url}) branch ${branch}…`);
  git(['push', '--force', '-q', url, `${branch}:${branch}`]);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`Done. In GitHub: Settings → Pages → Source "Deploy from a branch", branch "${branch}", folder "/ (root)".`);
} else {
  const target = process.env.DEPLOY_TARGET;
  if (!target) {
    console.error('DEPLOY_TARGET is not set. Set it in .env (e.g. user@host:/var/www/site/interviewing/),\nor use `npm run deploy:pages` for GitHub Pages.');
    process.exit(1);
  }
  console.log(`Deploying dist/ -> ${target}`);
  run('rsync', ['-avz', '--delete', 'dist/', target], { cwd: HERE });
}
