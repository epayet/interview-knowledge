---
description: Audit the "vault/" extract and delete notes that don't belong (asks before deleting)
---
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
