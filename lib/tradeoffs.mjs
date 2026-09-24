// Trade-off explorer: "X vs Y" notes, Opposite:: pairs and "When to use" sections.
import { slugify } from './vault.mjs';
import { esc, ownExcerpt, plainText } from './transform.mjs';

const HEADING_RE = /^(#{1,6})\s+(.*)$/;

// Sections whose heading matches `re`: [{heading, level, body}]
export function sectionsMatching(src, re) {
  const lines = src.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(HEADING_RE);
    if (!h || !re.test(h[2].trim())) continue;
    const level = h[1].length, body = [];
    for (let j = i + 1; j < lines.length; j++) {
      const h2 = lines[j].match(HEADING_RE);
      // Stop at a sibling/parent heading, or at another matching "when…" heading (it gets its own column).
      if (h2 && (h2[1].length <= level || re.test(h2[2].trim()))) break;
      body.push(lines[j]);
    }
    const text = body.join('\n').trim();
    if (text) out.push({ heading: h[2].trim(), level, body: text });
  }
  return out;
}

const WHEN_RE = /^when\b.*\b(use|choose|pick|shard|not)\b|^when not\b|^when to\b/i;

function optionLabels(name) {
  return name.split(/\s+vs\.?\s+/i).map((s, i) => {
    let t = s.trim();
    if (i === 0 && t.includes(' - ')) t = t.split(' - ').pop().trim();
    return t;
  });
}

const acronym = s => (s.match(/[A-Z]/g) || []).join('');

function matchOption(text, options) {
  const t = text.toLowerCase().replace(/[*_:?]/g, '').trim();
  if (!t) return -1;
  for (let i = 0; i < options.length; i++) {
    const o = options[i].label.toLowerCase();
    const acr = acronym(options[i].label).toLowerCase();
    const words = t.split(/[\s+/,]+/);
    if (t === o || t.includes(o) || (o.includes(t) && t.length > 2) || (acr.length > 1 && words.includes(acr))) return i;
    // "SQS+SNS" style: any word equal to the option.
    if (words.includes(o)) return i;
  }
  return -1;
}

