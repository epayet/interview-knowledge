// HTML page templates. All internal URLs are prefixed with @@ROOT@@, replaced per page
// with '' or '../' so the site works from any sub-path.
import { esc } from './transform.mjs';
import { LEVELS } from './maturity.mjs';

export const R = '@@ROOT@@';
const kindLabel = { Blog: 'Article', Video: 'Video', Book: 'Book', Reddit: 'Discussion' };
import { kindIcon, linkIcon } from './icons.mjs';

export function badge(m, { compact = false } = {}) {
  if (!m) return '';
  const L = LEVELS[m.level];
  const title = m.estimated ? `${L.label} (estimated): ${m.reasons.join(', ')}` : `${L.label}: ${L.blurb}. Set by the author.`;
  return `<span class="badge m-${m.level}${m.estimated ? ' est' : ''}" title="${esc(title)}"><span aria-hidden="true">${L.icon}</span>${compact ? `<span class="sr">${L.label}</span>` : ` ${L.label}${m.estimated ? '<span class="est-mark">est.</span>' : ''}`}</span>`;
}

export function noteLink(n, cls = '') {
  return `<a class="wikilink ${cls}" href="${R}${n.url}" data-note="${n.url}">${esc(n.kind === 'source' ? n.title : n.name)}</a>`;
}

export function sourceChip(s) {
  return `<a class="ext-chip" href="${R}${s.url}" data-note="${s.url}"><span class="ext-icon" aria-hidden="true">${kindIcon[s.sourceType] || linkIcon}</span>${esc(s.title)}</a>`;
}

function formatDate(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return esc(String(v));
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function authors(fm) {
  const a = fm.author == null ? [] : Array.isArray(fm.author) ? fm.author : [fm.author];
  return a.map(x => String(x).replace(/^\[\[|\]\]$/g, '').split('|').pop()).filter(Boolean);
}

// ---------- Sidebar ----------
export function sidebar(tree, current) {
  const open = new Set(current?.breadcrumb || []);
  if (current) open.add(current);
  // Folders (notes with children) first, then alphabetical.
  const sorted = list => [...list].sort((a, b) =>
    (b.treeChildren.length > 0) - (a.treeChildren.length > 0) ||
    a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true }));
  const item = (n, depth, cls = '') => {
    const kids = n.treeChildren || [];
    const cur = n === current ? ' aria-current="page"' : '';
    const label = `<a href="${R}${n.url}"${cur} class="${n.core ? '' : 'further'}">${esc(n.name)}</a>`;
    const li = cls ? `<li class="${cls}">` : '<li>';
    if (!kids.length) return `${li}${label}</li>`;
    return `${li}<details${open.has(n) ? ' open' : ''}><summary>${label}<span class="count">${kids.length}</span></summary><ul>${sorted(kids).map(k => item(k, depth + 1)).join('')}</ul></details></li>`;
  };
  // Pinned topics (config.pinned) come first, in the configured order.
  const pinned = tree.pinned || [];
  const rest = sorted(tree.root.treeChildren.filter(n => !pinned.includes(n)));
  const pinnedHtml = pinned.length
    ? `<ul class="pinned-list" aria-label="Main topics">${pinned.map(n => item(n, 0, 'pinned')).join('')}</ul>`
    : '';
  return `<nav class="tree" aria-label="All notes">${pinnedHtml}<ul>${rest.map(n => item(n, 0)).join('')}</ul></nav>`;
}

