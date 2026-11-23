---
name: story-adopt-issue
description: Turn {{forgeName}} issues created by hand into .pm/ stories. Use when the user says "adopt issue #N", "process the new issues", or when `npm run pm:issue -- --verify` reports issues without a README.
---

# /story-adopt-issue — Adopt issues as stories

1. What to adopt: with a number, that issue; without one, `npm run pm:adopt -- --list --json` (open issues no story
   claims and without `[{{storyPrefix}}-NNN]` in the title).
2. For each issue:
   - Find the epic by reading the READMEs in `.pm/{{epicPrefix}}*/`. If it is not obvious, ask with the epics as options.
   - Id with `npm run pm:next-id` (when adopting several, run it before each one: the previous one took its number).
   - Create the README from `.pm/templates/` with the issue's content; mark `(inferred)` what does not come from it.
     {{S.ready}} only if it is enough to implement; otherwise {{S.refining}} with the questions.
   - Set `{{K.issue}}: <N>` in the frontmatter and run `npm run pm:adopt -- <N> {{storyPrefix}}-NNN`: it renames the issue
     to `[{{storyPrefix}}-NNN] <title>`, sets labels and milestone, and comments where the story lives.
3. `npm run pm:issue -- --verify` and summarize: `#61 → {{storyPrefix}}-037 — {{S.refining}} (missing: …)`.