const MARKERS = [
  /^(?:#{1,6}\s*)?(?:\*\*)?(.+?)(?:\*\*)?\s+wins when:?\s*$/i,
  /^(?:#{1,6}\s*)?use\s+(.+?)\s+when:?\s*$/i,
  /^(?:#{1,6}\s*)?when (?:to |should i |would i |i'd |i would )?(?:use|choose|pick)\s+(.+?)\??:?\s*$/i,
  /^#{1,6}\s*(.+?)\s*$/,
];

// Split the body into per-option columns when it clearly follows a per-option pattern.
function splitColumns(src, options) {
  const lines = src.split('\n');
  const marks = [];
  let inFence = false;
  lines.forEach((l, i) => {
    if (/^\s*```/.test(l)) inFence = !inFence;
    if (inFence) return;
    for (const re of MARKERS) {
      const m = l.trim().match(re);
      if (!m) continue;
      const idx = matchOption(m[1], options);
      if (idx >= 0) { marks.push({ line: i, option: idx }); break; }
    }
  });
  const distinct = new Set(marks.map(m => m.option));
  if (distinct.size < 2) return null;
  const intro = lines.slice(0, marks[0].line).join('\n').trim();
  const cols = marks.map((m, k) => ({
    option: m.option,
    heading: lines[m.line].replace(/^#{1,6}\s*/, '').replace(/:\s*$/, '').trim(),
    body: lines.slice(m.line + 1, k + 1 < marks.length ? marks[k + 1].line : lines.length).join('\n').trim(),
  }));
  return { intro, cols };
}

function factorsFor(text, config) {
  const t = ' ' + text.toLowerCase() + ' ';
  return Object.entries(config.tradeoffFactors)
    .filter(([, f]) => f.terms.some(term => t.includes(term)))
    .map(([k]) => k);
}

function groupFor(note, config, resolve) {
  // Walk up declared Part-of targets (published or not) breadth-first.
  const groups = config.tradeoffGroups.filter(g => g.ancestors.length);
  let level = [note], seen = new Set([note.name.toLowerCase()]);
  for (let depth = 0; depth < 6 && level.length; depth++) {
    const names = [];
    const next = [];
    for (const n of level) {
      const targets = depth === 0 ? [n.name] : [];
      for (const l of n.footer?.partOf || []) targets.push(l.target.split('/').pop());
      for (const t of targets) {
        names.push(t.toLowerCase());
        const r = resolve(t);
        if (r && !seen.has(r.name.toLowerCase())) { seen.add(r.name.toLowerCase()); next.push(r); }
      }
    }
    for (const g of groups) if (g.ancestors.some(a => names.includes(a.toLowerCase()))) return g.id;
    level = next;
  }
  return 'practice';
}

export function buildTradeoffs({ published, resolve, render, config, badge }) {
  const K = [...published].filter(n => n.kind === 'knowledge');
  const byName = new Map(K.map(n => [n.name.toLowerCase(), n]));
  const findNote = label => {
    const l = label.toLowerCase();
    return byName.get(l) || byName.get(l.replace(/s$/, '')) || byName.get(l + 's') || null;
  };
  const cards = [];

  // 1. "X vs Y" notes.
  for (const n of K.filter(n => /\svs\.?\s/i.test(n.name))) {
    const options = optionLabels(n.name).map(label => ({ label, note: findNote(label) }));
    const split = splitColumns(n.main, options);
    const card = {
      id: slugify(n.name), kind: 'comparison', title: n.name, note: n, options,
      group: groupFor(n, config, resolve),
      factors: factorsFor(plainText(n.main), config),
    };
    if (split) {
      card.introHtml = split.intro ? render(split.intro) : '';
      card.columns = split.cols.map(c => ({ label: options[c.option].label, heading: c.heading, html: render(c.body) }));
    } else {
      card.bodyHtml = render(n.main);
    }
    cards.push(card);
    n.comparison = card;
  }

  // 2. Opposite:: pairs (symmetric, deduplicated).
  const seenPairs = new Set();
  for (const n of K) for (const m of n.opposites) {
    const key = [n.name, m.name].sort().join('⇄');
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    const [a, b] = [n, m].sort((x, y) => x.name.localeCompare(y.name));
    cards.push({
      id: slugify(key), kind: 'opposite', title: `${a.name} ⇄ ${b.name}`,
      options: [{ label: a.name, note: a }, { label: b.name, note: b }],
      group: groupFor(a, config, resolve),
      factors: factorsFor(plainText(a.main + ' ' + b.main), config),
      columns: [a, b].map(x => ({ label: x.name, heading: x.name, html: `<p>${esc(ownExcerpt(x.main, 60))}</p>`, note: x })),
    });
  }

  // 3. "When to use / when not to" sections from single-topic notes.
  for (const n of K) {
    if (n.comparison) continue;
    const secs = sectionsMatching(n.main, WHEN_RE);
    if (!secs.length) continue;
    n.whenSections = secs;
    cards.push({
      id: 'when-' + slugify(n.name), kind: 'when', title: `When to reach for ${n.name}`, note: n,
      options: [{ label: n.name, note: n }],
      group: groupFor(n, config, resolve),
      factors: factorsFor(secs.map(s => s.body).join(' '), config),
      columns: secs.map(s => ({ label: s.heading, heading: s.heading, html: render(s.body) })),
    });
  }

  const groups = config.tradeoffGroups.map(g => ({ ...g, cards: cards.filter(c => c.group === g.id) })).filter(g => g.cards.length);
  const factorCounts = {};
  for (const c of cards) for (const f of c.factors) factorCounts[f] = (factorCounts[f] || 0) + 1;
  return { cards, groups, factorCounts };
}
