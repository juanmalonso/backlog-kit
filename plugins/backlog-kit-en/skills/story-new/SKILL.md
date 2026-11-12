---
name: story-new
description: Create a new user story in .pm/ and its GitHub issue. Use when the user asks for a feature, story, ticket or a non-trivial fix, or says "add this to the backlog". Also when new work shows up in the middle of another story.
---

# /story-new — Create a story

## 1. Gather the minimum

If unclear, ask with concrete examples:

- **Epic**: one of `.pm/E*/` (read their READMEs). If none fits, propose a new one before creating it.
- Short **title** (≤ 80 characters) and **type**: feature | fix | spike | chore. A `fix` includes symptom and likely cause.
- **As / I want / so that**.
- **Priority**: blocker | high | medium | low.

## 2. Id and folder

```bash
npm run pm:next-id        # never guess the id: it checks remote branches and issues
```

Create `.pm/<epic>/US-NNN-<kebab-slug>/README.md` from `.pm/templates/story.md`.

## 3. Fill in the README

- `status: REFINING` if it will be worked on soon; `BACKLOG` if it is only noted.
- **Context**: which part of the product applies and which decisions (`docs/decisions/`) constrain it.
- **Scope**: what it includes and, above all, what it does **not** and which story gets it.
- Draft criteria, tentative plan and **real open questions**.
- Log: `- <today> — Created. (<status>)`.

The hook regenerates the backlog and runs the guard on save. If it blocks, fix what it says.

## 4. Issue

```bash
npm run pm:sync -- US-NNN   # in BACKLOG no issue is created; otherwise it is, and github_issue is written
```

## Report

Id, README path, issue link and the open questions to refine it.
