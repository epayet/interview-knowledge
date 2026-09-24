// Cleanup audit: lists what could be removed from the extract. Never deletes anything.
//   npm run audit            writes audit-report.md
//   npm run audit -- --json  prints the same data as JSON
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadVault } from './vault.mjs';
import { buildGraph } from './graph.mjs';
import { ownExcerpt } from './transform.mjs';

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(HERE, 'config.json'), 'utf8'));
const vaultDir = path.resolve(HERE, config.vault);
const vault = loadVault(vaultDir);
const g = buildGraph(vault, config);

const K = vault.notes.filter(n => n.kind === 'knowledge');
const info = n => ({
  path: n.rel,
  name: n.name,
  tags: n.footer.tags,
  firstLine: ownExcerpt(n.main, 25),
  partOf: n.footer.partOf.map(l => l.target.split('/').pop()),
});

// Sources/images that would become unreferenced if `note` were deleted.
const imageRefs = new Map();
for (const n of vault.notes) for (const m of n.raw.matchAll(/!\[\[([^\]|#]+)/g)) {
  const abs = vault.resolveAttachment(m[1]);
  if (!abs) continue;
  if (!imageRefs.has(abs)) imageRefs.set(abs, new Set());
  imageRefs.get(abs).add(n);
}
function cascade(note) {
  const sources = [...note.out].filter(s => s.kind === 'source' && [...s.in].every(m => m === note || m.kind === 'source'));
  const gone = new Set([note, ...sources]);
  const images = [...imageRefs].filter(([, ns]) => [...ns].every(n => gone.has(n))).map(([abs]) => path.relative(vaultDir, abs));
  return { sources: sources.map(s => s.rel), images };
}

const unlinked = g.unlinked.map(n => ({ ...info(n), cascade: cascade(n) }));
const connected = K.filter(n => n.published)
  .sort((a, b) => (a.distance ?? 99) - (b.distance ?? 99) || a.name.localeCompare(b.name))
  .map(n => ({
    ...info(n),
    distance: n.distance,
    core: n.core,
    breadcrumb: n.breadcrumb.map(b => b.name).join(' › '),
    cascade: cascade(n),
  }));
const usedImages = new Set([...imageRefs.keys()]);
const allImages = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(png|jpe?g|gif|webp|svg)$/i.test(e.name)) allImages.push(p); } })(vaultDir);
const unusedImages = allImages.filter(p => !usedImages.has(p)).map(p => path.relative(vaultDir, p));
const unreferencedSources = g.unreferencedSources.map(s => s.rel);

const data = { entry: config.entry, unlinked, connected, unreferencedSources, unusedImages };

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(data, null, 2));
} else {
  const fmtCascade = c => (c.sources.length || c.images.length) ? `\n    - deleting it would orphan: ${[...c.sources, ...c.images].join('; ')}` : '';
  const md = [
    `# Cleanup audit`,
    ``,
    `Generated ${new Date().toISOString()} from \`${config.vault}\`, entry \`${config.entry}\`. Nothing has been deleted.`,
    ``,
    `## 1. Knowledge notes not connected to the entry note (${unlinked.length})`,
    ...unlinked.map(n => `- **${n.name}** (\`${n.path}\`) ${n.tags.map(t => '#' + t).join(' ')}\n    - first line: ${n.firstLine || '(empty)'}${n.partOf.length ? `\n    - Part of: ${n.partOf.join(', ')}` : ''}${fmtCascade(n.cascade)}`),
    ``,
    `## 2. Connected notes, for a relevance review (${connected.length})`,
    `Sorted by link distance from the entry note ("—" = only reachable through inbound links).`,
    ``,
    ...connected.map(n => `- **${n.name}** · distance ${n.distance ?? '—'}${n.core ? '' : ' · further reading'} · ${n.breadcrumb || 'top level'} ${n.tags.map(t => '#' + t).join(' ')}\n    - first line: ${n.firstLine || '(empty)'}${fmtCascade(n.cascade)}`),
    ``,
    `## 3. Source notes no knowledge note cites (${unreferencedSources.length})`,
    ...unreferencedSources.map(s => `- \`${s}\``),
    ``,
    `## 4. Unused images (${unusedImages.length})`,
    ...unusedImages.map(s => `- \`${s}\``),
    ``,
  ].join('\n');
  fs.writeFileSync(path.join(HERE, 'audit-report.md'), md);
  console.log(`audit-report.md: ${unlinked.length} unlinked notes, ${connected.length} connected notes to review, ${unreferencedSources.length} unreferenced sources, ${unusedImages.length} unused images.`);
}