// ---------- Layout ----------
export function layout({ site, title, description = '', body, active = '', sidebarHtml = '', toc = null, bodyClass = '' }) {
  const nav = [
    ['index.html', 'Home', 'home'],
    ['map.html', 'System design map', 'map'],
    ['tradeoffs.html', 'Trade-offs', 'tradeoffs'],
    ['practice.html', 'Practice', 'practice'],
    ['library.html', 'Library', 'library'],
    ['tags.html', 'Tags', 'tags'],
  ].map(([href, label, id]) => `<a href="${R}${href}"${active === id ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  const tocHtml = toc && toc.length >= 3
    ? `<aside class="toc" aria-label="On this page"><div class="toc-title">On this page</div><ul>${toc.filter(t => t.level <= 3).map(t => `<li class="l${t.level}"><a href="#${t.id}">${esc(t.text)}</a></li>`).join('')}</ul></aside>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}${title === site.siteTitle ? '' : ' · ' + esc(site.siteTitle)}</title>
<meta name="description" content="${esc(description)}">
<link rel="icon" type="image/svg+xml" href="${R}assets/logo.svg">
<link rel="stylesheet" href="${R}assets/style.css">
<script>try{var t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t;}catch(e){}</script>
<script defer src="${R}assets/app.js" data-root="${R}"></script>
</head>
<body class="${bodyClass}">
<a class="skip" href="#main">Skip to content</a>
<header class="topbar">
  <button class="icon-btn menu-btn${sidebarHtml ? '' : ' hidden-btn'}" type="button" aria-label="Show all notes" aria-expanded="false" aria-controls="sidebar">☰</button>
  <a class="brand" href="${R}index.html"><svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M11 24.5 8.5 30M21 24.5 23.5 30" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round"/><rect x="1.5" y="2.5" width="29" height="22" rx="4" fill="var(--accent)"/><g fill="none" stroke="var(--bg)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="9" width="6.5" height="6.5" rx="1.2"/><path d="M12.5 12.25c3 0 4.5 1.5 5.5 5"/></g><path d="M17.5 19.5c-.6-6.2 3.2-10.4 9-11 .5 6.3-3.3 10.6-9 11z" fill="var(--bg)"/></svg>${esc(site.siteTitle)}</a>
  <nav class="mainnav" aria-label="Sections">${nav}</nav>
  <div class="search" role="search">
    <input id="q" type="search" placeholder="Search notes…" autocomplete="off" aria-label="Search notes" aria-controls="results">
    <kbd class="search-kbd">/</kbd>
    <div id="results" class="results" hidden></div>
  </div>
  <button class="icon-btn theme-btn" type="button" title="Toggle dark mode">☾<span class="sr">Toggle dark mode</span></button>
</header>
<div class="shell${sidebarHtml ? '' : ' no-sidebar'}">
  ${sidebarHtml ? `<aside id="sidebar" class="sidebar"><a class="side-home" href="${R}index.html">+ Interviewing</a>${sidebarHtml}</aside>` : ''}
  <main id="main" class="main"><nav class="mobile-nav" aria-label="Sections">${nav}</nav>${body}</main>
  ${tocHtml}
</div>
<footer class="sitefoot"><p>Personal notes, shared as-is. Sourced passages link to their origin. Built from an Obsidian vault.</p></footer>
</body>
</html>`;
}

// ---------- Shared blocks ----------
function noteCard(n, extra = '') {
  return `<li class="card-item"><a class="card-link" href="${R}${n.url}" data-note="${n.url}"><span class="card-title">${esc(n.name)}</span>${badge(n.maturity, { compact: true })}${n.core ? '' : '<span class="pill further-pill">further reading</span>'}</a>${n.excerpt ? `<p class="card-ex">${esc(n.excerpt)}</p>` : ''}${extra}</li>`;
}

function listSection(title, items, cls = '') {
  if (!items.length) return '';
  return `<section class="rel ${cls}"><h2 class="rel-title">${title}</h2><ul class="cards">${items.join('')}</ul></section>`;
}

function crumbs(n) {
  const parts = [`<a href="${R}index.html">Interviewing</a>`];
  for (const c of n.breadcrumb) if (c.name !== '+ Interviewing') parts.push(`<a href="${R}${c.url}">${esc(c.name)}</a>`);
  return `<nav class="crumbs" aria-label="Breadcrumb">${parts.join('<span aria-hidden="true">›</span>')}</nav>`;
}

// ---------- Note page ----------
export function notePage(n, { rendered, mapThumb }) {
  const created = n.fm.date_created ? formatDate(n.fm.date_created) : '';
  const words = rendered.stats.ownWords + rendered.stats.extWords;
  const minutes = Math.max(1, Math.round(words / 220));
  const tags = n.footer.tags.map(t => `<a class="tag" href="${R}tags.html#${esc(t)}">#${esc(t)}</a>`).join('');
  const inspired = n.createdFrom.length || n.footer.createdFromUrls.length
    ? `<p class="inspired"><span class="lbl">Inspired by</span> ${n.createdFrom.map(sourceChip).join(' ')}${n.footer.createdFromUrls.map(u => `<a class="ext-chip" href="${esc(u)}" target="_blank" rel="noopener"><span class="ext-icon" aria-hidden="true">${linkIcon}</span>${esc(new URL(u).hostname.replace(/^www\./, ''))}</a>`).join(' ')}</p>` : '';
  const compare = n.comparison
    ? `<p class="compare-head"><a href="${R}tradeoffs.html#${n.comparison.id}">${n.comparison.options.map(o => esc(o.label)).join(' <span aria-hidden="true">⇄</span> ')}</a><span class="lbl">in the trade-off explorer →</span></p>` : '';
  const counter = n.opposites.map(o => `<aside class="counterpoint"><div class="lbl">Counterpoint</div><a class="cp-title" href="${R}${o.url}" data-note="${o.url}">${esc(o.name)}</a>${o.excerpt ? `<p>${esc(o.excerpt)}</p>` : ''}</aside>`).join('');

  const children = [...new Set([...n.declaredChildren, ...n.treeChildren])];
  const shown = new Set([...children, ...n.leadsTo, ...n.comesAfter, ...n.opposites, n.treeParent]);
  const backlinks = [...n.in].filter(m => m.published && m.kind === 'knowledge' && !shown.has(m));

  const sources = [
    ...n.createdFrom.map(s => `<li>${sourceChip(s)} <span class="muted">inspired this note</span></li>`),
    ...(n.cites || []).map(s => `<li>${sourceChip(s)} <span class="muted">cited</span></li>`),
  ];

  const body = `
<article class="note">
  ${crumbs(n)}
  <header class="note-head">
    <h1>${esc(n.name)}</h1>
    <div class="meta">${badge(n.maturity)}${n.core ? '' : '<span class="pill further-pill" title="Connected to the interview notes, but not part of the main path">further reading</span>'}${created ? `<span class="muted">Started ${created}</span>` : ''}<span class="muted">${minutes} min read</span>${tags}</div>
    ${inspired}${compare}
  </header>
  ${mapThumb ? `<a class="where" href="${R}map.html#${mapThumb.id}" title="Where ${esc(n.name)} sits in the system design map">${mapThumb.svg}<span>Where it sits: <strong>${esc(mapThumb.label)}</strong></span></a>` : ''}
  ${counter}
  <div class="prose">${rendered.html}</div>
  ${listSection('In this topic', children.map(c => noteCard(c)), 'children')}
  ${listSection('Continue with →', n.leadsTo.map(c => noteCard(c)))}
  ${listSection('← Comes after', n.comesAfter.map(c => noteCard(c)))}
  ${sources.length ? `<section class="rel"><h2 class="rel-title">Sources</h2><ul class="src-list">${sources.join('')}</ul></section>` : ''}
  ${listSection('Referenced by', backlinks.map(c => noteCard(c)), 'backlinks')}
</article>`;
  return body;
}

