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

- [x] `P4.1` `packages/errors/docs` — `reference/catalog.md:40` says `RATE_LIMITED` and
  `UNAVAILABLE` have no class (both exist and are exported); `index.md` tree lists 8 of 11
  error files. `done: 2026-09-06`
  - **Done:** the two rows say **yes** with the class named; the `index.md` tree lists all twelve
    files in `src/error/`. The catalog page's own point survives the fix — `RATE_LIMITED` is
    `expected` (someone tried something they cannot do) and `UNAVAILABLE` is `unexpected` (we are
    broken), which is what decides the log level, and neither claim depended on the class being
    absent.
- [x] `P4.2` `packages/core/docs/index.md` — "four exports"; `Token` is the fifth, missing
  from tree, exports section and tests list; `reference/token.md` does not exist.
  `done: 2026-09-06`
  - **Done:** five exports, `Token` in the tree, the exports section and the tests list.
  - **`reference/token.md` was written rather than the mention dropped**, and registered in
    `reference/meta.json`. `Token` is the one export in this package where the *how* matters —
    an opaque random string and the digest of one, which is what lets an invitation token be
    stored as a hash and compared without ever holding the plaintext.
- [x] `P4.3` `packages/permissions/docs/index.md` — trees omit `core.permissions.ts`,
  `ai.permissions.ts`, `account.routes.ts`, `organization.routes.ts`; "four exports" is five.
  `done: 2026-09-06`
  - **Done:** all four files in the trees, five exports.
  - **The two `*.routes.ts` files carry the more interesting note** now they are visible:
    `account.routes.ts` and `organization.routes.ts` deliberately have **no gate**, because your
    own password is not a capability and founding your own tenant is not either. A route table
    whose every entry had a gate would be one nobody could read for the exceptions.
- [x] `P4.4` `packages/contracts/docs/index.md` — "none ship yet" (`role/`, `member/` ship);
  `InvitationId` absent from the identifiers line; two spec files missing. `done: 2026-09-06`
  - **Done:** `role/` and `member/` named as shipping, `InvitationId` on the identifiers line, both
    spec files in the tree. "None ship yet" was the load-bearing error — it is the sentence that
    sends a reader looking for a worked example the package has two of.
- [x] `P4.5` `packages/application/docs` — `meta.json` and `index.md:3` say "ten ports", the
  table lists fifteen, `src/port/` holds sixteen; tree omits `email.sender.ts`, `ai/`,
  `member/`, `rbac/` and their tests; `index.md:89` says `EventBus` is implemented in
  composition (it is not — `composition/docs/index.md:120` is right); example port path
  `src/task/task.repository.ts` does not exist. `done: 2026-09-06`
  - **Done:** sixteen ports counted from `src/port/` in both `meta.json` and `index.md`, and the
    table lists all sixteen. The tree gained `email.sender.ts`, `ai/`, `member/`, `rbac/` and their
    tests. The example port path is a slice that exists.
  - **`EventBus` was the claim worth correcting rather than deleting.** `index.md` said composition
    implements it; nothing does. It is now stated as the port to watch — `composition` wires
    `RecordingEventBus` into `TestContainer` and binds nothing in the real one, so the seam is
    exercised by tests and unused in production, which is a different thing from unimplemented.
- [x] `P4.6` `packages/infrastructure/docs` — `index.md` tree omits `smtp/`;
  `reference/unit-of-work.md` (rewritten by `P2.1`). `done: 2026-09-06`
  - **Done:** `smtp/` in the tree with `SmtpEmailSender`, and `reference/unit-of-work.md` rewritten
    against the shipped class.
- [x] `P4.7` `packages/composition/docs` — "two exports" is three (`HealthReport`); 9 of 15
  fakes listed; `reference/test-container.md` says eleven fakes, ten ports, "one entry per
  port" (it also carries `content`). `done: 2026-09-06`
  - **Done:** three exports (`Container`, `ContainerConfig`, `HealthReport`), all fifteen fakes.
  - **`test-container.md`'s "one entry per port" was a rule the file itself breaks**, and the
    exception is the interesting part: it also carries `content`, because `StaticContentSource` is
    the one port whose *real* implementation is the test double — there is no fake worth writing
    for a class that reads a catalog out of memory.
  - Carries the `P3.8` refusal: migrating `application/tests/**` onto `TestContainer` would make
    `application` depend on `composition`, inverting the layering. Recorded in that page.
- [x] `P4.8` **stale `db` package** — named in `observability`, `contracts`, `permissions`,
  `application` docs, `auth/src/apikey/api-key.resolver.ts:25`, `docs/setup/00:120,124`,
  `docs/setup/26:243`, `docs/setup/27:72-73`, `docs/setup/28` (bare `├── db/` and `:164,896`).
  `auth/src/tables/index.ts:19` and `auth.factory.ts:101` name `src/schema/auth.schema.ts`
  (real: `src/pg/schema/`). `done: 2026-09-06`
  - **Done:** `grep -rn '\bdb\b' docs packages/*/docs README.md AGENTS.md` returns only the
    drizzle `db:*` scripts, the `db` transaction getter, `better-auth/db`, and two sentences that
    frame the fold as history. The two source-file claims were already stale — `api-key.resolver.ts`
    and `auth/src/tables/index.ts` name real paths — so nothing under `src/` changed.
  - **Wider than the entry.** The fold invalidated derived claims the entry did not list, and each
    was checked against the code rather than reworded: the `06` dependency graph (the
    `application ──┬── db ──┐ … └── infra ─┘` fork is now one `infrastructure` chain), the `06`
    scaffold table (`db`'s drizzle devDependencies moved onto `infrastructure`), the `05`
    `OOP_PACKAGES` glob (which also lacked `errors` and `observability`, as
    `tooling/eslint-config/src/index.js:4` has them), the `28` package tree, the `28`
    `ServerOnly.assert()` roll-call (four markers, but `application` not `db` —
    `packages/*/src/index.ts:3`), the `28` `<slice>` count (six, not seven: `infrastructure`
    splits a slice across `pg/schema/` and `pg/repository/`), the `26` `scope-enum` block, and the
    `29` flow diagrams.
  - **The `00`/`15` "departure" is retired, not reworded.** Both pages argued for `infrastructure`
    as a package *the architecture docs do not have*; `docs/ai/rules/layering.md` now names it and
    prescribes the vendor split, so the departure was won. `00` departure 1 states the fold and why
    it went in this direction; `15`'s "Why this package exists" argues against `apps/` duplication,
    which is the reason that survived.
  - **Overlaps `P4.19`** (`scope-enum` has `db`, lacks `errors`) — that half is closed here; the
    rest of `P4.19` is untouched.
- [x] `P4.9` `packages/asset/docs/index.md:111` and `font.css:1-2` name `ui/src/token/token.css`
  (real `theme/token/typography.css`); `apps/web/src/store/appearance.store.ts:96` names
  `token.css` for a rule that lives in `motion.css`. `done: 2026-09-06`
  - **Already true — a verified no-op, not a skip.** All three sites name
    `packages/ui/src/theme/token/typography.css` today, and
    `grep -rn 'token\.css' packages apps docs` returns nothing at all. `appearance.store.ts:96` no
    longer names a file. The rest of the page was re-checked against the tree — `svg/` holds the
    three icons listed, `image.manifest.ts` holds the one `brand.logo` key it claims, and
    `packages/ui/src/theme/token/typography.css:1` is the sole importer of `font.css` — so the
    entry is stale rather than the page.
- [x] `P4.10` `packages/ui/docs/index.md` — `ThemeRegistry.apply` shown setting `colorScheme`
  (that is `ModeRegistry.apply`; `ThemeMeta` has no such field); tree lists 5 of 11
  components; "neither Storybook nor `/kitchen-sink` picked" (`/kitchen-sink` exists); "no
  component stylesheet" contradicted by ten files in `theme/class/`; "33 tests" (53).
  `done: 2026-09-06`
  - **Done:** the apply snippet now shows both calls and says why `colorScheme` belongs to
    `ModeRegistry` — it is a property of light-or-dark, not of the palette. The paragraph gained
    `resolveMode`, which the page never mentioned and which is the reason `midnight` (`modes:
    ["dark"]`) cannot render a page with no colours. The tree lists all eleven components.
    `/kitchen-sink` is named as the choice that was made, with the reason (no second build, no
    story files to keep in step). "No component stylesheet" became "no third-party design system":
    ten of the eleven have a file in `theme/class/`, and `Can` renders no element of its own.
  - The "33 tests" claim was already gone; the run is 61 across 10 files.
- [x] `P4.11` `packages/content/docs/index.md` — "four namespaces per locale" (eight); "eight
  catalog cells" (fourteen); `catalog.server.ts` "blocked" and `MessageStore` "deferred" (both
  shipped); tree omits `message-store.ts`, `catalog.server.ts`, four spec files; "28 tests" (54).
  `done: 2026-09-06`
  - **Done:** eight namespaces (`common` `error` `nav` `auth` `role` `member` `organization` +
    the server-only `email`), fourteen client cells over `Locale × ClientNamespace`, and the two
    ☐ rows are ✅ with their callers named — `Container`/`TestContainer` for `SERVER_CATALOG`,
    `apps/web/src/router.tsx` and `feature`'s `MessageProvider` for `MessageStore`. 55 tests.
  - **The paragraph under the table was inverted, not just restated.** It argued
    `SERVER_CATALOG` should wait; it now carries the reason the shipped file gives — static
    imports, because a dynamic specifier makes rollup emit an `email` chunk into the public assets
    directory even after the catalog is tree-shaken out. That is also why
    `router.tsx` still constructs `new StaticContentSource()` with no argument.
  - The `nav.data.ts` ban is no longer "passing vacuously" — the file exists, so the ESLint
    `PermissionKey` ban does work.
- [x] `P4.12` `packages/api-client/docs/index.md` — tree omits `account.client.ts`,
  `organization.client.ts`, the normalizer, 3 of 5 specs; "no namespace accessors" (has
  `role`, `member`); `inProcess` "used by SSR loaders" (used by nothing — `P5.10`).
  `done: 2026-09-06`
  - **Done:** the tree names all nine source files and all five specs. "No namespace accessors"
    became "two, and the rest go through `raw`".
  - **`inProcess` is recorded as unwired, not as working.** `createServerRpcClient` has no caller
    either, so every read goes over HTTP today, SSR loaders included — the loopback hop the factory
    exists to remove is still being paid. The factory table row is annotated rather than deleted;
    `P5.10` is what closes it.
- [x] `P4.13` `packages/query/docs/index.md` — tree lists 3 of 7 folders; `Env.apiUrl` example
  (no such field); "no feature slices"; "no hook tests … arrives with 22" (22 arrived);
  `QueryKeys.rbac.effective` headline example has no caller until `P5.2`. `done: 2026-09-06`
  - **Done:** all seven folders in the tree. `Env.apiUrl` became `Endpoint.rpc`, which is what
    `apps/web/src/router.tsx:34` actually passes — and the distinction matters, since `Env` is
    server-only and cannot reach the client bundle at all.
  - The two "does not have" items were both false and are replaced by the one that is true:
    `QueryKeys.rbac.effective` is read by no caller outside its own spec. Left as a fact about the
    key rather than a defect — the procedure it names exists; nothing reads effective permissions
    through the cache yet.
- [x] `P4.14` `packages/feature/docs/index.md` — tree lists 7 of 27 files (`account/`,
  `member/`, `organization/` and six `auth/` files absent); "12 tests" (29); "no feature
  slices". `done: 2026-09-06`
  - **Done:** all 27 files across the five slice folders. 62 tests across 14 spec files.
  - **"No feature slices" is wrong in a way worth naming.** Five slices ship; none of them is a
    *product* slice. Identity, membership and authorization are what a product needs before it has
    a product, so the honest claim is that nothing here reads a domain procedure yet and doc 23
    §23.5 is still an unwalked path.

### Root and `tasks/`

- [x] `P4.15` `README.md` — "Sign up at `/sign-in`" (there is `/sign-up`); step 6 and the
  troubleshooting row describe `bootstrap` enrolment while `.env.example` ships
  `AUTH_ENROLMENT_MODE=personal`; "`AGENTS.md` … one row per task" (it is twelve `@` lines,
  byte-identical to `CLAUDE.md`); `.agents/` referenced as committed (also `.gitignore:27`,
  `docs/setup/27:161`) and does not exist; readers sent to an `infra/.env` the repo does not
  template; no mention of organizations, members, invitations, enrolment modes; token budget
  "~650" vs `docs/ai/rules/index.md` "~850" vs `docs/index.md` "~400". `done: 2026-09-06`
  - **Step 6 was the one that would strand a reader**, and it is rewritten around the shipped
    default. `personal` is what `.env.example` sets and the only mode that works against an empty
    database; the page now leads with *no session is issued without a membership*, which is why the
    mode is a decision at all, then names `bootstrap` and `invite` and the invitation override that
    beats all three. The `/settings/members` → second account → `/forbidden` walk replaces the old
    first-user-gets-owner story, so the reader watches the route guard and the use-case gate decide
    the same thing.
  - The troubleshooting row now splits by mode rather than naming `BOOTSTRAP_ORGANIZATION_SLUG`
    unconditionally — under `invite` the cause is a missing invitation, not a missing slug.
  - `/sign-in` → `/sign-up`. `~650` → `~900`, measured. `.agents/` removed from all three files
    that named it. `infra/.env` is described as a file you create, since every published port has a
    default in the compose file — and `CLICKHOUSE_HTTP_PORT` / `CLICKHOUSE_NATIVE_PORT` were
    missing from the overridable list.
- [x] `P4.16` `docs/ai/index.md:57-59` draws `CLAUDE.md ├── @AGENTS.md` — false; `:86-89`
  claims one copy of every document while `AGENTS.md` duplicates `CLAUDE.md` verbatim. Make
  `AGENTS.md` a one-line pointer or an `@` import of `CLAUDE.md`, and fix the tree.
  `done: 2026-09-06`
  - **The diagram was made true rather than redrawn.** `CLAUDE.md` now `@`-imports `AGENTS.md`, and
    `AGENTS.md` is the brief the diagram always described — what the repo is, four rules that cost
    the most when broken, and the route into `docs/ai/index.md`. ~340 tokens.
  - **A pointer would have been the wrong fix.** `AGENTS.md` is the only file most non-Claude tools
    load unprompted, so a one-line redirect leaves them holding nothing; the twelve `@` lines it
    used to carry were worse — unresolvable tokens for any tool that does not implement the
    syntax. A brief works for both readers, and §12 already asserts it points at a router.
  - Token budgets across `docs/ai/index.md`, `docs/ai/rules/index.md` and `README.md` were
    re-measured rather than reconciled: twelve rule files are ~7,700 tokens, 410–890 each.
