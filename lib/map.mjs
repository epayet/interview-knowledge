// System design map: an SVG reference architecture where each component links to notes.
import { esc } from './transform.mjs';

const W = 1000, MAIN_W = 790, BOX_W = 160, BOX_H = 54, ROW_H = 112, TOP = 34;

export function buildMap(arch, resolve, isPublished) {
  const layers = arch.layers.map((l, i) => ({ ...l, index: i, y: TOP + i * ROW_H }));
  const layerById = new Map(layers.map(l => [l.id, l]));
  const comps = [];
  for (const l of layers) {
    const items = arch.components.filter(c => c.layer === l.id);
    const slot = (MAIN_W - 30) / items.length;
    items.forEach((c, k) => {
      const notes = c.notes.map(n => resolve(n)).filter(n => n && isPublished(n));
      comps.push({ ...c, notes, x: 30 + slot * (k + 0.5) - BOX_W / 2, y: l.y + 18, layerLabel: l.label, index: k });
    });
  }
  const cross = arch.crossCutting.map((c, i) => ({
    ...c, notes: c.notes.map(n => resolve(n)).filter(n => n && isPublished(n)),
    x: MAIN_W + 40, y: TOP + 18 + i * ((layers.length * ROW_H - 40) / arch.crossCutting.length), w: W - MAIN_W - 50, h: 44,
  }));
  const byId = new Map([...comps, ...cross].map(c => [c.id, c]));
  const height = TOP + layers.length * ROW_H;

  // Which component a note belongs to (first match wins).
  const noteToComp = new Map();
  for (const c of [...comps, ...cross]) for (const n of c.notes) if (!noteToComp.has(n)) noteToComp.set(n, c.id);

  function svg({ highlight = null, thumb = false } = {}) {
    const parts = [];
    parts.push(`<svg class="map-svg${thumb ? ' map-thumb' : ''}${highlight ? ' has-hl' : ''}" viewBox="0 0 ${W} ${height}" role="img" aria-label="System design reference architecture"${thumb ? ' aria-hidden="true"' : ''}>`);
    parts.push(`<defs><marker id="arr${thumb ? 't' : ''}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="map-arrow"/></marker></defs>`);
    for (const l of layers) {
      parts.push(`<rect class="map-band" x="8" y="${l.y}" width="${MAIN_W}" height="${ROW_H - 10}" rx="10"/>`);
      if (!thumb) parts.push(`<text class="map-layer" x="${MAIN_W - 6}" y="${l.y + 13}" text-anchor="end">${esc(l.label.toUpperCase())}</text>`);
    }
    parts.push(`<rect class="map-band cross" x="${MAIN_W + 22}" y="${TOP}" width="${W - MAIN_W - 30}" height="${layers.length * ROW_H - 10}" rx="10"/>`);
    if (!thumb) parts.push(`<text class="map-layer" x="${MAIN_W + 36}" y="${TOP + 14}">CROSS-CUTTING</text>`);

    // Edges: straight/curved between neighbours; orthogonal routes through the column
    // gaps when an edge skips a layer, so lines never cut through boxes.
    for (const [a, b] of arch.edges) {
      const A = byId.get(a), B = byId.get(b);
      if (!A || !B) continue;
      const la = layerById.get(A.layer).index, lb = layerById.get(B.layer).index;
      let d;
      if (la === lb) {
        if (Math.abs(A.index - B.index) !== 1) continue; // only neighbours in a row
        const [L, R2] = A.x < B.x ? [A, B] : [B, A];
        d = `M${L.x + BOX_W},${L.y + BOX_H / 2} L${R2.x},${R2.y + BOX_H / 2}`;
      } else {
        const down = la < lb;
        const [P, Q] = down ? [A, B] : [B, A];
        const x1 = P.x + BOX_W / 2, y1 = P.y + BOX_H, x2 = Q.x + BOX_W / 2, y2 = Q.y;
        if (Math.abs(la - lb) === 1) {
          const my = (y1 + y2) / 2;
          d = `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
        } else {
          const gx = Q.x - 15, r = 6;
          const ya = y1 + 12, yb = y2 - 12;
          const dir = gx < x1 ? -1 : 1;
          d = `M${x1},${y1} V${ya - r} Q${x1},${ya} ${x1 + dir * r},${ya} H${gx - dir * r} Q${gx},${ya} ${gx},${ya + r} V${yb - r} Q${gx},${yb} ${gx + r},${yb} H${x2 - r} Q${x2},${yb} ${x2},${yb + r} V${y2}`;
        }
      }
      const hl = highlight && (a === highlight || b === highlight) ? ' hl' : '';
      parts.push(`<path class="map-edge${hl}" d="${d}" marker-end="url(#arr${thumb ? 't' : ''})"/>`);
    }

    const box = (c, x, y, w, h, small) => {
      const has = c.notes.length > 0;
      const cls = ['map-comp', has ? '' : (c.id === 'client' ? 'neutral' : 'missing'), highlight === c.id ? 'hl' : ''].filter(Boolean).join(' ');
      const words = c.label.split(' ');
      const lines = c.label.length > 16 && words.length > 1 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [c.label];
      const ty = y + h / 2 - (lines.length - 1) * 8 + (has && !small && !thumb ? -3 : 4);
      let inner = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8"/>`;
      if (!thumb) inner += lines.map((t, i) => `<text class="map-label" x="${x + w / 2}" y="${ty + i * 16}">${esc(t)}</text>`).join('');
      if (!thumb && has && !small) inner += `<text class="map-count" x="${x + w / 2}" y="${y + h - 8}">${c.notes.length} note${c.notes.length > 1 ? 's' : ''}</text>`;
      if (!thumb && !has && c.id !== 'client') inner += `<text class="map-count" x="${x + w / 2}" y="${y + h - 8}">not written yet</text>`;
      if (has && !thumb) return `<a class="${cls}" href="@@ROOT@@${c.notes[0].url}" data-comp="${c.id}"><title>${esc(c.label)}</title>${inner}</a>`;
      return `<g class="${cls}" data-comp="${c.id}">${inner}</g>`;
    };
    for (const c of comps) parts.push(box(c, c.x, c.y, BOX_W, BOX_H, false));
    for (const c of cross) parts.push(box(c, c.x, c.y, c.w, c.h, true));
    parts.push('</svg>');
    return parts.join('');
  }

  return { layers, comps, cross, svg, noteToComp, byId };
}