// ---------- Source page ----------
export function sourcePage(s, { highlightsHtml, aiHtml }) {
  const fm = s.fm;
  const url = fm.source || fm.url || '';
  const img = fm.image || fm.cover || '';
  const by = authors(fm);
  const inspired = s.inspired || [], cited = (s.citedBy || []).filter(n => !inspired.includes(n));
  const body = `
<article class="note source">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="${R}library.html">Library</a><span aria-hidden="true">›</span><a href="${R}library.html#${s.sourceType.toLowerCase()}">${kindLabel[s.sourceType] || s.sourceType}s</a></nav>
  <header class="src-head">
    ${img ? `<img class="src-thumb" src="${esc(img)}" alt="" loading="lazy">` : ''}
    <div>
      <div class="src-kind"><span aria-hidden="true">${kindIcon[s.sourceType] || linkIcon}</span> ${kindLabel[s.sourceType] || s.sourceType}</div>
      <h1>${esc(s.title)}</h1>
      <div class="meta">${by.length ? `<span>by ${esc(by.join(', '))}</span>` : ''}${fm.published ? `<span class="muted">${formatDate(fm.published)}</span>` : fm.year ? `<span class="muted">${esc(fm.year)}</span>` : ''}</div>
      ${fm.description ? `<p class="src-desc">${esc(fm.description)}</p>` : ''}
      ${url ? `<p><a class="btn" href="${esc(url)}" target="_blank" rel="noopener">Read the original →</a></p>` : ''}
    </div>
  </header>
  ${highlightsHtml ? `<section class="src-sec external-sec"><h2>Highlights</h2><p class="sec-note">Passages saved from the original.</p><div class="prose">${highlightsHtml}</div></section>` : ''}
  ${aiHtml ? `<section class="src-sec ai-sec"><h2>Summary <span class="ai-tag">AI-generated</span></h2><p class="sec-note">Summarised by an AI assistant when this source was saved. Double-check against the original.</p><div class="prose">${aiHtml}</div></section>` : ''}
  ${!highlightsHtml && !aiHtml ? `<p class="muted empty-src">No highlights saved for this source. The notes below build on it.</p>` : ''}
  ${listSection('Notes this inspired', inspired.map(c => noteCard(c)))}
  ${listSection('Also cited by', cited.map(c => noteCard(c)))}
</article>`;
  return body;
}