- [x] `P4.17` `tasks/TODO.md` state table — dated 2026-08-29 in a file updated 2026-09-03;
  "11/11 assertions" (13); "388 tests across 65 files" (542 / 94); "20 projects" (17 declare
  `typecheck`); "Every task T-001–T-024 is done" (through T-029); `/permissions` ×3 (is
  `/settings/roles`); T-001 names `PgMembershipEnroller` (is `PgBootstrapMembershipEnroller`)
  and `seed/index.ts` (now a barrel); T-005 names `route/sign-in.tsx` (is `(shell)/`); no
  2026-09-03 changelog row; T-029 cites `~/.claude/plans/…` outside the repo for ten owed
  verification steps — copy the steps into the task. **Depends on:** `P1` (re-measure after).
  `done: 2026-09-06`
  - **Every number re-run, not adjusted.** 15 packages build · 17 typecheck projects · 716 lint
    files · **659 tests across 114 files** · 15/15 assertions with `build:packages` and the web
    build done first, so nothing skipped · `deps:check` and `repo:check` silent. Dated 2026-09-06.
  - **`infrastructure` is inside the total now.** It ran against a live Postgres on this machine
    (83 tests), so the "needs live Postgres — covered in CI" row is gone rather than reworded.
  - **The callout that replaced it says the opposite of what the old one did.** The old note
    deferred three acceptance criteria to CI; CI has never run, on this branch or on the default
    one — both jobs die in ~20s at `pnpm/action-setup@v4` because the root manifest declares
    `devEngines.packageManager` and the action reads `packageManager`. So the table now says
    plainly that "covered in CI" is not an answer any task may give until `P8.12` lands.
  - `T-029`'s ten manual steps are copied into the task, with step 5 named as the one that matters:
    the sixty-second `session.cookieCache` window is what a switch has to invalidate, and nothing
    unit-testable proves it does. The plan file it pointed at was outside the repository.
  - Also: `/permissions` → `/settings/roles` ×3, `PgBootstrapMembershipEnroller`,
    `seed/system-role.seed.ts`, `factory/auth.factory.ts`, `(shell)/sign-in.tsx`, and three missing
    changelog rows (2026-09-03, 2026-09-05, 2026-09-06).

### `docs/setup`

- [x] `P4.18` `docs/setup/25-worker-app.md` (worst page) — install block omits `contracts`,
  adds `core`; `Principal.system` snippet has two args (real: three, plus `USER_ID`); "only
  the `rbac` catalog ships" (three fragments ship); "`isKnown()` at boot" (per call — `P7.16`);
  `EmbeddingConsumer` snippet wrong ctor arity, `private handle`; `WorkerBootstrap` snippet
  lacks the `stopping` guard, the race, `WORKER_SHUTDOWN_TIMEOUT_MS`, and uses `Date.now()`;
  `main.ts` snippet lacks T-023's handlers; `document_embeddings` ×2 (is `document_chunks`);
  ✅ Gate `"consumers":1` can never pass (always ≥2); `recovery-sweep-daily` present tense and
  absent; cleanup "orphaned uploads" not implemented; "three months out" is two; root
  `biome.json` named for an override in `tooling/biome-config`; `apps/desktop`; layout tree
  omits `tests/`, `vitest.config.ts`. Re-derive every snippet from the file it shows.
  `done: 2026-09-06`
  - **Every snippet re-derived from its file**, which is what the entry asked for and what the
    page had stopped being. `SystemPrincipal` gained `USER_ID` and the third `Principal.system`
    argument — passing the organization id as the actor compiles until the brands diverge and puts
    a tenant id in the audit trail's actor column. `EmbeddingConsumer` takes `concurrency`, its
    `handle` is public (a private one is a unit of work no spec can reach), and the job data
    carries `goalId` and `sourceType`.
  - **`WorkerBootstrap` was the snippet with the most missing**, and each omission is its own
    incident: the `stopping` guard (a platform sending `SIGTERM` then `SIGINT` calls `stop()`
    twice and the second `close()` rejects with nothing to catch it), the race against
    `WORKER_SHUTDOWN_TIMEOUT_MS` (a job that never returns drains past the platform's SIGKILL
    timer), and `container.clock.now()` on both sides of the duration rather than `Date.now()`.
    All three are now shown and each carries the failure it prevents. Same for `main.ts`: the two
    process-level handlers registered *before* `start()`, so a container that cannot reach
    Postgres logs a parseable line instead of a raw stack.
  - **Three claims were false in a way that would strand a reader**, and each was checked against
    the code: `core` in the install block (the worker never imports it) with `contracts` missing
    (it does); "only the `rbac` catalog fragment ships" (five do, and both keys the snippet grants
    are real); "`isKnown()` at boot" (it runs per `forOrganization` call — recorded as the fact it
    is, since the failure is loud either way).
  - **Two schedules described work that does not happen.** `cleanup-daily` does not sweep orphaned
    uploads — `sweepExpired` takes sessions and verification rows, and an orphaned S3 object has
    no row to sweep from, which is a different job with a different cost. The recovery sweep has
    no file, so it is out of the shipping table and its paragraph is conditional.
  - The ✅ Gate asserted `"consumers":1`, which can never pass — two always start, three with
    `CLICKHOUSE_URL`. `document_embeddings` ×2 → `document_chunks`. `apps/desktop` dropped from
    the boundary note. The layout tree gained `bootstrap/`, every folder barrel, `tests/` and
    `vitest.config.ts`; the `biome.json` note names `tooling/biome-config/src/base.json`, which
    the root file does nothing but extend.
  - **Step 25.2 gained the four `WORKER_*` keys**, which the page never mentioned while the
    bootstrap snippet now reads three of them. Two are capped or defaulted to `1` for reasons that
    are silent when wrong — a second maintenance job deadlocks on the same partition, a second
    projection run interleaves keyset batches.
- [x] `P4.19` `docs/setup/26-hygiene-and-ci.md` — `scope-enum` block has `db`, lacks `errors`
  (its own `fix(db):` example is rejected); CI YAML omits the extensions step,
  `deps:check`/`repo:check`, migrate/seed, `check:contrast`, the `audit` job, uses
  `ratchet_test` where `ci.yml:18-21` explains why not; "required by rule 3" (rule 8);
  `BANNED` list shorter than the script; `EMAIL_FINGERPRINTS` one of five, `ENV_FINGERPRINTS`
  three of five; `process.env` exemption list names `db/` and matches neither tool; assertion
  12 description omits the `CLAUDE.md` import clause; promises `actions/cache`, compose smoke
  job, `pnpm peers`, `pnpm sbom`, desktop workflow — none exist; `check:contrast` gate
  undocumented; "`@orpc/shared` pinned exactly" — no such catalog entry (also
  `docs/ai/rules/dependencies.md:26`, `pnpm-workspace.yaml:114`). `done: 2026-09-06`
  - **The CI block is now the file, copied verbatim from `.github/workflows/ci.yml`** rather than a
    paraphrase that had drifted eight steps. Paraphrasing a workflow is what let it drift; a reader
    diffing the page against the repo now gets nothing.
  - **The most useful thing on the page is a new caution: this workflow has never run.**
    `pnpm/action-setup@v4` reads the root manifest's `packageManager` field and nothing else, and
    the root declares only `devEngines.packageManager` — so both jobs die in ~20s, on every branch,
    before a single check executes. It is easy to miss because it is not a check failing. Repo-side
    fix is `P8.12`; the page says to declare both fields or pass `version:` on the action, and the
    ✅ Gate now asks whether `verify` got *past* setup, not only whether a check reported red.
  - **Four steps the old block dropped are each restored with the hole they close:** the extensions
    step (compose mounts `postgres.init.sql` as an initdb script, and a `services:` container starts
    before checkout, so there is nothing to mount), `db:migrate` + `db:seed` (the infrastructure
    specs read the seeded organization rather than creating one), `deps:check` + `repo:check`
    before the build (pure file reads, seconds, caught by nothing else), and `check:contrast`. The
    `audit` job moved out of "optional but worth it" — it ships.
  - **`ratchet_test` was worse than a typo.** `tests/support/database.ts` pins the scratch URL, so a
    differently-named database fails every infrastructure spec with a connection error rather than
    an assertion — which reads as infrastructure being down. The page says so now.
  - **`check:contrast` had no section at all**, and it is the one gate that computes rather than
    greps: 117 pairings over five themes × two modes, WCAG AA, plus the sRGB-gamut check nobody
    expects — an out-of-gamut `oklch()` does not error, the browser clips it differently per engine,
    and the symptom is a palette that looks muddy in one theme.
  - Also corrected against their sources: the framework ban list (twelve entries, not seven — the
    doc's copy predated `@nestjs/`, `pg`, `express`, `fastify`, `hono`), `EMAIL_FINGERPRINTS` (five,
    not one), `ENV_FINGERPRINTS` (five, not three — the two missing are `GOOGLE_CLIENT_SECRET` and
    `AUTH_ENROLMENT_MODE`), the assertion-12 description (it also checks the `CLAUDE.md` `@`-import
    list, which is the clause the routers cannot see), the `scope-enum` block, `~650` → `~900`, and
    the desktop-workflow bullet.
  - **`@orpc/shared` is not a catalog entry and should not be.** The pinning is upstream's:
    `@orpc/server@1.15.0` depends on `@orpc/shared@1.15.0` exactly, not `^`. That is precisely why a
    skew between our four catalog ranges puts two copies in the tree rather than resolving to one —
    the page said "they pin", which sent a reader looking for a line that does not exist.
- [x] `P4.20` `docs/setup/27-verification-and-first-feature.md` — "Fifteen commits" over
  eighteen lines, two with scope `db`, `prettier` named; `/permissions` (`/settings/roles`);
  "one slice" (two); "three applications" (two); "`process.env` in exactly two files" (ten,
  eight exempt; repeated `28:148,160`); §27.4 "permission migration" describes a mechanism the
  shipped slices do not use (`SystemRoleSeed` at seed time); `member` slice and organization
  plugin absent from the twelve-step map. `done: 2026-09-06`
  - **"Fifteen commits" over eighteen lines** — eighteen, with the two `db` scopes already retired
    by `P4.8` and `prettier` replaced by `biome and eslint`, which is what the repo runs.
  - **The worked-example paragraph was the substantive fix.** It claimed one slice and a permission
    *migration*. Two slices ship, and neither uses a migration: `SystemRoleSeed` grants at seed
    time, which is idempotent and re-runnable, so a grant added later reaches an existing database
    on the next `pnpm db:seed`. `member` is now named as the one worth reading second — it has the
    writes, so it exercises the `UnitOfWork`, the in-transaction activity entry, and mail that goes
    out only after commit, none of which `role` touches.
  - **The organization plugin is named as deliberately not a slice.** Reading it as one is the
    mistake the page invited: those actions are identity-gated, no permission a non-owner holds
    could gate them, and only an endpoint holding Better Auth's `ctx` can call `setSessionCookie`.
  - **"`process.env` in exactly two files" was the checklist item most likely to fail on a clean
    tree.** Eight source files read it; six are exempt, and the shape of the exemption is the point
    — every one sits *outside* an app or package's `src/`, so a folder barrel cannot execute a
    script on import. The box now says that rather than a number a reader would trip over.
  - `/permissions` → `/settings/roles`. "Three applications" → two, with doc 30 named as a plan for
    a third rather than as something built.
- [x] `P4.21` `docs/setup/28-folder-structure.md` — "after step 26" vs 27; sixteen packages
  incl. `db/`; four `ServerOnly` markers named wrongly (real: application, composition, auth,
  infrastructure); malformed infra block with non-existent `postgres/init/01-extensions.sql`,
  missing `check-contrast.mjs`; "5 steps" CI (thirteen + a job); `(shell)/` 3 of 8 files,
  `server/` 2 of 3 fn files ("two" ×2 in prose), settings/organization routes missing, worker
  tree minimal, `tests/` and `vitest.config.ts` absent for both apps; full `apps/desktop/`
  tree. `done: 2026-09-06`
  - **Both app trees listed a fraction of what exists** and are now complete: `apps/web` at 3 of 8
    `(shell)/` files, missing every `settings/` and `organization/` route, missing
    `invitation.fn.ts`, `-redirect.ts` and `-session.ts`, and naming a generic `<subject>.router.ts`
    where `role` and `member` ship. `apps/worker` was missing `bootstrap/`, every folder barrel and
    four of five schedules. Both gained `tests/` and `vitest.config.ts` — a page whose whole claim
    is *the complete tree* cannot omit the directory the file rules say must mirror `src/`.
  - **The infra block was malformed and named a file that does not exist:** a stray second `└──`
    hung `postgres/init/01-extensions.sql` off `infra/`, where the real file is
    `infra/postgres.init.sql`. `tooling/scripts/` listed one script of three and called them "the
    thirteen CI greps".
  - "after step 26" → 27; CI "5 steps" → two jobs; the `(shell)` paragraph now says why the
    invitation landing page is there — an anonymous visitor must be able to preview one; "the two
    `*.fn.ts` files" → three, in both places the prose says it. The sixteen-package list and the
    `ServerOnly` roll-call were already closed by `P4.8`.
  - **Deferred to `P4.25`:** the full `apps/desktop/` tree, which is one item in a change that also
    touches doc 29, doc 30, both `env.ts` files, `.env.example` and a Biome glob. Splitting it
    across two entries would leave the tree gone and the env var still parsed.
