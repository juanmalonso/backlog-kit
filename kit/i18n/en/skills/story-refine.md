---
name: story-refine
description: Refine a story until {{S.ready}}: acceptance criteria, plan, tasks, test cases and resolving open questions with the user. Use for "refine {{storyPrefix}}-NNN", "let's define the criteria", "plan X".
---

# /story-refine — Take a story to {{S.ready}}

## 1. Read

- The whole README. If it is {{S.ready}} or later, confirm with the user before rewriting.
- The decisions (`{{docs.decisions}}/`) and the stories it depends on.
- The existing code the story extends.

## 2. Resolve the questions with the user

Present them together, each with **concrete options and an example**, your recommendation first.
Do not invent answers. Each answer goes to "{{sections.decisions}}" with a date. If a decision reaches
beyond the story → `/doc-adr`.

## 3. Complete

- **{{sections.criteria}}**, binary, as Given/when/then. Include what must **not** happen.
- **{{sections.plan}}** in logical order, naming real files.
- **Tasks**, including `{{checkCommand}}` clean.
- **{{sections.tests}}**: real rows{{#github}}; they are copied to the issue as a manual QA checklist{{/github}}.
- **{{sections.dependencies}}**: stories that must come first.

If it ended up XL, propose splitting it (`/story-new` for each part) before {{S.ready}}.

## 4. Move to {{S.ready}}

Only with zero open questions:

```bash
npm run pm:advance -- {{storyPrefix}}-NNN {{S.ready}} --note "Key decisions: …"
```

If it was {{S.backlog}}, first `npm run pm:advance -- {{storyPrefix}}-NNN {{S.refining}}`.
