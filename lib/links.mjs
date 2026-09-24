// Wikilink syntax shared by the parser modules.
export const WIKILINK_RE = /(!?)\[\[([^\[\]]+?)\]\]/g;

// Splits a wikilink body "target#heading|alias" into its parts.
export function parseLinkTarget(raw) {
  let [target, alias] = raw.split('|');
  let heading = null;
  if (target.includes('#')) [target, heading] = target.split('#');
  return { target: target.trim(), heading: heading?.trim() || null, alias: alias?.trim() || null };
}
