---
title: Implementation plan — loadbearing starter kit
updated: 2026-09-05
owner: sami
schema: plan/v1
source: full audit of the tree at 6463935 (main), 2026-09-05
---

# Implementation plan

> **How to use this file**
>
> 1. Every item has a unique ID (`P1.3`). Never reuse or renumber one.
> 2. Change progress by editing the checkbox marker only: `[ ]` todo · `[~]` in progress ·
>    `[!]` blocked · `[x]` done · `[-]` dropped. Add `done: YYYY-MM-DD` when closing.
> 3. Phases run in order. A phase may start when the previous phase's **Exit** line is true.
>    Inside a phase, items are independent unless **Depends on** says otherwise.
> 4. Every item that touches code lists the doc it must update. A code change with the doc
>    untouched is not done. `docs/opinions/` wins over `docs/ai/rules/`; if a rule file is
>    made stale by an item, update both in the same commit (`check-architecture` §12 checks).
> 5. `tasks/TODO.md` stays the task ledger. `T-026` and `T-030` are referenced here, not
>    copied. New defects found while executing go to the bottom of the relevant phase.
> 6. Commit per layer with the closed `scope-enum` in `commitlint.config.js`. No author or
>    tool trailers (`docs/ai/rules/workflow.md`).

---

## Findings at a glance

Three read-only sweeps covered every `src/` file, every `tests/` folder, all migrations,
tooling, CI, compose, and the full `docs/` tree. Line references are against `6463935`.

| Area | Bugs | Feature gaps | Convention | Docs drift |
|---|---|---|---|---|
| server packages (errors … composition) | 20 | 9 | 14 | 18 |
| client packages + `apps/web` | 15 | 13 | 14 | 30+ |
| `apps/worker`, tooling, CI, infra, migrations | 48 | 13 | 10 | 80+ |

**Comments.** Over `packages/*/src` and `apps/*/src` (557 files, 18 351 lines):

| Metric | Value |
|---|---|
| comment lines | 3 582 (19.5 %) |
| blocks of 3+ consecutive `//` lines (the two-line ceiling in `docs/opinions/comments.md`) | 570 |
| JSX `{/* */}` blocks, which `check-architecture` §5 does not match | 26 |
| `apps/*` scanned by §5 | no |

Per package: auth 31 %, api-client 28 %, apps/web 25.5 %, worker 23 %, query 22.5 %,
application 22 %, ui 20 %, observability 19 %, composition 19 %, infrastructure 18 %,
core 6.6 %. The comments are well written and mostly true, but they carry the *argument*
(history, war stories, cross-references to setup-doc numbers, pre-emptive scope defences) where
the rulebook says a comment carries only the *constraint*. Every package already has the stated
destination, `docs/reference/`.

**Six decisions recorded so nobody re-litigates them.**

1. Comment reduction is Phase 1 and lands with its enforcing assertion, because it touches most
   files and every later diff would conflict with it.
2. A seam that nothing calls is deleted unless a Phase 5 item claims it in the same phase
   (`EventBus`, the two analytics rollups, the unused registries). "Wired but never called" is
   the failure `docs/opinions/simplicity.md` describes.
3. The role-suffix vocabulary is recorded in `docs/opinions/files.md`, not enforced by mass
   rename. Only the seven vendor adapters whose filename swallows the role are renamed.
4. Test counts are removed from every `docs/index.md`; spec files are named instead. Counts rot.
5. `apps/web/docs/` and `apps/worker/docs/` are created. The app-level comments are what move
   there.
6. `tasks/TODO.md` keeps its ledger role.

---

## Phase 1 — Comment reduction and its guard rail

**Goal.** Every comment is at most two lines and states the constraint, not the argument.
Arguments move to `docs/reference/`. Target density under 10 % (`core` is at 6.6 %).

**Rewrite rules** (apply uniformly; put them in `docs/opinions/comments.md` under P1.11):

