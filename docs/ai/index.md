---
title: AI
description: Everything written for coding agents rather than for people. The task router — one row per thing you might be about to do — plus the rules and the skill run books it points at.
---

# AI

Material written for a coding agent to load, as opposed to `docs/opinions/` (the argument, written
to be read and reviewed) and `docs/setup/` (the build order, walked once).

`loadbearing` is a pnpm-workspace starter kit: TanStack Start web app + standalone worker over a
layered, port-and-adapter package graph. Postgres + pgvector, two Redis instances (cache and queue,
deliberately separate), S3, stdout → Loki, ClickHouse behind a driver flag.

## Open the row that matches what you are about to do

None of the rule files is longer than ~650 tokens. Read one or two, not all of them.

| About to | Read |
|---|---|
| Place a new file or folder | [`rules/files.md`](rules/files.md) + [`rules/folders.md`](rules/folders.md) |
| Write an import or a barrel | [`rules/imports.md`](rules/imports.md) |
| Name a class, port, or method | [`rules/classes.md`](rules/classes.md) |
| Name a permission, event, table, or env var | [`rules/vocabulary.md`](rules/vocabulary.md) |
| Add a table, migration, or store | [`rules/data.md`](rules/data.md) |
| Add a dependency | [`rules/dependencies.md`](rules/dependencies.md) |
| Decide which package something belongs in | [`rules/layering.md`](rules/layering.md) |
| Write a comment | [`rules/comments.md`](rules/comments.md) |
| Style anything — a colour, a component, a stylesheet | [`rules/color.md`](rules/color.md) |
| Decide how much structure to build | [`rules/simplicity.md`](rules/simplicity.md) |
| Run, verify, or commit a change | [`rules/workflow.md`](rules/workflow.md) |
| Write a commit message, a PR body, or a branch name | [`rules/workflow.md`](rules/workflow.md) — and never name yourself as author, co-author, or contributor |
| Add a feature slice | [`skills/add-slice.md`](skills/add-slice.md) |
| Write or extend a package's `docs/` | [`skills/add-docs.md`](skills/add-docs.md) |
| Get the whole rulebook, not one topic | [`rules/index.md`](rules/index.md) |
| Understand *why* a rule exists | [`docs/opinions/`](../opinions/index.md) |
| Understand how a package was built | [`docs/setup/`](../setup/00-README.md), in build order |
| Understand the running stack | [`docs/infra/`](../infra/index.md) |

Do not work from the surrounding code's example. This repository's conventions are stated, and a
convention you infer will be wrong in the ways that matter.

## What is here

- **[`rules/`](rules/index.md)** — the rules, one file per topic. A rule is stated there when not
  knowing it causes a *silent* violation: code that compiles, lints, and passes review while being
  wrong. Everything you would naturally look up is a reference instead.
- **[`skills/`](skills/index.md)** — run books, the executable checklist form of a procedure.
  Reached by name: `/add-slice`, `/add-docs` in Claude Code, or the file directly.

## How an agent reaches this

```
AGENTS.md                       ← the only file loaded unprompted (~180 tok)
  └── docs/ai/index.md          ← this file: routes by task
        ├── rules/<topic>.md    ← open the one or two a task needs
        └── skills/<name>.md    ← the run book for a procedure

CLAUDE.md                       ← Claude Code only; imports AGENTS.md
.claude/skills/<name>/          ← Claude Code only; user-invoked, points at skills/<name>.md
```

**Nothing loads that a task does not need.** Between `AGENTS.md` and `CLAUDE.md` that is under 300
tokens holding no rules at all — only where to look. A task that adds a dependency then reads ~470
tokens; one that places a file reads ~980. The whole rulebook is ~6,500 and nothing reads all of it.

**One copy of every document, and the rest are pointers.** `skills/<name>.md` is the run book;
`.claude/skills/<name>/SKILL.md` exists so Claude Code can surface it as `/<name>` without a second
copy drifting from the first.

## What keeps it honest

`rules/` is a digest of `docs/opinions/`, which means it is a second copy of every rule it states.
`check-architecture.mjs` §12 closes that loop. It fails when an opinions page exists that no rule
file cites, when a rule file is routed to from none of `AGENTS.md`, this file, or `rules/index.md`,
or when any of them routes to a path that does not exist — backticked or as a Markdown link. A tenth
opinions page cannot land while the digest silently omits it, and a rule file cannot be orphaned or
deleted without the build noticing.

It does **not** check that a rule file's summary of its page is still *accurate*. That is why every
file in `rules/` ends with the line saying `docs/opinions/` wins any disagreement.
