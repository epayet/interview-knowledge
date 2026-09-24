# CLAUDE.md

A static site builder that publishes the owner's interview-prep Obsidian notes for friends. See README.md for commands, note conventions, config and deploy. This file holds the decisions and constraints that aren't obvious from the code.

## The vault (`vault/`)
- It's an extract of the owner's main Obsidian vault. It's **not in git** (`.gitignore`), and the owner refreshes it manually, which overwrites edits made here. Content fixes made in `vault/` must also be reported to the owner so they can apply them in the main vault. Prefer fixing rendering problems in the build code rather than in notes.
- Never edit or delete notes unless asked. Confirm before deleting anything. For cleanup, follow `/clean-extract` (`.claude/commands/clean-extract.md`), which uses `npm run audit`.
- The entry note is `Knowledge/+ Interviewing.md`. Only notes connected to it are published.

## Privacy and content rules (the site is public)
- Never publish employer names, companies the owner applied to, colleagues' names, confidential or internal material (e.g. company slides), local file paths, or personal history ("at a past employer", layoffs, burnout).
- Source pages show **only** `# Highlights` and the AI summary (`# AI Notes` / `# AI`, labelled AI-generated). Never the owner's raw `# Notes`, `# Transcript`, `# Description`, `# Content` or `# Raw content` (`config.json → sourceSections`).
- Before any deploy: run `npm run check` (0 errors), read the privacy section of `publish-report.md`, and scan `dist/` HTML/JSON for identifying terms (employer and company names, the owner's surname and emails, "past employer", "confidential").
- Third-party diagrams and short article highlights with attribution are accepted by the owner. "Started" dates on notes are fine.

## Decisions to keep (asked for explicitly)
- Sidebar: `config.pinned` topics first, as highlighted cards distinct from the current-page highlight. The rest is sorted folders first, then alphabetical. Clicking the current folder's name toggles it.
- Home: "Start here" = `config.pinned`. The intro text comes from `config.siteIntro`, kept short. Counts sit on their own line. A footnote explains mine vs sourced and the maturity badges (no legend cards, no provenance toggle).
- No sidebar on Map, Trade-offs, Practice, Library and Tags (`bodyClass: 'wide'`).
- Maturity: `maturity:` frontmatter wins; otherwise a multi-signal estimate. Never plain word count.
- Trade-off explorer uses masonry columns. Practice has flashcards only (no multiple-choice quizzes).
- Source-type icons are SVG line icons in `lib/icons.mjs` (the video icon must not look like a play/next arrow).
- Site title "Interview knowledge". The logo is a whiteboard with a box growing into a leaf (`static/logo.svg` plus an inline copy in `lib/render.mjs`).

## Code conventions
- Everything is generated from the vault. Don't hardcode note names or counts in code; hand-maintained data lives in `data/` and `config.json`.
- Internal links in templates use the `@@ROOT@@` prefix (`T.R`), replaced per page, so the site works from any sub-path.
- CSS colours are variables on `:root`, with a dark set (`prefers-color-scheme` plus `[data-theme]`). There's no framework and no build step for CSS/JS, and pages must stay readable without JS.
- Keep templates in `lib/render.mjs`, markdown handling in `lib/transform.mjs`, and graph logic in `lib/graph.mjs`. Match the existing terse style and comment density.

## Verifying changes
There are no automated tests. After a change:
1. `npm run build` (the build fails on broken internal links or missing images) and read `publish-report.md`.
2. Look at the affected pages: `npm run preview` (or `PORT=… node lib/serve.mjs`), then take headless screenshots, e.g. `google-chrome --headless=new --screenshot=out.png --window-size=1400,900 URL`. Playwright is available via `npx playwright` for interactions (search, filters, practice, map panel).
3. For layout changes, check light and dark mode and 375px width. No page may scroll sideways: `document.documentElement.scrollWidth <= innerWidth` on every page in `dist/`.

## Git and deploy
- The commit author for this repo is set in the local git config. Don't change it or use the global identity.
- `main` holds only the builder code. Commit only when asked.
- Deploy: `npm run deploy:pages` builds and force-pushes `dist/` as a single commit to `gh-pages` on `origin` (GitHub Pages, custom domain set on the GitHub side). Deploying publishes publicly: do it only when asked, after the privacy checks above.
