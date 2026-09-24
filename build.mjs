// Builds the static site from the Obsidian vault into dist/.
//   node build.mjs          full build + publish-report.md
//   node build.mjs --check  same, but prints only warnings and exits non-zero on errors
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadVault, slugify } from './lib/vault.mjs';
import { buildGraph } from './lib/graph.mjs';
import { createTransformer, ownExcerpt, plainText, h1Sections, esc } from './lib/transform.mjs';
import { maturityOf } from './lib/maturity.mjs';
import { buildTradeoffs } from './lib/tradeoffs.mjs';
import { buildMap } from './lib/map.mjs';
import * as T from './lib/render.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHECK = process.argv.includes('--check');

export function build({ quiet = false } = {}) {
  const t0 = Date.now();
  const config = JSON.parse(fs.readFileSync(path.join(HERE, 'config.json'), 'utf8'));
  const vaultDir = path.resolve(HERE, config.vault);
  const DIST = path.join(HERE, 'dist');
  const arch = JSON.parse(fs.readFileSync(path.join(HERE, 'data/architecture.json'), 'utf8'));
  const numbers = JSON.parse(fs.readFileSync(path.join(HERE, 'data/numbers.json'), 'utf8'));

  const vault = loadVault(vaultDir);
  const graph = buildGraph(vault, config);
  const { published } = graph;
  const K = [...published].filter(n => n.kind === 'knowledge');
  const S = [...published].filter(n => n.kind === 'source');
  graph.entry.url = 'index.html'; // the map of content is the home page
  // Pinned sidebar topics. Pinned notes are moved to the top level of the tree.
  graph.tree.pinned = (config.pinned || []).map(name => vault.resolve(name)).filter(n => n?.published && n.kind === 'knowledge');
  for (const n of graph.tree.pinned) {
    if (n.treeParent && n.treeParent !== graph.entry) {
      n.treeParent.treeChildren = n.treeParent.treeChildren.filter(c => c !== n);
      n.treeParent = graph.entry;
      graph.entry.treeChildren.push(n);
    }
  }

  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(path.join(DIST, 'assets/img'), { recursive: true });

  // Attachments are copied on first use.
  const copied = new Map();
  const transformer = createTransformer({
    resolve: vault.resolve,
    resolveAttachment: vault.resolveAttachment,
    isPublished: n => n.published,
    rel: url => T.R + url,
    onAttachment: abs => {
      if (!copied.has(abs)) {
        const ext = path.extname(abs).toLowerCase();
        const name = `assets/img/${slugify(path.basename(abs, ext))}${ext}`;
        fs.copyFileSync(abs, path.join(DIST, name));
        copied.set(abs, name);
      }
      return copied.get(abs);
    },
  });
  const renderHtml = src => transformer.render(src).html;

  const warnings = { dangling: new Map(), missingImages: [] };
  const track = (n, r) => {
    for (const d of r.dangling) { if (!warnings.dangling.has(d)) warnings.dangling.set(d, new Set()); warnings.dangling.get(d).add(n.name); }
    for (const m of r.missingImages) warnings.missingImages.push(`${n.name}: ${m}`);
  };

  // Pass 1: render bodies, excerpts and maturity for every knowledge note.
  for (const n of K) {
    n.rendered = transformer.render(n.main);
    track(n, n.rendered);
    n.excerpt = ownExcerpt(n.main, 32);
  }
  for (const n of K) n.maturity = maturityOf(n, n.rendered.stats, config);

  // Sources: only the highlights and AI summary are shown; personal raw notes,
  // descriptions, transcripts and copied article text are dropped.
  const keep = new Set(config.sourceSections.keep.map(s => s.toLowerCase()));
  const ai = new Set(config.sourceSections.ai.map(s => s.toLowerCase()));
  for (const s of S) {
    const secs = h1Sections(s.main);
    const pick = set => secs.filter(x => x.title && set.has(x.title.toLowerCase()) && x.body).map(x => x.body).join('\n\n');
    const hl = pick(keep), aiText = pick(ai);
    const base = /^https?:/.test(String(s.fm.source || '')) ? String(s.fm.source) : null;
    s.highlights = hl ? transformer.render(hl, { base }) : null;
    s.ai = aiText ? transformer.render(aiText, { base }) : null;
    if (s.highlights) track(s, s.highlights);
    if (s.ai) track(s, s.ai);
    s.searchText = plainText([hl, aiText, s.fm.description || ''].join(' '));
    s.excerpt = String(s.fm.description || ownExcerpt(aiText || hl, 32) || '');
  }

  // Trade-offs and map.
  for (const f of Object.values(config.tradeoffFactors)) f.noteObj = f.note ? vault.resolve(f.note) : null;
  const tradeoffs = buildTradeoffs({ published, resolve: vault.resolve, render: renderHtml, config });
  const map = buildMap(arch, vault.resolve, n => n.published);
  for (const nb of numbers) nb.noteObj = vault.resolve(nb.note);

  const site = config;
  const pages = []; // [relPath, html]
  const write = (rel, html) => {
    const depth = rel.split('/').length - 1;
    const root = depth ? '../'.repeat(depth) : '';
    const out = html.replaceAll(T.R, root);
    fs.mkdirSync(path.dirname(path.join(DIST, rel)), { recursive: true });
    fs.writeFileSync(path.join(DIST, rel), out);
    pages.push(rel);
  };

  // Note pages.
  for (const n of K) {
    if (n === graph.entry) continue;
    const compId = map.noteToComp.get(n);
    const comp = compId && map.byId.get(compId);
    const mapThumb = comp ? { id: compId, label: comp.label, svg: map.svg({ highlight: compId, thumb: true }) } : null;
    const body = T.notePage(n, { rendered: n.rendered, mapThumb });
    write(n.url, T.layout({ site, title: n.name, description: n.excerpt, body, sidebarHtml: T.sidebar(graph.tree, n), toc: n.rendered.toc }));
  }

  // Source pages.
  for (const s of S) {
    const body = T.sourcePage(s, { highlightsHtml: s.highlights?.html, aiHtml: s.ai?.html });
    write(s.url, T.layout({ site, title: s.title, description: s.excerpt, body, active: 'library', sidebarHtml: T.sidebar(graph.tree, null) }));
  }

  // Home = the entry note: leading link-only lines become "Start here" cards.
  const entry = graph.entry;
  const lines = entry.main.split('\n');
  const firstHeading = lines.findIndex(l => /^#\s/.test(l));
  const lead = lines.slice(0, firstHeading < 0 ? lines.length : firstHeading);
  const startHere = lead.flatMap(l => [...l.matchAll(/\[\[([^\]]+)\]\]/g)].map(m => vault.resolve(m[1].split('|')[0].split('#')[0]))).filter(n => n?.published);
  const mocHtml = renderHtml(lines.slice(firstHeading < 0 ? lines.length : firstHeading).join('\n'));
  write('index.html', T.layout({
    site, title: site.siteTitle, description: site.siteSubtitle, active: 'home', bodyClass: 'home',
    body: T.homePage({ site, entry, startHere, mocHtml, legend: T.LEGEND, randomHtml: T.randomTradeoff(tradeoffs.cards, tradeoffs.groups), counts: { notes: K.length, sources: S.length, tradeoffs: tradeoffs.cards.length } }),
    sidebarHtml: T.sidebar(graph.tree, null),
  }));

  write('library.html', T.layout({ site, title: 'Library', description: 'Sources behind the notes', active: 'library', bodyClass: 'wide', body: T.libraryPage(S) }));

  const tagMap = new Map();
  for (const n of K) for (const t of n.footer.tags) { if (!tagMap.has(t)) tagMap.set(t, []); tagMap.get(t).push(n); }
  write('tags.html', T.layout({ site, title: 'Tags', active: 'tags', bodyClass: 'wide', body: T.tagsPage(tagMap) }));

  write('practice.html', T.layout({ site, title: 'Practice', description: 'Random trade-off flashcards', active: 'practice', bodyClass: 'wide', body: T.practicePage(tradeoffs, config) }));
  write('tradeoffs.html', T.layout({ site, title: 'Trade-off explorer', description: 'Comparisons and when-to-use guides', active: 'tradeoffs', bodyClass: 'wide', body: T.tradeoffsPage(tradeoffs, config) }));

  // "Common problems": each # heading of the patterns note is a problem; its links map to components.
  const patternsNote = arch.patternsNote ? vault.resolve(arch.patternsNote) : null;
  const problems = patternsNote?.published ? h1Sections(patternsNote.main).filter(sec => sec.title).map(sec => {
    const notes = [...new Set([...sec.body.matchAll(/\[\[([^\]|#]+)/g)].map(m => vault.resolve(m[1])).filter(n => n?.published))];
    const comps = [...new Set(notes.map(n => map.noteToComp.get(n)).filter(Boolean))];
    const text = sec.body.replace(/\[\[[^\]]*\]\]/g, '').replace(/\s+/g, ' ').trim();
    return { title: sec.title, id: 'p-' + slugify(sec.title), anchor: slugify(sec.title), notes, comps, text };
  }) : [];
  const allComps = [...map.comps, ...map.cross];
  const panels = allComps.map(c => {
    const primary = c.notes[0];
    const when = primary?.whenSections?.[0];
    const whenHtml = when ? `<h3>${esc(when.heading)}</h3>${renderHtml(when.body)}` : '';
    const comparisons = tradeoffs.cards.filter(t => t.kind !== 'when' && (c.notes.includes(t.note) || t.options.some(o => c.notes.includes(o.note))));
    return T.mapPanel(c, { whenHtml, comparisons });
  }).join('');
  write('map.html', T.layout({ site, title: 'System design map', description: 'Reference architecture linked to notes', active: 'map', bodyClass: 'wide', body: T.mapPage(map, numbers, panels, { problems, patternsNote }) }));

  // Search index and link previews.
  const search = [...K, ...S].map(n => ({
    id: n.url, url: n.url, kind: n.kind,
    title: n.kind === 'source' ? n.title : n.name,
    tags: (n.footer.tags || []).join(' '),
    headings: n.kind === 'knowledge' ? n.rendered.toc.map(t => t.text).join(' ') : '',
    text: (n.kind === 'knowledge' ? plainText(n.main) : n.searchText).slice(0, 4000),
    m: n.maturity?.level || '',
    ex: (n.excerpt || '').slice(0, 160),
  }));
  fs.writeFileSync(path.join(DIST, 'assets/search.json'), JSON.stringify(search));
  const previews = {};
  for (const n of [...K, ...S]) previews[n.url] = { t: n.kind === 'source' ? n.title : n.name, k: n.kind === 'source' ? n.sourceType : '', m: n.maturity ? T.badge(n.maturity) : '', e: n.excerpt || '' };
  fs.writeFileSync(path.join(DIST, 'assets/previews.json'), JSON.stringify(previews));

  // Static assets.
  for (const f of fs.readdirSync(path.join(HERE, 'static'))) fs.copyFileSync(path.join(HERE, 'static', f), path.join(DIST, 'assets', f));
  fs.copyFileSync(path.join(HERE, 'node_modules/minisearch/dist/umd/index.js'), path.join(DIST, 'assets/minisearch.js'));

  // Link check.
  const broken = [];
  for (const rel of pages) {
    const html = fs.readFileSync(path.join(DIST, rel), 'utf8');
    for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const u = m[1];
      if (/^(https?:|mailto:|data:|#)/.test(u)) continue;
      const target = path.join(DIST, path.dirname(rel), u.split('#')[0]);
      if (!fs.existsSync(target)) broken.push(`${rel} -> ${u}`);
    }
  }

  // Report.
  const report = makeReport({ config, graph, K, S, warnings, broken, map, numbers, tradeoffs, arch });
  fs.writeFileSync(path.join(HERE, 'publish-report.md'), report.text);
  const ms = Date.now() - t0;
  if (!quiet) {
    if (CHECK) console.log(report.warningsText || 'No warnings.');
    console.log(`Built ${pages.length} pages (${K.length} notes, ${S.length} sources) into dist/ in ${ms} ms. Report: publish-report.md`);
  }
  return { errors: report.errors, pages: pages.length };
}

function makeReport({ config, graph, K, S, warnings, broken, map, numbers, tradeoffs, arch }) {
  const out = [], warn = [];
  const code = s => '`' + String(s).replace(/`/g, "'") + '`';
  const sec = (title, items, { isWarn = false, hint = '' } = {}) => {
    const lines = [`## ${title} (${items.length})`, ''];
    if (hint) lines.push(`_${hint}_`, '');
    lines.push(...(items.length ? items.map(i => '- ' + i) : ['_None._']), '');
    const block = lines.join('\n');
    out.push(block);
    if (isWarn && items.length) warn.push(block);
  };
  const core = K.filter(n => n.core).length;
  out.push('# Publish report', '', `Generated ${new Date().toISOString()}.`, '');
  out.push('| Published | Count |', '|---|---|',
    `| Notes | ${K.length} (${core} core, ${K.length - core} further reading) |`,
    `| Sources | ${S.length} |`,
    `| Trade-off cards | ${tradeoffs.cards.length} |`, '');

  sec('❌ Errors: broken internal links', broken.map(code), { isWarn: true, hint: 'These fail the build.' });
  sec('❌ Errors: missing images', warnings.missingImages.map(code), { isWarn: true, hint: 'These fail the build. Copy the image into the vault or remove the embed.' });
  sec('Excluded', [...graph.excluded].map(([n, why]) => `${code(n.id)}: ${why}`), { hint: 'publish: false in frontmatter, or an excluded tag.' });
  sec('⚠️ Unlinked notes', graph.unlinked.map(n => code(n.id)), { isWarn: true, hint: 'Not connected to the entry note, so not published. Link them or run /clean-extract.' });
  sec('⚠️ Sources no published note links to', graph.unreferencedSources.map(n => code(n.id)), { isWarn: true, hint: 'Not published. Run /clean-extract to remove them.' });
  sec('Part of:: targets not in the vault', [...graph.missingParents].map(([t, ns]) => `${code(t)} ← ${[...ns].map(n => n.name).join(', ')}`), { hint: 'These notes are placed by their links instead.' });
  sec('⚠️ Part of:: cycles', graph.tree.cycles.map(n => n.name), { isWarn: true });
  sec('Dangling links', [...warnings.dangling].sort((a, b) => a[0].localeCompare(b[0])).map(([t, ns]) => `${code(t)} ← ${[...ns].join(', ')}`), { hint: 'Links to notes that are not published; rendered as plain text.' });
  const privacy = K.filter(n => n.footer.tags.some(t => config.privacyTags.includes(t)));
  sec('⚠️ Privacy check', privacy.map(n => `**${n.name}** (${n.footer.tags.filter(t => config.privacyTags.includes(t)).map(t => '#' + t).join(', ')})`), { isWarn: true, hint: `Published notes tagged ${config.privacyTags.map(t => '#' + t).join(', ')}. Make sure you are happy sharing them.` });

  const est = K.filter(n => n.maturity.estimated).sort((a, b) => a.maturity.score - b.maturity.score);
  out.push(`## Maturity not set (${est.length})`, '', '_Estimated badges, lowest score first. Add `maturity:` to the frontmatter to override._', '');
  if (est.length) {
    out.push('| Estimate | Note | Why |', '|---|---|---|', ...est.map(n => `| ${n.maturity.level} | ${n.name.replace(/\|/g, '\\|')} | ${n.maturity.reasons.join('; ').replace(/\|/g, '\\|')} |`), '');
  } else out.push('_None._', '');

  // System design notes not on the map.
  const sd = K.find(n => n.name === 'System Design');
  // Already on the map page: component notes, the patterns note, notes behind a number, or deliberately ignored.
  const onMapNames = new Set([...(arch.notOnMap || []), arch.patternsNote || '', ...numbers.map(n => n.note)].map(x => x.toLowerCase()));
  const onMap = new Set([...map.noteToComp.keys(), ...K.filter(n => onMapNames.has(n.name.toLowerCase()))]);
  const desc = [];
  const walk = n => { for (const c of n.treeChildren) { desc.push(c); walk(c); } };
  if (sd) walk(sd);
  sec('💡 System design notes not on the map', desc.filter(n => !onMap.has(n) && !n.comparison).map(n => n.name), { isWarn: true, hint: 'Add them to a component in data/architecture.json, or to its "notOnMap" list to stop this suggestion.' });

  // Number candidates.
  const numNotes = new Set(numbers.map(n => n.note.toLowerCase()));
  const cands = [];
  const NUM = /\b\d[\d.,]*\s?(k|K|M|ms|s|GB|TB|KB|MB|bytes|x|×|%|rps|qps|req\/s|writes|queries|requests|times)\b/;
  for (const n of K) {
    if (numNotes.has(n.name.toLowerCase())) continue;
    for (const l of n.main.split('\n')) if (NUM.test(l) && !/https?:|^>|\[\d+\]/.test(l.trim())) cands.push(`**${n.name}**: ${l.trim().slice(0, 140).replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')}`);
  }
  sec('💡 Number candidates not in data/numbers.json', cands, { isWarn: true, hint: 'Review; nothing is added automatically.' });

  const errors = broken.length + warnings.missingImages.length;
  return { text: out.join('\n'), warningsText: warn.join('\n'), errors };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { errors } = build();
  if (errors) { console.error(`${errors} error(s): see publish-report.md`); process.exit(1); }
}
