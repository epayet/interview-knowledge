// Parses the note footer convention:
//
//   ---
//   Part of:: [[A]],[[B]]        (older notes: Topic::)
//   Opposite::
//   Leads to::
//   This was created from: [[Source/...]]
//   #tag #tag
//
import { WIKILINK_RE, parseLinkTarget } from './links.mjs';

const FIELDS = [
  ['partOf', /^(?:Part of|Topic)::(.*)$/i], // "Topic::" is an older name for "Part of::"
  ['opposite', /^Opposite::(.*)$/i],
  ['leadsTo', /^Leads to::(.*)$/i],
  ['createdFrom', /^This was created from::?(.*)$/i],
];

export const TAG_RE = /(?:^|\s)#([a-zA-Z][\w/-]*)/g;
const JUNK_TAG = /^(footnote|fn)-?\d*/i;
const TAG_LINE = /^\s*(#[a-zA-Z][\w/-]*\s*)+$/;

export function extractTags(line) {
  return [...line.matchAll(TAG_RE)].map(m => m[1].toLowerCase()).filter(t => !JUNK_TAG.test(t));
}

function links(value) {
  const out = [];
  for (const m of value.matchAll(WIKILINK_RE)) {
    const { target, alias } = parseLinkTarget(m[2]);
    if (target) out.push({ target, alias });
  }
  return out;
}

export function parseFooter(body) {
  const lines = body.split('\n');
  const result = { partOf: [], opposite: [], leadsTo: [], createdFrom: [], createdFromUrls: [], tags: [], hasFooter: false, declared: {} };

  // Find the last '---' separator that is followed by at least one footer field.
  let cut = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === '---') {
      const rest = lines.slice(i + 1);
      if (rest.some(l => FIELDS.some(([, re]) => re.test(l.trim())))) { cut = i; break; }
    }
  }

  let footerLines = [];
  let mainLines = lines;
  if (cut >= 0) {
    footerLines = lines.slice(cut + 1);
    mainLines = lines.slice(0, cut);
    result.hasFooter = true;
  } else {
    // No footer: still strip trailing tag-only lines.
    let end = lines.length;
    while (end > 0 && (lines[end - 1].trim() === '' || TAG_LINE.test(lines[end - 1]))) {
      if (TAG_LINE.test(lines[end - 1])) footerLines.unshift(lines[end - 1]);
      end--;
    }
    mainLines = lines.slice(0, end);
  }

  for (const raw of footerLines) {
    const line = raw.trim();
    let matched = false;
    for (const [key, re] of FIELDS) {
      const m = line.match(re);
      if (m) {
        matched = true;
        result.declared[key] = true;
        const ls = links(m[1]);
        result[key].push(...ls);
        if (key === 'createdFrom') {
          const urls = m[1].replace(WIKILINK_RE, '').match(/https?:\/\/\S+/g);
          if (urls) result.createdFromUrls.push(...urls);
        }
      }
    }
    if (!matched && TAG_LINE.test(line)) result.tags.push(...extractTags(line));
  }

  // Drop trailing tag-only lines in the main body too (some notes put tags above the footer).
  while (mainLines.length && (mainLines.at(-1).trim() === '' || TAG_LINE.test(mainLines.at(-1)))) {
    const l = mainLines.pop();
    if (TAG_LINE.test(l)) result.tags.push(...extractTags(l));
  }
  result.tags = [...new Set(result.tags)];
  result.main = mainLines.join('\n');
  return result;
}
