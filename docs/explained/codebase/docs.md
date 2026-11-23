---
title: The docs folder
description: The written rules, the arguments behind them, the build order, the running stack.
---

# The docs folder

> Part of the [codebase guide](index.md). Every file below is described in plain words; the [architecture page](../architecture.md) explains how the parts work together.

`docs/` is the repository's written knowledge. It is plain Markdown, read on GitHub or in an editor; it is not the in-app docs system.

- `ai/` holds the rules, stated flatly and short enough for an AI agent to load whole.
- `opinions/` holds the argument behind each rule: the failure it prevents.
- `infra/` explains the running Docker stack.
- `explained/` is this plain-language guide.

These pages (`explained/`) are listed in the guide's own index rather than here.

This page covers 103 files.

## Every file

### `docs/`

| File | What it does |
|---|---|
| `index.md` | The documentation trees and what each is for — the rules an agent loads, the argument behind them, the running stack, this guide and the plans. |

### `docs/ai/`

| File | What it does |
|---|---|
| `index.md` | Everything written for coding agents rather than for people. The task router — one row per thing you might be about to do — plus the rules and the skill run books it points at. |
| `meta.json` | Sidebar order. |

### `docs/ai/rules/`

| File | What it does |
|---|---|
| `classes.md` | Role nouns for seams, technology prefixes for implementations, the method vocabulary, and the assert/can split. |
| `color.md` | Every colour is one of the twelve custom properties, read as var(). The one file allowed to write a literal, how to derive a state, and why a hex passes every other check. |
| `comments.md` | Line comments only, two lines maximum, and where the reasoning goes instead. |
| `data.md` | Which store owns which data, what is derived, and what is non-negotiable in any new schema. |
| `dependencies.md` | The catalog, the four tiers, and the four questions that decide which tier a new dependency lands in. |
| `explaining.md` | Rule: how to explain something so the reader ends up with the right picture: answer first, plain words first, problem before solution, verify before explaining. |
| `files.md` | Kebab-case everywhere, the closed set of role suffixes, one class per file, where tests go. |
| `folders.md` | What src/ may hold, role folders vs subject folders, and the two exceptions worth knowing before you place a file. |
| `imports.md` | One entrypoint, barrels that name every export, the three import rules, and the one outside surface. |
| `index.md` | The rules an agent must know unprompted, one file per topic. A digest of docs/opinions/ — that directory holds the argument, these files hold the rule. |
| `layering.md` | The one-way dependency graph, the server-only boundary, and where a concrete adapter may be named. |
| `meta.json` | Sidebar order. |
| `simplicity.md` | The tie-breaker when two designs satisfy every other rule: the least structure that achieves the goal. |
| `visibility.md` | Rule: the reasons something can be missing from a screen (flag, entitlement, permission, widget preference), who controls each, and what the API answers. |
| `vocabulary.md` | Four grammars that look alike and mean different things, plus the naming rules whose violation is silent. |
| `workflow.md` | The commands, what to run before claiming a change is done, the commit convention, who a commit is authored by, and where the feature run book lives. |

### `docs/ai/skills/`

| File | What it does |
|---|---|
| `add-docs.md` | The run book for writing docs/ inside a package — what index.md must answer, when a reference page earns its place, and the meta.json that orders them. |
| `add-slice.md` | The twelve-step path a feature takes through the packages, as an executable checklist. Setup 27.4 is the reasoning; this is the run book. |
| `index.md` | Run books — the executable checklist form of a procedure that touches many packages in a fixed order. |
| `meta.json` | Sidebar order. |

### `docs/infra/`

| File | What it does |
|---|---|
| `deployment.md` | One VPS now, managed services later — what changes, what never changes, and the order to move things in when it stops fitting on one box. |
| `index.md` | The local stack — every file, every service, and how they reach each other. Nine containers, two profiles, one bridge network. |
| `meta.json` | Sidebar order. |

### `docs/infra/reference/`

| File | What it does |
|---|---|
| `alloy.md` | The log pipeline component by component — two sources, six stages, four labels, and the three leaks that only a running system reveals. |
| `clickhouse.md` | The analytics store that is defined and deliberately not running — the schema, every clause in it, and the trigger that would start it. |
| `compose.md` | Fifteen services, five profiles, eight volumes and one network — what every block does and which parts are load-bearing. |
| `loki.md` | Every block of Loki's config — single-binary mode, MinIO-backed storage, thirty-day retention, and the two settings that stop it inventing labels. |
| `mailpit.md` | The SMTP sink — every outbound mail is caught and displayed, none is delivered. One env var separates it from a real provider. |
| `meta.json` | Sidebar order. |
| `minio.md` | The S3 stand-in, its two unrelated consumers, and the one-shot container that creates both buckets. |
| `pgbouncer.md` | Transaction-mode pooling — the startup-parameter trap, the role floor that closes it, and the two verbs that are not interchangeable. |
| `postgres.md` | The source of truth — the pgvector image, the three extensions, and why the init script runs exactly once. |
| `redis.md` | Two instances with opposite durability guarantees, every flag explained, and why one container was the wrong answer. |

### `docs/opinions/`

| File | What it does |
|---|---|
| `classes.md` | Plain role nouns for seams, technology prefixes for implementations, and a closed method vocabulary. |
| `comments.md` | Line comments only, two lines maximum, and the argument for a design lives in docs/reference instead. |
| `data-and-scale.md` | Which store owns which data, what is derived, what to build now, and the order every scaling move happens in. |
| `dependencies.md` | Four tiers by what a dependency can constrain, why framework-agnostic is not runtime-agnostic, and which layer may name what. |
| `files.md` | Kebab-case everywhere, a dot-suffix for every architectural role, one class per file. |
| `folders.md` | src/ holds index.ts, import.ts, and folders. Role folders by default, subject folders where contents repeat per feature. |
| `imports.md` | index.ts is what a package gives, import.ts is what it takes. Barrels name every export; export * is banned. |
| `index.md` | The positions this repository takes, stated flatly. Naming, folders, imports, classes, vocabulary, data ownership, visibility, simplicity, comments. |
| `meta.json` | Sidebar order. |
| `simplicity.md` | The least structure that achieves the goal — and performance is part of the goal, not the thing traded away to reach it. |
| `visibility.md` | Four independent reasons something is missing from a screen — a flag, an entitlement, a permission, a widget preference — the order they resolve in, and the one answer to "why is it gone". |
| `vocabulary.md` | Permissions, procedures, events, queues, contract members, database objects, env vars, React. |

### `docs/plans/`

| File | What it does |
|---|---|
| `BACKLOG.md` | Every task not yet done, in one place, numbered by section. Most wait on hardware, real traffic or a trigger date. |
| `index.md` | Contents page for the plans: what is live here, and what holds the open work. |
| `meta.json` | Sidebar order. |
| `HANDOFF.md` | Where the last plan stopped and how to pick the work up on a new machine: setup steps, test accounts, how each phase was checked, and the traps that cost time. |

