---
title: Vocabulary
description: Permissions, procedures, events, queues, contract members, database objects, env vars, React.
---

# Vocabulary

## Permissions, procedures, events, queues

Four vocabularies that look alike and mean different things.

| Kind | Grammar | Example |
|---|---|---|
| **Permission key** | `<module>.<subject>.<action>[.<qualifier>]`, action **imperative** | `task.reactivate`, `task.update.self` |
| **Procedure path** | `<subject>.<action>`, mirrors the permission it requires | `task.reactivate` |
| **Activity / event name** | `<subject>.<action>`, action **past tense** | `task.reactivated` |
| **Log event code** | `<subject>.<thing>.<state>`, state **past tense** | `queue.job.failed` |
| **Queue name** | `<domain>.<work>`, noun-ish | `embedding.generate` |
| **Repeatable job key** | `schedule.<name>` | `schedule.overdue-sweep` |

**Permission actions are imperative because they name a capability you hold; activity names are past
tense because they record something that happened.** `task.reactivate` is a right.
`task.reactivated` is a fact. Keeping them distinct is what makes an audit log readable.

**The qualifier vocabulary is closed**: `.self`, `.goal`, `.global`, `.org`. Do not invent `.own` or
`.mine` alongside `.self`.

**Procedure paths mirror their permission where the mapping is 1:1**, and the `ProcedurePermissions`
map stays explicit regardless. An identity-looking map is still the thing that fails closed when
someone adds a procedure and forgets the entry
([10](../setup/10-contracts-package.md), [24](../setup/24-web-app.md)).

**REST paths** on `.route({ path })` are kebab-case, plural resources, braced params matching the
contract field name: `/tasks/{taskId}/reactivate`.

**A log event code is not an activity name.** An activity is a business fact a user may read
(`task.reactivated`); a log event is a diagnostic an operator reads (`queue.job.failed`). Both are
past tense because both record something that already happened, and they live in different catalogs
with different sinks — see [`@loadbearing/observability`](../../packages/observability/docs/index.md).
Never emit one where the other belongs: a business fact in stdout is lost on restart, and a
diagnostic in Postgres is a retention bill.

## Error codes

`SCREAMING_SNAKE_CASE`, and the union is closed — `ERROR_CATALOG` is the whole vocabulary. A code is
a fact about a failure, never a sentence: `Error.message` **is** the code, and every word a user
reads lives in `@loadbearing/content` keyed by that code
([09](../setup/09-errors-package.md), [20](../setup/20-content-package.md)).

## Contract members

Every `*Contract` class uses the same static member names, so reading one is reading all of them.

| Member | Holds |
|---|---|
| `entity` | the full resource shape |
| `create` | creation input |
| `update` | patch input |
| `listQuery` | filter / pagination input |
| `<verb>` | any domain action's input — `reactivate`, `approve` |

Derived types follow the schema name: `TaskDto` from `entity`, `CreateTaskInput` from `create`.
**`Dto` for wire shapes, `Input` for procedure inputs**, never both on one type.

## Database

| Object | Convention | Example |
|---|---|---|
| Table | `snake_case`, **plural** | `goal_members` |
| Column | `snake_case`, singular | `assignee_id` |
| Foreign key | `<referenced_singular>_id` | `goal_id` |
| Boolean column | `is_` / `has_` prefix | `is_system` |
| Timestamp column | `<verb>ed_at` | `reactivated_at` |
| Unique index | `<table>_<cols>_uq` | `goal_member_uq` |
| Regular index | `<table>_<cols>_idx` | `goal_member_user_idx` |
| Enum values | `snake_case` | `in_progress` |
| Drizzle export | `camelCase` plural, matching the table | `goalMembers` |

**Zod enums mirror the DB enum values exactly** — `in_progress`, never `IN_PROGRESS` or
`InProgress`. One string travels from Postgres to a React `<select>` with no mapping layer to drift.

## Packages, env, React

- **Packages:** `@loadbearing/<single-lowercase-word>`. Scope by layer, never by feature — no
  `@loadbearing/task-contracts`.
- **Env vars:** `SCREAMING_SNAKE_CASE`, prefixed by subsystem: `DATABASE_URL`, `S3_BUCKET`.
  Client-exposed vars carry the framework's public prefix and nothing else does. Read once in
  `apps/*/src/env.ts` and passed down — Biome's `noProcessEnv` enforces that everywhere else.
- **React components:** `PascalCase` export in a kebab-case file — `task-card.tsx` exports
  `TaskCard`.
- **Hooks:** `use<Noun>` — `useCapabilities`.
- **Props type:** `<Component>Props`, same file.
- **Handler props:** `on<Event>`; the implementations filling them: `handle<Event>`.
- **Query factories:** `<Subject>Queries` / `<Subject>Mutations` in `@loadbearing/query`, never in
  `api-client`.
- **Query keys** mirror the procedure path, params last: `["task", "list", { goalId }]`. Never
  hand-written at a call site.