// ---------- Home ----------
// Turn plain mentions of the tools in the intro into links.
function linkTools(text) {
  return text
    .replace(/\bthe map\b/, `the <a href="${R}map.html">map</a>`)
    .replace(/\bthe trade-offs\b/, `the <a href="${R}tradeoffs.html">trade-offs</a>`)
    .replace(/\bpractice page\b/, `<a href="${R}practice.html">practice page</a>`);
}

export function homePage({ site, entry, startHere, mocHtml, counts, randomHtml }) {
  return `
<section class="hero">
  <p class="eyebrow">Shared notes</p>
  <h1>${esc(site.siteTitle)}</h1>
  <p class="lede">${esc(site.siteSubtitle)}. Notes on system design, coding and culture interviews, and how AI is changing all of it.</p>
  ${(site.siteIntro || []).map(p => `<p class="hero-intro">${linkTools(esc(p))}</p>`).join('')}
  <p class="hero-stats">${counts.notes} notes · ${counts.sources} sources · ${counts.tradeoffs} trade-offs</p>
</section>
<section class="start">
  <h2 class="sec-title">Start here</h2>
  <ul class="start-grid">${startHere.map(n => `<li><a class="start-card" href="${R}${n.url}" data-note="${n.url}"><span class="start-title">${esc(n.name)}</span>${badge(n.maturity, { compact: true })}<span class="start-ex">${esc(n.excerpt || '')}</span><span class="start-meta">${n.treeChildren.length ? `${n.treeChildren.length} note${n.treeChildren.length === 1 ? '' : 's'} inside` : ''}</span></a></li>`).join('')}</ul>
</section>
${randomHtml || ''}
<section class="tools">
  <a class="tool-card map-card" href="${R}map.html"><span class="tool-kicker">Explore</span><span class="tool-title">System design map</span><span class="tool-ex">The building blocks of a typical architecture. Click a component for notes, trade-offs and numbers worth knowing.</span></a>
  <a class="tool-card" href="${R}tradeoffs.html"><span class="tool-kicker">Practise</span><span class="tool-title">Trade-off explorer</span><span class="tool-ex">${counts.tradeoffs} comparisons and “when to use” guides, filterable by what the decision hinges on.</span></a>
  <a class="tool-card" href="${R}library.html"><span class="tool-kicker">Read</span><span class="tool-title">Library</span><span class="tool-ex">${counts.sources} articles, videos and books behind these notes, ranked by how much they shaped them.</span></a>
</section>
<article class="note moc">
  <div class="prose">${mocHtml}</div>
</article>
<p class="home-foot">Plain text is my own writing; framed blocks are quotes or paraphrases, linked to their source. 🌱 🌿 🌳 show how fleshed-out a note is (“est.” means estimated automatically).</p>`;
}


