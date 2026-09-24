// Builds the link graph, decides what gets published and derives the Part-of hierarchy.
import { linkTargets } from './vault.mjs';

function hasTag(note, tags) {
  const all = new Set([...note.footer.tags, ...toArray(note.fm.tags).map(t => String(t).toLowerCase())]);
  return tags.some(t => all.has(t));
}

function toArray(v) { return v == null ? [] : Array.isArray(v) ? v : [v]; }

export function buildGraph(vault, config) {
  const { notes, resolve } = vault;
  const entry = resolve(config.entry);
  if (!entry) throw new Error(`Entry note "${config.entry}" not found in vault`);

  // Resolved outgoing links (body + footer), and dangling targets.
  const dangling = new Map(); // target -> Set(note names)
  for (const n of notes) {
    n.out = new Set();
    for (const t of linkTargets(n.raw)) {
      const r = resolve(t);
      if (r && r !== n) n.out.add(r);
      else if (!r) {
        if (!dangling.has(t)) dangling.set(t, new Set());
        dangling.get(t).add(n);
      }
    }
    n.in = new Set();
  }
  for (const n of notes) for (const m of n.out) m.in.add(n);

  // Exclusions.
  const excluded = new Map(); // note -> reason
  for (const n of notes) {
    if (n.fm.publish === false) excluded.set(n, 'publish: false');
    else if (hasTag(n, config.excludeTags || [])) excluded.set(n, 'excluded tag');
  }

  // Undirected connectivity to the entry note, through non-excluded notes.
  const connected = new Set([entry]);
  const queue = [entry];
  while (queue.length) {
    const n = queue.shift();
    for (const m of [...n.out, ...n.in]) {
      if (connected.has(m) || excluded.has(m)) continue;
      connected.add(m); queue.push(m);
    }
  }

  const published = new Set();
  for (const n of connected) if (n.kind === 'knowledge') published.add(n);
  // Sources: published when a published knowledge note links to them.
  for (const n of [...published]) for (const m of n.out) if (m.kind === 'source' && !excluded.has(m)) published.add(m);

  const unlinked = notes.filter(n => n.kind === 'knowledge' && !connected.has(n) && !excluded.has(n));
  const unreferencedSources = notes.filter(n => n.kind === 'source' && !published.has(n) && !excluded.has(n));

  // Core = reachable forward from the entry (following links as written).
  const dist = new Map([[entry, 0]]);
  const fq = [entry];
  while (fq.length) {
    const n = fq.shift();
    for (const m of n.out) {
      if (!published.has(m) || dist.has(m)) continue;
      dist.set(m, dist.get(n) + 1); fq.push(m);
    }
  }
  for (const n of published) {
    n.core = dist.has(n);
    n.distance = dist.get(n) ?? null;
    n.published = true;
  }
  for (const n of notes) if (!published.has(n)) n.published = false;

  // Typed footer edges (published targets only).
  const missingParents = new Map(); // target name -> Set(notes)
  const res = (list) => list.map(l => resolve(l.target)).filter(m => m && published.has(m));
  for (const n of published) {
    n.parents = [];
    for (const l of n.footer.partOf) {
      const p = resolve(l.target);
      if (p && published.has(p) && p !== n && p.kind === 'knowledge') n.parents.push(p);
      else if (!p) {
        if (!missingParents.has(l.target)) missingParents.set(l.target, new Set());
        missingParents.get(l.target).add(n);
      }
    }
    n.parents = [...new Set(n.parents)];
    n.leadsTo = res(n.footer.leadsTo).filter(m => m.kind === 'knowledge');
    n.oppositeDeclared = res(n.footer.opposite).filter(m => m.kind === 'knowledge');
    n.createdFrom = res(n.footer.createdFrom).filter(m => m.kind === 'source');
    n.opposites = new Set(n.oppositeDeclared);
    n.comesAfter = [];
    n.declaredChildren = [];
  }
  for (const n of published) {
    for (const m of n.oppositeDeclared) m.opposites.add(n); // symmetric
    for (const m of n.leadsTo) m.comesAfter.push(n);
    for (const p of n.parents) p.declaredChildren.push(n);
  }
  for (const n of published) n.opposites = [...n.opposites];

  // Sources: which notes they inspired (created from) and which cite them inline.
  for (const n of published) if (n.kind === 'source') { n.inspired = []; n.citedBy = []; }
  for (const n of published) {
    if (n.kind !== 'knowledge') continue;
    for (const s of n.createdFrom) s.inspired.push(n);
    n.cites = [...n.out].filter(m => m.kind === 'source' && published.has(m) && !n.createdFrom.includes(m));
    for (const s of n.cites) s.citedBy.push(n);
  }

  const tree = buildTree(entry, published);

  return { entry, published, excluded, unlinked, unreferencedSources, dangling, missingParents, tree, notes };
}

