---
name: doc-adr
description: Record an architecture or product decision as an ADR in {{docs.decisions}}/. Use when a decision affects more than one story (stack, domain model, contracts, conventions) or when the user says "record this decision".
---

# /doc-adr — Record a decision

1. Number: the next one after `ls {{docs.decisions}}/ADR-*.md` (check remote branches too).
2. Copy `{{docs.decisions}}/template.md` to `{{docs.decisions}}/ADR-NNN-<slug>.md`.
3. Context, decision in present tense, alternatives with real pros and cons, and consequences.
4. Status `Proposed` if the user has not confirmed it; `Accepted` if they have. An accepted ADR is never rewritten: create a new one and mark the old one `Superseded by ADR-NNN`.
5. Add the row to `{{docs.decisions}}/README.md` and link it from the story that originated it.
