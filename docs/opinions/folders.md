---
title: Folders
description: src/ holds index.ts, import.ts, and folders. Role folders by default, subject folders where contents repeat per feature.
---

# Folders

## `src/` holds `index.ts`, `import.ts`, and folders. Nothing else

Two files at the root, and both are surfaces rather than code: `index.ts` is what the package
gives, `import.ts` is what it takes ([Imports and exports](imports.md)). Every other file lives in
a folder.

```
packages/errors/src/          packages/permissions/src/     packages/content/src/
├── index.ts                  ├── index.ts                  ├── index.ts
├── catalog/                  ├── capability/               ├── import.ts
├── error/                    ├── catalog/                  ├── message/
├── normalizer/               ├── gate/                     ├── primitive/
└── transport/                ├── registry/                 ├── source/
                              └── route/                    └── translator/
```

**Why the root is closed.** A loose file at `src/` root has no stated kind, so nothing tells you
where the next one goes — and "just this one helper" is how `utils.ts` gets born. Keeping the root
to two named surfaces means every question about placement has an answer that is already written
down.

The cost is real and worth paying: `errors/src/normalizer/` holds one file, and
`content/src/translator/translator.ts` stutters. **Accept both.** A folder that holds one thing
today needs no move when it holds three, and a rule with no judgement call in it is a rule nobody
has to litigate in review.

## Every folder has an `index.ts`

That is what lets you move a file within a folder without touching a single import elsewhere. The
barrel names every symbol it publishes — never `export *` ([Imports and exports](imports.md)).

**One exemption: `packages/content/src/message/en/` and `bn/`.** Nothing merges those files; they
are reached only by string-literal `import()` from `message/catalog.ts`, and that is what splits
them into one chunk per locale × namespace. A barrel there would be dead weight that anyone could
accidentally import and collapse the split. See [20](../setup/20-content-package.md).

## A folder is named after its role, and the vocabulary is shared

**The default is a role folder: the folder name says what kind of thing is inside.** The same kind
gets the same name in every package, so `catalog/` means the same thing in `errors` and in
`permissions`, and knowing one package teaches you the next.

| Folder | Holds | Used by |
|---|---|---|
| `primitive/` | standalone value types and small classes with no layer role | `core`, `content`, `contracts` |
| `catalog/` | team-owned fragments plus a platform-owned `index.ts` that merges them | `errors`, `permissions`, `contracts` |
| `registry/` | singleton lookup classes over a catalog | `permissions`, `contracts` |
| `capability/` | the resolution algorithm over a registry | `permissions` |
| `error/` | `AppError` subclasses, one per code that carries context | `errors` |
| `normalizer/` | boundary converters — unknown in, known shape out | `errors` |
| `transport/` | protocol mappings; the only place a wire format is named | `errors` |
| `source/` | an abstract seam plus its implementations | `content` |
| `translator/` | interpolation and fallback over a message bundle | `content` |
| `message/` | keyed copy, split by locale and namespace | `content` |
| `gate/` | module gates, fragment-per-slice | `permissions` |
| `route/` | declared destinations, fragment-per-slice | `permissions` |
| `procedure/` | the merged oRPC contract every slice's `.procedures.ts` feeds | `contracts` |
| `event/` | type-only declarations of what an event carries | `observability` |
| `logger/` | the diagnostic seam and its sinks | `observability` |
| `port/` | abstract classes for cross-cutting infrastructure, zero implementations | `application` |
| `schema/` | every table declaration, plus the barrel drizzle-kit is pointed at | `db` |
| `transaction/` | the `UnitOfWork` seam and the scope it reads | `db` |
| `seed/` | idempotent seeds, run after migration | `db` |
| `migrate/` | the migration runner | `db` |
| `consumer/` | queue consumers | `apps/worker` |
| `schedule/` | repeatable jobs | `apps/worker` |

**Non-plural, always.** `tasks/` and `task/` coexisting in different packages is exactly the
ambiguity this removes.

