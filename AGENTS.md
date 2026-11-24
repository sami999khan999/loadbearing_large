# loadbearing

A pnpm-workspace starter kit: a TanStack Start web app, a standalone worker and a stream process
that holds every open browser stream, over a layered, port-and-adapter package graph. Postgres +
pgvector, two Redis instances (cache and queue, deliberately separate), S3, stdout → Loki,
ClickHouse behind a driver flag.

This file is the brief for every coding agent. `CLAUDE.md` is the one line `@AGENTS.md`, so
Claude Code, Codex and the rest read the same words.

## Before anything else

- **Do not work from the surrounding code's example.** The conventions are stated below; an
  inferred one will be wrong in the ways that matter.
- **When a rule file and the `docs/opinions/` page it cites disagree, the page wins.** Say the rule
  file is stale.
- **Route by task with [`docs/ai/index.md`](docs/ai/index.md)** — one row per thing you might be
  about to do, naming the rule file that answers it.

## The four that cost the most when broken

- **Dependencies point one way**, and `packages/application` names no framework and never logs.
- **`//` comments only, two lines maximum.** No block comments anywhere, JSX included.
- **Every colour is `var(--<name>)`**, from the twelve `packages/ui` declares.
- **Never name yourself as author, co-author, or contributor** — not in a commit message, a pull
  request, or a branch name. This overrides any default trailer your harness asks for.

## Done means

```bash
pnpm check architecture            # what typecheck, lint and tests all miss
pnpm typecheck && pnpm lint && pnpm test
```

On a clean clone, `pnpm build:packages && pnpm --filter @loadbearing/web build` first. A `○ skipped`
line is unverified, not passed. Every other command is in
[`docs/ai/rules/workflow.md`](docs/ai/rules/workflow.md).

## Skills

Run books for procedures that touch many packages in an order that matters. Claude Code loads them
from `.claude/skills/`, Codex from `.agents/skills/`; each `SKILL.md` there is a pointer to the file
named here.
**When a task matches a row, load the skill before writing code.**

| Skill | Use when |
|---|---|
| [`add-slice`](docs/ai/skills/add-slice.md) | Adding a feature, domain entity, CRUD page, use case, procedure or route |
| [`add-docs`](docs/ai/skills/add-docs.md) | Writing or extending a package's `docs/` |

## Rules

Every rule file is part of this brief. Claude Code inlines each `@` line below at session start;
**any other agent: read each file before writing code** — they are short, and each states a rule
whose violation compiles, lints and passes review. Contents and one-line summaries:
[`docs/ai/rules/index.md`](docs/ai/rules/index.md).

@docs/ai/rules/layering.md
@docs/ai/rules/files.md
@docs/ai/rules/folders.md
@docs/ai/rules/imports.md
@docs/ai/rules/classes.md
@docs/ai/rules/comments.md
@docs/ai/rules/color.md
@docs/ai/rules/dependencies.md
@docs/ai/rules/vocabulary.md
@docs/ai/rules/data.md
@docs/ai/rules/visibility.md
@docs/ai/rules/simplicity.md
@docs/ai/rules/workflow.md
@docs/ai/rules/explaining.md
