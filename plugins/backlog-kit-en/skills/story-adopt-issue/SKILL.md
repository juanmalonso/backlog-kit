---
name: story-adopt-issue
description: Turn GitHub issues opened by hand into stories in .pm/. Use when the user says "adopt issue #N", "process the new issues", or when `npm run pm:issue -- --verify` reports issues without a README.
---

# /story-adopt-issue — Adopt issues as stories

1. With a number: `gh issue view <N> --json number,title,body,labels`. Without one: open issues with no `status:*` label.
2. For each issue:
   - Find the epic by reading `.pm/E*/` READMEs. If unclear, ask.
   - Id from `npm run pm:next-id`.
   - Create the README from `.pm/templates/story.md` with the issue content; mark `(inferred)` what is not in the issue.
   - Set `github_issue: <N>` and rename the issue: `gh issue edit <N> --title "[US-NNN] <title>"`.
   - `npm run pm:sync -- US-NNN`.
3. `npm run pm:issue -- --verify` and summarize: `#61 → US-037 — REFINING (missing: …)`.
