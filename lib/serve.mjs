// Static server for dist/. With --watch it rebuilds on changes to the vault or site
// sources and live-reloads open pages (Server-Sent Events, no dependencies).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(HERE, 'dist');
const WATCH = process.argv.includes('--watch');
const PORT = Number(process.env.PORT || 8080);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.gif': 'image/gif' };
const clients = new Set();
const RELOAD = `<script>new EventSource('/__reload').onmessage=()=>location.reload()</script>`;

// Each rebuild runs in a fresh process so changes to the build code are picked up too.
function rebuild() {
  const r = spawnSync(process.execPath, ['build.mjs'], { cwd: HERE, encoding: 'utf8' });
  const msg = (r.stdout + r.stderr).trim().split('\n').join(' | ');
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
  if (fs.existsSync(path.join(DIST, 'index.html'))) for (const res of clients) res.write('data: reload\n\n');
}

if (WATCH) {
  rebuild();
  const config = JSON.parse(fs.readFileSync(path.join(HERE, 'config.json'), 'utf8'));
  const vault = path.resolve(HERE, config.vault);
  let timer = null;
  const trigger = (file) => {
    if (file && /(^|[\\/])(dist|node_modules|\.obsidian|\.git|\.trash)([\\/]|$)|publish-report|audit-report/.test(file)) return;
    clearTimeout(timer); timer = setTimeout(rebuild, 250);
  };
  fs.watch(vault, { recursive: true }, (_, f) => trigger(f));
  for (const d of ['lib', 'static', 'data']) fs.watch(path.join(HERE, d), { recursive: true }, (_, f) => trigger(f));
  fs.watch(path.join(HERE, 'config.json'), () => trigger());
  fs.watch(path.join(HERE, 'build.mjs'), () => trigger());
  console.log(`Watching ${vault} and site sources.`);
} else if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/ is empty; run `npm run build` first.');
  process.exit(1);
}

http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (WATCH && url === '/__reload') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('\n'); clients.add(res); req.on('close', () => clients.delete(res));
    return;
  }
  let file = path.join(DIST, url);
  if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
  const ext = path.extname(file).toLowerCase();
  let body = fs.readFileSync(file);
  if (WATCH && ext === '.html') body = body.toString().replace('</body>', RELOAD + '</body>');
  res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
}).listen(PORT, () => console.log(`Serving dist/ at http://localhost:${PORT}${WATCH ? ' (live reload)' : ''}`));
