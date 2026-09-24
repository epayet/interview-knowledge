# Interview knowledge: static site builder

This turns the Obsidian extract in `vault/` (not tracked in git: copy or export it there yourself) into a static website (plain HTML, CSS and JS, no framework) that friends can browse. It starts from the map of content `vault/Knowledge/+ Interviewing.md`.

Generated pages (in `dist/`):

| Page | What it is |
|---|---|
| `index.html` | `+ Interviewing` as a landing page: "Start here" cards, links to the tools, then the rest of the map of content. |
| `notes/*.html` | One page per note: maturity badge, breadcrumb, "Inspired by", counterpoints, "where it sits" on the map, then *In this topic*, *Continue with*, *Sources*, *Referenced by*. |
| `sources/*.html` | One page per source (article, video, book): highlights, AI summary, link to the original, notes it inspired. |
| `map.html` | **System design map**: a reference architecture where each component opens the notes about it, a **Common problems** strip (pick a problem to light up the components that solve it), and **Numbers to know**. |
| `tradeoffs.html` | **Trade-off explorer**: every "X vs Y" note, `Opposite::` pair and "When to use" section, grouped by area and filterable by what the decision hinges on. |
| `practice.html` | **Practice**: one random trade-off at a time. Answer it, reveal the card, then rate yourself *Missed / Shaky / Got it*. Missed and shaky cards come back more often. Progress is saved per browser (localStorage). Keys: `space` to reveal, `1`/`2`/`3` to rate, `→` to skip. The home page also shows a "Random trade-off" prompt that links here. |
| `library.html` | All sources, ranked by how many notes they shaped. |
| `tags.html` | Tag index. |

Every page also has search (`/` or `Ctrl+K`), link previews on hover, dark mode, and a toggle that emphasises what's mine vs sourced.

## Quick start

```sh
npm install        # once; needs Node >= 20
npm run dev        # builds, serves http://localhost:8080 and rebuilds on every save
```

## Commands