// ---------- Library ----------
export function libraryPage(sources) {
  const types = ['Video', 'Blog', 'Book', 'Reddit'].filter(t => sources.some(s => s.sourceType === t));
  const score = s => (s.inspired?.length || 0) * 2 + (s.citedBy?.length || 0);
  const top = [...sources].sort((a, b) => score(b) - score(a)).slice(0, 6).filter(s => score(s) > 0);
  const row = s => {
    const by = authors(s.fm);
    const n = (s.inspired?.length || 0) + (s.citedBy?.length || 0);
    return `<li class="lib-item" data-kind="${s.sourceType}"><a href="${R}${s.url}" data-note="${s.url}" class="lib-title">${esc(s.title)}</a><div class="lib-meta">${by.length ? esc(by.join(', ')) + ' · ' : ''}${s.fm.published ? formatDate(s.fm.published) + ' · ' : ''}<span>${n} note${n === 1 ? '' : 's'}</span></div></li>`;
  };
  return `
<header class="page-head"><h1>Library</h1><p class="lede">The articles, videos and books behind these notes. Each page keeps the highlights and a summary, and links to the original.</p></header>
${top.length ? `<section><h2 class="sec-title">Most influential</h2><ol class="lib-top">${top.map(s => `<li><a href="${R}${s.url}" data-note="${s.url}"><span class="ext-icon" aria-hidden="true">${kindIcon[s.sourceType]}</span>${esc(s.title)}</a><span class="muted">shaped ${(s.inspired?.length || 0) + (s.citedBy?.length || 0)} notes</span></li>`).join('')}</ol></section>` : ''}
${types.map(t => `<section id="${t.toLowerCase()}"><h2 class="sec-title">${kindIcon[t]} ${kindLabel[t]}s <span class="muted">${sources.filter(s => s.sourceType === t).length}</span></h2><ul class="lib-list">${sources.filter(s => s.sourceType === t).sort((a, b) => score(b) - score(a) || a.title.localeCompare(b.title)).map(row).join('')}</ul></section>`).join('')}`;
}

