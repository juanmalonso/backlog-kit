---
name: story-backlog
description: Show project status and suggest what to do next. Use for "what's there?", "where are we?", "what's next?", "what's ready?", "what's blocked?". Read-only.
---

# /story-backlog — Status and next step

1. Read `.pm/backlog.md` (generated; if in doubt, run `npm run pm:backlog` first).
2. If something is IN_PROGRESS, read the end of its "Progress log".
3. If the user asks about GitHub: `npm run pm:issue -- --verify`.

Short, actionable answer:

```text
Active: US-004 (IN_PROGRESS) — last log: …
In review: US-003 — waiting for your acceptance
Ready: US-007, US-009
Blocked: US-020 — missing …
Suggestion: take US-007 because it unblocks US-008.
```

To suggest: resolved dependencies first, then priority, then what unblocks the most stories.
Anything in IN_REVIEW goes first: it needs the user.
