// Loads the Obsidian vault: notes, frontmatter, attachments and a wikilink resolver.
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { parseFooter } from './footer.mjs';
import { WIKILINK_RE, parseLinkTarget } from './links.mjs';

export { WIKILINK_RE, parseLinkTarget };

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif)$/i;

export function slugify(s) {
  return s
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9+]+/g, '-')
    .replace(/\+/g, 'plus')
    .replace(/^-+|-+$/g, '') || 'note';
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}


export function loadVault(vaultDir) {
  const files = walk(vaultDir);
  const notes = [];
  const attachments = new Map(); // lowercased basename and relative path -> absolute path

  for (const abs of files) {
    const rel = path.relative(vaultDir, abs).split(path.sep).join('/');
    if (IMAGE_EXT.test(rel)) {
      attachments.set(rel.toLowerCase(), abs);
      attachments.set(path.basename(rel).toLowerCase(), abs);
      continue;
    }
    if (!rel.endsWith('.md')) continue;
    const text = fs.readFileSync(abs, 'utf8');
    let fm = {}, body = text;
    try {
      const parsed = matter(text);
      fm = parsed.data || {};
      body = parsed.content;
    } catch {
      body = text.replace(/^---\n[\s\S]*?\n---\n/, '');
    }
    const id = rel.slice(0, -3);
    const name = path.basename(id);
    const kind = id.startsWith('Source/') ? 'source' : 'knowledge';
    const sourceType = kind === 'source' ? id.split('/')[1] : null; // Blog, Video, Book, Reddit
    const footer = parseFooter(body);
    notes.push({
      id, name, kind, sourceType, fm, rel, abs,
      raw: body,
      main: footer.main,
      footer,
      title: kind === 'source' ? (fm.title ? String(fm.title) : name.replace(/^(Blog|Youtube|Book|Reddit) - /, '')) : name,
      slug: null,
      url: null,
    });
  }

  // Unique slugs per folder.
  const used = new Set();
  for (const n of notes) {
    const base = n.kind === 'source' ? 'sources/' : 'notes/';
    let s = slugify(n.kind === 'source' ? n.name : n.name);
    let candidate = base + s, i = 2;
    while (used.has(candidate)) candidate = `${base}${s}-${i++}`;
    used.add(candidate);
    n.slug = candidate.slice(base.length);
    n.url = candidate + '.html';
  }

  const byPath = new Map(), byName = new Map();
  for (const n of notes) {
    byPath.set(n.id.toLowerCase(), n);
    const k = n.name.toLowerCase();
    if (!byName.has(k)) byName.set(k, n);
  }

  function resolve(target) {
    if (!target) return null;
    const t = target.replace(/\.md$/i, '').replace(/^\/+/, '').toLowerCase();
    return byPath.get(t) || byName.get(path.posix.basename(t)) || null;
  }

  function resolveAttachment(target) {
    const t = target.toLowerCase().replace(/^\/+/, '');
    return attachments.get(t) || attachments.get(path.posix.basename(t)) || null;
  }

  return { notes, resolve, resolveAttachment, dir: vaultDir };
}

// All wikilink targets in a piece of markdown (excluding image embeds).
export function linkTargets(md) {
  const out = [];
  for (const m of md.matchAll(WIKILINK_RE)) {
    const { target } = parseLinkTarget(m[2]);
    if (IMAGE_EXT.test(target)) continue;
    out.push(target);
  }
  return out;
}

export function isImage(target) { return IMAGE_EXT.test(target); }