// ---------- Tags ----------
export function tagsPage(tagMap) {
  const tags = [...tagMap.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  return `
<header class="page-head"><h1>Tags</h1></header>
<p class="tag-cloud">${tags.map(([t, ns]) => `<a class="tag" href="#${esc(t)}">#${esc(t)} <span class="muted">${ns.length}</span></a>`).join(' ')}</p>
${tags.map(([t, ns]) => `<section id="${esc(t)}" class="tag-sec"><h2 class="sec-title">#${esc(t)}</h2><ul class="cards">${ns.sort((a, b) => a.name.localeCompare(b.name)).map(n => noteCard(n)).join('')}</ul></section>`).join('')}`;
}

// ---------- Trade-offs ----------
const TO_KIND = { comparison: 'Comparison', opposite: 'Counterpoints', when: 'When to use' };
export function tradeoffCard(c, config) {
  const opts = c.options.map(o => o.note ? `<a class="opt" href="${R}${o.note.url}" data-note="${o.note.url}">${esc(o.label)}</a>` : `<span class="opt">${esc(o.label)}</span>`).join('<span class="vs" aria-hidden="true">⇄</span>');
  const factors = c.factors.map(f => {
    const fnote = config.tradeoffFactors[f].noteObj;
    return fnote ? `<a class="factor" href="${R}${fnote.url}">${esc(f)}</a>` : `<span class="factor">${esc(f)}</span>`;
  }).join('');
  const cols = c.columns
    ? `${c.introHtml ? `<div class="prose intro">${c.introHtml}</div>` : ''}<div class="cols cols-${Math.min(c.columns.length, 3)}">${c.columns.map(col => `<div class="col"><div class="col-head">${esc(col.heading)}</div><div class="prose">${col.html}</div>${col.note ? `<a class="more" href="${R}${col.note.url}">Read note →</a>` : ''}</div>`).join('')}</div>`
    : `<div class="prose">${c.bodyHtml}</div>`;
  return `<article class="to-card kind-${c.kind}" id="${c.id}" data-factors="${esc(c.factors.join('|'))}">
<header><div class="to-kind">${TO_KIND[c.kind]}${c.note ? ' ' + badge(c.note.maturity, { compact: true }) : ''}</div><h3 class="to-opts">${c.kind === 'when' ? `When to reach for ${opts}` : opts}</h3></header>
${cols}
<footer>${factors ? `<div class="factors"><span class="lbl">Hinges on</span>${factors}</div>` : ''}${c.note ? `<a class="more" href="${R}${c.note.url}">Open note →</a>` : ''}</footer>
</article>`;
}

// The question shown before a flashcard is revealed.
export function practicePrompt(c) {
  const labels = c.options.map(o => o.label);
  const list = labels.length > 2 ? labels.slice(0, -1).join(', ') + ' or ' + labels.at(-1) : labels.join(' or ');
  if (c.kind === 'comparison') return `${list}: when would you pick each?`;
  if (c.kind === 'opposite') return `${labels.join(' vs ')}: how do these pull against each other?`;
  const hasNot = (c.columns || []).some(col => /\bnot\b/i.test(col.heading));
  return `When would you reach for ${labels[0]}${hasNot ? ', and when not' : ''}?`;
}

export function tradeoffsPage(data, config) {
  const factorChips = Object.keys(config.tradeoffFactors).filter(f => data.factorCounts[f])
    .map(f => `<button type="button" class="chip" data-factor="${esc(f)}" aria-pressed="false">${esc(f)} <span class="muted">${data.factorCounts[f]}</span></button>`).join('');
  const card = c => tradeoffCard(c, config);
  return `
<header class="page-head"><h1>Trade-off explorer</h1><p class="lede">Interviewers look for trade-offs more than for the “right” answer. These are the comparisons from my notes, grouped by area. Filter by what the decision hinges on to drill a specific dimension.</p></header>
<div class="filters" role="group" aria-label="Filter by deciding factor"><span class="lbl">Hinges on</span>${factorChips}<button type="button" class="chip clear" hidden>clear</button></div>
<nav class="group-nav" aria-label="Areas">${data.groups.map(g => `<a href="#g-${g.id}">${esc(g.label)} <span class="muted">${g.cards.length}</span></a>`).join('')}</nav>
${data.groups.map(g => `<section class="to-group" id="g-${g.id}"><h2 class="sec-title">${esc(g.label)}</h2><div class="to-grid">${g.cards.map(card).join('')}</div></section>`).join('')}
<p class="muted empty-filter" hidden>No comparisons match all selected factors.</p>`;
}

// ---------- Practice ----------
export function practicePage(data, config) {
  const cards = data.cards;
  const areas = data.groups.map(g => `<button type="button" class="chip" data-area="${g.id}" aria-pressed="false">${esc(g.label)} <span class="muted">${g.cards.length}</span></button>`).join('');
  const first = cards[0];
  return `
<header class="page-head"><h1>Practice</h1><p class="lede">One trade-off at a time. Answer it out loud as you would in an interview, then reveal my notes and rate yourself. Cards you miss come back more often. Progress is saved in this browser only.</p></header>
<div class="filters practice-filters" role="group" aria-label="Areas"><span class="lbl">Areas</span>${areas}<button type="button" class="chip clear" hidden>all areas</button></div>
<section class="stage" aria-live="polite">
  <div class="stage-meta"><span class="stage-area"></span><span class="stage-stats muted"></span></div>
  <p class="stage-prompt">${esc(practicePrompt(first))}</p>
  <p class="stage-hint muted">Think it through (options, what the choice hinges on, an example) before revealing.</p>
  <div class="stage-actions">
    <button type="button" class="btn reveal-btn">Reveal <kbd>space</kbd></button>
    <button type="button" class="btn-ghost skip-btn">Skip <kbd>→</kbd></button>
  </div>
  <div class="stage-answer" hidden></div>
  <div class="rate" hidden>
    <span class="lbl">How did you do?</span>
    <button type="button" class="rate-btn r-missed" data-rate="missed">Missed <kbd>1</kbd></button>
    <button type="button" class="rate-btn r-shaky" data-rate="shaky">Shaky <kbd>2</kbd></button>
    <button type="button" class="rate-btn r-got" data-rate="got">Got it <kbd>3</kbd></button>
  </div>
  <noscript><p>Practice needs JavaScript. You can browse every card on the <a href="${R}tradeoffs.html">Trade-off explorer</a>.</p></noscript>
</section>
<p class="muted practice-foot"><button type="button" class="linkish reset-btn">Reset my progress</button> · <a href="${R}tradeoffs.html">Browse all ${cards.length} trade-offs</a></p>
<div hidden id="practice-cards">${cards.map(c => `<template data-id="${c.id}" data-area="${c.group}" data-area-label="${esc(data.groups.find(g => g.id === c.group)?.label || '')}" data-prompt="${esc(practicePrompt(c))}">${tradeoffCard(c, config)}</template>`).join('')}</div>`;
}

// Small "Random trade-off" teaser for the home page. JS swaps in a random prompt.
export function randomTradeoff(cards, groups) {
  if (!cards.length) return '';
  const items = cards.map(c => ({ id: c.id, p: practicePrompt(c), a: groups.find(g => g.id === c.group)?.label || '' }));
  const f = items[0];
  return `<section class="random-to" aria-label="Random trade-off">
  <div class="rt-kicker"><span>Random trade-off</span><span class="rt-area muted">${esc(f.a)}</span></div>
  <p class="rt-prompt">${esc(f.p)}</p>
  <div class="rt-actions"><a class="btn rt-go" href="${R}practice.html#${f.id}">Answer it →</a><button type="button" class="btn-ghost rt-next" hidden>Another one</button></div>
  <script type="application/json" class="rt-data">${JSON.stringify(items).replace(/</g, '\\u003c')}</script>
</section>`;
}

// ---------- Map ----------
export function mapPage(map, numbers, panels, { problems = [], patternsNote = null } = {}) {
  const list = map.layers.map(l => `<section class="ml-layer"><h3>${esc(l.label)}</h3><ul>${map.comps.filter(c => c.layer === l.id).map(c => `<li>${c.notes.length ? `<a href="${R}${c.notes[0].url}" data-comp="${c.id}">${esc(c.label)}</a><span class="muted">${c.notes.length}</span>` : `<span class="muted">${esc(c.label)}${c.id === 'client' ? '' : ' · not written yet'}</span>`}</li>`).join('')}</ul></section>`).join('')
    + `<section class="ml-layer"><h3>Cross-cutting</h3><ul>${map.cross.map(c => `<li>${c.notes.length ? `<a href="${R}${c.notes[0].url}" data-comp="${c.id}">${esc(c.label)}</a>` : esc(c.label)}</li>`).join('')}</ul></section>`;
  const groups = [...new Set(numbers.map(n => n.group))];
  const nums = groups.map(g => `<div class="num-group"><h3>${esc(g)}</h3><dl>${numbers.filter(n => n.group === g).map(n => `<div class="num"><dt>${esc(n.label)}</dt><dd><span class="num-val">${esc(n.value)}</span>${n.detail ? `<span class="num-detail">${esc(n.detail)}</span>` : ''}${n.noteObj ? `<a class="num-src" href="${R}${n.noteObj.url}" data-note="${n.noteObj.url}">${esc(n.noteObj.name)}</a>` : ''}</dd></div>`).join('')}</dl></div>`).join('');
  return `
<header class="page-head"><h1>System design map</h1><p class="lede">A typical architecture, one layer at a time. Each box opens what I've written about that component. Greyed boxes are gaps I haven't written up yet.</p></header>
${problems.length ? `<section class="problems" aria-label="Common problems">
  <div class="prob-head"><h2 class="sec-title">Common problems</h2><span class="muted">Pick a problem to light up the building blocks that solve it${patternsNote ? `. From <a href="${R}${patternsNote.url}" data-note="${patternsNote.url}">${esc(patternsNote.name)}</a>` : ''}.</span></div>
  <div class="prob-chips">${problems.map(p => `<a class="prob${p.notes.length ? '' : ' missing'}" href="${R}${patternsNote.url}#${p.anchor}" data-prob="${p.id}" data-comps="${p.comps.join(' ')}" aria-pressed="false">${esc(p.title)}</a>`).join('')}</div>
</section>` : ''}
<div class="map-wrap">
  <div class="map-canvas">${map.svg()}</div>
  <aside class="map-panel" id="map-panel" aria-live="polite"><p class="muted panel-hint">Select a component to see its notes, when to use it and related trade-offs.</p></aside>
</div>
<div class="map-list">${list}</div>
<div hidden id="map-panels">${panels}${problems.map(p => problemPanel(p, map)).join('')}</div>
<section class="numbers" id="numbers">
  <h2 class="sec-title">Numbers to know</h2>
  <p class="muted">Rough orders of magnitude for back-of-the-envelope estimates. Each one links to the note it comes from.</p>
  <div class="num-grid">${nums}</div>
</section>`;
}

function problemPanel(p, map) {
  const comps = p.comps.map(id => map.byId.get(id)).filter(Boolean);
  return `<template data-prob="${p.id}">
  <div class="panel-kicker">Common problem</div>
  <h2>${esc(p.title)}</h2>
  ${p.text && !p.notes.length ? `<p class="panel-ex">${esc(p.text)}</p>` : ''}
  ${comps.length ? `<h3>Reach for</h3><ul class="panel-list">${comps.map(c => `<li><a href="#${c.id}" data-select="${c.id}">${esc(c.label)}</a></li>`).join('')}</ul>` : ''}
  ${p.notes.length ? `<h3>Notes</h3><ul class="panel-list">${p.notes.map(n => `<li><a href="${R}${n.url}" data-note="${n.url}">${esc(n.name)}</a> ${badge(n.maturity, { compact: true })}</li>`).join('')}</ul>` : '<p class="muted">Not written up yet.</p>'}
</template>`;
}

export function mapPanel(c, { whenHtml, comparisons }) {
  const [primary, ...rest] = c.notes;
  return `<template data-comp="${c.id}">
  <div class="panel-kicker">${esc(c.layerLabel || 'Cross-cutting')}</div>
  <h2>${esc(c.label)}</h2>
  ${primary ? `<p><a class="panel-main" href="${R}${primary.url}" data-note="${primary.url}">${esc(primary.name)}</a> ${badge(primary.maturity, { compact: true })}</p>${primary.excerpt ? `<p class="panel-ex">${esc(primary.excerpt)}</p>` : ''}` : `<p class="muted">${esc(c.blurb || 'Not written yet.')}</p>`}
  ${whenHtml ? `<div class="panel-when">${whenHtml}</div>` : ''}
  ${rest.length ? `<h3>Related notes</h3><ul class="panel-list">${rest.map(n => `<li><a href="${R}${n.url}" data-note="${n.url}">${esc(n.name)}</a> ${badge(n.maturity, { compact: true })}</li>`).join('')}</ul>` : ''}
  ${comparisons.length ? `<h3>Trade-offs</h3><ul class="panel-list">${comparisons.map(t => `<li><a href="${R}tradeoffs.html#${t.id}">${esc(t.title)}</a></li>`).join('')}</ul>` : ''}
</template>`;
}