| Command | What it does |
|---|---|
| `npm install` | One-time setup. |
| `npm run build` | Wipes `dist/` and rebuilds everything (a few seconds), then writes `publish-report.md`. Fails on broken internal links or missing images. |
| `npm run dev` | Watches `vault/` and the build sources, rebuilds on save, and serves `dist/` at `localhost:8080` with live reload. Set `PORT=` to change the port. |
| `npm run preview` | Serves the current `dist/` without watching. |
| `npm run check` | Build, then print only the warnings: broken links, unlinked notes, privacy-tagged notes, map gaps, number candidates. Exits non-zero on errors. Run it before deploying. |
| `npm run audit` | Writes `audit-report.md`, a list of cleanup candidates. It **never deletes anything**. It's the input for `/clean-extract`. `npm run audit -- --json` prints the same data as JSON. |
| `npm run deploy:pages` | Build, then publish `dist/` to GitHub Pages (the `gh-pages` branch). See [Deploying](#deploying). |
| `npm run deploy` | Copy `dist/` to your own server with rsync (`DEPLOY_TARGET`). See [Deploying](#deploying). |

All links in `dist/` are relative, so the site works from any sub-folder of your website.

## Updating the site

The site is always regenerated from scratch from the vault, so it can't go stale and the vault is never written to.

Typical loop:

1. Edit or add notes in Obsidian, then refresh the `vault/` extract.
2. `npm run check` and read the warnings.
3. `npm run preview` (or keep `npm run dev` running while editing) and have a look.
4. `npm run deploy:pages` (or `npm run deploy` for your own server).

How changes flow through, with no site code to touch:

- **New note**: published once it's linked to `+ Interviewing` directly or indirectly (in either direction). Its `Part of::` places it in the sidebar, in the breadcrumb and in its parent's "In this topic" list.
- **New "X vs Y" note**: appears in the Trade-off explorer automatically. The same goes for a new `## When to use …` section.
- **New component note** (e.g. `Blob storage`): appears on the map only once it's in `data/architecture.json`. `check` lists system-design notes that aren't on the map.
- **New number worth knowing**: `check` lists numeric statements as candidates. Add the ones you want to `data/numbers.json`.
- **Hide a note**: delete it from the extract, or add `publish: false` to its frontmatter.
- **Mark maturity**: add `maturity: seedling | growing | established` to its frontmatter.

`vault` in `config.json` could point at your main vault instead of the extract. Publishing still follows links from `+ Interviewing`, but everything linked in the main vault would then be reachable, so the curated extract is the default.

## Deploying

The site is a folder of static files (`dist/`), so it can be hosted anywhere. Your notes (`vault/`) are not in git, so GitHub can't build the site itself: you build locally and publish the result.

### GitHub Pages (recommended)

One-time setup:

1. Create a repository on GitHub and push this one: `git remote add origin git@github.com:<you>/<repo>.git && git push -u origin main`.
2. Run `npm run deploy:pages` once, so the `gh-pages` branch exists.
3. On GitHub: **Settings → Pages → Build and deployment → Source: "Deploy from a branch"**, branch **`gh-pages`**, folder **`/ (root)`**.

The site is then at `https://<you>.github.io/<repo>/` (links are relative, so the sub-path works).

To publish an update, run `npm run deploy:pages`. It builds, then force-pushes `dist/` as a single commit to `gh-pages`. That branch only ever contains the built site: never the vault, never old versions. `main` holds the builder code.

Settings in `.env` (all optional):

| Variable | Meaning |
|---|---|
| `PAGES_REMOTE` | Where to push `gh-pages`: a git remote name (default `origin`) or a repository URL. |
| `PAGES_CNAME` | A custom domain (e.g. `notes.example.com`). It writes the `CNAME` file GitHub Pages needs. Point your DNS at GitHub as described in their docs. |
| `PAGES_BRANCH` | The branch to publish to (default `gh-pages`). |

Things to know:
- GitHub Pages on a free account needs a **public repository**. The builder code, and the author name and email on your commits, become visible. `vault/` is never pushed (it's in `.gitignore`), but the published site is public anyway.
- Run `npm run check` first, and read the privacy section of `publish-report.md`.

### Your own server

`npm run deploy` copies `dist/` to a server with `rsync -avz --delete dist/ $DEPLOY_TARGET`. It needs SSH access to the server.

`DEPLOY_TARGET` is the rsync destination, in the form `user@host:/path/on/server/`. For example, `me@myserver.com:/var/www/mysite/interviewing/` makes the site available at `https://mysite.com/interviewing/`. `--delete` removes files on the server that are no longer in `dist/` (e.g. a deleted note's page), so point it at a folder used only for this site.

## Note conventions the build understands

**Mine vs sourced.** A line like `From [[Source/Video/…]]:` or `From Google:` starts a *sourced block* (it also works with a trailing period or no colon, `From [[Person]] in [[Source/…]]`, and a `From [[…]]:` at the end of your own sentence), which is rendered in a framed box with a chip linking to the source. The block ends at the next heading, the next `From …:` line, or a blank line followed by a plain paragraph. `>` quotes are also shown as sourced. Everything else is shown as the author's own writing.

**Footer fields** (after the last `---`):

| Field | What it powers |
|---|---|
| `Part of::` (or the older `Topic::`) | The hierarchy: sidebar tree, breadcrumbs, and the parent page's "In this topic" list. With several parents the note is listed under each, and the sidebar and breadcrumb use the shortest path to `+ Interviewing`. A missing or out-of-folder parent is ignored and the note hangs off its shortest link path instead. |
| `Opposite::` | A "Counterpoint" card on **both** notes, and a card in the Trade-off explorer. |
| `Leads to::` | "Continue with →" on this note, "← Comes after" on the target. |
| `This was created from:` | "Inspired by" under the title. On the source page, "Notes this inspired". Inline `From [[…]]:` sources are listed as "cited". |
| trailing `#tags` | Tag chips and `tags.html`. `#footnote-12`-style junk is ignored. |

**Maturity badges.** `maturity:` in frontmatter always wins. Without it the badge is estimated (dashed border and "est.", with the reasons in its tooltip) from:

- how much is the author's own writing (quoted material counts for a third)
- structure (sections with content, lists, diagrams and tables)
- penalties for empty sections, TODO markers, single-line and link-only notes
- a small bonus for being well connected

A note that's mostly quoted is capped at 🌿. The weights and thresholds are in `config.json`.

**Source notes.** Only `# Highlights` and the AI summary (`# AI Notes` / `# AI`, labelled "AI-generated") are published, plus the frontmatter metadata (title, author, date, `source:` link, `image:` thumbnail, `description:`). Personal `# Notes`, `# Description`, `# Transcript`, `# Content` and `# Raw content` are never published. Root-relative links inside highlights are resolved against the source URL.

**Trade-off explorer columns.** A comparison note is split into side-by-side columns only when its body clearly follows a per-option pattern: `Kafka wins when:`, `Use X when`, `When to use X`, or a heading named after an option. Otherwise the whole note is shown. The "hinges on" factors are matched from keywords in `config.json → tradeoffFactors`, and the card's area comes from its `Part of` ancestors (`tradeoffGroups`).

Other syntax: `[[wikilinks]]` (links to unpublished notes become plain dotted text), `![[image.png]]` embeds, `==highlights==`, callouts, tables, footnotes, and ```` ```embed ```` blocks (rendered as link cards). A single line break is a line break, as in Obsidian.

## Configuration

`config.json`:

| Key | Meaning |
|---|---|
| `vault`, `entry` | Where the vault is, and the note everything hangs off. |
| `siteTitle`, `siteSubtitle` | Shown on the home page and in page titles. |
| `siteIntro` | Paragraphs under the home page title. Mentions of "the map", "the trade-offs" and "the practice page" become links. |
| `excludeTags` | Notes with these tags are never published (default `#private`). |
| `privacyTags` | Published notes with these tags are flagged in the report for a double-check. |
| `maturityWeights`, `maturityThresholds` | Tuning for the estimated badge. |
| `sourceSections` | Which `#` sections of source notes are published (`keep`) or shown as AI-generated (`ai`). |
| `tradeoffGroups`, `tradeoffFactors` | Areas and "hinges on" keywords for the Trade-off explorer. |

`data/architecture.json` holds the system design map. Layers render top to bottom, components left to right within their layer, and each component lists the notes it opens (the first is the main one). `edges` are drawn between neighbouring boxes, and edges that skip a layer are routed around the boxes. Example component:

```json
{ "id": "cache", "label": "Cache", "layer": "data", "notes": ["Caching", "Caching patterns", "Redis", "Redis vs Memcached"] }
```

Two more keys in `architecture.json`:

- `patternsNote` names the note that drives the **Common problems** strip above the map (default `Common System Design Patterns`). Each `#` heading in that note is a problem. The notes linked under the heading decide which components light up, and a heading with no links shows as "not written up yet". To add a problem, add a heading and links to that note. No site change is needed.
- `notOnMap` lists system-design notes that deliberately aren't components (e.g. `System Design Primer`), so the report stops suggesting them. Notes used by `numbers.json` are skipped automatically.

`data/numbers.json` holds "Numbers to know". Each entry has `label`, `value`, `detail`, `note` (the note it comes from) and `group`.

`.env` holds the deploy settings (copy `.env.example`); see [Deploying](#deploying).

## Reading the publish report

`publish-report.md` is rewritten on every build:

- **❌ Errors: broken internal links / missing images**: these fail the build. Usually an `![[image]]` whose file isn't in the extract.
- **Unlinked notes / Sources no published note links to**: files in the extract that aren't published. Link them or run `/clean-extract`.
- **Part of:: targets not in the folder**: the parent isn't in the extract. The note still shows up, attached by its links.
- **Dangling links**: links to notes that aren't in the extract. They render as plain text, which is fine.
- **Privacy check**: published notes tagged `#me` and similar. Make sure you're happy sharing them.
- **Maturity not set**: every estimated badge and why, lowest first, to help decide where to add `maturity:`.
- **System design notes not on the map / Number candidates**: suggestions for `data/architecture.json` and `data/numbers.json`.

## Cleaning the extract

Do this after a big re-extract from the main vault, or when `check` reports unlinked notes or sources. It has two halves:

1. `npm run audit` works out, without deleting anything: which notes can't reach `+ Interviewing`, which sources and images nothing uses, and what each deletion would leave orphaned.
2. The judgement of what's off-topic happens in a Claude Code command. From this folder, run `/clean-extract` in Claude Code, or from a shell:

   ```sh
   claude "$(tail -n +4 .claude/commands/clean-extract.md)"
   ```

   It always asks before deleting anything. The prompt, which you can also paste into any assistant:

   ```markdown
   Clean up the notes extract in "vault/" so it only contains content
   related to interviewing for technical roles, reachable from "Knowledge/+ Interviewing.md".

   1. Run `npm run audit` and read `audit-report.md`. Do not delete anything yet.
   2. Sort candidates into groups, citing each note's first line or tags as evidence:
      A. Not connected to + Interviewing and off-topic → delete.
      B. Not connected but plausibly useful for interviews (levelling, behavioural
         stories, domain knowledge, self-knowledge for culture fit) → propose either
         deleting it or linking it via `Part of::` to a specific existing note (name it).
      C. Connected but off-topic (hobbies, tooling, model internals, creativity, etc.)
         → delete. Be conservative: AI-and-engineering, career, role, market and learning
         notes are in scope.
   3. Ask me which groups/notes to delete (multi-select), and for B whether to link instead.
   4. Delete only what I confirmed. Never touch files outside "vault/".
      Never edit note contents except adding a `Part of::` link I approved for group B.
   5. Re-run the audit and show the cascade (sources and images no longer referenced).
      Ask before deleting those too.
   6. Finish with `npm run check` and summarise: deleted counts, remaining notes,
      any new dangling links.
   ```

## Project layout

```
vault/               the Obsidian extract (input; never modified by the build)
dist/                the generated site (upload this)
build.mjs            orchestrates the build and writes the report
lib/vault.mjs        reads the vault, frontmatter, slugs, Obsidian-style link resolution
lib/links.mjs        wikilink syntax helpers
lib/footer.mjs       parses Part of:: / Opposite:: / Leads to:: / This was created from: / tags
lib/graph.mjs        link graph, what gets published, core vs further reading, Part-of tree
lib/transform.mjs    markdown → HTML (wikilinks, embeds, provenance blocks, heading ids, stats)
lib/maturity.mjs     explicit or estimated maturity
lib/tradeoffs.mjs    Trade-off explorer data
lib/map.mjs          system design map SVG
lib/render.mjs       page templates
lib/serve.mjs        preview / dev server with live reload
lib/audit.mjs        cleanup audit
lib/deploy.mjs       deploy to GitHub Pages (--pages) or rsync to a server
static/              style.css, app.js and logo.svg (favicon), copied to dist/assets/
data/                architecture.json and numbers.json
```

## Troubleshooting

- **A link shows as dotted plain text.** The target note isn't in the extract (or isn't published). Check "Dangling links" in the report.
- **A note isn't on the site.** It isn't connected to `+ Interviewing` by any link. See "Unlinked notes" in the report. Link it from a related note or add a `Part of::`.
- **A note sits in an odd place in the sidebar.** Its `Part of::` is empty or points outside the extract, so it was placed by link distance. Set `Part of::`.
- **The build fails with broken links.** See the ERRORS section of the report. It's usually an embedded image that wasn't copied into the extract.
- **A sourced passage runs on into my own text.** Leave a blank line and start your own paragraph with plain text (not a list), or add a heading.
