// Maturity: an explicit `maturity:` frontmatter field wins; otherwise a
// multi-signal estimate with a human-readable explanation.
export const LEVELS = {
  seedling: { icon: '🌱', label: 'Seedling', blurb: 'An early thought or a stub' },
  growing: { icon: '🌿', label: 'Growing', blurb: 'Useful, still being fleshed out' },
  established: { icon: '🌳', label: 'Established', blurb: 'Fleshed out and reasonably complete' },
};

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export function maturityOf(note, stats, config) {
  const explicit = String(note.fm.maturity || '').toLowerCase().trim();
  if (LEVELS[explicit]) return { level: explicit, estimated: false, reasons: ['set by the author'] };

  const w = config.maturityWeights;
  const th = config.maturityThresholds;
  const reasons = [];
  const own = stats.ownWords, ext = stats.extWords;
  const total = own + ext;
  const ownShare = total ? own / total : 0;

  // Own voice: diminishing returns past ~350 words; quoted material counts for a third.
  const ownScore = 3 * clamp(Math.log1p(own + ext / 3) / Math.log1p(350), 0, 1);

  const structure =
    clamp(stats.sectionsWithContent, 0, 4) * 0.25 +
    (stats.listItems >= 3 ? 0.25 : 0) +
    (stats.images + (stats.tableRows > 2 ? 1 : 0) + (stats.codeBlocks ? 1 : 0) > 0 ? 0.5 : 0);

  const singleImage = stats.contentLines <= 1 && stats.images > 0;
  const singleLine = stats.contentLines <= 1 && !singleImage;
  const linkOnly = stats.contentLines > 0 && stats.linkOnlyLines === stats.contentLines;
  const incomplete =
    stats.emptyHeadings * 0.4 + stats.todo * 0.5 + (singleLine ? 1.5 : 0) + (singleImage ? 0.75 : 0) + (linkOnly ? 1.5 : 0);

  const footerFilled = note.parents.length + note.opposites.length + note.leadsTo.length + note.createdFrom.length;
  const connected =
    clamp(footerFilled, 0, 3) * 0.15 + clamp(note.in.size, 0, 5) * 0.06 + clamp((note.cites?.length || 0) + note.createdFrom.length, 0, 3) * 0.1;

  let score = w.ownVoice * ownScore + w.structure * structure + w.incomplete * incomplete + w.connected * connected;

  let level = score >= th.established ? 'established' : score >= th.growing ? 'growing' : 'seedling';
  if (level === 'established' && total > 60 && ownShare < 0.3) {
    level = 'growing';
    reasons.push(`mostly quoted material (${Math.round((1 - ownShare) * 100)}% from sources)`);
  }

  if (singleImage) reasons.push('a single diagram');
  else if (singleLine) reasons.push('a single line');
  else if (linkOnly) reasons.push('only links so far');
  else reasons.push(`~${own} words of own writing` + (ext ? `, ~${ext} quoted` : ''));
  if (stats.sectionsWithContent >= 3) reasons.push(`${stats.sectionsWithContent} sections`);
  if (stats.emptyHeadings) reasons.push(`${stats.emptyHeadings} empty section${stats.emptyHeadings > 1 ? 's' : ''}`);
  if (stats.todo) reasons.push('has TODO markers');
  if (stats.images || stats.tableRows > 2) reasons.push('includes a diagram or table');
  if (footerFilled >= 3 || note.in.size >= 5) reasons.push('well connected');

  return { level, estimated: true, score: Math.round(score * 100) / 100, reasons };
}
