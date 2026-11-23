---
name: doc-wiki
description: Publish .pm/ (backlog, decisions, epics and stories) to the {{forgeName}} wiki. Use when the user asks to update the wiki or after big changes in .pm/ (new stories, ADRs, re-planning).
---

# /doc-wiki — Publish .pm/ to the wiki

```bash
npm run pm:wiki -- --dry-run     # which pages it creates, updates or deletes, touching nothing
npm run pm:wiki
```

- Page titles come from epic, story and decision names (no accents, cut at a word). Renaming a story changes its
  page: with `wiki.prune` the old one is deleted and loses its history.
- With `wiki.prune: true`, any page that does not come from `.pm/` is deleted except those in `wiki.keep`. If the
  `--dry-run` shows deletions you did not expect, stop and ask.
- Report the summary (new, updated, deleted) and the wiki link.
