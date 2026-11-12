---
name: story-wave
description: Implement several stories in parallel, one per worktree, in the order the dependency graph allows. Use when the user asks to "start a wave", "do the ready ones in parallel" or "move everything possible forward".
---

# /story-wave — A wave of stories in parallel

A wave is the set of READY stories with no pending dependencies that do not step on each
other. Each goes in its own worktree and branch, with an implementer and then an independent
reviewer. Nobody merges: each story ends in a PR with green CI.

## 1. Pick the wave

```bash
npm run pm:next -- --json      # review, free ready stories (by stage, what they unblock, priority) and waiting ones
```

Propose 2 to 4 stories from `next` that do not touch the same files or shared resources (one
migration per wave, only one resetting the database). Wait for the user to confirm.

## 2. Prepare the worktrees

For each story:

```bash
npm run pm:start -- US-NNN           # in progress + branch from origin/main
git switch main                          # main checkout goes back to its branch
git worktree add ../wt/US-NNN <branch>
```

Install dependencies in each worktree before launching anyone.

## 3. Implement and review (subagents, in parallel)

Per story, an implementer subagent in its worktree, briefed to: read the README, implement the
plan, `npm run pm:check` clean, tick only what was verified, `npm run pm:log`,
`npm run pm:advance -- US-NNN IN_REVIEW` and `npm run pm:pr`.

When it finishes, the `criteria-reviewer` subagent reviews that worktree. If something is
missing, it goes back to the implementer with the list. If two subagents will reserve numbers
(ADRs, findings, migrations), assign them before launching.

## 4. Close the wave

- Summarize per story: PR, status of CI, what is still open and decisions the user must make.
- The user asks for the merge. Then rebase branches that clash on `.pm/backlog.md` (regenerate with `npm run pm:backlog`).
- `git worktree remove` the merged ones and `npm run pm:next` for the next wave.