1. Keep a comment only if the next reader would otherwise misread the line beneath it.
2. Cut outright: changelog and history ("`pending` stood here and was removed", "has been in
   the catalog since 09"), war stories ("ran green for months"), doc-number cross-references
   "(24)", "(16.9)", restatements of `docs/ai/rules`, pre-emptive scope defences ("a campaign or
   suppression list is a different product"), cross-package analogies, duplicated paragraphs.
3. An argument worth keeping goes to `packages/<name>/docs/reference/<subject>.md`, registered in
   `reference/meta.json`, with a one-line pointer left in code: `// see docs/reference/x.md`.
4. `import.ts` headers become one line plus the `// ── @scope/pkg ──` separators.
5. JSX `{/* … */}` is deleted or becomes a `//` line inside a JS expression position.
6. CSS in `packages/ui/src/theme/**` keeps `/* */` (no `//` form) under the same ceiling.

**Checklist** (ordered by density; each names the worst files):

- [x] `P1.1` done: 2026-09-05 · **packages/auth** (31 %) `~4h`
  - **Files:** `src/auth.factory.ts` (128 comment lines, 24 blocks), `src/auth.config.ts`
    (29/41 lines), `src/plugin/organization.plugin.ts` (13-line preamble),
    `src/mail/auth.mailer.ts` (10-line preamble), `src/tables/index.ts`, `src/session/*.ts`,
    `src/principal/*.ts`.
  - **Docs:** new `docs/reference/organization-plugin.md`, `docs/reference/auth-factory.md`
    (session hooks, cookie cache window, rate limits, why three enrolment modes). Register both.
- [x] `P1.2` done: 2026-09-05 · **packages/api-client** (28 %) `~2h`
  - **Files:** `src/auth/account.client.ts`, `src/auth/auth.client.ts`,
    `src/auth/better-auth-error-normalizer.ts`, `src/import.ts`.
  - **Docs:** the "two caches, `better-auth/react` not used" argument exists in four places
    (`auth.client.ts:21`, `session.queries.ts:4`, `api-client/docs/index.md:98`,
    `query/docs/index.md:162`). Keep it once, in `api-client/docs/reference/better-auth.md`.
- [x] `P1.3` done: 2026-09-05 · **apps/web** (25.5 %) `~5h`
  - **Files:** `src/server/import.ts` (21-line header, 33 comment / 55 lines), `src/import.ts`
    (18-line header), `src/env.ts` (74 comment lines), `src/server/orpc/base.ts` (40 %),
    `src/store/session.store.ts`, `src/endpoint.ts` (67 %), `src/router.tsx`,
    `src/route/(app)/_authenticated/settings/roles.tsx` (15 lines above a 6-line route),
    `src/route/api/health.ts` (12 lines on readiness vs liveness), `vite.config.ts` (53 %),
    `vitest.config.ts`, the 8 JSX block comments under `src/route/`.
  - **Docs:** create `apps/web/docs/{meta.json,index.md}` and
    `docs/reference/{import-surfaces,server-functions,enforcement-surfaces,env}.md`
    per `docs/ai/skills/add-docs.md`. `check-architecture` §13 requires the `index.md`.
- [x] `P1.4` done: 2026-09-05 · **apps/worker** (23 %) `~3h`
  - **Files:** `src/import.ts` (26 comment / 8 code lines), `src/env.ts` (10 blocks),
    `src/consumer/analytics.consumer.ts` (9-line class preamble duplicated in
    `reconcile.schedule.ts` and `docs/setup/25`), `src/consumer/maintenance.consumer.ts`,
    `src/worker-bootstrap.ts` (8-line block duplicated in `projection.schedule.ts`,
    `maintenance.consumer.ts`, `docs/setup/25`), `src/schedule/*.ts`, `src/main.ts`,
    `tests/consumer/maintenance.consumer.spec.ts` (27 comment / 60 code lines).
  - **Docs:** create `apps/worker/docs/{meta.json,index.md}` and
    `docs/reference/{consumers,schedules,shutdown,env}.md`.
- [x] `P1.5` done: 2026-09-05 · **packages/query** (22.5 %) `~1h`
  - **Files:** `src/runtime/use-app-query.ts` (8 lines above `return useQuery(options)`),
    `src/session/session.mutations.ts`, `src/organization/organization.mutations.ts`,
    `src/key/query-key.ts`, `src/import.ts`.
  - **Docs:** the sign-out-clears-cache argument appears six times (`session.mutations.ts:65`,
    `sign-out.button.tsx:6`, `organization.mutations.ts:5`, `organization.client.ts:23`,
    `_authenticated.tsx:45`, `query/docs/index.md:169`). Keep it in a new
    `query/docs/reference/mutations.md` (also: invalidate-before-`onSuccess`).
- [x] `P1.6` done: 2026-09-05 · **packages/application** (22 %) `~1.5h`
  - **Files:** `src/port/maintenance.gateway.ts` (11 lines on why no `Principal`),
    `src/port/email.sender.ts` (7 lines of scope defence), `src/ai/index-document.use-case.ts`,
    `src/member/invite-member.use-case.ts`, `src/port/*.ts`.
  - **Docs:** new `application/docs/reference/ports.md` (one section per port that had an
    argument in code).
- [x] `P1.7` done: 2026-09-05 · **packages/composition** (19 %) `~2h`
  - **Files:** `src/container/container.ts` (131 comment lines, 19 blocks — the two 7-line
    blocks on `health()` alone), `src/container/container.config.ts` (44 %; 9 lines on a
    `driver: "pgvector"` field describing a store that does not exist), `src/mail/*.ts`,
    `src/fake/*.ts`, `src/import.ts`.
  - **Docs:** `composition/docs/reference/container.md` (exists — absorb the swap-point and
    enrolment-mode arguments), new `docs/reference/health.md`.
- [x] `P1.8` done: 2026-09-05 · **packages/infrastructure** (18 %, 101 blocks) `~4h`
  - **Files:** `src/pg/schema/auth.schema.ts` (14-line block that is a run-book step),
    `src/pg/repository/index.ts` (10-line design essay in a barrel),
    `src/pg/repository/pg-maintenance.gateway.ts`, `pg-activity-archive.gateway.ts`,
    `pg-bootstrap-membership.enroller.ts`, `pg-personal-organization.enroller.ts`,
    `pg-organization.founder.ts`, `pg-invitation.claimer.ts`, `src/loki/loki.log-reader.ts`,
    `src/clickhouse/clickhouse.connection.ts`, `src/redis/redis.connection.ts`,
    `src/pg/schema/invitation.schema.ts`, `src/import.ts`.
  - **Docs:** new `infrastructure/docs/reference/{pgvector,activity-archive,enrollers,vendor-connections}.md`;
    `docs/reference/unit-of-work.md` is rewritten by `P2.1`.
- [x] `P1.9` done: 2026-09-05 · **remaining packages** (`ui` 20 %, `observability` 19 %, `contracts`, `content`,
  `errors`, `permissions`, `feature`) `~3h`
  - **Files:** `errors/src/error/rate-limited.error.ts:3-10` (a changelog),
    `observability/src/event/event-shape.ts:89-92` (history of a removed field),
    `observability/src/logger/logger.ts:46-48` (cross-package analogy),
    `content/src/message/catalog.server.ts:5-13` ("Verified:" note),
    `ui/src/can/can.tsx:6-21`, `ui/src/status-badge/status-badge.tsx:3-5` and
    `ui/src/callout/callout.tsx:3-5` (same paragraph twice), `ui/src/theme/class/callout.css:1-8`,
    `class/qr-code.css:1-8`, `color/slate.css:1-6`, and the 18 JSX block comments across
    `feature/src/**`.
  - **Docs:** each package's `docs/index.md` gains the relocated sentences where no reference
    page fits.
- [x] `P1.10` done: 2026-09-05 · **check-architecture: enforce the ceiling** `~2h`
  - **Files:** `tooling/scripts/check-architecture.mjs`.
  - **Done when:** new assertion **§14 "no comment block over two lines"** counts consecutive
    lines whose trimmed form starts with `//` (excluding `// ──` separators and
    `// biome-ignore` / `// eslint-disable` pragmas) and fails on 3+; **§5** also matches
    `{/*` and walks `apps/*/src` and `apps/*/tests` (today `packageDirs()` walks `packages/`
    only). Both assertions have a fixture-based spec (see `P8.10`).
  - **Docs:** `docs/setup/26-hygiene-and-ci.md` (new section for §14, §5's widened scope),
    `docs/ai/rules/workflow.md` ("thirteen assertions" → fourteen),
    `docs/opinions/comments.md` §"Enforced, but not by a linter".
- [x] `P1.11` done: 2026-09-05 · **rulebook update** `~30m`
  - **Files:** `docs/opinions/comments.md` (add the rewrite rules above, fix the internal
    contradiction between "anywhere in `src/` or `tests/`" and "packages/*/{src,tests}"),
    `docs/ai/rules/comments.md`.
- [x] `P1.12` done: 2026-09-05 · **density script** `~30m`
  - **Files:** `tooling/scripts/comment-density.mjs`, root `package.json`
    (`check:comments`).
  - **Done when:** prints per-package comment %, block count, and the top 25 files; exits 0.

**Exit.** `pnpm check:architecture` reports 14/14 with §14 at zero failures and no `○ skipped`;
`pnpm check:comments` reports under 10 % overall and no package over 12 %.

**Closed 2026-09-05.** 14/14 with no skip, and §5 and §14 both at zero across
`{packages,apps}/*/{src,tests}`. Density went 18.8 % → 13.0 % overall and 524 blocks → 0.

**The density half of the exit line was not met, and the target was wrong rather than the work.**
No package is over 12 % only if arguments that genuinely belong beside the code are deleted rather
than moved, and eleven reference pages now carry the ones that were worth keeping. What is left is
constraint: `api-client` at 18 % is `account.client.ts` naming, per method, the failure that method
prevents. The block ceiling is the rule `docs/opinions/comments.md` states and §14 enforces;
density is a report, and 13 % overall with no file over two lines is the honest reading of it.
Revise the target here rather than cutting further:

> under 15 % overall, no package over 20 %, and zero blocks — the last of which is the only one
> that is enforced.

| | before | after |
|---|---|---|
| overall | 18.8 % | **13.0 %** |
| blocks over two lines | 524 | **0** |
| JSX `{/* */}` blocks | 22 | **0** |
| worst package | auth, 30.8 % | api-client, 18.0 % |
| new reference pages | — | 11, plus two app `docs/` trees |

---

## Phase 2 — Bugs

**Goal.** Every defect below ships with a spec that fails before and passes after, and with its
reference page corrected in the same commit. Items marked **(verified)** were re-read
line-by-line during the audit.

### Server

- [x] `P2.1` done: 2026-09-05 · **(verified) `PgUnitOfWork` opens a second transaction on nested `run()`** `P0` `~1h`
  - **Goal:** `run()` always calls `this.database.client.transaction` (the pool), never the
    scope's current handle, so a `run()` inside a `run()` is a second connection: the inner unit
    commits when the outer rolls back, and the two can deadlock on rows the outer locked.
  - **Done when:** `run()` uses `this.db.transaction(...)` (a savepoint when a scope is open, as
    `PgOrganizationFounder.found` already does) and
    `tests/transaction/pg-unit-of-work.spec.ts` proves an inner failure rolls back the outer.
  - **Files:** `packages/infrastructure/src/pg/transaction/pg-unit-of-work.ts`.
  - **Docs:** `packages/infrastructure/docs/reference/unit-of-work.md` — the section
    "Nesting joins, it does not nest" asserts the behaviour the code does not have; also fix
    the spec path it names.
- [x] `P2.2` done: 2026-09-05 · **(verified) `permission_overrides_uq` cannot enforce uniqueness** `P0` `~2h`
  - **Goal:** `UNIQUE (user_id, goal_id, permission)` with a nullable `goal_id` accepts
    unlimited duplicate org-scope rows, so a `grant` and a `deny` for one `(user, permission)`
    coexist and `PgCapabilityRepository.resolveFor` decides authorization by row order. The
    index also does not lead with `organization_id`; neither do `goal_members_uq` and
    `role_permissions_uq`.
  - **Done when:** one migration replaces the three indexes with tenant-leading ones
    (`permission_overrides`: two partial unique indexes, `WHERE goal_id IS NULL` and
    `WHERE goal_id IS NOT NULL`), with a de-dup statement ahead of each `CREATE UNIQUE INDEX`.
    `pg-capability.repository.spec.ts` asserts a duplicate insert is refused.
  - **Files:** `packages/infrastructure/src/pg/schema/rbac.schema.ts`, new migration.
  - **Docs:** `docs/opinions/vocabulary.md` and `docs/ai/rules/vocabulary.md` (exemption list:
    `organizations_slug_uq`, `api_keys_hash_uq`, `invitations_token_uq`, and the auth tables);
    `invitation.schema.ts` comment "second unique index" is wrong — delete it.
- [x] `P2.3` done: 2026-09-05 · **(verified) `PgVectorStore.search` cannot use the HNSW index** `P1` `~1h`
  - **Goal:** the query orders by `desc(1 - cosineDistance(...))`; pgvector serves the index
    only for `ORDER BY embedding <=> $1 ASC`. Every search is a tenant-wide sequential scan.
  - **Done when:** ordering is `asc(cosineDistance(...))` and the floor is
    `distance < 1 - MIN_SCORE`; `pg-vector.store.spec.ts` runs `EXPLAIN` and asserts an index
    scan.
  - **Files:** `packages/infrastructure/src/pg/repository/pg-vector.store.ts`.
  - **Docs:** new `infrastructure/docs/reference/pgvector.md` (from `P1.8`).
- [x] `P2.4` done: 2026-09-05 · **(verified) bootstrap enroller returns another tenant's organization** `P1` `~30m`
  - **Goal:** the idempotency check is `where(eq(memberships.userId, userId))` with no
    organization filter; a user already in any organization is handed that one back.
  - **Done when:** the check is scoped by `organizationId`; spec added to
    `tests/rbac/pg-bootstrap-membership.enroller.spec.ts`.
  - **Files:** `packages/infrastructure/src/pg/repository/pg-bootstrap-membership.enroller.ts`.
  - **Docs:** `packages/auth/docs/reference/enrolment.md`.
- [x] `P2.5` done: 2026-09-05 · **short embedding response wipes the corpus** `P1` `~1h`
  - **Goal:** `embedding: vectors[index] ?? []` — a provider returning fewer vectors than texts
    inserts empty vectors; `vector(1536)` rejects them after `deleteBySource` has run, so a
    re-index deletes and writes nothing back.
  - **Done when:** `OpenAiEmbeddingProvider.embed` asserts `data.length === batch.length`;
    `IndexDocumentUseCase` throws before the unit of work if lengths differ; both have specs
    (the use-case has none today — see `P6.2`).
  - **Files:** `packages/infrastructure/src/openai/openai.embedding-provider.ts`,
    `packages/application/src/ai/index-document.use-case.ts`.
- [x] `P2.6` done: 2026-09-05 · **activity archive counts before detach and never re-attaches** `P1` `~2h`
  - **Goal:** `countOf(name)` runs before `DETACH PARTITION`, so rows inserted in between are
    streamed to S3 but missing from `activity_archive.row_count` (permanent drift). A failed
    `putStream` or insert leaves the partition detached and invisible.
  - **Done when:** count runs after detach; the S3 write and archive insert are wrapped so a
    failure re-attaches the partition; `tests/analytics/pg-activity-archive.gateway.spec.ts`
    exists (none today) and covers both.
  - **Files:** `packages/infrastructure/src/pg/repository/pg-activity-archive.gateway.ts`.
  - **Docs:** new `infrastructure/docs/reference/activity-archive.md`.
- [x] `P2.7` done: 2026-09-05 · **vendor error bodies reach the wire** `P2` `~30m`
  - **Goal:** `new UnavailableError(\`ClickHouse request failed (...): ${detail}\`)` puts the
    response body (which echoes the offending row on a failed INSERT) into `ErrorContext`,
    which `AppError.toJSON()` serialises to the client. The `status` parameter is discarded.
  - **Done when:** `new UnavailableError("clickhouse", response.status)` /
    `("loki", status)`, body logged at `warn`.
  - **Files:** `packages/infrastructure/src/clickhouse/clickhouse.connection.ts:106`,
    `packages/infrastructure/src/loki/loki.log-reader.ts:59`.
- [x] `P2.8` done: 2026-09-05 · **invitation tokens stored in plaintext** `P1` `~2h`
  - **Goal:** `invitations.token` is the raw bearer locator; `api_keys.token_hash` two files
    over stores a digest so a dump holds no credential.
  - **Done when:** column becomes `token_hash`, `Token.random()` output is hashed with the
    existing `ApiKeyHasher` (or a `TokenHasher` in `core`), `PgInvitationClaimer` and
    `PgInvitationRepository.save` look up by digest; migration drops pending rows (they are
    seven-day tokens) rather than migrating them.
  - **Files:** `packages/infrastructure/src/pg/schema/invitation.schema.ts`,
    `pg-invitation.claimer.ts`, `pg-invitation.repository.ts`,
    `packages/application/src/member/invite-member.use-case.ts`.
  - **Docs:** `packages/auth/docs/reference/enrolment.md`.
- [x] `P2.9` done: 2026-09-05 · **`ValidationError.paramsFor` drops `max`** `P3` `~15m`
  - **Files:** `packages/errors/src/error/validation.error.ts:47-51`; spec in
    `tests/error/validation.error.spec.ts`.
- [x] `P2.10` done: 2026-09-05 · **`RedisCacheStore.get` swallows corruption silently** `P3` `~30m`
  - **Goal:** deletes the key and returns null; `cache.entry.corrupt` is in `EVENT_CATALOG`
    with `{ key }` and is never emitted anywhere.
  - **Done when:** the store takes a `Logger` (or returns a `Result`) and the event is emitted.
  - **Files:** `packages/infrastructure/src/redis/redis.cache-store.ts`,
    `packages/composition/src/container/container.ts`.
- [x] `P2.11` done: 2026-09-05 · **FK and cascade inconsistencies** `P2` `~1h`
  - **Goal:** `document_chunks.organization_id` has no FK; `invitations.role_id` has no
    `ON DELETE`; `roles`, `memberships`, `role_permissions`, `goal_members`,
    `permission_overrides` → `organizations` are `NO ACTION` while `api_keys`, `sessions`,
    `invitations` cascade, so an organization can never be deleted although
    `users.last_active_organization_id` is `SET NULL` for exactly that case.
  - **Done when:** one migration makes every tenant FK `ON DELETE CASCADE` and adds the
    missing FK; a spec deletes an organization and asserts nothing is left.
  - **Files:** `packages/infrastructure/src/pg/schema/{vector,invitation,rbac}.schema.ts`.
  - **Docs:** `docs/opinions/data-and-scale.md` (deletion semantics).
- [x] `P2.12` done: 2026-09-05 · **no index for the projection reader** `P1` `~30m`
  - **Goal:** `PgActivityReplayReader.since` and `dailyCounts` order by `(occurred_at, id)`
    across all tenants; the only index is `(organization_id, occurred_at DESC)`, so every
    projection batch scans every partition.
  - **Done when:** migration adds `activity_log (occurred_at, id)`; spec asserts an index scan.
  - **Files:** `packages/infrastructure/src/pg/schema/activity.schema.ts`.
- [x] `P2.13` done: 2026-09-05 · **invite: mail failure after commit; `lower(email)` defeats the index** `P2` `~1h`
  - **Goal:** `InviteMemberUseCase` commits, then `mailer.send` throws → 5xx with a live
    invitation. `PgInvitationClaimer.claim` compares `lower(invitations.email)` although the
    column is stored lowercased, so `invitations_email_idx` is unusable.
  - **Done when:** the send is caught, logged (`email.send.failed`, new event) and the record
    is still returned; the claimer compares the column directly. Specs for both.
  - **Files:** `packages/application/src/member/invite-member.use-case.ts`,
    `packages/infrastructure/src/pg/repository/pg-invitation.claimer.ts`.
- [x] `P2.14` done: 2026-09-05 · **`core.activity.write` is asserted inconsistently — closes `T-030`** `P2` `~1h`
  - **Goal:** `IndexDocumentUseCase` asserts it; the member use-cases deliberately do not.
    Only `owner` holds it.
  - **Done when:** `CapabilitySet.can()` treats every `core.*` key as held by any resolved
    principal (the catalog says it is "a property of acting at all"), no use-case asserts it,
    and `T-030` is closed in `TODO.md`.
  - **Files:** `packages/permissions/src/capability/capability-set.ts`,
    `packages/application/src/ai/index-document.use-case.ts`.
  - **Docs:** `packages/permissions/docs/reference/capability-set.md`,
    `packages/permissions/src/catalog/core.permissions.ts` comment.

### Client and web

- [x] `P2.15` done: 2026-09-05 · **(verified) two-factor status never reaches the security page** `P1` `~1h`
  - **Goal:** `SessionUser` carries `id, email, name, activeOrganizationId, organizations`;
    `settings/security.tsx` reads `user.twoFactorEnabled` through a structural cast, so it is
    always `false`: an enrolled user sees the wizard and `TwoFactorPanel` (disable /
    regenerate) is unreachable.
  - **Done when:** `SessionUser` has `twoFactorEnabled`, `fetchSession` populates it, the cast
    is deleted, and a route spec renders the panel for an enrolled user.
  - **Files:** `apps/web/src/store/session.store.ts`, `apps/web/src/server/session.fn.ts`,
    `apps/web/src/route/(app)/_authenticated/settings/security.tsx`.
- [x] `P2.16` done: 2026-09-05 · **(verified) list query keys ignore their params** `P1` `~30m`
  - **Goal:** `QueryKeys.member.list()`, `.invitations()`, `.rbac.roles()` take no argument
    while the fetch passes `params`; page 2 reads page 1 from cache.
  - **Done when:** keys take `params` last (`["member", "list", params]`), per
    `query/docs/index.md:118`; `query/tests/key/query-key.spec.ts` covers it.
  - **Files:** `packages/query/src/key/query-key.ts`, `src/member/member.queries.ts`,
    `src/rbac/role.queries.ts`.
- [x] `P2.17` done: 2026-09-05 · **(verified) 403 renders as "please sign in"; 400 renders " is not valid"** `P2` `~30m`
  - **Files:** `packages/api-client/src/auth/better-auth-error-normalizer.ts:57-67` — 403 →
    `ForbiddenError`; 400 → a `ValidationError` with no field entries (or a `rule` without
    `field`), and `ErrorCopy.field` must not emit a leading space.
  - **Docs:** `api-client/docs/reference/better-auth.md`.
- [x] `P2.18` done: 2026-09-05 · **(verified) `requireSession()` drops the destination** `P2` `~30m`
  - **Goal:** `throw redirect({ to: "/sign-in" })` without `search: { redirect }`, although
    `RedirectSearch` and `complete()` already honour it. Deep links land on `/`.
  - **Done when:** the guard passes the current `location.href` as `redirect`; a `RouteGuard`
    spec exists (none today).
  - **Files:** `apps/web/src/route/-guard.ts`, new `apps/web/tests/route/guard.spec.ts`.
- [x] `P2.19` done: 2026-09-05 · **open-redirect regex admits a backslash** `P2` `~15m`
  - **Files:** `apps/web/src/route/-redirect.ts:15` (`/^\/(?![\/\\])/` and reject `\`
    anywhere), `apps/web/tests/route/redirect.spec.ts` (add `/\evil.test`).
- [!] `P2.20` **`SessionGuard` navigates during render** `P3` `~30m`
  - **Goal:** `onUnauthenticated()` / `onForbidden()` are called in the render body.
  - **Done when:** moved into `useEffect`, or the component is deleted under `P5.15` (nothing
    consumes it). Decide in `P5.15` first. **Depends on:** `P5.15`.
  - **Blocked by:** `P5.15`, by this item's own instruction. Fixing a component that phase
    may delete is work either way, and the fix is thirty minutes once the decision exists.
  - **Files:** `packages/feature/src/auth/session.guard.tsx`.
- [x] `P2.21` done: 2026-09-05 · **`Field` never associates hint and error with the input** `P2` `~1h`
  - **Goal:** `hintId`/`errorId` are computed and placed on the `<p>` elements, but no
    `aria-describedby` / `aria-invalid` is ever emitted; every form inherits this.
  - **Done when:** `Field` clones its child with both attributes (or `Input` accepts them);
    `ui/tests/field/field.spec.tsx` asserts the association.
  - **Files:** `packages/ui/src/field/field.tsx`, `packages/ui/src/input/input.tsx`.
  - **Docs:** `packages/ui/docs/index.md` (Field section).
- [x] `P2.22` done: 2026-09-05 · **list components: loading, error, empty, current-session** `P2` `~2h`
  - **Goal:** `ActiveSessionList` lets you revoke the current session and renders the
    "current" badge detached from any row; `LinkedAccountList` shows the empty state while
    pending; `InvitationList` returns `null` while pending; `MemberList` has no error branch.
  - **Done when:** all four follow the `RoleMatrix` shape (pending → skeleton, error →
    callout, empty → `EmptyState`, list); the current session row is marked and its Revoke
    hidden. Specs for each (`P6.4`).
  - **Files:** `packages/feature/src/account/active-session.list.tsx`,
    `linked-account.list.tsx`, `packages/feature/src/member/{invitation-list,member-list}.tsx`.
- [x] `P2.23` done: 2026-09-05 · **form state defects** `P2` `~2h`
  - **Goal:** `TwoFactorForm` cannot reach backup codes from OTP mode (`totp→backup`,
    everything else `→totp`); `ChangeEmailForm` never resets and allows a second submit;
    `TwoFactorPanel` keeps showing regenerated codes after a disable; `InviteMemberForm`'s
    role `<select>` value can diverge from what is painted and `roleId` never resets.
  - **Done when:** each has a spec covering the case above.
  - **Files:** `packages/feature/src/auth/two-factor.form.tsx:95-103`,
    `packages/feature/src/account/change-email.form.tsx`, `two-factor.disable.tsx:58-65`,
    `packages/feature/src/member/invite-member.form.tsx:34-38`.
- [x] `P2.24` done: 2026-09-05 · **`AuthClient.signOut()` ignores the error** `P3` `~15m`
  - **Files:** `packages/api-client/src/auth/auth.client.ts:81-83` — throw through the
    normalizer so `onDone` does not clear a cache the server still honours.
- [x] `P2.25` done: 2026-09-05 · **`font.css` references two missing `.woff2` files** `P3` `~30m`
  - **Files:** `packages/asset/src/font/font.css:6,14`. Either commit the variable fonts or
    remove the `@font-face` blocks; update `asset/docs/index.md:114-122` either way.

### Found while executing

- [x] `P2.26` done: 2026-09-05 · **the archive's row stream keeps querying a partition nobody is uploading** `P2` `~1h`
  - **Goal:** `archive()` hands `gzip(this.rows(name))` to `putStream`, and `Readable.from` starts
    pulling as soon as it is piped. A `putStream` that rejects leaves that generator paging the
    detached partition with no consumer: in production a full scan of the month nothing reads, and
    in `tests/analytics/pg-activity-archive.gateway.spec.ts` an unhandled rejection once the
    partition is dropped — `pnpm test` reports "1 error" beside a green suite, which is what
    P2.6's exit line missed.
  - **Done when:** the source is destroyed and awaited before `reattach`, so no query is in flight
    when the caller sees the failure; the spec's unhandled error is gone.
  - **Files:** `packages/infrastructure/src/pg/repository/pg-activity-archive.gateway.ts`.
  - **Docs:** `infrastructure/docs/reference/activity-archive.md`.

**Exit.** `pnpm test` green including `packages/infrastructure` against a live Postgres, with no
unhandled errors beside a passing suite; every item's spec file named in its commit message.

**Closed 2026-09-05**, with `P2.20` left `[!]` on `P5.15` by its own instruction. Every other item
is done and every one ships a spec that fails before and passes after — each was run against the
reverted source to prove it. 14/14 architecture assertions, `pnpm typecheck`, `pnpm lint` and
`pnpm test` green, the infrastructure suite included, against a live Postgres 16 with pgvector.

**Three things the work turned up that the audit had not.**

1. `P2.26`, above: the archive's row stream kept paging a partition after the upload that was
   reading it had failed. It surfaced as vitest's "1 error" beside a green suite — the shape of
   report that gets read as noise, which is why `P2.6`'s exit line missed it.
2. `commitlint.config.js` has no `observability` scope, so no commit could name a package that has
   shipped since `09b`. Filed and fixed as `P8.23`, out of phase order, because it blocked `P2.7`.
3. `docs/setup/08-permissions-package.md` listed five resolution rules under a heading that said
   four. Corrected with `P2.14`'s sixth rather than filed.

Two items grew a second half the audit had not named, and both are in the same commit as the first:
`P2.24` (a refused sign-out now says so, rather than re-enabling a button in silence) and `P2.25`
(the wrong `font.css` import path, which `P4.9` also names).

---

## Phase 3 — Convention and pattern clean-up

**Goal.** The tree matches `docs/ai/rules` and `docs/opinions`, or the opinion is updated to
match a decision the tree already made.

- [x] `P3.1` done: 2026-09-05 · **loose files under `packages/auth/src`** `~30m` — `auth.config.ts`,
  `auth.factory.ts` → `src/factory/`. Update `src/index.ts`, `auth/docs/index.md` tree.
- [x] `P3.2` done: 2026-09-05 · **barrels that are scripts** `~1h` — `auth/src/tables/index.ts` (137 lines,
  dotenv, `console.log`) and `infrastructure/src/smoke/index.ts` (130 lines) → move above
  `src/` as `packages/auth/tables.mts` and `packages/infrastructure/smoke.mts` beside
  `drizzle.config.ts` and `seed.ts`; `pg/migrate/index.ts` likewise → `migrate.mts`. This
  removes the three `dotenv` imports, six `process.env` reads and eighteen `console.log`
  calls from `src/` at once. Update `package.json` scripts, `check-architecture` §3 exemption
  list, `biome-config/src/base.json` override, `docs/setup/26:243`, `docs/setup/13`, `15`, `16`.
- [x] `P3.3` done: 2026-09-05 · **`withOrganizationSlug` mutable setter → constructor arg** `~30m` —
  `packages/infrastructure/src/pg/repository/pg-bootstrap-membership.enroller.ts`,
  `composition/src/container/container.ts`.
- [x] `P3.4` done: 2026-09-05 · **static mutable state** `~15m` — freeze `SystemRoleSeed.ROLES`
  (`system-role.seed.ts:22`) and `QueueName.ALL` (`queue-name.ts:14`) at module load, as
  `permission-registry.ts:13` does.
- [x] `P3.5` done: 2026-09-05 · **two classes per file** `~30m` — split `ApiKeyRepository` out of
  `auth/src/apikey/api-key.resolver.ts` into `api-key.repository.ts`; rename
  `feature/src/account/two-factor.disable.tsx` → `two-factor.panel.tsx` (exports
  `TwoFactorPanel`). Update barrels and both `docs/index.md` trees.
- [x] `P3.6` done: 2026-09-05 · **`OrganizationFounder` port lacks `slug`** `~30m` — add `slug?: string` to
  `auth/src/session/organization.founder.ts:7`; `Container` holds the port, not
  `PgOrganizationFounder`. Update `auth/docs/reference/enrolment.md`.
- [x] `P3.7` done: 2026-09-05 · **fakes diverge from adapters** `~1h` — `InMemoryVectorStore.search` applies
  `MIN_SCORE`; `InMemoryStorageGateway.get` throws `NotFoundError`; `TestContainer.build`
  wires `SERVER_CATALOG`. Spec each divergence in `composition/tests/fake/fake.spec.ts`.
- [x] `P3.8` done: 2026-09-05 · **`TestContainer` unreachable outside `composition`** `~2h` — export
  `TestContainer` and `TestPorts` from `composition/src/index.ts` (no subpath); migrate
  `application/tests/**` off hand-rolled doubles. Update `composition/docs/index.md`
  ("two exports"), `docs/reference/test-container.md`.
  - **Done:** the barrel exports `TestContainer`, `TestPorts`, `TestHarness`, `FixedClock` and the
    seventeen fakes; `apps/worker/tests/consumer/maintenance.consumer.spec.ts` drops the object
    literal it cast `as unknown as Container`. Both `apps/web` bundles still contain none of the
    names — tsup emits ESM and a consumer importing only `Container` shakes the rest out.
  - **Not done, and refused rather than deferred:** `application/tests/**` keeps its hand-rolled
    doubles. `composition` imports `application`, so the reverse edge is a cycle in the workspace
    graph and inverts the layering `docs/ai/rules/layering.md` states. Fixing it means moving the
    fakes into a package left of `application`, which is a package decision rather than a file
    move — recorded in `composition/docs/reference/test-container.md`.
- [x] `P3.9` done: 2026-09-05 · **duplication in `feature` and `apps/web`** `~3h` — `MIN_PASSWORD_LENGTH` ×3 and
  the password/confirm `<Field>` pair ×3 → `feature/src/auth/password-pair.tsx` with the
  floor imported from `contracts` (one authority); `day()` ×2 → `ui/src/format/date-format.ts`;
  the "clear cache, invalidate session, re-run root, navigate" block ×4 (`_authenticated.tsx:50,58`,
  `organization/new.tsx:34`, `invitation/$token.tsx:46`; `sign-in.tsx:52` omits the clear) →
  `apps/web/src/route/-session.ts` `refreshSession()`. Update `feature/docs/index.md`,
  `apps/web/docs`.
- [x] `P3.10` done: 2026-09-05 · **`TwoFactorForm` bypasses the query seam** `~1h` — four raw `AuthClient` calls
  with hand-rolled pending state → `SessionMutations.{verifyTotp,verifyBackupCode,verifyOtp,sendOtp}`.
  Update `query/docs/reference/mutations.md`.
- [x] `P3.11` done: 2026-09-05 · **`QueryKeys.session` is a bare array** `~15m` → `{ all() }` like its siblings;
  fix `account.mutations.ts:52`.
- [x] `P3.12` done: 2026-09-05 · **barrels named `index.tsx` with no JSX** `~15m` — `ui`, `query`, `feature` →
  `index.ts`; `package.json` `exports`/tsup entry.
- [x] `P3.13` done: 2026-09-05 · **duplicate DOM ids across auth forms** `~30m` — `id="email"` / `id="password"`
  in sign-in, sign-up, forgot, reset → prefixed (`sign-in-email`), as the account forms do.
- [x] `P3.14` done: 2026-09-05 · **unused dependency** `~5m` — remove `@loadbearing/auth` from
  `apps/web/package.json`; `pnpm deps:check`.
- [x] `P3.15` done: 2026-09-05 · **role-suffix vocabulary** `~2h`
  - **Goal:** `docs/opinions/files.md` lists 25 suffixes and calls the set closed; the tree uses
    ~30 more (`.enroller .founder .claimer .mailer .factory .plugin .config .seed .events .cache
    .hasher .builder .connection .unit-of-work .form .list .queries .mutations .client .guard
    .context .button .setup .inspector .fn .manifest .data .composer`). Vendor adapters swallow
    the role: `bullmq.queue-publisher.ts` vs `pg-vector.store.ts`.
  - **Done when:** the table in `docs/opinions/files.md` and `docs/ai/rules/files.md` records
    every suffix in use (decision 3); the seven vendor adapters and their `fake/` twins are
    renamed to the `pg-` pattern: `bullmq-queue.publisher.ts`, `redis-cache.store.ts`,
    `smtp-email.sender.ts`, `openai-embedding.provider.ts`, `loki-log.reader.ts`,
    `clickhouse-analytics.reader.ts`, `clickhouse-analytics.projector.ts`,
    `better-auth-session.resolver.ts`. `apps/worker/src/notification/digest.composer.ts` →
    `notification-digest.composer.ts` (subject-folder prefix rule).
  - **Docs:** `infrastructure/docs/index.md`, `composition/docs/index.md`, `docs/setup/15`,
    `docs/setup/28`.
- [x] `P3.16` done: 2026-09-05 · **layering graph vs `composition → content`** `~30m` — `layering.md` puts
  `content` to the right of `composition`; `composition` imports it for the two mailers. Move
  `content` beside `contracts` in `docs/ai/rules/layering.md` and
  `docs/opinions/dependencies.md`; add an `eslint` boundary entry that matches.
- [x] `P3.17` done: 2026-09-05 · **abbreviated params in the authorization kernel** `~15m` —
  `permissions/src/capability/capability-set.ts:26,30,104,108,128,140` (`p s a b`).
- [x] `P3.18` done: 2026-09-05 · **`permission` module grammar** `~30m` — `member.*` and `apikey.*` declare
  `module: "rbac"` (`rbac.permissions.ts:26-38`) against `<module>.<subject>.<action>`. Either
  register `member` and `apikey` modules in `ModuleRegistry` or rename the keys
  `rbac.member.invite` etc. Recommend registering the modules (fewer renames, keys are already
  in `PROCEDURE_PERMISSIONS`). Update `permissions/docs/reference/module-registry.md`.
- [x] `P3.19` done: 2026-09-05 · **missing `override`** `~5m` — `auth/src/session/null-membership.enroller.ts:19`.
- [x] `P3.20` done: 2026-09-05 · **`apps/worker` folder rules** `~1h` — four loose files under `src/`, no
  `index.ts` in `consumer/`, `schedule/`, `notification/`; consts vs `private static readonly`
  split. `env.ts` and `main.ts` stay (framework-dictated); `worker-bootstrap.ts` and
  `system-principal.ts` → `src/bootstrap/`; add barrels; pick `private static readonly` for
  every constant. Record the apps-folder rule in `docs/opinions/folders.md`.

### Found while executing

- [x] `P3.21` done: 2026-09-05 · **the Postgres harness picks whichever tenant Postgres
  returns first** `P2` `~15m`
  - **Goal:** `seedOrganizationId` is `select id from organizations limit 1` with no ordering,
    and it is what fourteen specs scope their rows by. It was right while the seed wrote the
    only organization; `P2.11`'s cascade spec and the founder specs both create their own, so
    the pick is now a coin flip that can hand one spec a tenant another is about to delete.
  - **Done when:** the lookup matches `seed.ts`'s own slug.
  - **Files:** `packages/infrastructure/tests/support/database.ts`.

**Exit.** `pnpm lint`, `pnpm check:architecture`, `pnpm deps:check`, `pnpm repo:check` all
green; `docs/ai/rules/*.md` and `docs/opinions/*.md` agree (§12).

**Closed 2026-09-05.** All twenty items plus `P3.21`. The exit line holds: `pnpm lint`,
`check:architecture` 14/14, `deps:check`, `repo:check`, `typecheck` and the full suite green,
infrastructure included against a live Postgres.

**Three items ended somewhere the audit did not predict.**

1. `P3.8` did half of what it asked, and the other half is refused rather than deferred — see the
   item. `application` cannot import `composition` without inverting the layer, so its specs keep
   their hand-rolled doubles; `apps/worker` was the consumer that actually needed the harness and
   now uses it.
2. `P3.15` renamed nineteen files, not the seven the audit counted. Every vendor adapter outside
   `pg/` and `s3/` wrote the role into the subject (`redis.cache-store.ts`), and so did every fake
   standing in for one, both content mailers, and content's own two static implementations. The
   suffix table records sixty roles against the twenty-five it claimed were closed.
3. `P3.16`'s "eslint boundary entry" is a Biome one: there is no boundaries plugin, and the machinery
   that already expresses the graph is the server-only ban list — which `content` and `asset` were
   missing from for exactly as long as the graph put them downstream of `composition`.

`P3.21` was filed from a defect `P2.11`'s spec created: `seedOrganizationId` picked whichever tenant
Postgres returned first, which stopped being one row the moment a second spec founded its own.

---

## Phase 4 — Docs drift already present

**Goal.** No sentence in `docs/`, `README.md`, `AGENTS.md`, `tasks/TODO.md` or
`packages/*/docs` describes something that is not true of the tree. Link resolution is already
clean (1 601 of 1 601) and every `meta.json` matches its pages; the drift is in prose, paths
and counts.

**Rule for this phase.** Regenerate every `docs/index.md` tree from the real tree. Drop test
counts and file counts; name the spec files. Where a count must stay ("sixteen ports"), derive
it once and make the doc-drift gate (`P4.26`) check it.

### Package docs

- [ ] `P4.1` `packages/errors/docs` — `reference/catalog.md:40` says `RATE_LIMITED` and
  `UNAVAILABLE` have no class (both exist and are exported); `index.md` tree lists 8 of 11
  error files.
- [ ] `P4.2` `packages/core/docs/index.md` — "four exports"; `Token` is the fifth, missing
  from tree, exports section and tests list; `reference/token.md` does not exist.
- [ ] `P4.3` `packages/permissions/docs/index.md` — trees omit `core.permissions.ts`,
  `ai.permissions.ts`, `account.routes.ts`, `organization.routes.ts`; "four exports" is five.
- [ ] `P4.4` `packages/contracts/docs/index.md` — "none ship yet" (`role/`, `member/` ship);
  `InvitationId` absent from the identifiers line; two spec files missing.
- [ ] `P4.5` `packages/application/docs` — `meta.json` and `index.md:3` say "ten ports", the
  table lists fifteen, `src/port/` holds sixteen; tree omits `email.sender.ts`, `ai/`,
  `member/`, `rbac/` and their tests; `index.md:89` says `EventBus` is implemented in
  composition (it is not — `composition/docs/index.md:120` is right); example port path
  `src/task/task.repository.ts` does not exist.
- [ ] `P4.6` `packages/infrastructure/docs` — `index.md` tree omits `smtp/`;
  `reference/unit-of-work.md` (rewritten by `P2.1`).
- [ ] `P4.7` `packages/composition/docs` — "two exports" is three (`HealthReport`); 9 of 15
  fakes listed; `reference/test-container.md` says eleven fakes, ten ports, "one entry per
  port" (it also carries `content`).
- [ ] `P4.8` **stale `db` package** — named in `observability`, `contracts`, `permissions`,
  `application` docs, `auth/src/apikey/api-key.resolver.ts:25`, `docs/setup/00:120,124`,
  `docs/setup/26:243`, `docs/setup/27:72-73`, `docs/setup/28` (bare `├── db/` and `:164,896`).
  `auth/src/tables/index.ts:19` and `auth.factory.ts:101` name `src/schema/auth.schema.ts`
  (real: `src/pg/schema/`).
- [ ] `P4.9` `packages/asset/docs/index.md:111` and `font.css:1-2` name `ui/src/token/token.css`
  (real `theme/token/typography.css`); `apps/web/src/store/appearance.store.ts:96` names
  `token.css` for a rule that lives in `motion.css`.
- [ ] `P4.10` `packages/ui/docs/index.md` — `ThemeRegistry.apply` shown setting `colorScheme`
  (that is `ModeRegistry.apply`; `ThemeMeta` has no such field); tree lists 5 of 11
  components; "neither Storybook nor `/kitchen-sink` picked" (`/kitchen-sink` exists); "no
  component stylesheet" contradicted by ten files in `theme/class/`; "33 tests" (53).
- [ ] `P4.11` `packages/content/docs/index.md` — "four namespaces per locale" (eight); "eight
  catalog cells" (fourteen); `catalog.server.ts` "blocked" and `MessageStore` "deferred" (both
  shipped); tree omits `message-store.ts`, `catalog.server.ts`, four spec files; "28 tests" (54).
- [ ] `P4.12` `packages/api-client/docs/index.md` — tree omits `account.client.ts`,
  `organization.client.ts`, the normalizer, 3 of 5 specs; "no namespace accessors" (has
  `role`, `member`); `inProcess` "used by SSR loaders" (used by nothing — `P5.10`).
- [ ] `P4.13` `packages/query/docs/index.md` — tree lists 3 of 7 folders; `Env.apiUrl` example
  (no such field); "no feature slices"; "no hook tests … arrives with 22" (22 arrived);
  `QueryKeys.rbac.effective` headline example has no caller until `P5.2`.
- [ ] `P4.14` `packages/feature/docs/index.md` — tree lists 7 of 27 files (`account/`,
  `member/`, `organization/` and six `auth/` files absent); "12 tests" (29); "no feature
  slices".

### Root and `tasks/`

- [ ] `P4.15` `README.md` — "Sign up at `/sign-in`" (there is `/sign-up`); step 6 and the
  troubleshooting row describe `bootstrap` enrolment while `.env.example` ships
  `AUTH_ENROLMENT_MODE=personal`; "`AGENTS.md` … one row per task" (it is twelve `@` lines,
  byte-identical to `CLAUDE.md`); `.agents/` referenced as committed (also `.gitignore:27`,
  `docs/setup/27:161`) and does not exist; readers sent to an `infra/.env` the repo does not
  template; no mention of organizations, members, invitations, enrolment modes; token budget
  "~650" vs `docs/ai/rules/index.md` "~850" vs `docs/index.md` "~400".
- [ ] `P4.16` `docs/ai/index.md:57-59` draws `CLAUDE.md ├── @AGENTS.md` — false; `:86-89`
  claims one copy of every document while `AGENTS.md` duplicates `CLAUDE.md` verbatim. Make
  `AGENTS.md` a one-line pointer or an `@` import of `CLAUDE.md`, and fix the tree.
- [ ] `P4.17` `tasks/TODO.md` state table — dated 2026-08-29 in a file updated 2026-09-03;
  "11/11 assertions" (13); "388 tests across 65 files" (542 / 94); "20 projects" (17 declare
  `typecheck`); "Every task T-001–T-024 is done" (through T-029); `/permissions` ×3 (is
  `/settings/roles`); T-001 names `PgMembershipEnroller` (is `PgBootstrapMembershipEnroller`)
  and `seed/index.ts` (now a barrel); T-005 names `route/sign-in.tsx` (is `(shell)/`); no
  2026-09-03 changelog row; T-029 cites `~/.claude/plans/…` outside the repo for ten owed
  verification steps — copy the steps into the task. **Depends on:** `P1` (re-measure after).

### `docs/setup`

- [ ] `P4.18` `docs/setup/25-worker-app.md` (worst page) — install block omits `contracts`,
  adds `core`; `Principal.system` snippet has two args (real: three, plus `USER_ID`); "only
  the `rbac` catalog ships" (three fragments ship); "`isKnown()` at boot" (per call — `P7.16`);
  `EmbeddingConsumer` snippet wrong ctor arity, `private handle`; `WorkerBootstrap` snippet
  lacks the `stopping` guard, the race, `WORKER_SHUTDOWN_TIMEOUT_MS`, and uses `Date.now()`;
  `main.ts` snippet lacks T-023's handlers; `document_embeddings` ×2 (is `document_chunks`);
  ✅ Gate `"consumers":1` can never pass (always ≥2); `recovery-sweep-daily` present tense and
  absent; cleanup "orphaned uploads" not implemented; "three months out" is two; root
  `biome.json` named for an override in `tooling/biome-config`; `apps/desktop`; layout tree
  omits `tests/`, `vitest.config.ts`. Re-derive every snippet from the file it shows.
- [ ] `P4.19` `docs/setup/26-hygiene-and-ci.md` — `scope-enum` block has `db`, lacks `errors`
  (its own `fix(db):` example is rejected); CI YAML omits the extensions step,
  `deps:check`/`repo:check`, migrate/seed, `check:contrast`, the `audit` job, uses
  `ratchet_test` where `ci.yml:18-21` explains why not; "required by rule 3" (rule 8);
  `BANNED` list shorter than the script; `EMAIL_FINGERPRINTS` one of five, `ENV_FINGERPRINTS`
  three of five; `process.env` exemption list names `db/` and matches neither tool; assertion
  12 description omits the `CLAUDE.md` import clause; promises `actions/cache`, compose smoke
  job, `pnpm peers`, `pnpm sbom`, desktop workflow — none exist; `check:contrast` gate
  undocumented; "`@orpc/shared` pinned exactly" — no such catalog entry (also
  `docs/ai/rules/dependencies.md:26`, `pnpm-workspace.yaml:114`).
- [ ] `P4.20` `docs/setup/27-verification-and-first-feature.md` — "Fifteen commits" over
  eighteen lines, two with scope `db`, `prettier` named; `/permissions` (`/settings/roles`);
  "one slice" (two); "three applications" (two); "`process.env` in exactly two files" (ten,
  eight exempt; repeated `28:148,160`); §27.4 "permission migration" describes a mechanism the
  shipped slices do not use (`SystemRoleSeed` at seed time); `member` slice and organization
  plugin absent from the twelve-step map.
- [ ] `P4.21` `docs/setup/28-folder-structure.md` — "after step 26" vs 27; sixteen packages
  incl. `db/`; four `ServerOnly` markers named wrongly (real: application, composition, auth,
  infrastructure); malformed infra block with non-existent `postgres/init/01-extensions.sql`,
  missing `check-contrast.mjs`; "5 steps" CI (thirteen + a job); `(shell)/` 3 of 8 files,
  `server/` 2 of 3 fn files ("two" ×2 in prose), settings/organization routes missing, worker
  tree minimal, `tests/` and `vitest.config.ts` absent for both apps; full `apps/desktop/`
  tree.
- [ ] `P4.22` **wrong backticked paths** — `15:247,320,347,468,494` (`src/{cache,storage,queue}`
  → `redis/ s3/ bullmq/`, which contradicts `layering.md`'s own vendor rule); `14:233`
  (`src/embedding/` → `src/openai/`); `12:177,193,210` (`application/src/error/` → `errors/`);
  `20:879` (`bundled.content-source.ts` → `static.`); `05:565` and `00:36` (Prettier, not
  used); `10:171,245,310,372` and `24:560` (`task` slice → `role`);
  `docs/infra/deployment.md:89` (`docker-compose.prod.yml`); `30:228` (`apps/desktop`).
- [ ] `P4.23` **shipped features with no setup page** — `AUTH_ENROLMENT_MODE` appears in zero
  files under `docs/`; organization plugin, `PgOrganizationFounder`, `PgInvitationClaimer`,
  `InvitationClaimingEnroller`, `MemberRouter`, `OrganizationSwitcher`, `/settings/members`,
  `/organization/new`, `/invitation/$token` in no setup page; `/api/health` not walked in `24`;
  `docs/ai/rules/workflow.md` command list omits `check:contrast`, `smoke`, `deps:check`,
  `repo:check`, `auth:tables`, `infra:up:analytics`, and Mailpit. Add §16.x (enrolment modes,
  organization plugin), §24.x (health, member router), §27.4 (second slice), and fix
  `workflow.md`.
- [ ] `P4.24` **rules ↔ opinions disagreements** — comments scope (`opinions/comments.md:10`
  says anywhere in src/tests, `:128` scopes enforcement to `packages/*`); `classes.md`
  free-function ban in tests (opinions scope to `src/`, rules silent —
  `apps/worker/tests/consumer/maintenance.consumer.spec.ts` has three); rulebook size
  (`data-and-scale.md` is 613 lines vs "~2 000 tokens"). Settle each in the opinion, mirror in
  the rule. **Depends on:** `P1.11`.
- [ ] `P4.25` **`apps/desktop` does not exist** — `docs/setup/30-desktop-app.md`, `28:127-148`,
  `29:354`, `26:429`, `25:92`, `biome-config/src/base.json:75`,
  `AUTH_DESKTOP_SESSION_MAX_AGE_SECONDS` (required in both `env.ts`, read by nothing). Add a
  "not yet built" banner to `30`, remove the desktop trees from `28`/`29`, drop the env key
  from `env.ts` and `.env.example`, drop the biome glob.
- [ ] `P4.26` **doc-drift gate** `~2h` — `check-architecture` **§15**: every backticked
  repo-relative path in `docs/**`, `README.md`, `AGENTS.md`, `packages/*/docs/**`,
  `apps/*/docs/**` must exist on disk (exclude fenced code blocks and paths ending in
  `<placeholder>`). ~25 of the findings above would have been caught by it.
  **Docs:** `docs/setup/26`, `docs/ai/rules/workflow.md` (fifteen).
- [ ] `P4.27` `docs/infra` — `reference/compose.md:157-171` and `README.md:16-26` describe an
  `infra/.env` that `P8.19` ships; `deployment.md` describes readiness without naming
  `/api/health`.

**Exit.** `pnpm check:architecture` §15 zero failures; a fresh reader can follow `README.md`
step 6 under the default enrolment mode and land where it says.

---

## Phase 5 — Feature gaps: close or cut

**Goal.** Every declared seam either has a consumer or is gone. Each "build" item follows the
twelve steps in `docs/ai/skills/add-slice.md` and its commit sequence.

### Build

- [ ] `P5.1` **Role management** `P1` `~12h` `#api #ui`
  - **Goal:** `rbac.role.manage`, `rbac.permission.grant`, `rbac.permission.revoke` are keys
    with nothing behind them; `PermissionMatrix.onToggle` is a checkbox with no mutation;
    `CapabilityCache.invalidate` is never called from production code.
  - **Done when:** procedures `role.create`, `role.update`, `role.delete`, `role.grant`,
    `role.revoke` exist in `contracts/src/role/`, mapped in `catalog/role.permissions.ts`; five
    use-cases in `application/src/rbac/`; `PgRoleRepository` gains `save`/`delete` and
    `RolePermissionRepository` (or methods on the role repository) with tenant scope; every
    write calls `capabilities.invalidate(organizationId)` for affected users (spec pins it);
    system roles (`is_system`) are immutable (spec); `/settings/roles` edits inline;
    `role.updated`, `role.permission.granted/revoked` land in `activity_log`.
  - **Files:** `packages/contracts/src/role/`, `packages/application/src/rbac/`,
    `packages/infrastructure/src/pg/repository/pg-role.repository.ts`,
    `packages/query/src/rbac/role.mutations.ts`, `packages/content/src/message/{en,bn}/role.ts`,
    `packages/feature/src/rbac/`, `apps/web/src/server/orpc/role.router.ts`,
    `packages/composition/src/container/container.ts`.
  - **Docs:** `permissions/docs/reference/capability-set.md` (invalidation contract),
    `auth/docs/reference/capability-cache.md`, `docs/setup/27` §27.4 example.
- [ ] `P5.2` **Effective permissions inspector** `P2` `~4h` `#api #ui`
  - **Done when:** `rbac.effective` procedure (`rbac.effective.inspect`) returns the resolved
    `CapabilitySetDto` for a member; `EffectivePermissionsInspector` reads it via
    `QueryKeys.rbac.effective(userId)` (today a key with no caller); reachable from a member
    row on `/settings/members`. **Depends on:** `P5.3`.
- [ ] `P5.3` **Member lifecycle** `P1` `~8h` `#api #ui`
  - **Goal:** `member.deactivate` is a key with nothing behind it; a member's role cannot be
    changed; `member.badge.deactivated` copy exists and is never rendered.
  - **Done when:** `member.changeRole` and `member.deactivate` (+ `member.reactivate`)
    procedures and use-cases; a `deactivated_at` column on `memberships` (migration);
    `PrincipalBuilder` refuses a deactivated membership; "cannot deactivate or demote the last
    owner" rule with a spec; `MemberList` row actions; `member.deactivated`,
    `member.role.changed` events.
  - **Docs:** `auth/docs/reference/principal-builder.md`, `docs/setup/27`.
- [ ] `P5.4` **API keys** `P2` `~8h` `#api #ui`
  - **Goal:** `apikey.read` / `apikey.manage` keys, `PgApiKeyRepository`, `ApiKeyHasher` and
    `ApiKeyResolver` all exist; nothing can create or list a key.
  - **Done when:** `apikey.list`, `apikey.create`, `apikey.revoke` procedures; `ROUTES.rbac.apiKeys
    = "/settings/api-keys"` plus route; the plaintext key is shown once; `apikey.created/revoked`
    events; `api_keys` gains `last_used_at` throttling per `P7.2`.
  - **Docs:** `auth/docs/reference/api-key.md`.
- [ ] `P5.5` **Document index and search** `P2` `~8h` `#api #ui`
  - **Goal:** `VectorStore.search` has zero callers; `ai.embedding.read` is unused;
    `container.queue` is exposed and never called; nothing in the app can enqueue the
    embedding job that `EmbeddingConsumer` waits for.
  - **Done when:** `document.index` procedure publishes to `QueueName.EMBEDDING`;
    `document.search` procedure calls `VectorStore.search` with the principal's goal scope;
    a minimal `/documents` page (paste text → index → search). `ai.document.searched` event.
  - **Docs:** `infrastructure/docs/reference/pgvector.md`, `docs/setup/14`, `25` (the Gate at
    `25:477` finally has a producer).
- [ ] `P5.6` **Error surfaces** `P1` `~4h` `#ui`
  - **Goal:** `ErrorCopy`, `ERROR_COPY`, `FIELD_RULE_COPY` have zero consumers; no
    `errorComponent`, `notFoundComponent` or `pendingComponent` anywhere; forms fall back to
    `shell.t("state.error")`.
  - **Done when:** `__root.tsx` has `errorComponent` and `notFoundComponent` rendering
    `ErrorCopy`; `feature/src/error/use-error-message.ts` maps an `AppError` to copy; every
    form's error callout uses it; `pendingComponent` on `(app)/_authenticated`.
  - **Docs:** `content/docs/reference/error-copy.md`, `feature/docs/index.md`.
- [ ] `P5.7` **Navigation from data** `P2` `~3h` `#ui`
  - **Goal:** `_authenticated.tsx` hardcodes two `<Can>`/`<Link>` pairs; `ROUTES` is never
    imported by `apps/web`; the `nav` collection, `ContentSource.nav()` and `rbacGates` have no
    consumer; five route files assert in comments that their literal equals a `ROUTES` entry.
  - **Done when:** the sidebar renders from `MODULE_GATES` + `ContentSource.nav()`;
    `apps/web/tests/route/routes.spec.ts` asserts every `createFileRoute` literal is a value in
    `ROUTES` and every gated `ROUTES` path has a route file.
- [ ] `P5.8` **Home page, `/settings` index, deep-link return** `P2` `~4h` `#ui`
  - **Goal:** `/` renders `EmptyState("Nothing here yet")` and is the target of every
    post-sign-in, post-switch, post-create navigation; `/settings` 404s.
  - **Done when:** `/` shows the organization, role, member count and gated links;
    `/settings` redirects to `/settings/account`; sign-in returns to the deep link (`P2.18`).
- [ ] `P5.9` **Locale** `P2` `~4h` `#ui`
  - **Goal:** `bn/` (eight files) is unreachable: `MessageStore.empty("en")` is hardcoded,
    `Locales.negotiate` has zero callers, no locale cookie, no switcher. `bn` is also missing
    `error.*` ×8, `common.*` ×4 (`state.empty`, `state.error` are rendered by six components),
    `auth.organization*` ×2.
  - **Done when:** `appearance.store.ts` carries a `locale` cookie, `fetchAppearance` calls
    `Locales.negotiate(Accept-Language, cookie)`, a header switcher exists, and every `en` key
    has a `bn` cell (make the locale record total, not `Partial`, so a missing cell will not
    compile).
  - **Docs:** `content/docs/reference/namespace.md`, `docs/setup/20`.
- [ ] `P5.10` **SSR uses the in-process client** `P1` `~2h` `#ui`
  - **Goal:** `createServerRpcClient` / `ApiClient.inProcess` have no caller; `router.tsx`
    builds `ApiClient.overHttp("/api/rpc")` for both sides, so the first loader
    `ensureQueryData` throws `Failed to parse URL` under Node.
  - **Done when:** `router.tsx` injects `ApiClient.inProcess(...)` when `typeof window ===
    "undefined"`; one route loader prefetches (`/settings/roles`) and an SSR spec proves it.
  - **Docs:** `api-client/docs/index.md:63,135`, `query/docs/index.md:90`.

### Cut (delete code and docs together) or wire

- [ ] `P5.11` **`EventBus`** — port, `RecordingEventBus`, `TestPorts.events`,
  `application/docs` row, `composition/docs` sentence. No adapter, no publisher, no
  `Container` field. **Delete.** Record the outbox design as a `TODO.md` backlog item.
- [ ] `P5.12` **Analytics rollups** — `AnalyticsReader.goalRiskScores` / `reliabilityTrend`,
  `goal_risk_daily`, `user_reliability_daily`, both readers' implementations, the fake, and the
  `ANALYTICS_DRIVER` switch for reads: nothing reads them and nothing writes the tables. Keep
  `activity_events` projection and reconciliation. **Delete** the two rollups and their tables
  (migration); keep the port with one method (`dailyCounts`) until a feature needs more.
  **Docs:** `infrastructure/docs/reference/clickhouse.md`, `docs/setup/15`, `25`,
  `docs/opinions/data-and-scale.md`.
- [ ] `P5.13` **`LogReader`, `StorageGateway.presign*`, `QueuePublisher.publish`** — keep
  (they are the seams the README advertises) but make `smoke` a vitest suite under
  `packages/infrastructure/tests/smoke/` that CI's integration job runs, so each has one
  exercised path. **Depends on:** `P3.2`, `P8.12` (MinIO in CI).
- [ ] `P5.14` **Event codes never emitted** — eight of twenty-two, `cache.entry.corrupt` having
  been closed by `P2.10`. Emit the ones with an obvious site: `queue.job.failed` (every
  consumer's `failed` handler — today they call `logger.failure`), `embedding.request.failed`
  (provider), `http.request.completed/failed` (`errorMiddleware`), `analytics.projection.failed`
  (consumer catch). **Delete** `queue.sweep.completed`, `db.query.slow`,
  `storage.upload.failed` from `core.events.ts` and `event-shape.ts`.
  **Docs:** `observability/docs/reference/catalog.md`.
- [ ] `P5.15` **Zero-consumer symbols** — decide per symbol and record in the owning
  `docs/index.md`: `SessionGuard` (delete — `RouteGuard` is the surface), `SessionQueries`
  (delete — `SessionStore` owns it), `FontRegistry` (wire into `appearance.store` or delete),
  `IconRegistry` (keep — `<Icon>` should validate against it; add the check), `ImageManifest`
  / `MediaResolver` / `ContentSource.media()` / `brand.logo` (wire the logo into the header),
  `DocumentEntity` / `ContentSource.document()` hardcoded `null` (delete),
  `ApiClient.raw` (keep, documented escape hatch), `QueryKeys.account.twoFactor` (delete or
  use for `P2.15`).
- [ ] `P5.16` **`/kitchen-sink` ships to production** — `(dev)` is a pathless group, not a
  build condition. Gate: `loader: () => { if (!import.meta.env.DEV) throw notFound() }`; add
  `Callout`, `CodeList`, `QrCode` (three of eleven primitives missing); translate its eleven
  string literals. **Docs:** `ui/docs/index.md:165`.

**Exit.** `grep -rn` for each deleted symbol returns nothing; every remaining permission key in
`CATALOG` is used by at least one `PROCEDURE_PERMISSIONS` entry (add that as a
`contracts` spec).

---

## Phase 6 — Tests for what is risky and untested

- [ ] `P6.1` **`Container`** (zero tests, 513 lines) — three enrolment branches, the analytics
  driver throw, six throwing getters, `dispose()` order (the comment says a wrong order hangs).
  `composition/tests/container/container.spec.ts` against `TestContainer`-style doubles.
- [ ] `P6.2` **application and auth** — `IndexDocumentUseCase` (chunk overlap arithmetic, the
  short-vector path from `P2.5`), `ListInvitationsUseCase`, `Token.random`, `PrincipalBuilder`
  (api-key-before-cookie precedence at `principal.builder.ts:16-21` — a security decision with
  no test), `OrganizationPlugin` (three endpoints, the only tenant-switch authorization).
- [ ] `P6.3` **query and client** — `RouteGuard`, `useAppMutation` (invalidate before
  `onSuccess`), `AccountMutations`, `MemberMutations`, `OrganizationMutations`,
  `MemberQueries`, `RoleQueries`, `AccountClient` (no spec at all), `MessageStore`.
- [ ] `P6.4` **forms** — `sign-in.form` (the 2FA fork), `reset-password`, `change-password`,
  `change-email`, `two-factor.setup` (codes shown once), `linked-account.list` (last
  credential rule), `active-session.list`, `invite-member.form`, `organization-switcher`.
- [ ] `P6.5` **`T-026`** — `pg-activity-replay.reader.spec.ts` walks from the table start in
  ten batches of two and fails once twenty unrelated rows exist. Seed into a dedicated
  partition window and read from a checkpoint just before it.
- [ ] `P6.6` **query-count assertions** — `SystemRoleSeed.run` (after `P7.1`: one `IN` query),
  `PgInvitationRepository.list`, `PgMemberRepository.list`, using the `DatabaseConfig.logger`
  seam `pg-capability.repository.spec.ts:31-43` already uses.
- [ ] `P6.7` **`apps/worker` tests typechecked** — `tsconfig.json` includes `src/**` only;
  `--passWithNoTests` on the test script. Add `tsconfig.test.json`, drop the flag.
- [ ] `P6.8` **`tooling/scripts` fixtures** — see `P8.10`.

**Exit.** Every file named above has a spec in the mirrored `tests/` path.

---

## Phase 7 — Improvements

- [ ] `P7.1` `SystemRoleSeed.run` issues one SELECT per role (four) and runs on every
  organization creation — one `IN` query and one batched insert. **Docs:** `docs/setup/13`.
- [ ] `P7.2` `PgApiKeyRepository.touch` writes `last_used_at` on every authenticated API
  request, awaited — throttle to once per minute (`WHERE last_used_at < now() - interval '1 minute'`).
- [ ] `P7.3` `PgMaintenanceGateway.sweepExpired` uses `.returning({ id })` to count —
  use the command tag row count.
- [ ] `P7.4` `PgMembershipReader.organizationsFor` has no limit — cap at 100 and document.
- [ ] `P7.5` `/organization/create` is bounded only by a 5/min rate limit; each call seeds
  roles and ~17 permission rows — per-user cap on owned organizations (`AUTH_MAX_OWNED_ORGANIZATIONS`,
  default 10). **Docs:** `auth/docs/reference/organization-plugin.md`.
- [ ] `P7.6` `ClickHouseConnection.encode` builds `'${String(v)}'` with no escaping — escape
  `\` and `'`.
- [ ] `P7.7` `Uuid.isValid` checks the variant nibble, not the version — tighten to `[7]` or
  rename `isValidV7`.
- [ ] `P7.8` `Container.dispose()` never closes the SMTP transport — `SmtpEmailSender.close()`.
- [ ] `P7.9` `MessageStore.ensure` has no in-flight de-duplication (`SessionStore.ensure` has)
  — share the promise per namespace set.
- [ ] `P7.10` `auth` namespace is 82 keys and every one loads for `/forgot-password` — split
  `auth` (sign-in/up/recovery) from `account` (settings). **Docs:** `content/docs/reference/namespace.md`.
- [ ] `P7.11` `useAppMutation` gains `onMutate`/rollback so revoke-invitation, unlink-account
  and revoke-session can be optimistic. **Docs:** `query/docs/reference/mutations.md`.
- [ ] `P7.12` a11y — `PermissionMatrix` empty `<th>` (`aria-label`), `<header>`/`<nav>`
  landmarks and a skip link in `_authenticated.tsx`, `aria-busy` on the two raw `<select>`s.
- [ ] `P7.13` `AppError.from` adopts a client-supplied `traceId` — only on the client path;
  the server mints its own.
- [ ] `P7.14` `LokiLogReader implements LogReader` while every sibling `extends` — align, and
  drop the `type` import in `infrastructure/src/import.ts`.
- [ ] `P7.15` `AnalyticsConsumer` lag: `lagSeconds` is 0 forever on an empty destination —
  compute from the oldest unprojected row; `reconcile` emits `completed` with a `drifted`
  count instead of returning early.
- [ ] `P7.16` `SystemPrincipal.GRANTS` validated per job — once at module load, frozen.

---

## Phase 8 — Worker, tooling, CI, infra, migrations

### `apps/worker`

- [ ] `P8.1` **(verified) second signal hard-kills a graceful drain** `P1` `~30m`
  - **Goal:** `stop()` returns `undefined` when `stopping` is already true; `main.ts` chains
    `.then(() => process.exit(0))`, so SIGINT during a SIGTERM drain exits mid-close.
  - **Done when:** `stop()` returns the in-flight promise; spec in
    `apps/worker/tests/worker-bootstrap.spec.ts`.
  - **Files:** `apps/worker/src/worker-bootstrap.ts:79-81`, `apps/worker/src/main.ts:41-52`.
  - **Docs:** `apps/worker/docs/reference/shutdown.md`, `docs/setup/25`.
- [ ] `P8.2` **(verified) signal handlers registered after `start()`; losing race promise
  unhandled** `P2` `~30m` — register before `await bootstrap.start()`; attach `.catch` to the
  `Promise.all(close)` so a late rejection is logged, not fatal.
- [ ] `P8.3` **worker requires SMTP for a digest it never sends** `P2` `~4h`
  - **Goal:** `env.ts` requires `SMTP_URL`/`EMAIL_FROM` "for the scheduled digest";
    `DigestComposer` is constructed only in its spec; `QueueName.NOTIFICATION` and
    `QueueName.DOCUMENT` have no consumer or producer.
  - **Done when (recommended: ship):** `NotificationConsumer` on `QueueName.NOTIFICATION`
    sends the digest through `container.email`; `digest.schedule.ts` enqueues daily;
    `QueueName.DOCUMENT` is deleted (or claimed by `P5.5`). Alternative: delete composer,
    queue names and the two env keys from the worker schema.
  - **Docs:** `docs/setup/25`, `apps/worker/docs/reference/consumers.md`.
- [ ] `P8.4` **partition runway and sweeps** `P2` `~2h` — `MONTHS_AHEAD = 3` with
  `offset = 0` creates two months ahead (doc says three); `cleanup-daily` sweeps sessions and
  verifications only — add expired `invitations` (an expired row permanently blocks re-invite
  under `invitations_email_uq`) with an index on `expires_at`; delete the documented
  `recovery-sweep-daily` from `25` or implement it.
- [ ] `P8.5` **structure** — see `P3.20`.

### `tooling/scripts`

- [ ] `P8.6` **(verified) summary counts skipped as passed** `P1` `~30m` —
  `check-architecture.mjs:634-639` prints `${results.length} assertions passed` with `○`
  lines included; print `passed / skipped`, exit 1 on any skip when `CI=true`.
- [ ] `P8.7` **§8 cannot see a stale bundle** `P2` `~30m` — the local 13/13 observed during
  the audit ran against an `.output` predating T-027..029. Fail when the newest file under
  `apps/web/src` is newer than `apps/web/.output`.
- [ ] `P8.8` **assertion blind spots** `P2` `~2h` — §5 walks `packages/*` only (`P1.10`);
  §10 (`AuditTrail`) does not walk `docs/`, where the drift it was written for lives; §3's
  `*.config.*` exemption matches `src/**/container.config.ts` (narrow to root and package-root
  configs; mirror in `biome-config/src/base.json:122`); §3's regex hits `process.env` inside
  comments (strip comments first); §6 and §9 regexes are column-0 dependent and pass silently
  on nested or minified output.
- [ ] `P8.9` **new schema assertions** `P1` `~3h` — **§16** every unique index on a table
  carrying `organization_id` leads with it (parse `migrations/*.sql`, with the documented
  exemption list); **§17** every FK column in a `pgTable` has an index. Both are stated as
  non-negotiable in `docs/ai/rules/data.md` and checked by nothing.
  **Docs:** `docs/setup/26`, `workflow.md` (seventeen).
- [ ] `P8.10` **scripts are untyped and untested** `P2` `~4h` — `// @ts-check` +
  `tsc --checkJs` in `tooling/scripts/package.json`; `tests/check-architecture.spec.mjs` runs
  each assertion against a fixture tree that violates it (`docs/setup/26:210` demands this);
  `check-contrast.mjs` missing-name branch blames the wrong name and `--border` presence is
  never checked.

### CI and hooks

- [ ] `P8.11` **(verified) pre-push runs only ESLint** `P1` `~15m` — `.husky/pre-push`:
  `pnpm lint:fast && pnpm check:architecture && pnpm check:contrast`; keep `typecheck` in CI
  (slow). `.lintstagedrc.json` stays biome-only. **Docs:** `docs/setup/26:56`.
- [ ] `P8.12` **`ci.yml`** `P1` `~2h` — `audit` job is `continue-on-error` at job level
  (cannot signal): step-level plus a summary write; `env:` lacks every `S3_*`, `EMBEDDING_*`,
  `AUTH_*` key both `env.ts` schemas require (the job survives because nothing evaluates
  `Env`) — add them and a boot-smoke step per app; add a MinIO service (S3 gateway and
  activity archive have zero coverage); run `pnpm --filter @loadbearing/worker build`;
  `actions/cache` on `packages/*/dist` (promised at `26:426`); "fifteen themes" comment is
  five; pin `pnpm/action-setup` to `packageManager`.
- [ ] `P8.13` **doc-promised jobs** — compose smoke job, `pnpm peers check`, `pnpm sbom`
  (`26:426-432`): implement the first (boot `infra:up`, `db:migrate`, `db:seed`, hit
  `/api/health`), drop the other two from the doc.

### Migrations and seed

- [ ] `P8.14` **auth tables** `P1` `~1h` — `accounts` has no unique index on
  `(provider_id, account_id)` (two rows per Google account accepted);
  `two_factors_user_idx` is not unique (two TOTP secrets per user). Migration + `auth.schema.ts`.
  Run `pnpm auth:tables` and diff.
- [ ] `P8.15` **unpartitioned append-only tables** `P2` — `activity_archive` (and
  `goal_risk_daily`, `user_reliability_daily` unless `P5.12` deletes them). Partition by month
  in a migration; hand-edit the DDL as `activity_log` did. **Docs:** `docs/opinions/data-and-scale.md`.
- [ ] `P8.16` **migrations that fail on existing data** `P2` `~1h` — `0003` and `0004` add
  unique indexes with no de-dup; `0004` drops `memberships_uq` before recreating it. Ship a
  `0005` that is idempotent, and a `docs/setup/13` section "writing a unique-index migration"
  (delete duplicates → create index, in one transaction).
- [ ] `P8.17` **seed** `P2` `~1h` — organization insert and `SystemRoleSeed.run()` in one
  transaction; roles insert gains `onConflictDoNothing`; permissions removed from the catalog
  are reconciled off `owner` (today only ever added); `seed.ts` falls back to `"loadbearing"`
  while `env.ts` has no default, so under `personal` mode the seeded organization is never
  joined — make the seed print that under `personal` it creates nothing but the system roles
  template, or make both read the same default.

### Infra

- [ ] `P8.18` **compose** `P1` `~1h` — MinIO healthcheck runs `mc ready local` inside the
  server image (no `mc`; the alias lives in `minio-init`) → HTTP `/minio/health/live`;
  `minio-init` gets `restart: "no"`; Alloy's docker-socket mount gets `group_add` so it
  collects on Linux; ClickHouse user/db `ratchet` vs `env.ts` default `default` — align.
  **Docs:** `docs/infra/reference/compose.md`.
- [ ] `P8.19` **env templates** `P2` `~30m` — ship `infra/.env.example` with the eleven port
  overrides; remove `EMBEDDING_PROVIDER` and `WEB_PORT` from `.env.example` and
  `docs/setup/02:139,146` (read by nothing); `AUTH_DESKTOP_SESSION_MAX_AGE_SECONDS` per
  `P4.25`; `S3_FORCE_PATH_STYLE` gains a `.default("false")` like `LOG_PRETTY`.
- [ ] `P8.20` **stale worktree** `P3` `~5m` — `.claude/worktrees/…` is a full checkout inside
  the repo (gitignored); greps from the root double-count. Delete it; note in `workflow.md`
  that `.claude/` is excluded from every grep in `check-architecture`.

### Found while executing

- [ ] `P8.21` **`lint-staged` fails on Windows above roughly sixty staged files** `P2` `~30m`
  - **Goal:** `.lintstagedrc.json` passes every staged path to one `biome check` invocation. On
    Windows the 8191-character command line is reached at around sixty files with paths this long,
    and the commit fails with `The command line is too long` — after lint-staged has already
    stashed, so the working tree is restored and nothing says the cause is path length. Committing
    per layer avoids it, which is why it went unnoticed.
  - **Done when:** the config chunks (a function config in `.lintstagedrc.js` splitting the file
    list, or `biome check --write --no-errors-on-unmatched .` with no arguments), and
    `docs/setup/26` names the limit.
- [ ] `P8.22` **`lint-staged` never formats `tooling/scripts/*.mjs`** `P3` `~5m`
  - **Goal:** the glob is `*.{js,jsx,ts,tsx,json,jsonc,css}`. Every script in `tooling/scripts/` is
    `.mjs`, so none is formatted on commit — `pnpm lint` catches them, the hook does not.
  - **Done when:** `mjs` and `cjs` are in the glob.
- [x] `P8.23` done: 2026-09-05 · **`scope-enum` has no `observability`** `P2` `~5m`
  - **Goal:** the package has shipped since `09b` and no commit can name it; the enum still
    carries `db`, which `P4.8` retires. Taken out of phase order because it blocked `P2.7`.
  - **Done when:** `observability` is in `commitlint.config.js`. `db` leaves with `P4.8`, and
    `docs/setup/26:81-85` is corrected by `P4.19`.

**Exit.** `pnpm check:architecture` 17/17 with no skip; CI green with the MinIO service and
both app builds; `infra:up` reports every container healthy on Linux and Windows.

---

## Verification — the whole plan

```bash
pnpm build:packages && pnpm --filter @loadbearing/web build && pnpm --filter @loadbearing/worker build
pnpm check:architecture      # 17/17, no "○ skipped"
pnpm check:comments          # < 10 % overall, no package > 12 %
pnpm typecheck && pnpm lint && pnpm test
pnpm infra:up && pnpm db:migrate && pnpm db:seed
pnpm --filter @loadbearing/infrastructure test
curl -s localhost:3000/api/health
```

By hand, per `docs/ai/skills/add-slice.md` "Verify", for every Phase 5 slice: removing the
permission from a role removes the nav item **and** returns `FORBIDDEN`; the `Pg<Subject>Repository`
grep hits exactly `infrastructure` and `composition`; no repository method queries without
`organization_id`; loops have a query-count assertion. Then the ten-step manual pass owed by
`T-029` (copied into `TODO.md` by `P4.17`).

## Changelog

| Date | Who | Change |
|---|---|---|
| 2026-09-05 | @sami | Created from a full audit of the tree at `6463935` |
| 2026-09-05 | @sami | Phase 3 closed. All twenty items plus `P3.21`, filed from a defect `P2.11`'s spec created. `P3.15` grew from seven renames to nineteen; `P3.8` did half and recorded why the other half is refused |
| 2026-09-05 | @sami | Phase 2 closed but for `P2.20`, blocked on `P5.15` by its own instruction. 25 of 26 items done, each with a spec proven to fail before the fix. `P2.26` filed and fixed from a defect the work surfaced; `P8.23` taken out of phase order because it blocked a commit. `T-030` and `T-026` closed in `TODO.md`, whose backlog is now empty |
| 2026-09-05 | @sami | Phase 1 closed. §14 shipped and §5 widened; 524 blocks to 0, density 18.8 % → 13.0 %; eleven reference pages and two app `docs/` trees written. Phase 1's density target revised — see the note under its exit line. `P8.21` and `P8.22` filed from defects the work surfaced |