// Order of first mention of each note inside `n`'s body.
function mentionOrder(n) {
  const order = new Map();
  let i = 0;
  for (const m of n.out) order.set(m, i++);
  return order;
}

// Assigns each published knowledge note one primary parent, so the Part-of
// hierarchy becomes a tree rooted at the entry note. Declared parents win;
// notes without a usable parent are adopted along the shortest link path.
function buildTree(entry, published) {
  const K = [...published].filter(n => n.kind === 'knowledge');
  const parent = new Map([[entry, null]]);
  const hasDeclared = n => n.parents.length > 0;
  const cycles = [];

  const neighbours = (n, viaSources) => {
    const direct = [...n.out, ...n.in].filter(m => m.kind === 'knowledge' && published.has(m));
    if (!viaSources) return direct;
    const extra = [];
    for (const s of [...n.out, ...n.in]) if (s.kind === 'source') for (const m of [...s.out, ...s.in]) if (m.kind === 'knowledge' && published.has(m)) extra.push(m);
    return [...direct, ...extra];
  };

  function bfs(seeds, adoptAll, viaSources) {
    const q = [...seeds];
    while (q.length) {
      const x = q.shift();
      // Declared children, ordered by mention in x, then alphabetically.
      const order = mentionOrder(x);
      const kids = x.declaredChildren.filter(c => !parent.has(c));
      kids.sort((a, b) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9) || a.name.localeCompare(b.name));
      for (const c of kids) { parent.set(c, x); q.push(c); }
      for (const c of neighbours(x, viaSources)) {
        if (parent.has(c)) continue;
        if (!adoptAll && hasDeclared(c)) continue; // wait for its declared parent
        parent.set(c, x); q.push(c);
      }
    }
  }
  bfs([entry], false, false);
  // Notes whose declared parents never got placed (cycles or detached chains).
  let before = -1;
  while (parent.size !== before && parent.size < K.length) {
    before = parent.size;
    bfs([...parent.keys()], true, false);
  }
  if (parent.size < K.length) bfs([...parent.keys()], true, true);

  for (const n of K) {
    // Detect declared Part-of cycles for the report.
    const seen = new Set([n]);
    let cur = n.parents[0];
    while (cur) {
      if (seen.has(cur)) { if (cur === n) cycles.push(n); break; }
      seen.add(cur); cur = cur.parents[0];
    }
  }

  const children = new Map(K.map(n => [n, []]));
  for (const n of K) {
    const p = parent.get(n);
    if (p) children.get(p).push(n);
  }
  // Keep children ordered by mention in the parent, then name.
  for (const [p, kids] of children) {
    const order = mentionOrder(p);
    kids.sort((a, b) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9) || a.name.localeCompare(b.name));
  }
  for (const n of K) {
    n.treeParent = parent.get(n) || null;
    n.treeChildren = children.get(n) || [];
    const crumbs = [];
    let cur = n.treeParent, guard = 0;
    while (cur && guard++ < 50) { crumbs.unshift(cur); cur = cur.treeParent; }
    n.breadcrumb = crumbs;
  }
  const orphans = K.filter(n => !parent.has(n));
  return { root: entry, children, orphans, cycles };
}
