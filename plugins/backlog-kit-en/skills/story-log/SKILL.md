---
name: story-log
description: Record progress on a story (README log and issue comment) without changing its status. Use after a milestone, a decision or a finding, or when closing a work session.
---

# /story-log — Record progress

A meaningful milestone, not every commit: what happened, artifacts (file, test) and what is left.

```bash
npm run pm:log -- US-NNN "Board with filters. Test: board.test.mjs. Left: keyboard shortcuts."
```

If progress changed the scope, update "Scope" or "Tasks" too: the log does not replace keeping the
README current. If the status changed, use `/story-advance` (it already logs).