- [x] `P4.22` **wrong backticked paths** — `15:247,320,347,468,494` (`src/{cache,storage,queue}`
  → `redis/ s3/ bullmq/`, which contradicts `layering.md`'s own vendor rule); `14:233`
  (`src/embedding/` → `src/openai/`); `12:177,193,210` (`application/src/error/` → `errors/`);
  `20:879` (`bundled.content-source.ts` → `static.`); `05:565` and `00:36` (Prettier, not
  used); `10:171,245,310,372` and `24:560` (`task` slice → `role`);
  `docs/infra/deployment.md:89` (`docker-compose.prod.yml`); `30:228` (`apps/desktop`).
  `done: 2026-09-06`
  - **Every path corrected against the tree, and §15 is now what stops the next one.** The vendor
    paths in `15` and `14` and the `application/src/error/` block went with the first pass; this one
    closed the rest.
  - **Three were not path typos but stale claims underneath a path**, which is why the entry is
    worth more than a find-and-replace: `00:36` still sold doc 05 as "Prettier" for a page whose
    whole subject is replacing it; `10`'s two `illustrative` markers said "the starter kit ships no
    feature slices" while `role/` and `member/` sit in that package; and `12`'s
    `application/src/error/` paths were correct-as-history but the `<summary>` did not say so, so
    §15's `<details>` exemption was carrying a reader who could not see why.
  - **`bundled.content-source.ts` was a naming-rule violation, not a wrong path.** The role suffix
    is `.source`, so the technology joins with a hyphen: `bundled-content.source.ts`, matching the
    `static-content.source.ts` beside it. Written the other way, `*.source.ts` misses the file —
    which is exactly the failure `docs/ai/rules/files.md` names. Fixed in three places in doc 20 and
    in `packages/content/docs/`.
  - `deployment.md:89` already reads "illustrative; write it on the host, it is not in the
    repository", and `30:228` is now under that page's not-built banner (`P4.25`).
- [x] `P4.23` **shipped features with no setup page** — `AUTH_ENROLMENT_MODE` appears in zero
  files under `docs/`; organization plugin, `PgOrganizationFounder`, `PgInvitationClaimer`,
  `InvitationClaimingEnroller`, `MemberRouter`, `OrganizationSwitcher`, `/settings/members`,
  `/organization/new`, `/invitation/$token` in no setup page; `/api/health` not walked in `24`;
  `docs/ai/rules/workflow.md` command list omits `check:contrast`, `smoke`, `deps:check`,
  `repo:check`, `auth:tables`, `infra:up:analytics`, and Mailpit. Add §16.x (enrolment modes,
  organization plugin), §24.x (health, member router), §27.4 (second slice), and fix
  `workflow.md`. `done: 2026-09-06`
  - **§16.11 — enrolment.** The gap that mattered: `AUTH_ENROLMENT_MODE` appeared in zero files
    under `docs/`, and it decides whether a fresh sign-up can reach the app at all. The section
    gives the port, the three enrollers, the table of what each mode grants, and two failures that
    are silent when you get them wrong — enrolment must run from `session.create.before`, because
    Better Auth queues `create.after` until the sign-up endpoint has finished, which is *after* the
    session hook has already refused; and `bootstrap` takes a `pg_advisory_xact_lock` so two
    simultaneous first sign-ups cannot both become owner.
  - **`InvitationClaimingEnroller` is documented as a decorator, and why that is the design.**
    Written as a condition inside each enroller, "an invitation wins" would be stated three times
    and could disagree with itself. A fourth mode inherits it for free.
  - **§16.12 — the organization plugin**, with the two reasons it is not oRPC stated rather than
    implied: these actions are identity-gated (`isMember` *is* the authorization, and no permission
    key could express it), and only an endpoint holding Better Auth's `ctx` can call
    `setSessionCookie` — without which the cookie cache answers for the old tenant for up to a
    minute. `rebind`'s three writes are shown **in order**, because writing the cookie before the
    row leaves a window where a crash produces a cookie the session table disagrees with.
  - **§24.7 gained `/api/health`** — readiness, not liveness, and the difference decides what the
    platform does with a 503: hold the instance out of the pool, or kill the container. Also why
    `cache-control: no-store` is not boilerplate, why `analytics` is `null` rather than `true` when
    unconfigured, and why Loki is deliberately absent from the report.
  - **§24.6 now shows the real `app.router.ts`** with both merge points, and calls out
    `revokeInvitation` as the four-line procedure: the use-case answers `void` because "it worked"
    is the transport's word, so the router is where the domain's silence and the contract's output
    schema meet. Every write-shaped procedure will have those four lines.
  - `docs/ai/rules/workflow.md` gained `check:contrast`, `deps:check`, `repo:check`, `smoke`,
    `auth:tables`, `infra:up:analytics` and Mailpit, and "fourteen assertions" became fifteen.
  - §27.4's second slice was closed by `P4.20`.
- [x] `P4.24` **rules ↔ opinions disagreements** — comments scope (`opinions/comments.md:10`
  says anywhere in src/tests, `:128` scopes enforcement to `packages/*`); `classes.md`
  free-function ban in tests (opinions scope to `src/`, rules silent —
  `apps/worker/tests/consumer/maintenance.consumer.spec.ts` has three); rulebook size
  (`data-and-scale.md` is 613 lines vs "~2 000 tokens"). Settle each in the opinion, mirror in
  the rule. **Depends on:** `P1.11`. `done: 2026-09-06`
  - **Two of the three were already settled and one was real.** The comments scope agrees in all
    three places today — `opinions/comments.md` says `{src,tests}` under `packages/*` or `apps/*` in
    both the statement and the enforcement section, `rules/comments.md` says the same, and
    `sourceDirs()` in the script walks exactly that. The "~2 000 tokens" claim is not in the tree at
    all any more; `P1.11` and `P4.16`'s re-measurement took it out.
  - **The free-function ban was genuinely wrong, and in a way a reader could not resolve.** The
    opinion's package list was eleven and omitted `observability`, which the ESLint glob has had all
    along — so the page said one thing and the config another with nothing to arbitrate. And neither
    file stated the *scope*, which is why `apps/worker/tests/…spec.ts`'s three local helpers read as
    violations: the glob is `packages/{…}/src/**`, so `tests/` is outside it and `apps/*` is outside
    it twice over.
  - **Settled in the opinion, mirrored in the rule**, as the entry asks: the ban is on the shipped
    surface — exported, and `src/` only. Both halves carry their reason. A spec has no public API to
    keep coherent, so forcing a `harness()` into a class buys nothing; a module-private helper beside
    the class that uses it is fine. What the rule prevents is a barrel that is half classes and half
    loose functions, where there is no answer to *where does the next one go*.
- [x] `P4.25` **`apps/desktop` does not exist** — `docs/setup/30-desktop-app.md`, `28:127-148`,
  `29:354`, `26:429`, `25:92`, `biome-config/src/base.json:75`,
  `AUTH_DESKTOP_SESSION_MAX_AGE_SECONDS` (required in both `env.ts`, read by nothing). Add a
  "not yet built" banner to `30`, remove the desktop trees from `28`/`29`, drop the env key
  from `env.ts` and `.env.example`, drop the biome glob. `done: 2026-09-06`
  - **`AUTH_DESKTOP_SESSION_MAX_AGE_SECONDS` was the item with teeth.** It was **required** — no
    default — in `apps/web/src/env.ts`, so every deployment had to supply a value that nothing in
    the repository reads. A required env var nobody can explain is worse than a missing one: the
    first person to meet it either invents a number or copies the example, and neither is a
    decision. Dropped from the schema, `.env.example`, `apps/web/vitest.config.ts` and three docs.
  - **Both server-only globs dropped** — Biome's and ESLint's, though the entry named only Biome;
    leaving one would have re-created the disagreement. By the repo's own tie-breaker this is
    clear-cut: the retrofit is *local*, one line in an existing array. Doc 05's CAUTION stays and
    now says exactly that, because the CAUTION is what prevents the real mistake — adding a
    separate `apps/desktop/**` override, which replaces the whole `paths` map rather than adding to
    it and silently unbans every server-only package.
  - **Doc 30 keeps its content and gains a banner that does the useful half of the work**: what is
    real today (the abstract `TokenProvider`, `BearerAuthStrategy`, the `surface` column, the shared
    route table — each of which earns its place on the web app's own terms), and what is not (no
    globs, no env key, no CI workflow), with the one-line cost of each named. "A glob matching
    nothing and an env key nothing reads are not preparation — they are a rule a reader cannot
    verify and a required value nobody can explain."
  - Doc 28's tree and doc 29's §1.22 became "if a desktop shell arrives" sections rather than
    deletions: the naming decisions in them are already load-bearing on the pages before them, and
    deleting them would lose the reason `ROUTES` is shared and `surface` exists.
  - **Also swept, since a stale config claim is the same defect:** doc 20 said the `SERVER_CATALOG`
    ESLint ban covers `packages/feature` and `apps/desktop` (it covers neither), and doc 03 said
    `apps/desktop` imports `@tanstack/react-router` directly while `apps/web` never installs it —
    the reverse of the manifests. Four `Used by … apps/desktop` rows in package docs, and the Tauri
    catalog comment, now say what is installed.
- [x] `P4.26` **doc-drift gate** `~2h` — `check-architecture` **§15**: every backticked
  repo-relative path in `docs/**`, `README.md`, `AGENTS.md`, `packages/*/docs/**`,
  `apps/*/docs/**` must exist on disk (exclude fenced code blocks and paths ending in
  `<placeholder>`). ~25 of the findings above would have been caught by it.
  **Docs:** `docs/setup/26`, `docs/ai/rules/workflow.md` (fifteen). `done: 2026-09-06`
  - **§15 ships and has been the working gate for this whole phase** — it caught prose in
    `docs/setup/26` on the commit that introduced it, and has failed on something in most of the
    passes since. The estimate that it would catch ~25 of the findings held.
  - Resolution is owner-relative: a `docs/…` span tries the owning package, then every source dir,
    then the root, so `docs/reference/<page>.md` written generically in an opinions page passes if
    any package has one. Fenced blocks, `<details>` blocks, and any line or heading marked
    `illustrative` / `not written yet` / `does not exist` / `removed` / `deleted` / `☐` are skipped
    — the last is what lets a page show a planned file without lying about it.
  - `apps/desktop` and `apps/api` are exempt by name, and `P4.25` is what made the first of those an
    exemption for a directory nothing claims exists rather than a hole in the gate.
- [x] `P4.27` `docs/infra` — `reference/compose.md:157-171` and `README.md:16-26` describe an
  `infra/.env` that `P8.19` ships; `deployment.md` describes readiness without naming
  `/api/health`. `done: 2026-09-06`
  - **`infra/.env` is documented as a file you create, not one `P8.19` will ship.** Every published
    port already has a default in the compose file, so a template of defaults would be one more file
    to keep in step for no gain. What the page was missing is the distinction that actually catches
    people: the root `.env` is what the *applications* read through `env.ts`, `infra/.env` is what
    *Compose* reads, and overriding a port in one means changing the matching URL in the other.
  - **`deployment.md` gained a readiness section**, because `depends_on: service_healthy` gets a
    container *started* in the right order and says nothing about whether the app inside it can
    serve — it still has to parse its environment, build a container and open its own connections.
    `/api/health` is that answer, with a Compose `healthcheck` block, and the readiness-versus-
    liveness distinction stated in terms of what happens on a 503: held out of the pool, or killed.
    A liveness probe on this endpoint turns one slow database into a restart loop.
  - **The worker's absence from that section is the point**, not an omission: it has no HTTP surface,
    so its liveness signal is the `process.started` line with its consumer count and its readiness is
    that it consumes — which is why `analytics-reconcile` exists. A worker that died quietly on a
    Tuesday is not something a probe finds.

**Exit.** `pnpm check:architecture` §15 zero failures; a fresh reader can follow `README.md`
step 6 under the default enrolment mode and land where it says.

---

## Phase 5 — Feature gaps: close or cut

**Goal.** Every declared seam either has a consumer or is gone. Each "build" item follows the
twelve steps in `docs/ai/skills/add-slice.md` and its commit sequence.

### Build

- [x] `P5.1` **Role management** `P1` `~12h` `#api #ui`
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
    `auth/docs/reference/capability-cache.md`, `docs/setup/27` §27.4 example. `done: 2026-09-06`
  - **Four refusals, and three of them are the database's.** Seeded roles are immutable
    (`SystemRoleSeed` rewrites them on every deploy, so an accepted edit vanishes at the next one);
    a reserved key cannot be created even before the seed has run; and a role somebody holds cannot
    be deleted, because `memberships.role_id` and `goal_members.role_id` are `on delete no action`
    and the alternative to the check is a driver error no UI can render.
  - **The reserved-key rule closes a real escalation path.** `SystemRoleSeed` resolves its rows by
    `(organization_id, key)` and grants `owner` **every permission in the catalog**. A tenant that
    created a role keyed `owner` before the seed ran would have had it handed the wildcard on the
    next deploy — a privilege escalation with a deploy-shaped fuse.
  - **`GrantPermissionUseCase` refuses to hand out a permission the actor does not hold.** Not in
    the plan and added anyway: without it `rbac.permission.grant` is the only key anyone ever needs,
    since holding it lets you write every other one into a role you hold. An owner's wildcard
    answers `can()` for everything, so the rule never obstructs the role meant to grant anything.
  - **Grant validates against the registry; revoke deliberately does not.** A row left behind by a
    renamed permission is exactly the one somebody needs to be able to remove, so the asymmetry is
    the point rather than an oversight. Both pinned.
  - **The invalidation is a port, and it caught a live bug on the way in.**
    `CapabilityInvalidator` in `application/src/port/` is the sixteenth port; `Container` binds
    `CapabilityCache` to it. Wiring it revealed that **`ChangeMemberRoleUseCase` never flushed** —
    a demoted member kept the old role's resolved set for up to the 60s TTL. One line, two specs.
  - **`invalidateAll()` became `invalidateOrganization(organizationId)`.** The old method had no
    production consumer and flushed every tenant to answer a change in one; the key layout already
    put the organization between the fixed prefix and the user id precisely so this would work.
  - **After the commit, never inside it.** A flush issued while the old row is still the committed
    one lets a concurrent read resolve the stale set and cache it again — the same bug the flush
    exists to prevent, now with a race attached.
  - **`PgRoleRepository.save` is an update-then-insert, and the first attempt was wrong.** A single
    `on conflict (id) do update` raises rather than upserting here: an existing row trips
    `roles_key_uq` too, and Postgres only arbitrates the named index. Caught by the integration
    spec, not by review. The insert carries `on conflict do nothing` on `(organization_id, key)`
    and turns a lost race into the same `CONFLICT` the use-case would have thrown.
  - **`test-container.spec` now counts the port directory instead of restating it.** It called
    itself "one port per abstract class in application/src/port" while being a hardcoded list, and
    it did not notice the new port. Verified by adding a throwaway port and watching it fail.
  - **Verified end to end against a live stack**, not only by unit test: create, duplicate key,
    reserved key, rename and delete of a seeded role, grant, an unknown permission, grant into a
    seeded role, revoke, revoke of a stale row, the escalation refusal, delete-in-use, and the audit
    trail carrying all six actions. Cache invalidation checked directly in Redis — one key after a
    read, zero after a revoke.
  - **Two doc sections were already stale from `P5.2`** and are corrected here: `query/docs` still
    said `QueryKeys.rbac.effective` had no caller, and `feature/docs` still said
    `EffectivePermissionsInspector` needed no query.
- [x] `P5.2` **Effective permissions inspector** `P2` `~4h` `#api #ui`
  - **Done when:** `rbac.effective` procedure (`rbac.effective.inspect`) returns the resolved
    `CapabilitySetDto` for a member; `EffectivePermissionsInspector` reads it via
    `QueryKeys.rbac.effective(userId)` (today a key with no caller); reachable from a member
    row on `/settings/members`. **Depends on:** `P5.3`. `done: 2026-09-06`
  - **The inspector answered the wrong question.** It read `useCapabilities()` — the *viewer's*
    set, from the session — so on a members page it showed you your own permissions next to
    somebody else's name. It now takes an optional `userId`: absent means your own, with no round
    trip, and present means theirs, which only the server can resolve.
  - **The procedure resolves through `CapabilityRepository`, not `CapabilityCache`.** An inspector
    is opened to answer "why can they do that", and a cached answer is the wrong one — so the query
    also carries `staleTime: 0`.
  - **Membership is checked before resolving.** Without it a uuid from another tenant resolves to
    an empty set and reads as "this person has no permissions" rather than "not a member here".
    Verified: a cross-tenant id returns `NOT_FOUND`, not an empty grant list.
  - **The wire type is declared in the contract, not imported from `permissions`**, and the client
    filters unknown keys through `PermissionRegistry.isKnown` exactly as `RoleMatrix` already does.
    A permission the catalog no longer knows is a stale row, and the boundary is where it stops
    being trusted.
  - **`QueryKeys.rbac.effective` has a caller now**, which `P4.13` recorded as the one thing `query`
    was missing.
  - **Verified live:** an owner inspecting a member gets `{"wildcard":false,"org":{"grants":
    ["member.read"],"denies":[]},"goals":{}}` — exactly what `SystemRoleSeed` grants that role — a
    plain member is `FORBIDDEN` on `rbac.effective.inspect`, and a cross-tenant user is `NOT_FOUND`.
- [x] `P5.3` **Member lifecycle** `P1` `~8h` `#api #ui`
  - **Goal:** `member.deactivate` is a key with nothing behind it; a member's role cannot be
    changed; `member.badge.deactivated` copy exists and is never rendered.
  - **Done when:** `member.changeRole` and `member.deactivate` (+ `member.reactivate`)
    procedures and use-cases; a `deactivated_at` column on `memberships` (migration);
    `PrincipalBuilder` refuses a deactivated membership; "cannot deactivate or demote the last
    owner" rule with a spec; `MemberList` row actions; `member.deactivated`,
    `member.role.changed` events.
  - **Docs:** `auth/docs/reference/principal-builder.md`, `docs/setup/27`. `done: 2026-09-06`
  - **The migration fixes a tenancy bug, not just a missing column.** `MemberDto.deactivated`
    already existed and was read from `users.deactivated_at` — a **user-level** flag. Deactivating
    someone in one organization would have locked them out of every organization they belong to,
    which is a cross-tenant write dressed as a local one. `memberships.deactivated_at` is per
    membership, and `PgMemberRepository.list` now reads that column.
  - **`PrincipalBuilder` refuses the session, and that is the half that matters.** A deactivated
    member's cookie is still valid, still decrypts, and still names a real organization — nothing
    else in the stack refuses it. One row on `memberships_uq` before the capability read, because a
    deactivated membership is not a principal with nothing granted, it is no principal at all.
    Verified live: the same cookie that worked returns `UNAUTHORIZED` after deactivation and works
    again after reactivation.
  - **`PgCapabilityRepository` also skips a deactivated membership** — defence in depth, free,
    because that query already starts from `memberships`.
  - **The last-owner rule is enforced in two places and pinned by four specs.** Demoting the last
    active owner and deactivating them both refuse with `CONFLICT/lastOwner`; the count is of
    **active** owners, so a deactivated one does not keep a tenant unlockable. Promotion never
    consults the count, and a spec asserts it is not even read.
  - **Self-deactivation refuses with its own reason.** Locking yourself out is recoverable by a
    colleague and still never what the click meant; the row action is hidden for your own row, since
    a button whose only outcome is a `CONFLICT` should not be there.
  - **Two procedures, one use-case.** `deactivate` and `reactivate` carry the direction in the path
    so a product can gate them apart later; the column is one value, so two classes would let them
    disagree about what "active" means. `member.role.change` is its own permission key because
    removing someone's access and changing what they may do are different powers.
  - **Both refusals get their own copy**, in `en` and `bn`. The catalog's generic conflict sentence
    is "someone else changed this first", which is wrong about both.
  - **Verified end to end against a live stack**, not only by unit test: `CONFLICT/self`,
    `CONFLICT/lastOwner`, a successful deactivate returning the updated DTO, `UNAUTHORIZED` for the
    deactivated member's session, reactivation restoring it, and `member.deactivated` in
    `activity_log`.
- [x] `P5.4` **API keys** `P2` `~8h` `#api #ui`
  - **Goal:** `apikey.read` / `apikey.manage` keys, `PgApiKeyRepository`, `ApiKeyHasher` and
    `ApiKeyResolver` all exist; nothing can create or list a key.
  - **Done when:** `apikey.list`, `apikey.create`, `apikey.revoke` procedures; `ROUTES.rbac.apiKeys
    = "/settings/api-keys"` plus route; the plaintext key is shown once; `apikey.created/revoked`
    events; `api_keys` gains `last_used_at` throttling per `P7.2`.
  - **Docs:** `auth/docs/reference/api-key.md`. `done: 2026-09-06`
  - **`ApiKeyRepository` moved from `auth` to `application`**, and the doc's stated reason for it
    living in `auth` — "no use-case should learn that API keys exist" — is corrected rather than
    quietly dropped. It held exactly as long as nothing could issue a key. `auth` already imports
    `application`, so the resolver reads the port from there and `PgApiKeyRepository` serves both.
  - **The split that replaced it is better than the original rule.** `ApiKeyRecord` carries
    `tokenHash` and is what authentication reads; `ApiKeySummary` is what a list renders and **has
    no hash field at all**, so a digest cannot reach the wire through a careless DTO mapping.
  - **Minting moved to `ApiKeyRules` in `application`**, which owns the token format — the `rk_`
    marker and the eight-character prefix — because both layers depend on it and two copies drift
    into a key that authenticates against nothing. `ApiKeyHasher.generate` is gone; its two specs
    moved to `application/tests/apikey/` with it.
  - **A key cannot be issued with a scope its issuer does not hold.** The resolver re-intersects
    with the issuer's live capabilities, so such a scope grants nothing *today* — and silently
    widens the key the day that person is promoted. Refused at creation instead.
  - **`last_used_at` is throttled in the predicate, not in a branch** (`P7.2`'s item, done here
    because the write is on the path this feature creates). Unthrottled it is one `UPDATE` per
    authenticated request forever, to a column nothing reads more precisely than "roughly when".
  - **Revocation is a timestamp and it is idempotent**, keeping the *first* one: that is the
    timestamp an incident review reads, and a retry must not move it.
  - **`CORE_MODULE` is now exported from `permissions`.** The scope picker offered
    `core.activity.write` — a permission every principal holds implicitly, so `can()` said yes.
    Caught by reading the rendered page, not by a test.
  - **Verified end to end against a live stack:** create; the plaintext returned once and absent
    from `api_keys` and `activity_log`; an unknown scope and a past expiry both refused; the key
    authenticating `member/list` and being FORBIDDEN on `role/list`; `last_used_at` written once
    then not rewritten inside the window; revoke making it UNAUTHORIZED; a second revoke preserving
    the timestamp; and the escalation refusal from a principal holding `apikey.manage` but not
    `member.deactivate`.
  - **My first probe used `Authorization: Bearer` and got `UNAUTHORIZED`.** The header is
    `x-api-key`, checked before the session in `PrincipalBuilder` so a scoped key is never
    silently upgraded to the issuer's full session. That was a test error, not a defect.
- [x] `P5.5` **Document index and search** `P2` `~8h` `#api #ui`
  - **Goal:** `VectorStore.search` has zero callers; `ai.embedding.read` is unused;
    `container.queue` is exposed and never called; nothing in the app can enqueue the
    embedding job that `EmbeddingConsumer` waits for.
  - **Done when:** `document.index` procedure publishes to `QueueName.EMBEDDING`;
    `document.search` procedure calls `VectorStore.search` with the principal's goal scope;
    a minimal `/documents` page (paste text → index → search). `ai.document.searched` event.
  - **Docs:** `infrastructure/docs/reference/pgvector.md`, `docs/setup/14`, `25` (the Gate at
    `25:477` finally has a producer). `done: 2026-09-06`
  - **`QueueName` moved from `infrastructure` to `application/src/primitive/`.** Which queue a job
    belongs on is a domain decision — `QueueDocumentIndexUseCase` names `QueueName.EMBEDDING` — and
    `application` cannot import `infrastructure` to say it. The alternative was passing the queue
    name in from `Container`, which puts a domain rule in the DI root. A closed vocabulary of
    strings belongs beside `Principal` and `Authorizer`, not beside the adapter that consumes it.
  - **A live bug the unit tests could not catch: BullMQ rejects a `jobId` containing `:`.** The
    dedup key was `<org>:<doc>`, the recording fake accepted it happily, and the real publish threw
    `Custom Id cannot contain :` as a 500. Now `_`, pinned by a spec that asserts the absence of the
    character, and stated on `JobOptions.jobId` where the next caller will read it.
  - **Indexing is queued, and the response says so.** `DocumentContract.queued` returns the id and
    nothing else: a shape promising chunks would be a lie the day someone reads it, since the work
    has not happened yet. The copy says the same thing, because a search straight after indexing
    finds nothing and the page looks broken otherwise.
  - **`document.search` is a `POST`.** It is a read, but the query goes in the body — a search
    string in a URL is a search string in every access log between the browser and the server — and
    it writes an `ai.document.searched` activity row, which is what an audit asks for after a leak.
  - **The dedup key carries the tenant.** Two organizations re-indexing documents that happen to
    share an id must not collapse into one job; verified live by publishing the same document twice
    and watching the queue depth stay put.
  - **Verified end to end against live Redis and Postgres:** the job lands on `bull:embedding` with
    the tenant on its payload and `<org>_<doc>` as its id; a duplicate is deduplicated; a blank
    query is refused before it costs an embedding; and both procedures answer `FORBIDDEN` to a
    plain member.
  - **The OpenAI round trip is the one link not exercised**, because this environment has no
    `OPENAI_API_KEY`. What that leaves covered: the use-case logic by unit test, the store by the
    five existing `pg-vector.store.spec.ts` integration tests against real pgvector, and the
    enqueue live. Searching with no key answers a clean `UNAVAILABLE` 503 rather than a 500, which
    was checked rather than assumed.
- [x] `P5.6` **Error surfaces** `P1` `~4h` `#ui`
  - **Goal:** `ErrorCopy`, `ERROR_COPY`, `FIELD_RULE_COPY` have zero consumers; no
    `errorComponent`, `notFoundComponent` or `pendingComponent` anywhere; forms fall back to
    `shell.t("state.error")`.
  - **Done when:** `__root.tsx` has `errorComponent` and `notFoundComponent` rendering
    `ErrorCopy`; `feature/src/error/use-error-message.ts` maps an `AppError` to copy; every
    form's error callout uses it; `pendingComponent` on `(app)/_authenticated`.
  - **Docs:** `content/docs/reference/error-copy.md`, `feature/docs/index.md`. `done: 2026-09-06`
  - **The defect was worse than "unused exports".** Nine components rendered
    `shell.t("state.error")` — "Something went wrong" — against an envelope that had travelled from
    the server carrying the exact code. A `FORBIDDEN` and a `CONFLICT` reached the component as
    different things and left it as the same sentence.
  - **`useErrorMessage` is the seam**, in a new `feature/src/error/`. It normalises whatever was
    thrown, renders the code through `ERROR_COPY` and the violations through `FIELD_RULE_COPY`, and
    returns `{ message, fields, envelope }` — `fields` always an array, so a caller renders it
    without asking what kind of failure it holds.
  - **`useTranslator` was needed and is a real addition, not a convenience.**
    `useMessages(namespace)` narrows keys to one namespace, and `ErrorCopy` picks its own shell key
    from the code — there is nothing to scope, so the narrowed hook cannot express it.
  - **The two branching call sites keep their branch.** An invitation that is `NOT_FOUND` and an
    invite that is `CONFLICT` have their own copy in their slice namespace, which is more specific
    than the shared sentence. They now fall through to `ErrorCopy` instead of to `state.error`, so
    the branch adds a sentence rather than replacing the mechanism.
  - **`errorComponent` and `notFoundComponent` go on the root**, not per page: a boundary declared
    per route is one somebody forgets, and an unhandled throw in TanStack Router renders a bare
    stack. `pendingComponent` goes on `(app)/_authenticated`, which covers every gated page —
    including `/settings/roles`, whose loader now prefetches (`P5.10`) and so has a visible wait.
  - **Four specs asserted the bug.** They pinned "Something went wrong", which is `state.error` —
    the exact string this replaces. They now assert the catalog's sentence, and a new spec rejects
    with a `ForbiddenError` and asserts "You do not have permission to do that." appears while the
    generic one does not. That is the assertion the old specs could not make.
- [x] `P5.7` **Navigation from data** `P2` `~3h` `#ui`
  - **Goal:** `_authenticated.tsx` hardcodes two `<Can>`/`<Link>` pairs; `ROUTES` is never
    imported by `apps/web`; the `nav` collection, `ContentSource.nav()` and `rbacGates` have no
    consumer; five route files assert in comments that their literal equals a `ROUTES` entry.
  - **Done when:** the sidebar renders from `MODULE_GATES` + `ContentSource.nav()`;
    `apps/web/tests/route/routes.spec.ts` asserts every `createFileRoute` literal is a value in
    `ROUTES` and every gated `ROUTES` path has a route file. `done: 2026-09-06`
  - **`ModuleNav` joins two lists on `module`, and the join is the security property.** Content
    says what a menu holds and in what order; `ModuleRegistry` says who may see it. An editor
    reordering a menu cannot grant access, which is why `module` is the only join key and why
    `NavContract` deliberately types it as a wide `string` — a CMS row is wide.
  - **The component takes `renderLink` rather than importing `<Link>`.** `feature` may not name the
    router, so the shell passes the element. That is the same rule that keeps every other component
    in this package mountable under a different routing shell.
  - **The icon is validated, not cast.** `IconRegistry.isKnown` gates it, so an unknown name from a
    content row renders no icon rather than a `<use>` pointing at nothing. That needed `ui` to
    re-export `IconName` and `IconRegistry` — a consumer rendering `<Icon name={…}>` from data has
    no other way to check. It also closes half of `P5.15`'s `IconRegistry` item.
  - **`ContentSource` is on the router context now**, and the layout's loader resolves `nav()`
    beside the message namespaces. The seam rather than `navItems` directly: a CMS behind this port
    must not mean editing the layout that renders it.
  - **Two links stay hardcoded and ungated, and that is the correct reading.** `/settings/account`
    and `/settings/security` have no gate because `accountRoutes` declares none — "may I change my
    own password" is not a capability anyone can be denied. Rendering them through a gate-driven nav
    would have required inventing one.
  - **The spec was verified by breaking it.** Renaming `ROUTES.rbac.roles` to `/settings/roles-typo`
    fails both assertions; it sees all fifteen route files and resolves each URL through the group
    and pathless-layout rules. `api/` mounts, the `$token` parameter and the dev-only kitchen sink
    are excluded by name, each with the reason stated.
- [x] `P5.8` **Home page, `/settings` index, deep-link return** `P2` `~4h` `#ui`
  - **Goal:** `/` renders `EmptyState("Nothing here yet")` and is the target of every
    post-sign-in, post-switch, post-create navigation; `/settings` 404s.
  - **Done when:** `/` shows the organization, role, member count and gated links;
    `/settings` redirects to `/settings/account`; sign-in returns to the deep link (`P2.18`).
  `done: 2026-09-06`
  - **Verified against the live stack, not only by test.** A `curl` with a session cookie returns
    `<h1>Home Probe</h1><p>You are Owner here.</p><p>Members: 1</p><nav>…` — organization, role,
    count and gated links, all server-rendered before any JavaScript. `/settings` answers `307` to
    `/settings/account`. Signed out, the page is a sign-in prompt rather than an empty state.
  - **The role needed one join, not a new procedure.** `organizationsFor` already joined
    `memberships → organizations`; it now also joins `roles` and selects the name, so the answer
    costs no extra round trip. `roleName` sits on the *organization* row rather than on the user
    because the same person is an owner in one tenant and a member in another.
  - **A spec pins exactly that**, and it is the one worth having: a join on the wrong column would
    read "Owner" for every tenant without failing anything else. Grace owns her own organization and
    is a plain member of Ada's, and the assertion is `["Owner", "Member"]`. Ada's fixtures were left
    alone after a first attempt broke three specs that assert which tenants she is and is not in.
  - **The member count is prefetched only when the capability allows it.** The loader checks the
    same `member.read` key `<Can>` checks, so an anonymous or unpermitted visit issues no member
    query at all — and a permitted one has no loading flash, because the cache is warm before first
    paint.
  - **`ModuleNav` from `P5.7` is reused rather than a second nav written**, which is the payoff for
    having built it from data.
  - **`nav.home.members` is "Members: {count}", not "{count} members".** `Translator` interpolates
    and does not pluralise, so the obvious phrasing renders "1 members" — and would be wrong in
    every locale that inflects. Caught by reading the rendered page.
  - **`/settings` had to be declared in `ROUTES`**, which `P5.7`'s new spec caught on the first run:
    a route file whose path no fragment declares is one a `<Link>` cannot be typed against.
- [x] `P5.9` **Locale** `P2` `~4h` `#ui`
  - **Goal:** `bn/` (eight files) is unreachable: `MessageStore.empty("en")` is hardcoded,
    `Locales.negotiate` has zero callers, no locale cookie, no switcher. `bn` is also missing
    `error.*` ×8, `common.*` ×4 (`state.empty`, `state.error` are rendered by six components),
    `auth.organization*` ×2.
  - **Done when:** `appearance.store.ts` carries a `locale` cookie, `fetchAppearance` calls
    `Locales.negotiate(Accept-Language, cookie)`, a header switcher exists, and every `en` key
    has a `bn` cell (make the locale record total, not `Partial`, so a missing cell will not
    compile).
  - **Docs:** `content/docs/reference/namespace.md`, `docs/setup/20`. `done: 2026-09-06`
  - **The locale is a fourth axis on `AppearanceSnapshot`**, beside theme, mode and font: same
    cookie mechanism, same argument for resolving it server-side, and `fetchAppearance` was already
    holding the request headers `Accept-Language` arrives in.
  - **It is the one axis that is not a CSS variable**, which is the whole difference. Theme and font
    are attributes the cascade applies in the same frame; a locale change has to *fetch* copy, so
    the switcher calls `router.invalidate()` and the root re-runs.
  - **The ordering in `__root.tsx` is load-bearing and is commented as such.** `beforeLoad` awaits
    appearance, then calls `MessageStore.setLocale`; the loader's `ensure(SHELL)` runs after it.
    Reversed, the first paint is English and corrects itself in front of the reader.
  - **`setLocale` drops every loaded namespace rather than merging.** They are the previous locale's
    copy, and a merge leaves the old sentences under keys the new bundle also has.
  - **Fifteen missing `bn` cells, and four of them were `common`** — `state.empty` and `state.error`
    are rendered by six components, so a Bengali page fell back to English at exactly the moments a
    reader is already confused. `error.*` was missing eight of twelve.
  - **`NamespaceBundle` is now `Record`, not `Partial`.** Verified by removing a key and watching
    `tsc` fail. **`tsup`'s DTS build does not catch it — only `pnpm typecheck` does**, which is
    worth knowing before trusting a green `pnpm build`.
  - **Four specs pinned the *absence* of a translation** as their fixture for the English fallback
    layer, so doing the translations broke them. That is the spec depending on incomplete data:
    rewritten against a local fixture catalog, plus one that now asserts every `ErrorCode` renders
    non-ASCII in `bn` — a runtime check of what the type promises. Verified by reverting one value
    to English and watching it fail.
  - **`Locales.label()` returns endonyms**, and the switcher never translates them: "বাংলা" is what
    a reader who cannot read the current locale is scanning for.
  - **Verified end to end against a live server**, all six negotiation cases: no cookie and no
    header → `en`; `Accept-Language: bn` → `bn`; a cookie beating a conflicting header; a cookie
    naming a locale with no catalog → `en`; a header naming one → `en`. `/sign-in` server-renders
    Bengali including the switcher's own label.
  - **`T-035` filed:** the English fallback layer is now unreachable for anything that compiles, and
    it doubles the message payload on every non-English page. The fix is a decision, not an edit —
    drop the base layer, or relax the totality — and shipping both would be the wrong answer twice.
- [x] `P5.10` **SSR uses the in-process client** `P1` `~2h` `#ui`
  - **Goal:** `createServerRpcClient` / `ApiClient.inProcess` have no caller; `router.tsx`
    builds `ApiClient.overHttp("/api/rpc")` for both sides, so the first loader
    `ensureQueryData` throws `Failed to parse URL` under Node.
  - **Done when:** `router.tsx` injects `ApiClient.inProcess(...)` when `typeof window ===
    "undefined"`; one route loader prefetches (`/settings/roles`) and an SSR spec proves it.
  - **Docs:** `api-client/docs/index.md:63,135`, `query/docs/index.md:90`. `done: 2026-09-06`
  - **The bug is real and was reproduced before it was fixed.** Under Node,
    `ApiClient.overHttp("/api/rpc", …)` throws `TypeError: Invalid URL` on the first call — `fetch`
    has no document to resolve a relative base against. It was latent only because no loader
    prefetched; adding one is what fires it.
  - **`createIsomorphicFn` is the mechanism**, and the reason it is safe here is checkable rather
    than assumed: the Start plugin removes the unused branch *and its imports*, so
    `createServerRpcClient` — and the container graph behind it — never enters the client graph.
    Verified against the built bundle: `createServerRpcClient`, `serverTransport`,
    `createRouterClient`, `drizzle` and `ioredis` all return zero hits across 38 assets, and §8
    passes. Without that property this would be a one-hop path from every route component to the
    server graph, which is exactly what the two import surfaces exist to prevent.
  - **The runtime stub prefers the server branch when untransformed**, which is the right default
    for Node and the reason a vitest run must not call `getRouter()`.
  - **Beyond the entry: `overHttp` now refuses a relative base outside a browser.** A `TypeError`
    raised inside a route loader names neither the transport nor the fix; an `InternalError` at
    construction does. The sentence rides on `cause` rather than `message`, because in this
    repository the code **is** the message — the first draft put prose in `message` and the spec
    caught it, which is the convention working.
  - **Proven end to end, not only by unit test.** `/settings/roles` prefetches through
    `ensureQueryData` in its loader; against a live Postgres and both Redis instances, a `curl` with
    a session cookie returns 200 with the role names and permission cells already in the HTML — no
    JavaScript ran — and zero `Invalid URL` in the server log.
  - **Found and filed, not fixed here: `T-032`.** A production `.output` build 500s on every page
    with `jsxDEV is not a function` — a development JSX transform in the *server* bundle. Confirmed
    pre-existing by stash-and-rebuild. `pnpm dev` is unaffected, which is why no gate has caught it:
    doc 24's ✅ Gate checks that the *client* bundle carries no dev build and never checks that the
    server bundle serves a request.

### Cut (delete code and docs together) or wire

- [x] `P5.11` **`EventBus`** — port, `RecordingEventBus`, `TestPorts.events`,
  `application/docs` row, `composition/docs` sentence. No adapter, no publisher, no
  `Container` field. **Delete.** Record the outbox design as a `TODO.md` backlog item.
  `done: 2026-09-06`
  - **Deleted:** `application/src/port/event.bus.ts`, `composition/src/fake/recording-event.bus.ts`,
    both barrel lines, both `import.ts` lines, `TestPorts.events` and its default.
    `grep -rn 'EventBus\|DomainEvent'` over `packages` and `apps` returns nothing.
  - **The design is preserved as `T-031` in `TODO.md`, and it is an outbox rather than a bus.** The
    four broker-shaped properties move there intact, because they are the part a Kafka or Redis
    Streams implementation cannot give back later. What the entry adds is why the deleted port was
    the wrong shape anyway: the event and the state change that caused it must commit or fail
    together, and neither publishing inside the transaction nor publishing after it has that
    property. The `UnitOfWork` this repo already has is what makes an outbox one line at a call site.
  - **A spec was quietly not doing its job, and that is the finding worth keeping.**
    `test-container.spec.ts`'s "one assertion per port — this is the completeness check" listed
    twelve of sixteen: `activityArchive`, `activityReplay`, `analyticsProjector`, `logs` and
    `maintenance` had all been added to `TestPorts` without the check noticing. It now iterates
    `Object.entries(harness)`, and a second spec pins the exact key set — a hand-written subset is
    a completeness check that passes while being incomplete, which is how it drifted.
  - **Counts corrected in the same pass**, since they all derived from the deleted port: sixteen
    ports → fifteen in `application/docs/{index.md,meta.json}` and `composition/docs`, and
    `packages/application/docs/index.md` had `VectorStore` listed twice.
  - **The `.bus.ts` role suffix left the closed set** in `docs/opinions/files.md` and
    `docs/ai/rules/files.md`. Every other row in that table names a file that exists, and the set is
    closed precisely so an entry means something. `T-031` re-adds it.
- [x] `P5.12` **Analytics rollups** — `AnalyticsReader.goalRiskScores` / `reliabilityTrend`,
  `goal_risk_daily`, `user_reliability_daily`, both readers' implementations, the fake, and the
  `ANALYTICS_DRIVER` switch for reads: nothing reads them and nothing writes the tables. Keep
  `activity_events` projection and reconciliation. **Delete** the two rollups and their tables
  (migration); keep the port with one method (`dailyCounts`) until a feature needs more.
  **Docs:** `infrastructure/docs/reference/clickhouse.md`, `docs/setup/15`, `25`,
  `docs/opinions/data-and-scale.md`. `done: 2026-09-06`
  - **The item's own instruction could not be followed, and the premise is why.** It says to keep the
    port with one method, `dailyCounts` — but `dailyCounts` is on `ActivityReplayReader` and
    `AnalyticsProjector`, never on `AnalyticsReader`. Removing the two rollups leaves the port with
    **no methods**, so "keep it" was not an available option. Confirmed with the user before acting.
  - **Deleted in full:** both methods, `goal_risk_daily` and `user_reliability_daily` (migration
    `0011`, and the matching pair in `infra/clickhouse.init.sql`), `AnalyticsReader`,
    `PgAnalyticsReader`, `ClickHouseAnalyticsReader`, `StubAnalyticsReader`, `container.analytics`,
    `TestPorts.analytics`, `DateRange`/`RiskScore`/`TrendPoint`, and `ANALYTICS_DRIVER` from both
    `env.ts` files and `.env`/`.env.example`.
  - **`ANALYTICS_DRIVER` had to go with it.** Its entire function was choosing between two
    implementations of the deleted port. A flag left behind would be a lie a deployer can act on:
    set it to `clickhouse` and believe reads had moved.
  - **What survives is the half with a consumer.** `AnalyticsProjector`,
    `ClickHouseAnalyticsProjector`, the projection consumer, the nightly reconciliation and
    `activity_events` all stay; `CLICKHOUSE_URL` still turns them on. The store fills and reconciles
    while nothing reads it, which is the state to be in before writing a reader.
  - **Both tables were empty in the live database** before the migration ran — checked, not assumed.
  - **`test-container.spec` caught the removal** as well as the addition in `P5.1`, because it now
    counts the port directory. Fifteen ports again.
  - **The doc rewrite is the bulk of this item, and one section reverses.**
    `docs/opinions/simplicity.md` used `AnalyticsReader` as its example of a seam that earns its
    place before the second implementation. It is now the counter-example, which is the more useful
    version of that argument: certainty about the swap is the cheap half of the test, and the
    expensive half — *is the retrofit spread or local?* — is the one it failed. A port nothing calls
    has no call sites, so the cost it was insuring against did not exist.
  - **Fourteen more pages corrected**, including `docs/setup/{00,06,11,12,13,14,15,17,27,28}`,
    `docs/opinions/{classes,folders,dependencies,vocabulary,data-and-scale}.md`, both
    `clickhouse.md` references, `docs/infra/deployment.md`, and the `application`, `composition` and
    `infrastructure` package docs. Examples that named the deleted symbols moved to ones that exist
    (`LogReader`, `ActivityReplayReader.dailyCounts`, `ClickHouseAnalyticsProjector`).
  - **`T-034` filed:** bring the reader back with the first dashboard, against a store that has been
    reconciling for days — and keep `goalIds` a required resolved parameter when it returns.
- [ ] `P5.13` **`LogReader`, `StorageGateway.presign*`, `QueuePublisher.publish`** — keep
  (they are the seams the README advertises) but make `smoke` a vitest suite under
  `packages/infrastructure/tests/smoke/` that CI's integration job runs, so each has one
  exercised path. **Depends on:** `P3.2`, `P8.12` (MinIO in CI).
- [x] `P5.14` **Event codes never emitted** — eight of twenty-two, `cache.entry.corrupt` having
  been closed by `P2.10`. Emit the ones with an obvious site: `queue.job.failed` (every
  consumer's `failed` handler — today they call `logger.failure`), `embedding.request.failed`
  (provider), `http.request.completed/failed` (`errorMiddleware`), `analytics.projection.failed`
  (consumer catch). **Delete** `queue.sweep.completed`, `db.query.slow`,
  `storage.upload.failed` from `core.events.ts` and `event-shape.ts`.
  **Docs:** `observability/docs/reference/catalog.md`. `done: 2026-09-06`
  - **Five wired, three deleted, and the count re-derived rather than trusted:** twenty-four codes
    were declared, eight had no production call site, and twenty-one ship now with every one emitted.
  - **`queue.job.failed` is emitted *beside* `logger.failure`, not instead of it.** The three
    consumers already logged the error; what they had no way to produce was a countable signal.
    The event gives one `event_code`, so queue health is a rate; the `error.raised` line beside it
    carries the normalised code, cause and stack. One without the other is either a number nobody
    can explain or an explanation nobody can alert on.
  - **`http.request.completed` / `.failed` go in `errorMiddleware`**, inside the oRPC chain rather
    than at the adapter — the same reason the error interceptor is there, since an adapter-level
    hook has no `traceId` and no request-scoped logger. The `path` field is the **procedure** path:
    every RPC arrives at `/api/rpc`, so the URL would make every line identical. The failure line
    is emitted before `ErrorInterceptor.toTransport`, which never returns.
  - **`embedding.request.failed` needed a seam that already existed.** `OpenAiEmbeddingProvider`
    had no logger; it now takes an optional one exactly as `LokiLogReader` does, wired in
    `Container`. It fires on both failure branches — a non-`ok` response and a short batch — and
    carries the *batch* size, because a run that fails on its fourth batch has already embedded
    three.
  - **`analytics.projection.failed`'s declared shape wanted an `eventId` the projector cannot
    produce**, since `project(records)` works in batches. The checkpoint is read *before* the run
    and reported on failure: it is where a replay resumes, which is the question a failed
    projection cannot otherwise be asked. The catch rethrows — BullMQ's retry is driven by
    rejection.
  - **The three deletions each name a thing the system does not do:** `queue.sweep.completed` (the
    recovery sweep has no file), `db.query.slow` (no query timing exists; that is Postgres's own
    `log_min_duration_statement`, a deployment setting), `storage.upload.failed` (the gateway
    presigns and never uploads, so that failure happens in the browser).
  - **Filed `T-033`:** an assertion that every declared code has an emitter. Left out of this entry
    deliberately — a sixteenth assertion means renumbering "fifteen" across four files, which is
    churn worth doing once rather than mid-phase.
- [x] `P5.15` **Zero-consumer symbols** — decide per symbol and record in the owning
  `docs/index.md`: `SessionGuard` (delete — `RouteGuard` is the surface), `SessionQueries`
  (delete — `SessionStore` owns it), `FontRegistry` (wire into `appearance.store` or delete),
  `IconRegistry` (keep — `<Icon>` should validate against it; add the check), `ImageManifest`
  / `MediaResolver` / `ContentSource.media()` / `brand.logo` (wire the logo into the header),
  `DocumentEntity` / `ContentSource.document()` hardcoded `null` (delete),
  `ApiClient.raw` (keep, documented escape hatch), `QueryKeys.account.twoFactor` (delete or
  use for `P2.15`). `done: 2026-09-06`
  - **Deleted:** `SessionGuard` (+ spec), `SessionQueries` (+ spec), `DocumentEntity`,
    `DocumentContract`, `ContentSource.document()` and its `StaticContentSource` implementation,
    `QueryKeys.account.twoFactor`.
  - **`SessionGuard` and `RouteGuard` were two statements of one rule.** The guard ran *after* a
    component mounted and called back; `RouteGuard` runs in the loader, before the page renders at
    all. Doc 23's "four enforcement surfaces" list now names `<Can>` alone as this package's.
  - **`SessionQueries` put the session in two places** — the cache and `SessionStore`, which rides
    the SSR payload. Two copies of the answer that gates every other read is one too many, and the
    store is the one that resolves server-side. `SessionMutations` stays: signing in is a write.
  - **`document()` is the one I nearly kept.** It was correct — `null` is an honest answer — and
    heavily defended in `content-shapes.md` as "the shape that exists to come from a database".
    That is an argument for building it *with* the database rather than before one: nothing called
    it, no adapter returned a row, and the contract and entity beside it parsed nothing. Re-adding
    it is one abstract method, one implementation and one contract — the same cost it was carrying
    while doing nothing. Three shapes now, each with a caller.
  - **`FontRegistry` was wired, not deleted**, because it is a complete third axis with the same
    shape as the other two. `appearance.store` gained a `font` cookie, snapshot field and
    `FontRegistry.apply` in `choose`; `__root.tsx` sets `--font-sans` on the *server-rendered*
    element, because a face that swaps after hydration reflows the whole page. A picker sits in
    the kitchen sink, and a spec pins that an unknown cookie value falls back.
  - **`IconRegistry` gained its check** as part of `P5.7`: `ModuleNav` validates a content row's
    icon name through `isKnown` rather than casting, so an unknown name renders no icon instead of
    a `<use>` pointing at nothing. That needed `ui` to re-export it.
  - **The logo is wired through the seam, not imported.** `_authenticated`'s loader resolves
    `ContentSource.media("brand.logo")`, which is what gives `ImageManifest`, `MediaResolver` and
    `media()` a consumer at once — content records hold a key, never a path, so a CDN is one adapter.
  - **`ApiClient.raw` kept**, already documented as the escape hatch for a namespace with no
    accessor (`P4.12`).
  - **§15 caught the doc drift immediately**, naming two setup pages that showed the deleted files.
    Both sections were rewritten to say what was removed and why rather than deleted, since the
    reasoning is what a reader of a build guide is there for.
- [x] `P5.16` **`/kitchen-sink` ships to production** — `(dev)` is a pathless group, not a
  build condition. Gate: `loader: () => { if (!import.meta.env.DEV) throw notFound() }`; add
  `Callout`, `CodeList`, `QrCode` (three of eleven primitives missing); translate its eleven
  string literals. **Docs:** `ui/docs/index.md:165`. `done: 2026-09-06`
  - **Gated, and the gate is pinned in both directions.** `loader` throws `notFound()` unless
    `import.meta.env.DEV`, and `apps/web/tests/route/kitchen-sink.spec.ts` asserts it throws with
    `DEV` false and does not with `DEV` true — a one-direction spec would pass with the gate
    deleted.
  - **The three primitives are in, with real inputs rather than placeholders.** `CodeList` gets six
    backup-code-shaped strings because the grid's column count is the thing being looked at, and
    `QrCode` gets a genuine `otpauth://` URI because that component re-encodes nothing — a trimmed
    sample renders a QR that scans into an authenticator generating wrong codes. `Callout` shows
    its four tones; the page had listed a fifth, `neutral`, which `CalloutTone` does not have.
  - **Ten of eleven, not eleven.** `Can` renders no element of its own, so there is nothing for a
    visual surface to show. Stated in `ui/docs` rather than left as an apparent gap.
  - **The eleven string literals are deliberately not translated, and the entry's two halves are in
    tension.** Gating the page out of production is what settles it: a route that `notFound()`s in
    production has no users, so there is no user-visible copy for `content` to own. Translating
    them would mean a `dev` namespace in `ClientNamespace` and `NamespaceShape` plus two catalog
    cells — structure built so that nobody can read it, which is what
    [`simplicity`](../docs/ai/rules/simplicity.md) asks about first. Recorded in `ui/docs`.

**Exit.** `grep -rn` for each deleted symbol returns nothing; every remaining permission key in
`CATALOG` is used by at least one `PROCEDURE_PERMISSIONS` entry (add that as a
`contracts` spec).

**Met on 2026-09-06, except `P5.13`, which is blocked on `P8.12`.**
- **The grep is clean.** `EventBus`, `RecordingEventBus`, `SessionGuard`, `SessionQueries`,
  `DocumentEntity`, `AnalyticsReader` and its three implementations, `goalRiskScores`,
  `reliabilityTrend`, `goal_risk_daily`, `user_reliability_daily`, `ANALYTICS_DRIVER`,
  `invalidateAll`, `GeneratedApiKey` and `ApiKeyRow` return nothing outside `dist/` and the
  migration history. One stale mention of `ApiKeyRow` survived in `docs/setup/13` and is gone.
- **The spec is `procedure-permissions.spec.ts`**, "leaves no permission in the catalog without a
  procedure behind it". It exempts the `core` module, because `core.activity.write` is held
  implicitly by every principal in `CapabilitySet.can()` rather than granted through a role — no
  procedure asserts it and none should. Verified by adding a key with no procedure and watching it
  fail.
- **Fourteen keys, thirteen gated.** All five `rbac.*`, all four `member.*`, both `apikey.*` and
  both `ai.embedding.*` now sit behind a procedure that a screen can reach.

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
- [ ] `P6.7` **no package typechecks its own tests** — `tsconfig.json` includes `src/**` only,
  in `apps/worker` and in every other package. Add `tsconfig.test.json`, and drop
  `--passWithNoTests` from the worker's test script.
  - **This is not theoretical, and `P7.5` walked into it.** `StubMembershipReader` in
    `auth.factory.spec.ts` had been missing `isActive` since that method was added to the port:
    an abstract member with no implementation, compiling because nothing typechecks the file, and
    passing because the spec never calls it. A third method made it two. Both are fixed there; the
    hole that let it happen is this entry.
- [ ] `P6.8` **`tooling/scripts` fixtures** — see `P8.10`.

**Exit.** Every file named above has a spec in the mirrored `tests/` path.

---

## Phase 7 — Improvements

- [x] `P7.1` `SystemRoleSeed.run` issues one SELECT per role (four) and runs on every
  organization creation — one `IN` query and one batched insert. **Docs:** `docs/setup/13`.
  `done: 2026-09-06`
  - **Eleven round trips, measured, not four.** Four SELECTs, four role INSERTs and three grant
    INSERTs on a fresh tenant; seven on a re-seed. Now three either way, and the count does not
    grow when a fifth role is added.
  - **Write first, read after.** `onConflictDoNothing` makes one insert correct for a tenant that
    has these rows and for one that does not, which a per-role existence check is not. The read
    back is not optional: `onConflictDoNothing` does not say which rows it skipped, so the
    generated ids are only correct for the rows that landed — and reading `(organization_id, key)`
    afterwards is also what makes two requests creating the same tenant safe against each other.
  - **This takes the `onConflictDoNothing` half of `P8.17`** with it; the transaction and the
    reconciliation of removed permissions are still open there.
  - Four specs, two of them the query-count assertion `P6.6` asks for, both watched failing against
    the previous implementation (11 and 7). They run against a tenant this spec creates rather than
    the seeded one, because a count is only stable if nothing else is seeding the same rows.
- [x] `P7.2` `PgApiKeyRepository.touch` writes `last_used_at` on every authenticated API
  request, awaited — throttle to once per minute (`WHERE last_used_at < now() - interval '1 minute'`).
  `done: 2026-09-06` — closed by `P5.4`, whose feature put the write on a path anyone could reach.
  The throttle is a `notBefore` parameter on the port rather than an interval in the SQL, so the
  window is a domain decision (`ApiKeyRules.TOUCH_THROTTLE_MS`, five minutes) and the adapter holds
  no policy. Verified live: written once, then not rewritten inside the window.
- [x] `P7.3` `PgMaintenanceGateway.sweepExpired` uses `.returning({ id })` to count —
  use the command tag row count. `done: 2026-09-06`
  - `rowCount` off the command tag. The old form shipped every expired session's id back over
    the wire to be `.length`ed and dropped — on a nightly sweep that is the whole expired set
    crossing the socket to produce one integer.
  - **The new spec is coverage, not a regression guard, and the distinction is worth stating.**
    Both forms return the same numbers, so nothing at this level can tell them apart; what the
    spec pins is the contract — exact counts, unexpired rows untouched, zero on a second pass —
    against a live database, which is where a future rewrite would go wrong.
- [x] `P7.4` `PgMembershipReader.organizationsFor` has no limit — cap at 100 and document.
  `done: 2026-09-06`
  - A named constant on the reader, not a literal in the query: the number is a product decision
    about when a switcher stops being a switcher, and past it the answer is search rather than a
    longer list. `docs/reference/enrollers.md` says that, and says the truncation is silent on
    purpose — the port returns a list, and no caller could act on "there were more".
  - **No spec.** Exercising the cap needs 101 tenants for one user, and each one seeds roles and
    ~17 permission rows; that is a slow, brittle fixture guarding a `.limit()`. Recorded rather
    than skipped quietly.
- [x] `P7.5` `/organization/create` is bounded only by a 5/min rate limit; each call seeds
  roles and ~17 permission rows — per-user cap on owned organizations (`AUTH_MAX_OWNED_ORGANIZATIONS`,
  default 10). **Docs:** `auth/docs/reference/organization-plugin.md`. `done: 2026-09-06`
  - **A rate limit bounds the rate, not the total.** Five a minute is three hundred an hour, and
    nothing in that is abusive by the rate limit's own measure. The two limits answer different
    questions and the endpoint needed both.
  - **Owning is holding the `owner` role, not having founded it** — the definition that survives a
    transfer. `ownedCount` is a `count(*)` over memberships joined to `roles`, deliberately not
    `organizationsFor().length`: that read is capped at 100 by `P7.4`, so counting it would make the
    check pass forever once someone reached the ceiling.
  - The field runs `env.ts` → `ContainerConfig` → `AuthConfig` → `OrganizationPlugin.create`, which
    is four files for one number, and correct: `auth.config.ts` says none of its values are literals.
  - **It found something else on the way.** No package typechecks its own `tests/` — every
    `tsconfig.json` includes `src/**` and not `tests/**` — so `StubMembershipReader` in
    `auth.factory.spec.ts` had been missing `isActive` since that method was added, and compiled
    anyway. `P6.7` names this for `apps/worker`; it is every package. Both stale doubles are fixed
    here, and `P6.7` now says so.
  - Two specs on `ownedCount`, against a fixture where one user owns two tenants and another owns
    one while belonging to two — which is the pair a membership count would get wrong. No spec on
    the endpoint itself: reaching it needs a live Better Auth instance and a request, and the
    `auth` package's own specs read `auth.options` back rather than serving anything.
- [x] `P7.6` `ClickHouseConnection.encode` builds `'${String(v)}'` with no escaping — escape
  `\` and `'`. `done: 2026-09-06`
  - **Only the array branch needed it, and the reason is worth keeping**: a scalar rides its own
    `param_*` query-string entry and is never quoted, so nothing in it can end anything. An array has
    to go over as a literal, and each element was wrapped in quotes with no escape.
  - **Not a route into the statement — a route into the value.** The predicate stays bound, so this
    is not injection into SQL; an element carrying `'` closed its own string and became *two*, and a
    filter list then matches rows the caller never named. Confirmed by watching the old code emit
    `['a'b','c']` for `["a'b", "c"]`.
  - **Backslash first, then quote**, or the escape the first pass writes is escaped by the second.
    There is a spec for that ordering specifically, because getting it backwards still looks right.
- [x] `P7.7` `Uuid.isValid` checks the variant nibble, not the version — tighten to `[7]` or
  rename `isValidV7`. `done: 2026-09-06`
  - **Neither, and the third option is the one the package's own reference doc argues for.**
    `core/docs/reference/uuid.md` records the general-shape-guard intent as deliberate — "an
    identifier minted elsewhere is still an identifier" — and per the rulebook a package's
    `docs/reference/` wins over a line in this file. Tightening to `[7]` would move a schema decision
    into a regex; renaming would keep the loose check and give it a name that lies.
  - **What was actually wrong is narrower than the entry says.** The version group was `[0-9a-f]`,
    which is to say the version was not checked at all: a correct variant alone passed a version
    nibble of `0` or `f`, so the nil UUID and the max UUID were accepted. `[1-8]` is every version
    RFC 9562 defines. A v4 still passes, deliberately, and there is a spec saying so.
  - **No production callers** — `isValid` is used only by its own spec — so this is a correctness fix
    to an exported surface rather than a behaviour change to anything running.
- [x] `P7.8` `Container.dispose()` never closes the SMTP transport — `SmtpEmailSender.close()`.
  `done: 2026-09-06`
  - The container now holds the sender concretely as `emailSender` and exposes it as `email`, the
    same split `queuePublisher`/`queue` already uses: `EmailSender` is a port and says nothing
    about a transport's lifetime, which is exactly why this one got forgotten.
  - Nodemailer keeps sockets open between sends, so a process exiting without closing them waits
    on the SMTP server to time each one out. `close()` is not `async` — nodemailer's is
    synchronous, and `require-await` is right to say so.
  - Spec is on `SmtpEmailSender.close()` rather than on `Container.dispose()`, which would need a
    live Postgres, Redis and S3 to construct. It fails without the fix by not compiling, which is
    the stronger failure. `boot-smoke` re-run after the change: still a clean drain.
- [x] `P7.9` `MessageStore.ensure` has no in-flight de-duplication (`SessionStore.ensure` has)
  — share the promise per namespace set. `done: 2026-09-06`
  - **Per namespace, not per set**, which is a deliberate departure from the entry. Two routes
    rarely declare the same set and often overlap: `["nav", "auth"]` and `["auth", "role"]` should
    be two requests covering three namespaces, not two covering four. Keying on the set would
    de-duplicate only the exact repeat.
  - **`SessionStore` needs one `inFlight` field because it loads one thing**; a store whose unit of
    work is a set needs a map, and the map is keyed by locale *and* namespace so a load still
    running when the locale changes cannot be joined by a caller that now wants the other language.
  - **It found a second bug while being fixed.** `load()` re-checks the locale before merging: a
    bundle arriving after `setLocale()` is the previous language's copy, and merging it puts old
    sentences under keys the new bundle also has. That failure is silent — the page renders fluent
    text in the wrong language rather than a missing key — and the old code had it too.
  - Five specs; three fail against the previous implementation, including the locale race, which is
    what says it was real rather than hypothetical. `docs/setup/20` carries both arguments.
- [x] `P7.10` `auth` namespace is 82 keys and every one loads for `/forgot-password` — split
  `auth` (sign-in/up/recovery) from `account` (settings). **Docs:** `content/docs/reference/namespace.md`.
  `done: 2026-09-06`
  - **42 keys, not 82, on the signed-out pages.** `auth` keeps the flows that run before there is a
    session; `account` takes the 40 keys a signed-in person reads in settings. Measured in the built
    client bundle: `auth` is 2,259 bytes in English and 4,709 in Bengali, `account` another 2,343 and
    4,752 — and `/forgot-password`, which renders three visible strings, used to download both.
  - **The line is the session, not the feature area.** `sign-out.button.tsx` lives in
    `feature/src/auth/` and now reads `nav`, because the folder groups by feature and a namespace
    groups by when it is downloaded.
  - **Six shell keys went to `nav`**, which the signed-in layout already loads: sign-out and its
    failure, the two settings links, and the organization switcher's two. Putting them in either half
    would make every signed-in page load that half.
  - **Five strings are duplicated across `auth` and `account`** — `name`, `resetNewPassword`,
    `twoFactorCode`, `twoFactorFailed`, `socialFailed`. A third namespace to hold them would be
    loaded by everything that loads either half, which is the thing being fixed; and identical in
    English is not a promise of identical in a language that inflects. Said in the reference.
  - **The four account specs now name their namespace.** The harness defaults to `["auth"]`, and a
    component reading a namespace nobody loaded renders the raw key — which is how those four failed
    the moment the keys moved, and is worth keeping rather than defaulting the harness wider.
- [x] `P7.11` `useAppMutation` gains `onMutate`/rollback so revoke-invitation, unlink-account
  and revoke-session can be optimistic. **Docs:** `query/docs/reference/mutations.md`.
  `done: 2026-09-06`
  - **`onMutate` was already reachable** — `AppMutationOptions` omits only `onSuccess`, so a caller
    could always have written this by hand. What it could not do is write it *right* four times: the
    hook now declares `optimistic: { queryKey, apply }` and owns cancel, snapshot, rollback, and
    invalidating the optimistic key on success.
  - **Cancel before the write is the step whose absence is unreproducible.** A refetch already in
    flight resolves with the server's pre-mutation answer and puts the row back; it shows up as a
    flicker that depends on network timing.
  - **Rollback runs before the caller's `onError`**, because a failure handler usually renders the
    message beside the row, and the row has to be back for that to mean anything.
  - **`useRevokeInvitation` now takes the page it revokes from.** The invitation list is paginated,
    so the params are part of the cache key; without them the edit would silently apply to page one
    while the reader is on page two.
  - `Rollback` had to be exported — it lands in the inferred return type of every mutation hook, and
    `tsc` refuses to emit a declaration naming a type it cannot reach.
  - Two specs, through `ActiveSessionList` rather than the hook: `packages/query` has no jsdom or
    testing-library and adding them for this would be a dependency for one file. Both watched
    failing with `optimistic` swapped back for `invalidates`. The rollback spec rejects on a later
    tick deliberately — an immediate rejection batches the edit and the rollback into one render,
    and the removal is never observable.
- [ ] `P7.12` a11y — `PermissionMatrix` empty `<th>` (`aria-label`), `<header>`/`<nav>`
  landmarks and a skip link in `_authenticated.tsx`, `aria-busy` on the two raw `<select>`s.
- [x] `P7.13` `AppError.from` adopts a client-supplied `traceId` — only on the client path;
  the server mints its own. `done: 2026-09-06`
  - **Sanitised rather than refused.** Adopting is correct on the client path — a trace id the user
    can quote back is the whole point — so the fix is that `from()` applies the same bound and
    charset check the request path already applies, instead of trusting the envelope.
  - **The rule moved to `TraceIds` in `errors`, and `Correlation.sanitise` now delegates to it.**
    Two copies of a bound-and-charset check is the pair that drifts, and the dependency direction
    settles which package holds it: `observability` imports `errors`, never the reverse. Callers of
    `Correlation.sanitise` are unchanged.
  - **Over-long is truncated, wrongly shaped is dropped.** An over-long id is still probably the
    upstream's and half a trace beats none; a malformed one has nothing worth keeping.
  - Exposure today is zero — `AppError.from` has no production caller, only its spec — so this
    closes a door rather than a hole. Two specs, both watched failing against the old form.
- [x] `P7.14` `LokiLogReader implements LogReader` while every sibling `extends` — align, and
  drop the `type` import in `infrastructure/src/import.ts`. `done: 2026-09-06`
  - `implements` on an abstract class buys nothing and costs the `override` checking: a port method
    renamed leaves the old one behind as a new public method, and nothing says so. Both methods now
    carry `override`, which is what makes that a compile error.
- [x] `P7.15` `AnalyticsConsumer` lag: `lagSeconds` is 0 forever on an empty destination —
  compute from the oldest unprojected row; `reconcile` emits `completed` with a `drifted`
  count instead of returning early. `done: 2026-09-06`
  - **The lag was wrong, but not in the way this entry says, and the difference matters.** It was
    the age of the newest *projected* row, so an empty destination that drains reports the age of
    the newest row, not zero. Zero only ever came back when the audit trail was empty too, where it
    is correct. What is actually reachable — and what the specs reproduce — is a caught-up
    deployment that has been quiet for ninety minutes reporting ninety minutes of lag and tripping
    `analytics.projection.lagged` at `warn` on every run, forever, with nothing wrong.
  - **The other direction is worse and quieter.** A run that stops at its batch ceiling reported the
    age of the last row it *did* write, which understates the backlog it just failed to clear.
  - **Fixed to the oldest unprojected row**, as the entry asks. Caught up is zero and the loop
    already knows it is caught up, so only a capped run pays for the answer — one keyset query for
    the next row after the checkpoint, on the run where the true backlog age is worth a query.
  - **`reconcile` no longer returns early**, and `completed` carries `drifted`. The early return made
    "the reconciliation is finding drift" and "the consumer has stopped" the same absence on a
    dashboard; the one signal this job owes an operator is that it ran.
  - Five specs, three of which fail against the previous implementation. The capped branch is not
    among them: reaching it needs 100,001 records through the in-memory fake, which is a slow
    fixture for three lines — stated rather than skipped quietly.
- [x] `P7.16` `SystemPrincipal.GRANTS` validated per job — once at module load, frozen.
  `done: 2026-09-06`
  - Module-level `const` and `Object.freeze`, not a `static readonly` field — the same shape
    `PermissionRegistry` uses for its own derived views, and the one `docs/ai/rules/classes.md`
    requires.
  - **The cost was never the argument.** The comment above the check said "at boot rather than at
    3am" while the code ran it per call, so a renamed permission surfaced on the first job at 3am.
    `docs/setup/25` stated the per-call behaviour as a deliberate trade-off; it now states the
    module-load one, and why there is no import-order window — `CATALOG` is a compile-time
    constant with no dynamic registration.
  - **No new spec**: once-versus-per-call is not observable without mocking the registry, and the
    outcome — exactly two grants, no `core.*`, not a wildcard — is already pinned by four.

---

## Phase 8 — Worker, tooling, CI, infra, migrations

### `apps/worker`

- [x] `P8.1` **(verified) second signal hard-kills a graceful drain** `P1` `~30m`
  - **Goal:** `stop()` returns `undefined` when `stopping` is already true; `main.ts` chains
    `.then(() => process.exit(0))`, so SIGINT during a SIGTERM drain exits mid-close.
  - **Done when:** `stop()` returns the in-flight promise; spec in
    `apps/worker/tests/bootstrap/worker-bootstrap.spec.ts`. `done: 2026-09-06`
  - **Files:** `apps/worker/src/bootstrap/worker-bootstrap.ts`, `apps/worker/src/main.ts`.
  - **Docs:** `apps/worker/docs/reference/shutdown.md`, `docs/setup/25`.
  - **`draining ??= this.drain(signal)`**, and `stop()` returns it. The boolean guard already
    prevented the double close; what it did not do was give the second caller anything to wait on.
    Both halves are one line and only together are they a guard — `docs/setup/25` says so at the
    listing, because the version with the boolean looks finished.
  - **Four specs, and the two that matter were watched failing** against the previous
    implementation: promise identity, and the late rejection. The other two — one
    `process.stopping` per drain, every worker closed — pass either way, which is the point of
    having them.
- [x] `P8.2` **(verified) signal handlers registered after `start()`; losing race promise
  unhandled** `P2` `~30m` — register before `await bootstrap.start()`; attach `.catch` to the
  `Promise.all(close)` so a late rejection is logged, not fatal. `done: 2026-09-06`
  - **`const started = bootstrap.start()`, handlers, then `await started`.** The handler waits on
    that promise before draining: there is nothing to drain until the consumers exist. Closing the
    window costs three lines and removes the case where SIGTERM during boot gets Node's default
    handling on a worker with consumers running and schedules half registered.
  - **The rejection handler goes on before the race, not after.** Once the backstop wins, the drain
    moves on and `close()` is still pending; a rejection landing later reaches
    `unhandledRejection`, which `main.ts` turns into `process.exit(1)` — over a shutdown that had
    already emitted `process.stopped`.
  - **`apps/worker/vitest.config.ts` gains a `test.env` block**, the same shape and for the same
    reason as `apps/web`'s: `Env` parses at module load, so importing `WorkerBootstrap` at all
    needs a complete environment. `WORKER_SHUTDOWN_TIMEOUT_MS` is 20ms there so a spec can let the
    backstop win without waiting on the 25s production default.
  - **Verified against the real process too**, not only in vitest: SIGTERM and SIGINT delivered
    back to back to the built worker drains once and exits 0, and `boot-smoke` still passes.
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

- [x] `P8.6` **(verified) summary counts skipped as passed** `P1` `~30m` —
  `check-architecture.mjs:634-639` prints `${results.length} assertions passed` with `○`
  lines included; print `passed / skipped`, exit 1 on any skip when `CI=true`. `done: 2026-09-06`
  - Skips are counted apart and never summed into the passes, and `CI=true` turns one into a
    failure. Verified by deleting `apps/web/.output` and running with `CI=true`: `15 passed, 1
    skipped, of 16` and exit 1.
  - `process.env` in a tooling script needs a Biome exemption; `check-architecture.mjs` joins the
    four scripts already named in `tooling/biome-config/src/base.json` rather than a `tooling/**`
    glob, so each stays a decision.
- [ ] `P8.7` **§8 cannot see a stale bundle** `P2` `~30m` — the local 13/13 observed during
  the audit ran against an `.output` predating T-027..029. Fail when the newest file under
  `apps/web/src` is newer than `apps/web/.output`.
- [ ] `P8.8` **assertion blind spots** `P2` `~2h` — §5 walks `packages/*` only (`P1.10`);
  §10 (`AuditTrail`) does not walk `docs/`, where the drift it was written for lives; §3's
  `*.config.*` exemption matches `src/**/container.config.ts` (narrow to root and package-root
  configs; mirror in `biome-config/src/base.json:122`); §3's regex hits `process.env` inside
  comments (strip comments first); §6 and §9 regexes are column-0 dependent and pass silently
  on nested or minified output.
- [x] `P8.9` **new schema assertions** `P1` `~3h` — **§17** every unique index on a table
  carrying `organization_id` leads with it, with the documented exemption list; **§18** every FK
  column in a `pgTable` has an index. Both are stated as non-negotiable in
  `docs/ai/rules/data.md` and were checked by nothing.
  **Docs:** `docs/setup/26`, `workflow.md`, `AGENTS.md` (eighteen). `done: 2026-09-06`
  - **They are §17 and §18, not §16 and §17** — `P8.12` took 16 for the pnpm declarations.
  - **They read the drizzle schema, not `migrations/*.sql` as this entry proposed.** The schema is
    the file a person edits and the file `db:generate` diffs against, so an index missing there is
    missing from the next migration too; replaying migrations would additionally have to track
    every later `DROP INDEX` to end at the live set, and get `0004`'s drop-and-recreate right, to
    reach the same answer. The gap that leaves is a hand-edited migration, and it is a gap drizzle
    already has: DDL the schema does not declare is DDL the next generate proposes to drop. Said in
    `docs/setup/26` at §18.
  - **A shared parser, because a regex over `pgTable(...)` cannot do this.** `closingBracket` walks
    brackets while skipping strings and `//` comments; `pgTableBlocks` splits each call at the
    columns object so a column and an index are never matched by the same pattern. Verified against
    all sixteen tables: partial indexes, `.desc()` columns, and the HNSW index — which leads with no
    column and is correctly absent — all parse.
  - **§17 matches `organization_id` as a whole quoted name.** `users.last_active_organization_id`
    ends with the string; a `String.includes` test, which is what §9 uses, makes a table carrying no
    tenant look like one. §9 survives it only because `users` is in its exemption list.
  - **§18 found four real gaps**, all the same shape: the FK column present inside a tenant-leading
    composite and therefore useless to the cascade — `api_keys.issuer_id`,
    `role_permissions.role_id`, `goal_members.user_id`, `permission_overrides.user_id`. Deleting a
    user or a role scanned the whole child table under a lock. `0013` adds the four, named
    `<table>_<subject>_fk_idx` so nobody later reads one as a duplicate of the composite beside it.
  - **A second index, not a reordering.** `goal_members_user_idx` on `(organization_id, user_id)` is
    on `CapabilityRepository.resolveFor()`'s path, which runs on essentially every request;
    reordering it to serve the cascade trades a hot read for a rare write.
  - **Both were verified by breaking them**: `roles_key_uq` reduced to `(key)` and
    `memberships_role_idx` deleted, each named by exactly one failure line, then restored.
- [ ] `P8.10` **scripts are untyped and untested** `P2` `~4h` — `// @ts-check` +
  `tsc --checkJs` in `tooling/scripts/package.json`; `tests/check-architecture.spec.mjs` runs
  each assertion against a fixture tree that violates it (`docs/setup/26:210` demands this);
  `check-contrast.mjs` missing-name branch blames the wrong name and `--border` presence is
  never checked.

### CI and hooks

- [x] `P8.11` **(verified) pre-push runs only ESLint** `P1` `~15m` — `.husky/pre-push`:
  `pnpm lint:fast && pnpm check:architecture && pnpm check:contrast`; keep `typecheck` in CI
  (slow). `.lintstagedrc.json` stays biome-only. **Docs:** `docs/setup/26:56`. `done: 2026-09-06`
  - Four checks, about a second in total, measured. `typecheck` and `test` stay in CI: a hook people
    learn to `--no-verify` past checks nothing.
- [x] `P8.12` **`ci.yml`** `P1` `~2h` — `audit` job is `continue-on-error` at job level
  (cannot signal): step-level plus a summary write; `env:` lacks every `S3_*`, `EMBEDDING_*`,
  `AUTH_*` key both `env.ts` schemas require (the job survives because nothing evaluates
  `Env`) — add them and a boot-smoke step per app; add a MinIO service (S3 gateway and
  activity archive have zero coverage); run `pnpm --filter @loadbearing/worker build`;
  `actions/cache` on `packages/*/dist` (promised at `26:426`); "fifteen themes" comment is
  five; pin `pnpm/action-setup` to `packageManager`. `done: 2026-09-06`
  - **CI had never passed, on any branch, ever.** `pnpm/action-setup@v4` reads the root
    `packageManager` field and nothing else; this repo declared only `devEngines.packageManager`,
    so both jobs died in about twenty seconds before a single check ran. Every "verified" claim in
    this plan rested on local runs.
  - **`docs/setup/26` already described the failure** in a CAUTION block and then contradicted
    itself forty lines later — *"leave the action's `version` input unset"* is the advice that
    produced the broken workflow. Both passages are reconciled.
  - **Assertion 16 makes the drift impossible rather than unlikely:** both declarations must exist
    and agree. Verified by removing one and watching the check fail.
  - **The `env:` block now carries every key both schemas require**, and the boot smoke is what
    makes that mean something — before it, nothing in CI ever evaluated `Env`, so a missing key was
    invisible until a deploy.
  - **`tooling/scripts/boot-smoke.mjs`** boots the built worker, waits for `process.started`, sends
    SIGTERM and requires a clean `process.stopped` exit. Verified three ways: it passes on a good
    boot, fails with no env at all, and fails with one key removed.
  - **No web boot smoke.** Its server bundle throws `jsxDEV is not a function` — `T-032`. The step
    lands with that fix, and the script's `APPS` table says so at the line someone will read.
  - **MinIO is a `docker run` step, not a `services:` entry**, because it needs `server /data` and a
    service container takes no command. `P5.13` is unblocked.
  - **The `dist` cache was written and then removed.** `tsup` has no incremental mode, so a restored
    `dist/` is rebuilt by the very next step; it would only pay off by making the build conditional
    on a cache hit, and a stale `dist/` silently used is a worse failure than a slow job. The pnpm
    store half is already done by `actions/setup-node`. `docs/setup/26` says this now.
  - **"fifteen themes" was five**, and the comment now carries the real number, 117 pairings.
  - **The first run that got past `action-setup` failed, and found something real.**
    `apps/web/src/route-tree.gen.ts` is generated by the TanStack plugin and gitignored, so a clean
    checkout has no route tree: 48 `error TS` lines across every route file, all cascading from one
    `Cannot find module './route-tree.gen'`. **This repository had never been typecheckable from a
    clean clone** — `pnpm typecheck` only ever passed for someone who had already run `dev` or
    `build`. Reproduced locally by deleting the file (48 errors, same as CI), fixed by moving the
    web build above `typecheck`, and verified from a clean state: 0 errors.
  - `docs/setup/26` and `docs/ai/rules/workflow.md` now say so, because the error names none of it.
- [ ] `P8.13` **doc-promised jobs** — compose smoke job, `pnpm peers check`, `pnpm sbom`
  (`26:426-432`): implement the first (boot `infra:up`, `db:migrate`, `db:seed`, hit
  `/api/health`), drop the other two from the doc.

### Migrations and seed

- [x] `P8.14` **auth tables** `P1` `~1h` — `accounts` has no unique index on
  `(provider_id, account_id)` (two rows per Google account accepted);
  `two_factors_user_idx` is not unique (two TOTP secrets per user). Migration + `auth.schema.ts`.
  Run `pnpm auth:tables` and diff. `done: 2026-09-06`
  - **`pnpm auth:tables` shows no column drift**, which is the useful negative result: `getSchema`
    reports column-level uniqueness and knows nothing about composite indexes, so neither defect was
    ever going to appear in that diff. Both are index-level and both are ours to declare.
  - **`0012` de-duplicates before it creates**, per `P8.16`: `accounts` keeps the earliest
    `(created_at, id)` per `(provider_id, account_id)` — the original link — and `two_factors` keeps
    the verified enrolment over a later abandoned one. The live database held no duplicates, so the
    de-dup was verified by inserting both collisions by hand, migrating, and checking that the row
    meant to survive is the row that did.
  - **`IF NOT EXISTS` on the creates, `IF EXISTS` on the drop.** Drizzle's journal runs a migration
    once, but a migration also gets applied by hand to a branch database or a restored snapshot, and
    the second run should be a no-op rather than an error.
  - The recipe is now `docs/setup/13`, "writing a unique-index migration" — the other half of
    `P8.16`.
- [ ] `P8.15` **unpartitioned append-only tables** `P2` — `activity_archive`. It is the only one
  left: `P5.12` deleted `goal_risk_daily` and `user_reliability_daily`. Partition by month in a
  migration; hand-edit the DDL as `activity_log` did. **Docs:** `docs/opinions/data-and-scale.md`.
- [ ] `P8.16` **migrations that fail on existing data** `P2` `~1h` — `0003` and `0004` add
  unique indexes with no de-dup; `0004` drops `memberships_uq` before recreating it. Ship a
  migration that is idempotent, and a `docs/setup/13` section "writing a unique-index migration"
  (delete duplicates → create index, in one transaction).
  - **The doc half is done** (`P8.14`), and `0012` is the worked example it quotes. What is left is
    `0003` and `0004` themselves, which have already run everywhere they are going to run — so the
    remaining work is deciding whether a replayed history is a case this repo supports at all,
    rather than writing SQL.
- [ ] `P8.17` **seed** `P2` `~1h` — organization insert and `SystemRoleSeed.run()` in one
  transaction; roles insert gains `onConflictDoNothing`; permissions removed from the catalog
  are reconciled off `owner` (today only ever added); `seed.ts` falls back to `"loadbearing"`
  while `env.ts` has no default, so under `personal` mode the seeded organization is never
  joined — make the seed print that under `personal` it creates nothing but the system roles
  template, or make both read the same default.

### Infra

- [x] `P8.18` **compose** `P1` `~1h` — MinIO healthcheck runs `mc ready local` inside the
  server image (no `mc`; the alias lives in `minio-init`) → HTTP `/minio/health/live`;
  `minio-init` gets `restart: "no"`; Alloy's docker-socket mount gets `group_add` so it
  collects on Linux; ClickHouse user/db `ratchet` vs `env.ts` default `default` — align.
  **Docs:** `docs/infra/reference/compose.md`. `done: 2026-09-06`
  - The MinIO probe could only ever fail: `mc` is absent from the server image and the `local` alias
    it names is created by `minio-init`, which waits on this healthcheck. HTTP `/minio/health/live`
    now.
  - **ClickHouse is aligned by a cross-field rule, not by changing the defaults.** `env.ts` explains
    that a default naming the project would be a credential baked into shipped code — that reasoning
    is sound, so setting `CLICKHOUSE_URL` now *requires* `CLICKHOUSE_DATABASE` and `CLICKHOUSE_USER`
    instead. Both apps; the worker had no `superRefine` before. Verified by setting the URL with the
    defaults left alone and watching boot refuse with both field paths.
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
