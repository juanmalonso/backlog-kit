---
name: story-backlog
description: Show project status and suggest what to do next. Use for "what's there?", "where are we?", "what's next?", "what's ready?", "what's blocked?". Read-only.
---

# /story-backlog — Status and next step

1. Read `.pm/backlog.md` (generated; if in doubt, run `npm run pm:backlog` first).
2. If something is {{S.inProgress}}, read the end of its "{{sections.log}}".
{{#github}}3. If the user asks about GitHub: `npm run pm:issue -- --verify`.
{{/github}}
Short, actionable answer:

```text
Active: {{storyPrefix}}-004 ({{S.inProgress}}) — last log: …
In review: {{storyPrefix}}-003 — waiting for your acceptance
Ready: {{storyPrefix}}-007, {{storyPrefix}}-009
Blocked: {{storyPrefix}}-020 — missing …
Suggestion: take {{storyPrefix}}-007 because it unblocks {{storyPrefix}}-008.
```

To suggest: resolved dependencies first, then priority, then what unblocks the most stories.
Anything in {{S.review}} goes first: it needs the user.