**Adding a name to this table is a decision, not a side effect.** If a new folder wants a name that
already means something else here, it is the wrong name.

## Where the contents repeat per feature, the folder is the subject instead

A role folder is right when the package has one of each thing. It is wrong when the package has one
of each thing *per feature* — twenty schemas in one directory next to twenty repositories in another
means a team owns files in two places and neither place belongs to anyone.

**So: if a folder's contents would repeat once per feature slice, name the folder after the
subject.**

```
packages/contracts/src/                not:  packages/contracts/src/
├── index.ts                                 ├── contract/
├── import.ts                                │   ├── task.contract.ts
├── task/                                    │   └── goal.contract.ts
│   ├── index.ts                             ├── entity/
│   ├── task.contract.ts                     │   ├── task.entity.ts
│   ├── task.entity.ts                       │   └── goal.entity.ts
│   └── task.procedures.ts                   └── procedure/
├── goal/                                        ├── task.procedures.ts
└── primitive/                                   └── goal.procedures.ts
```

> [!NOTE]
> **`packages/db` deliberately does not follow this**, and it is the clearest place to see the
> trade. Its tables live in one `schema/` folder — because `drizzle.config.ts` must be pointed at a
> single barrel that names every table, and `drizzle(pool, { schema })` needs the same namespace at
> runtime for Better Auth's adapter to find its tables at all. One folder is what those two tools
> require, so `schema/rbac.schema.ts` and `rbac/pg-capability.repository.ts` do sit in two
> directories. The rule above still describes the default; `db` is the exception, and it is an
> exception because a tool demanded it rather than because it read better.

A subject folder is singular, and **every file inside is prefixed with the folder's name**. The
folder is the subject; the suffix is the role. A path tells you both without opening anything.

```
packages/contracts/src/task/
├── index.ts
├── task.contract.ts
├── task.entity.ts
└── task.procedures.ts
```

Subject folders repeat across packages by design: `contracts/task/`, `application/task/`,
`query/task/`, `feature/task/`, `web/route/task/`. One glob per team —
`packages/*/src/<slice>/**`. In `db` a slice is split across `schema/task.schema.ts` and
`task/pg-task.repository.ts`, for the tooling reason above.

**Which packages are which.** `core`, `errors`, `permissions`, `observability`, `content`,
`composition`, `api-client` are role-organised — they hold one of each thing. `application`, `db`, `query`,
`feature` are subject-organised — they hold one of each thing per slice. `infrastructure` is
role-organised with the folder named after the *capability* (`cache/`, `storage/`, `queue/`,
`embedding/`, `analytics/`) and the file named after the technology, so a vendor swap is visibly
local. It holds only vendors application code **imports** — a log platform the code never names has
no folder here, because there would be nothing to put in it. `ui` is
the third kind: one folder per exported component.

**`contracts` is both, and that is the clearest illustration of the rule.** Its shared vocabulary
and its two merge points are role folders — `primitive/`, `procedure/`, `catalog/`, `registry/` —
because there is exactly one of each. Its subjects are subject folders, because there is one per
slice. Nothing about the package had to choose; each folder answered the question on its own.

**Two things that look like slices and are not.** `db/src/vector/` and `db/src/analytics/` are
infrastructure, which is why they sit alongside `rbac/` rather than inside a slice. And repository
*ports* live in the slice, not in `application/src/port/` — `port/` is for capabilities the whole
system shares, and putting `TaskRepository` there would make that folder grow by one file per
feature forever.

**The test for `port/` is what a new feature adds, not what the port is called.** `AnalyticsReader`
lives there and looks slice-shaped — `goalRiskScores`, `reliabilityTrend` — but a second feature
adds a *method* to it, not a second file beside it. `TaskRepository` is the opposite: every feature
brings its own. One cross-cutting seam that many subjects ask questions of belongs in `port/`; one
seam per subject belongs with the subject.

## Build-time artefacts sit above `src/`

`drizzle.config.ts`, `migrations/`, `build-sprite.mjs`. They are not shipped code, and `src/` is
the shipped surface.
