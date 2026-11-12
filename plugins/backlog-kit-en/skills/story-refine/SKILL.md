---
name: story-refine
description: Refine a story until READY: acceptance criteria, plan, tasks, test cases and resolving open questions with the user. Use for "refine US-NNN", "let's define the criteria", "plan X".
---

# /story-refine — Take a story to READY

## 1. Read

- The whole README. If it is READY or later, confirm with the user before rewriting.
- The decisions (`docs/decisions/`) and the stories it depends on.
- The existing code the story extends.

To save time, launch the `refiner` subagent: it proposes criteria, plan, cases and the questions.

## 2. Resolve the questions with the user

Present them together, each with **concrete options and an example**, your recommendation first.
Do not invent answers. Each answer goes to "Decisions" with a date. If a decision reaches
beyond the story → `/doc-adr`.

## 3. Complete

- **Acceptance criteria**, binary, as Given/when/then. Include what must **not** happen.
- **Implementation plan** in logical order, naming real files.
- **Tasks**, including `npm run pm:check` clean.
- **Test cases**: real rows; they are copied to the issue as a manual QA checklist.
- **Dependencies**: stories that must come first.

If it ended up XL, propose splitting it (`/story-new` for each part) before READY.

## 4. Move to READY

Only with zero open questions:

```bash
npm run pm:advance -- US-NNN READY --note "Key decisions: …"
```

If it was BACKLOG, first `npm run pm:advance -- US-NNN REFINING`.
