// Turns Obsidian markdown into HTML: wikilinks, embeds, highlights, provenance
// ("From [[source]]:" blocks) and heading ids. Also collects stats used by maturity.
import MarkdownIt from 'markdown-it';
import footnote from 'markdown-it-footnote';
import path from 'node:path';
import { WIKILINK_RE, parseLinkTarget } from './links.mjs';
import { slugify, isImage } from './vault.mjs';

export const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const FROM_RE = /^From\s+(.{1,200}?):\s*$/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const LIST_RE = /^\s*([-*+]|\d+[.)])\s/;
const FENCE_RE = /^\s*(```|~~~)/;

// Pasted citation noise: Google AI "[[1](url), [2](url)]" and newsletter "[57](url#footnote-57)".
function stripCitationNoise(md) {
  return md
    .replace(/\s?\[\[\d+\]\([^)]*\)(?:,\s*\[\d+\]\([^)]*\))*\]/g, '')
    .replace(/\[\d+\]\([^)]*#footnote[^)]*\)/g, '');
}

// Apply fn to the parts of a line that are not inside `code spans`.
function outsideCode(line, fn) {
  return line.split(/(`[^`]*`)/).map((part, i) => (i % 2 ? part : fn(part))).join('');
}

const kindIcon = { Blog: '✍︎', Video: '▶︎', Book: '📖', Reddit: '💬' };

export function createTransformer(ctx) {
  // ctx: { resolve, resolveAttachment, isPublished(note), onAttachment(abs) -> url, rel(url) }
  const md = new MarkdownIt({ html: true, linkify: true, breaks: true, typographer: false }).use(footnote);

  // Heading ids + TOC collection.
  md.core.ruler.push('heading_ids', state => {
    const used = new Set();
    state.env.toc = [];
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'heading_open') continue;
      const inline = tokens[i + 1];
      const text = inline.children.filter(t => t.type === 'text' || t.type === 'code_inline').map(t => t.content).join('').trim();
      let id = slugify(text) || 'section', k = 2;
      while (used.has(id)) id = `${slugify(text)}-${k++}`;
      used.add(id);
      tokens[i].attrSet('id', id);
      state.env.toc.push({ level: Number(tokens[i].tag.slice(1)), text, id });
    }
  });
  // External links open in a new tab.
  const defaultLinkOpen = md.renderer.rules.link_open || ((t, i, o, e, s) => s.renderToken(t, i, o));
  md.renderer.rules.link_open = (tokens, idx, opts, env, self) => {
    const href = tokens[idx].attrGet('href') || '';
    if (/^https?:/.test(href)) { tokens[idx].attrSet('target', '_blank'); tokens[idx].attrSet('rel', 'noopener'); tokens[idx].attrJoin('class', 'ext-link'); }
    return defaultLinkOpen(tokens, idx, opts, env, self);
  };

  function linkHtml(raw, env, embed) {
    const { target, heading, alias } = parseLinkTarget(raw);
    if (embed && isImage(target)) {
      const abs = ctx.resolveAttachment(target);
      if (!abs) { env.missingImages.push(target); return `<span class="dangling" title="missing image">${esc(path.basename(target))}</span>`; }
      const url = ctx.onAttachment(abs);
      const width = alias && /^\d+$/.test(alias) ? ` width="${alias}"` : '';
      return `<img src="${ctx.rel(url)}" alt="${esc(path.basename(target))}" loading="lazy"${width}>`;
    }
    const note = ctx.resolve(target);
    const label = alias || (note ? (note.kind === 'source' ? note.title : note.name) : path.posix.basename(target)) + (heading && !alias ? ` › ${heading}` : '');
    if (note && ctx.isPublished(note)) {
      env.links.add(note);
      const hash = heading ? '#' + slugify(heading) : '';
      const cls = note.kind === 'source' ? 'wikilink src-link' : 'wikilink';
      return `<a class="${cls}" href="${ctx.rel(note.url)}${hash}" data-note="${note.url}">${esc(label)}</a>`;
    }
    env.dangling.push(target);
    return `<span class="dangling" title="Not published">${esc(label)}</span>`;
  }

  function inline(line, env) {
    return outsideCode(line, part => part
      .replace(WIKILINK_RE, (_, bang, raw) => linkHtml(raw, env, bang === '!'))
      .replace(/==([^=\n]+?)==/g, '<mark>$1</mark>'));
  }

  function sourceChip(label) {
    const m = label.match(/^\[\[([^\]]+)\]\]$/);
    if (m) {
      const { target, alias } = parseLinkTarget(m[1]);
      const note = ctx.resolve(target);
      if (note && ctx.isPublished(note)) {
        return { kind: note.sourceType || 'note', html: `<a class="ext-chip" href="${ctx.rel(note.url)}" data-note="${note.url}"><span class="ext-icon" aria-hidden="true">${kindIcon[note.sourceType] || '↗'}</span>${esc(note.title)}</a>`, note };
      }
      return { kind: 'unknown', html: `<span class="ext-chip"><span class="ext-icon" aria-hidden="true">↗</span>${esc(alias || path.posix.basename(target))}</span>` };
    }
    // "From Google:" and other plain-text origins; may contain inline wikilinks.
    return { kind: 'other', html: `<span class="ext-chip"><span class="ext-icon" aria-hidden="true">↗</span>${esc(label.replace(WIKILINK_RE, (_, b, r) => parseLinkTarget(r).alias || path.posix.basename(parseLinkTarget(r).target)))}</span>` };
  }

  function embedCard(yamlLines) {
    const get = k => (yamlLines.find(l => l.startsWith(k + ':')) || '').slice(k.length + 1).trim().replace(/^"|"$/g, '');
    const url = get('url'), title = get('title'), image = get('image');
    if (!url) return '';
    return `<a class="embed-card" href="${esc(url)}" target="_blank" rel="noopener">${image ? `<img src="${esc(image)}" alt="" loading="lazy">` : ''}<span>${esc(title || url)}</span></a>`;
  }

  // Line-level pass: provenance blocks, embeds, callouts, stats.
  function preprocess(src, env) {
    // Root-relative links copied from articles: absolutise against the source URL, or drop the link.
    src = src.replace(/\[([^\]]*)\]\((\/(?!\/)[^)\s]*)\)/g, (_, text, href) => (env.base ? `[${text}](${new URL(href, env.base).href})` : text));
    const lines = stripCitationNoise(src).split('\n');
    const out = [];
    const stats = env.stats;
    let inFence = false, inExt = false, i = 0;
    const headings = []; // {level, index in contentCount timeline}
    let contentSinceHeading = [];

    const closeExt = () => { if (inExt) { out.push('', '</aside>', ''); inExt = false; } };
    const countWords = l => l.replace(WIKILINK_RE, (_, b, r) => parseLinkTarget(r).alias || '').replace(/[#>*_`=\-|]/g, ' ').split(/\s+/).filter(w => /\w/.test(w)).length;

    for (i = 0; i < lines.length; i++) {
      let line = lines[i];
      if (FENCE_RE.test(line)) {
        // ```embed blocks become link cards.
        if (!inFence && /^\s*```embed/.test(line)) {
          const buf = [];
          i++;
          while (i < lines.length && !FENCE_RE.test(lines[i])) buf.push(lines[i++].trim());
          out.push(embedCard(buf), '');
          continue;
        }
        inFence = !inFence;
        out.push(line);
        if (inFence) stats.codeBlocks++;
        continue;
      }
      if (inFence) { out.push(line); continue; }

      const h = line.match(HEADING_RE);
      const from = line.trim().match(FROM_RE);

      if (inExt) {
        const prevBlank = i > 0 && lines[i - 1].trim() === '';
        const plainPara = line.trim() !== '' && !LIST_RE.test(line) && !/^\s*>/.test(line) && !/^\s/.test(line) && !/^\|/.test(line);
        if (h || from || (prevBlank && plainPara) || line.trim() === '---') closeExt();
      }

      if (h) {
        headings.push({ level: h[1].length, content: 0 });
        stats.headings++;
        out.push(inline(line, env));
        continue;
      }
      if (from) {
        const chip = sourceChip(from[1].trim());
        env.fromBlocks.push(chip);
        out.push('', `<aside class="external" data-kind="${chip.kind}">`, `<div class="ext-src">From ${chip.html}</div>`, '');
        inExt = true;
        continue;
      }
      // Obsidian callouts: "> [!note] Title" -> bold title line.
      line = line.replace(/^(\s*>\s*)\[!(\w+)\][+-]?\s*(.*)$/, (_, q, type, title) => `${q}**${title || type[0].toUpperCase() + type.slice(1)}**`);

      const trimmed = line.trim();
      if (trimmed) {
        if (headings.length) headings.at(-1).content++;
        stats.contentLines++;
        const isQuote = /^>/.test(trimmed);
        const words = countWords(trimmed);
        if (inExt || isQuote) stats.extWords += words; else stats.ownWords += words;
        if (/^(\[\[[^\]]+\]\]\s*,?\s*)+$/.test(trimmed)) stats.linkOnlyLines++;
        if (LIST_RE.test(line)) stats.listItems++;
        if (/^\|/.test(trimmed)) stats.tableRows++;
        if (/!\[\[[^\]]+\.(png|jpe?g|gif|webp|svg)/i.test(trimmed) || /!\[[^\]]*\]\(/.test(trimmed)) stats.images++;
        if (/\b(TODO|TBD|WIP|FIXME)\b/.test(trimmed)) stats.todo++;
      }
      out.push(inline(line, env));
    }
    closeExt();

    // Empty headings: no content before the next heading of the same or higher level.
    for (let k = 0; k < headings.length; k++) {
      if (headings[k].content > 0) continue;
      let hasSub = false;
      for (let j = k + 1; j < headings.length && headings[j].level > headings[k].level; j++) if (headings[j].content > 0) { hasSub = true; break; }
      if (!hasSub) stats.emptyHeadings++;
    }
    stats.sectionsWithContent += headings.filter(x => x.content > 0).length;
    return out.join('\n');
  }

  function render(src, { base = null } = {}) {
    const env = {
      base,
      links: new Set(), dangling: [], missingImages: [], fromBlocks: [],
      stats: { ownWords: 0, extWords: 0, headings: 0, emptyHeadings: 0, sectionsWithContent: 0, contentLines: 0, linkOnlyLines: 0, listItems: 0, tableRows: 0, images: 0, todo: 0, codeBlocks: 0 },
    };
    const pre = preprocess(src, env);
    const html = md.render(pre, env);
    return { html, toc: env.toc || [], stats: env.stats, links: env.links, dangling: env.dangling, missingImages: env.missingImages, fromBlocks: env.fromBlocks };
  }

  return { render, renderInline: s => md.renderInline(s) };
}

// Plain-text excerpt of the note author's own words (skips headings, quotes, "From" blocks, link-only lines).
export function ownExcerpt(src, maxWords = 40) {
  const lines = stripCitationNoise(src).split('\n');
  const words = [];
  let inExt = false, inFence = false;
  for (let i = 0; i < lines.length && words.length < maxWords; i++) {
    const l = lines[i];
    if (FENCE_RE.test(l)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const t = l.trim();
    if (FROM_RE.test(t)) { inExt = true; continue; }
    if (inExt) {
      if (HEADING_RE.test(t) || (t && i > 0 && lines[i - 1].trim() === '' && !LIST_RE.test(l) && !/^\s*>/.test(l))) inExt = false;
      else continue;
    }
    if (!t || HEADING_RE.test(t) || /^>/.test(t) || /^\|/.test(t) || t === '---') continue;
    if (/^(!?\[\[[^\]]+\]\]\s*,?\s*)+$/.test(t)) continue;
    const plain = t
      .replace(WIKILINK_RE, (_, b, r) => (b ? '' : parseLinkTarget(r).alias || path.posix.basename(parseLinkTarget(r).target)))
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/^\s*([-*+]|\d+[.)])\s+/, '')
      .replace(/==/g, '')
      .replace(/[*_`]/g, '')
      .replace(/^-\s+/, '')
      .trim();
    if (!plain) continue;
    // Obsidian notes rely on line breaks; end each line as a sentence in the excerpt.
    words.push(...(/[.!?:;,…)]$/.test(plain) ? plain : plain + '.').split(/\s+/));
  }
  const out = words.slice(0, maxWords).join(' ');
  return words.length > maxWords ? out + '…' : out;
}

// Plain text for the search index.
export function plainText(src) {
  return stripCitationNoise(src)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(WIKILINK_RE, (_, b, r) => (b ? '' : parseLinkTarget(r).alias || path.posix.basename(parseLinkTarget(r).target)))
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`=|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Split a markdown body into level-1 sections: [{title, body}], with a leading untitled section.
export function h1Sections(src) {
  const out = [{ title: null, body: [] }];
  let inFence = false;
  for (const line of src.split('\n')) {
    if (FENCE_RE.test(line)) inFence = !inFence;
    const m = !inFence && line.match(/^#\s+(.*)$/);
    if (m) out.push({ title: m[1].trim(), body: [] });
    else out.at(-1).body.push(line);
  }
  return out.map(s => ({ title: s.title, body: s.body.join('\n').replace(/\n-{3,}\s*$/g, '').trim() }));
}
