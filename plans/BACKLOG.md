---
title: Backlog — every task not done, from every plan file, in one place
updated: 2026-09-20
owner: sami
schema: backlog/v1
source: compiled 2026-09-20 at 885e144 from the five ledgers, which moved to archive/ the same day
---

# Backlog

**This is the only open ledger. Everything else in `plans/` is history.**

Everything not done, gathered once. Five files used to hold open work and each held a different
kind: `archive/PLAN.md` the unchecked boxes, `archive/REVIEW.md` forty-five defects nothing has
fixed, `archive/STUCK.md` what a session could not do and why, `archive/OPEN.md` the ledger of what
closed and what did not, `archive/TODO.md` three ledger rows. All five moved to `archive/` on
2026-09-20 and this file replaced them. They are still the place each item's **full argument**
lives — every entry below is a summary with a pointer — but nothing is ticked there any more.

> **How to use this file**
>
> 1. **Every entry keeps its original ID** — `23.3`, `R.7`, `S.1`, `T-036` — and points at the
>    archived file and line that hold the full text. Read the body before acting on a summary.
> 2. **Tick it here.** `archive/` is not edited: a file in it is the record of what was decided,
>    not a checklist. Fix the item, tick or delete the line here, and add a changelog row.
> 3. **Nothing here is a place to argue a decision.** The argument is in the archived body. A new
>    decision goes in the entry here and says it supersedes.
> 4. **Line numbers are as of `885e144`** and are stable, because the archived files no longer
>    change. If one is ever off, the ID is the truth and the number is the hint.
> 5. Every claim below about the *tree* — "still true", "already resolved" — was re-read from the
>    source on 2026-09-20 rather than copied from the plan that made it.

**The count.**

| Section | What | Open |
|---|---|---|
| 1 | `archive/PLAN.md` unchecked boxes, Phases 23–26 | 35 |
| 2 | `archive/REVIEW.md` defects | 10 |
| 3 | `archive/STUCK.md` blockers | 3 |
| 4 | Unfinished work buried inside ticked items | 7 |
| 5 | Verification owed — browser, manual, or a scale not run | 9 |
| 6 | Conditional work — "reopen when" | 11 |
| 7 | `archive/TODO.md` ledger rows | 3 |
| 8 | Doc housekeeping still owed | 2 |

Sections 1–3 are the work. Section 4 is work the ledgers say is done and is not. Sections 5–8
are cheaper than the rest and are listed so nobody re-derives them.

> **The stack runs again, as of 2026-09-20.** Every port it needed — 5432, 6379, 9000, 1025, 8025 —
> was held by two unrelated projects, so nothing could start: the whole of `packages/infrastructure`
> was red with an authentication error from *another project's* Postgres, and two `Container.health`
> cases timed out. Every published port is now the well-known one with a `1` in front, stated once
> in the root `.env`, which is now the only env file. `infra/.env` and `packages/infrastructure/.env`
> are gone, and `check:architecture` §27 fails the build if a port and the URL that dials it ever
> disagree. The infrastructure suite is 35 files and 236 tests green; `composition` is green.
>
> **A second node runs too**, under `pnpm infra:up:sharded` with the two `DATABASE_SHARD_1_*`
> lines in `.env`. That is what proved half of `R.2`. What still needs a decision rather than a
> container is `24.1`, the foreign-key call, and the items behind it — `24.2` and the outbox half
> of `R.2`'s proof. An entry that is blocked says so.

**Every archived plan was checked and carries nothing of its own.** Every `[ ]` in
`archive/COMMUNICATION-PLAN.md`, `DB-SCALING-PLAN.md`, `PLATFORM-ADMIN-PLAN.md` and
`IMPLEMENTATION-PLAN.md` maps through `archive/PLAN.md`'s **Where the old IDs went** table to an item that
is either ticked there or listed in section 1 below. The four blockquoted Exit clauses in the
communication plan are `23.5`–`23.11`. `DB-SCALING-DEFERRED.md`'s two items were reopened and
delivered as Phases 18–20. `P2.20` was dropped as moot; `P8.3` is `23.4`, done.

---

## 1. `archive/PLAN.md` — the thirty-five open boxes

All in Phases 23–26. Phases 1–22 have no open box. Each line: what, where it stands, what it waits
on, and the `archive/PLAN.md` line that holds the entry.

### Phase 23 — Loose ends, no gate

**Fixes with a recommendation filed and not taken.** Each is a decision the owner has to make; the
recommendation under the entry was measured, not argued.

- [ ] `23.1` **The `jobId` duplicate-suppression window is ~5 s, not 86 400 s.** The drain's
  repeat job (`removeOnComplete: 10`, once a second) trims the shared `EVENT` completed set, so the
  deliveries' `removeOnCompleteAgeSeconds` never applies. Not a correctness bug — subscribers are
  idempotent on `event.id`. **Recommended:** accept the seconds-long window and correct two
  comments (`10.8`'s note and `JobOptions.removeOnCompleteAgeSeconds` in
  `packages/application/src/port/queue.publisher.ts`). No behaviour change. `R.24` is the same
  fact from the other bound. — `archive/PLAN.md:3354`
- [ ] `23.2` **`pnpm smoke` publishes a probe job onto the live `MAINTENANCE` queue**, and a
  running worker logs `queue.job.failed {jobId: "smoke-unnamed"}`. **Recommended:** one local
  constant `SMOKE_QUEUE = "smoke"` in
  `packages/infrastructure/tests/smoke/redis.smoke.spec.ts` replacing the seven
  `QueueName.MAINTENANCE` references — `publish` takes a `string`, so no `QueueName` member is
  added. — `archive/PLAN.md:3397`
- [ ] `23.3` **The QueryClient is not dehydrated**, so every loader prefetch is thrown away and the
  client refetches what SSR already rendered. **Recommended, option (d):** name `DehydratedState`
  in the router's `SerializableExtensions` (a `declare module` block in `apps/web/src/router.tsx`),
  then `dehydrate(queryClient)` into the payload and `hydrate` back out. Written, typechecked,
  built and served, then reverted; no dependency, no cast. The one judgement left is that the
  augmentation is global. **`23.6` is behind this.** — `archive/PLAN.md:3429`

**Exit clauses that need a browser** — the eight from Phases 10–13, blocked by `S.1`. The
checklist that turns these into twenty minutes of work is in `archive/STUCK.md` S.1.

- [ ] `23.5` **The inviter's second tab refetches the member list without a reload.** The server
  half is proved (an SSE stream over `curl` received `member.changed` after an invite). What is
  left is the browser reacting to it. — `archive/PLAN.md:3515`
- [ ] `23.6` **The loader's prefetch of page 1 and the unread count reach the browser.** Will fail
  until `23.3` lands; leave unticked and say why, or fix `23.3` first. — `archive/PLAN.md:3523`
- [ ] `23.7` **The bell count moves on refocus.** — `archive/PLAN.md:3528`
- [ ] `23.8` **A row is marked read optimistically and stays read after refetch.** — `archive/PLAN.md:3532`
- [ ] `23.9` **Killing the web process and restarting it reconnects the stream, and a `resync`
  frame arrives.** `EventSource`'s own reconnect; only the network panel can show it. — `archive/PLAN.md:3536`
- [ ] `23.10` **A sent message appears optimistically** and is reconciled, not duplicated, on a
  throttled connection. — `archive/PLAN.md:3540`
- [ ] `23.11` **Typing indicator clears** within its timeout with no further keystroke. — `archive/PLAN.md:3544`
- [ ] `23.12` **Record the walk** — tick the matching clauses in
  `archive/COMMUNICATION-PLAN.md`'s Exit blocks (lines 679, 942, 1209, 1522) and close `T-036` in
  `archive/TODO.md`. — `archive/PLAN.md:3548`

**From `archive/TODO.md`.**

- [ ] `23.14` **Bring back an analytics reader, with the first dashboard** `P3` `~8h`. Gated on
  its own order: let the projection fill and reconcile for days first, then write the reader
  against real data. Four decisions carry over (new port, read-only, resolved scope, ISO periods).
  Step one is done — the analytics profile is up and `ch:migrate` applied (`S.2`). — `archive/PLAN.md:3586`
- [ ] `23.15` **The English fallback layer is dead payload** `P3` `~3h`. A `bn` page carries
  3 471 characters of English it can never read. **Recommended:** drop the base layer —
  `StaticContentSource.messages` returns `base: {}`; `MessageSnapshot` keeps both fields for a CMS
  source; two specs. Both reasons the entry gave for keeping it were checked and neither holds as
  built. — `archive/PLAN.md:3610`

**Found on 2026-09-20, filed rather than fixed.**

- [ ] `23.20` **The shipped configuration warns about itself on every worker boot** —
  `worker.pool.oversubscribed {concurrency: 20, poolMax: 10}` from `.env.example`'s own numbers.
  **Recommended (a):** raise the shipped `DATABASE_POOL_MAX` to 20 in `.env.example` and both
  `env.ts` defaults. (b) count only consumers that touch the database; (c) a separate
  `WORKER_DATABASE_POOL_MAX`. A defaults decision; the number wants choosing beside `23.21`'s. — `archive/PLAN.md:3767`
- [ ] `23.21` **The worker's first boot against a real stack is not clean.** Two things. (1)
  `partitions-boot` logs nothing for 29.9 s, BullMQ's 30 s `lockDuration` expires, the job is
  re-delivered and runs twice — at 78 tenants. **Recommended:** a `lockDuration` on the
  maintenance `Worker` that matches its work (five minutes). (2) `AnalyticsConsumer.project`
  places each tenant *outside* the per-tenant `try`, so an unplaceable tenant aborts the run
  without `analytics.projection.failed`. **Recommended, one line:** move `withShard` inside the
  `try`. The larger question — skip or fail an unplaceable tenant — is left open. — `archive/PLAN.md:3802`
- [ ] `23.24` **`apps/web` has no smoke suite.** Nothing proves the system behaves as a system;
  one `curl` session (`archive/OPEN.md` "Proved end to end over HTTP") did it by hand. Shape:
  `apps/web/vitest.smoke.config.ts`, a `globalSetup` that spawns `.output/server/index.mjs` (extract
  from `tooling/scripts/boot-smoke.mjs`), Mailpit's HTTP API as the verification channel. **Decide
  first:** whether it runs in the `compose` job or a third one, and whether it shares `pnpm test`'s
  database. **Cheapest useful subset:** one case proving an SSE frame reaches an HTTP client. — `archive/PLAN.md:3875`

### Phase 24 — The physical split 📁

Filed until a second node is provisioned. One compose container is enough to *run* the smoke and
not enough to *decide* `24.1` (`S.3`).

- [ ] `24.1` **The foreign-key decision.** Ten `cascade` FKs cross from a shard to the catalog —
  nine on routed tables, one on local `outbox_event`, referencing only `organizations` and
  `users`. **Recommended (a):** drop them, sweep routed rows by `organization_id` per shard, count
  orphans nightly. The measurement behind it: a `users` delete already costs a
  `conversation_members` scan per tenant partition (300 users exceeded a 30 s `statement_timeout`
  at 82 tenants); (b) would fire that on every node, (a) prunes a tenant delete to one partition.
  Carry into whichever lands: a *user* delete becomes a maintenance job at a few thousand tenants.
  `R.2` is gated on this. — `archive/PLAN.md:3907`
- [ ] `24.2` **Tenant move** as a `MaintenanceConsumer` job — `shard_assignments.moving_to`,
  `ensureTenantPartitions` on the target, keyset copy, verify counts, flip `node`,
  `resolver.invalidate`, drop the source after a grace period; write freeze as a `ForbiddenError`
  from `shardMiddleware`. Lands with `25.5`'s procedure and flips `Container.hasShardMoves`. — `archive/PLAN.md:3971`
- [ ] `24.3` **Read replica per shard** — `DATABASE_SHARD_<n>_REPLICA_URL`, `cluster.reader(key)`,
  dashboard and analytics reads moved onto it. `25.1`, `25.2` and the `platform.replica.manage`
  key wait on this. — `archive/PLAN.md:3979`
- [ ] `24.4` **The catalog is the last single primary** — measure first; a replica for its reads
  if it hurts. — `archive/PLAN.md:3983`
- [ ] `24.5` **Two-node proof** — half done: `sharded.smoke.spec.ts` is **4 passed** with the
  `sharded` profile and the two `DATABASE_SHARD_1_*` lines. The second clause, a tenant move under
  load with no lost writes, waits on `24.2`. — `archive/PLAN.md:3987`
- [ ] `24.6` **Load test the routed paths at 10×** — half ran (`tests/smoke/routed.smoke.spec.ts`,
  `ROUTED_SCALE=1`): a warm placement resolve is 679 µs, a miss 2 568 µs, the cross-node walk is
  serial. **The write half cannot run**: a routed insert on node 1 is a `23503` before it can be
  timed, which is `24.1`. — `archive/PLAN.md:3997`
- [ ] `24.7` **A pooled partition for the long tail** — small tenants share one `<table>_pool`
  list partition and graduate on a size line. Not built until `16.12`'s number says so (section 6). — `archive/PLAN.md:4015`

### Phase 25 — The replica panel and the shard map 📁

- [ ] `25.1` **Status** — `InspectPlatformStatusUseCase` grows `replica: { healthy, lagSeconds } | null`.
  Waits on `24.3`. — `archive/PLAN.md:4036`
- [ ] `25.2` **The switch** — `platform_policy.replica_reads_enabled` exists since `20.8` and is
  read by nothing; `toggle-replica-reads.use-case.ts` under `platform.replica.manage` lands with
  `24.3`. — `archive/PLAN.md:4040`
- [ ] `25.3` **Colder storage class** — `transitionAfterDays` and a storage class on
  `LifecycleRule`, once someone pays for Glacier; MinIO needs a configured tier. — `archive/PLAN.md:4046`
- [ ] `25.5` **The move button** — rendered and disabled today; `move-tenant.use-case.ts`
  (`platform.shards.manage`) and the `shards.move` procedure land with `24.2`. `R.44` notes the
  button has no `onClick`, so it goes live and does nothing the day `hasShardMoves` flips. — `archive/PLAN.md:4114`

### Phase 26 — Communication follow-ups 📁

Each names its trigger. `26.2`, `26.8`, `26.9` and `26.12` closed on 2026-09-20.

- [ ] `26.1` **Threads, reactions, attachments** — `messages.parent_id`, `message_reactions`,
  `message_attachments` over `presignUpload`; each its own slice increment. — `archive/PLAN.md:4133`
- [ ] `26.3` **Web push** — a `PushPublisher` port beside `MailPublisher`; lands with its first
  adapter and `Container` line or not at all. — `archive/PLAN.md:4159`
- [ ] `26.4` **Message archive** — old `messages` partitions to S3 behind a per-tenant retention
  setting. Note `messages` is `retentionMonths: null` by decision D47, so this needs that decision
  revisited first. — `archive/PLAN.md:4162`
- [ ] `26.5` **Redis Streams behind `RealtimeSubscriber`** — `XADD`/`XREAD` from
  `last-event-id`, a real replay on reconnect. Same port. `R.27` (CORS omits `last-event-id`) is
  worth fixing before this. — `archive/PLAN.md:4165`
- [ ] `26.6` **Global stream cap and presence** — `INCR` with TTL per user in the cache Redis. — `archive/PLAN.md:4168`
- [ ] `26.7` **Per-tenant digest hour**, channel mentions, notification grouping — also holds the
  recipient list, count and opt-out that `23.4` called product work. — `archive/PLAN.md:4171`
- [ ] `26.10` **A delivery log, if the question arrives** — an append-only table written by the
  consumer, built only when "was this sent" cannot be answered from Loki or the provider. — `archive/PLAN.md:4248`
- [ ] `26.11` **Move from SMTP to a provider API** — one adapter behind `EmailSender`; moves the
  entry from Tier 0 to Tier 2 in `dependencies.md`. — `archive/PLAN.md:4254`

---

## 2. `archive/REVIEW.md` — forty-five defects a green build does not catch

A full read at `d98c9f3`, verified by reading callers; **runtime-proved** means reproduced with a
script. Each line: where, the failure, the shape of the fix. The full entry with the proof is in
`archive/REVIEW.md` under the same ID. Ranked as the review ranked them.

**Fifteen are fixed**, all on 2026-09-20: every High (`R.1`–`R.5`), plus `R.12`, `R.13`,
`R.22`, `R.27`, `R.28`, `R.29`, `R.30`, `R.31`, `R.35` and `R.44`. **Thirty are open.**

### High — data loss, a page that crashes, or a feature that never happens

- [x] `R.1` **The nightly sweep destroyed every `outbox_event` cold archive** `done: 2026-09-20`
  - Fixed with `R.5`'s tombstone rather than by excluding `NO_TENANT`, because one column
    answers both: an outbox row is never stamped, so the sweep never sees it.
    `retention_policy.cold_months` for `outbox_event` is honoured for the first time.
- [x] `R.2` **Every cross-node pass ran its transaction on node 0** `done: 2026-09-20`
  - **Both gateways were handed the catalog unit of work**, whose `handle()` returns the catalog
    client and never reads `ShardScope`. They declare themselves `local`, and `local` is
    deliberately compatible with an open `catalog` transaction, so `this.db` inside returned node
    0 rather than tripping the wire. `eachShard` set the scope per node; the transaction ignored
    it. `Container` now builds a third, `local`-placed `PgUnitOfWork` and binds both to it.
  - **The second bug under the same binding is fixed with it.** `PgMaintenanceGateway` is `local`,
    but `sweepExpired` deletes from `sessions`, `verifications` and `invitations` — all catalog.
    It worked only because `local` falls back to node 0 outside a scope, and binding it correctly
    would have made it sweep whichever node the loop was on. It uses `catalogDb` now, which is the
    sanctioned crossing from `local` and exists for exactly this.
  - **Proved on two real nodes**, which the entry said was impossible. `24.1` gates the *outbox*
    half only: that needs a row in node 1's `outbox_event`, whose foreign key to `organizations`
    is the `23503`. The runway half needs no key, so `sharded.smoke.spec.ts` now asserts a month
    partition lands on node 1 **and not on the catalog** — it fails on the old binding.
  - **Still owed, and it is the outbox half:** with two nodes, a spec that drains node 1's outbox.
    It waits on `24.1` like the rest of Phase 24. The binding that fixes it has landed; what is
    missing is the proof.
- [x] `R.3` **Server errors reached the browser with `context` and `fields` stripped**
  `done: 2026-09-20`
  - **Fixed in `ErrorNormalizer`, not in `api-client`.** The review offered either; the normaliser
    is the one place both transports pass through, so the in-process SSR client is covered by the
    same branch. A new `wrappedEnvelope` check runs **before** the structural `isAppError` check,
    which a decoded transport error was passing — it carries a known `code` and a `toJSON`, so
    `.toJSON()` answered oRPC's shape and `context` was `undefined`.
  - **A second hole, found by the spec rather than by the review.** When the wrapped code is one
    the catalog does not hold, the old fall-through adopted the *wrapper's* code and handed back
    the broken shape again. It collapses to `INTERNAL` now: an envelope is untrusted input, and
    `AppError.from` already refuses an unknown code.
  - **Proved red then green.** Five specs in `errors` and two in `feature` fail with the fix
    stashed and pass with it. The feature pair click Deactivate and assert the last-owner and
    self sentences — the two reasons share a code, so `context` is the only thing telling them
    apart, and it was exactly what the wire dropped.
  - **The gap the review named is closed:** `tests/support/transport-error.ts` is the first
    fixture in `feature` that rejects with the decoded wire shape rather than an `AppError`
    instance. `R.45`'s third bullet is this same gap and goes with it.
  - **Still open, and cheap now:** `use-role-failure.ts` and `use-api-key-failure.ts` have no
    spec of their own. The mechanism is proved, the two call sites are not.
- [x] `R.4` **The digest selected nobody on the shipped default** `done: 2026-09-20`
  - **The candidate list was the bug, not the filter.** `digestRecipients` read
    `notification_preferences` for `mode = 'digest'`, and the shipped default *is* digest with no
    row — so a tenant where nobody opened the preferences screen sent nothing, ever.
    `organizationsWithDigest` had the same shape, so the fan-out never even queued the job.
  - **Both now read `notifications`.** `recipientsWithUnreadSince` and
    `organizationsWithUnreadSince` on `NotificationRepository` replace them; the two preference
    methods are deleted rather than left beside the new ones, so there is one answer to "who gets
    a digest". The use-case then resolves each unread row as `stored ?? policy default` and keeps
    anyone with at least one row on digest.
  - **The default is keyed by kind, not by category** — `NotificationPolicy.defaultModeForKind`,
    built once at module load from the rows that actually write a notification. `membership`
    holds one kind on digest and one on immediate, so a category-level default cannot answer.
    Rows with `recipients: none` are excluded: they write nothing, so their modes describe no row.
  - **Eight specs**, including the one the review asked for: no stored preferences, one unread
    row, one mail published. Also the inverse — `off` and `immediate` both send nothing.
  - **`verified: 2026-09-20`** — the `unverified:` note is closed. Eight cases in
    `tests/notification/pg-notification.repository.spec.ts` run both queries against Postgres,
    against **two** tenants so the cross-tenant predicate cannot pass by having nothing to leak.
  - **Left alone deliberately:** `R.14` is the same missing concept seen from the preferences
    screen, and it needs a *category*-level default, which is a separate decision.

### Medium — wrong data, a promise the code does not keep, or a user with no way out

- [x] `R.5` **The recovery window measured the age of a month, not the age of the delete**
  `done: 2026-09-20`
  - **A tombstone**, as the review prescribed. Migration `0032_archive_tombstone` adds
    `partition_archive.deleted_at` with a partial index; `DeleteOrganizationUseCase` stamps it
    before the row goes; `sweepDeleted` reads that and keeps `not exists (organizations)` as the
    second half, so a mis-stamped row on a live tenant is still never swept.
  - **The stamp is idempotent** — `where deleted_at is null` — so a second delete pass cannot
    push the window out to sixty days.
  - **Seven specs in `tests/cold/sweep-deleted.spec.ts`**, the file the review named as missing.
    Three fail on the old predicate and pass on the new one, including one case per defect.
  - **Docs corrected**, because both stated the promise the code did not keep:
    `cold-storage.md` and `docs/ai/rules/data.md`.
- [x] `R.6` **`coldMode: "drop"` ignores per-tenant retention overrides** — the `drop` branch in
  `maintenance.consumer.ts:403–412` returns before reading `tenantRetentionPolicies`. A tenant with
  a longer override loses its month unrecoverably. Fix: read overrides before branching on mode.
  `done: 2026-09-20` — the overrides are read before the mode branch, and the tenant walk drops at each tenant's own cutoff.
- [x] `R.7` **The outbox drain runs *behind* every `deliver` job**, the opposite of its
  `priority: 1`. BullMQ pops the wait list before the prioritized set, and `deliver` jobs carry no
  priority. Fix: give `deliver` a higher-numbered priority, or drop the priority from both.
  `done: 2026-09-20` — `deliver` takes `priority: 10`. A job with none goes on the plain wait list, which `moveToActive` empties before it looks at the prioritized set — so the drain's `priority: 1` had put it exactly last.
- [x] `R.8` **`cold-restore` and `tenant-export` never place a shard**, so they always read node 0.
  Neither `restore` nor `export` in `maintenance.consumer.ts` wraps in `withShard`. Fix: resolve the
  tenant's placement and run inside it, as the projection does. Latent on one node.
  `done: 2026-09-20` — the restore places per archive entry, because the index is catalog and the scratch table and its ATTACH are the tenant's; the export places the tenant it names.
- [x] `R.9` **The SSR session ignores a deactivated membership, and the shell then retries the
  stream forever.** `session.fn.ts` checks only that `activeOrganizationId` is present;
  `PrincipalBuilder` returns null for an inactive membership. A deactivated user gets the shell,
  an UNAUTHORIZED stream reconnecting every two seconds, and no way out but sign-out. Fix: add
  `memberships.isActive` to `fetchSession`'s `Promise.all`.
  `done: 2026-09-20` — the membership check rides in the same `Promise.all` as the capabilities. **No unit test:** `session.fn.ts` calls `createServerFn` at module scope and hangs under vitest without the react-start plugin. `apps/web/docs/reference/server-functions.md` now names this second case of the rule it already stated.
- [x] `R.10` **An error thrown inside a streaming handler bypasses the error interceptor.** For an
  `async function*` handler, `next()` resolves before the body runs, so a FORBIDDEN from
  `message.stream` or a `RateLimitedError` from `assertUnderCap` becomes an opaque
  `INTERNAL_SERVER_ERROR` on the stream, logged nowhere, and the client reconnects forever. Fix:
  run the membership assertion and the cap check before returning the iterator, or wrap the
  iterator's `next` the way `shardMiddleware` does.
  `done: 2026-09-20` — `errorMiddleware` wraps a streaming output the way `shardMiddleware` already wraps one, so each frame's rejection goes through the interceptor.
- [x] `R.11` **The conversation list truncates when a page ends on a conversation with no
  messages.** `ORDER BY last_message_at DESC` puts NULLs first and `nextCursor` is null for a null
  row. Fix: sort and cursor on `coalesce(last_message_at, created_at)`, keep
  `conversations_recent_idx` in step.
  `done: 2026-09-20` — the sort key is `coalesce(last_message_at, created_at)`, never null, and `conversations_recent_idx` moves with it in `0033_conversation_keyset`. `mapWith` on the expression: drizzle hands a raw timestamp back as a string, and the cursor was being built from one.
- [x] `R.12` **Notification and digest emails link to relative URLs** (`/settings/members`).
  Only the invitation mailer prefixes `config.email.baseUrl`. Fix: prefix in one place the two
  notification mailers share.
  `done: 2026-09-20` — Fixed in `ContentMailRenderer`, which is the one place both notification templates
  pass through: it takes the base url and absolutises a relative one, leaving an already
  absolute link alone. Three renderer specs.
- [x] `R.13` **The digest footer names the organization by its UUID.**
  `send-notification-digest.use-case.ts:78` passes `input.organizationId` as `organization`.
  `done: 2026-09-20` — `OrganizationReader` gains `nameOf` — one method on a port that already existed, so
  the container's port count is unchanged. Resolved once per run, not per recipient.
- [x] `R.14` **The preferences screen shows `off / off` as the membership default** — the use-case
  takes the *first* policy row per category, and `member.invited` (recipients `none`) comes first.
  Fix: derive the default from rows that have recipients, or declare it on the category.
  `done: 2026-09-20` — `NotificationPolicy.defaultModeForCategory`, built from the rows that have recipients, so the grid and delivery read the same table.
- [x] `R.15` **Saving a retention row rewrites the ClickHouse TTL without its per-action clauses**
  — `update-retention-policy.use-case.ts:82` composes the base clause only, with no
  compare-before-write; `list-retention-policies` computes `expected` the same way. Fix: both
  through `clickhouseTtlFrom`, compare first.
  `done: 2026-09-20` — both go through `clickhouseTtlFrom`, and the save compares before it writes.
- [x] `R.16` **Re-indexing a document within an hour is silently dropped** — `jobId:
  <org>_<documentId>` with completed jobs kept 3 600 s. Fix: a content hash or version in the id.
  `done: 2026-09-20` — `JobKey.of(documentId, text)`; the text is in the key, so new words are a new job.
- [x] `R.17` **A conversation can hold users who are not members of the organization** —
  `add-conversation-member` and `create-conversation` never check membership; also an existence
  oracle. Fix: assert `memberships.isActive` for every added user.
  `done: 2026-09-20` — `TenantMembershipReader`, a new port. Named apart from `auth`'s `isActive`: parameters compare bivariantly and the two take their arguments in opposite orders.
- [x] `R.18` **Six messaging use-cases publish outbox events outside any transaction** — edit,
  delete, add member, remove member, rename, leave. Fix: inject the routed unit of work and wrap
  write plus publish, as `send-message` does.
  `done: 2026-09-20` — all six take the routed unit of work and wrap write plus publish, as `send` does.
- [x] `R.19` **Last-owner protection is check-then-act outside the transaction** in
  `change-member-role` and `set-member-active`. Two concurrent demotions leave zero owners. Fix:
  count inside the transaction under `for update` or a per-tenant advisory lock. Likely.
  `done: 2026-09-20` — the count moves inside the transaction and takes `for update` on the owner rows. Promotion and reactivation take no lock: they cannot drop the count, and locking there would serialise every membership edit in the tenant.
- [x] `R.20` **Tenant delete never sweeps `tenant_retention_policy`** — `deleteFor` has no caller
  anywhere. Fix: call it inside the delete transaction.
  `done: 2026-09-20` — `tenantRetention.deleteFor` inside the delete transaction.
- [x] `R.21` **The realtime stream stays subscribed to the previous tenant after an organization
  switch** — `RealtimeProvider` opens once per `client` identity and nothing remounts it. Fix: key
  the provider on the active organization id. Likely.
  `done: 2026-09-20` — the provider takes the active tenant and reopens on it, and opens nothing before there is one.
- [x] `R.22` **The notification inbox traps the user in "unread only"** — with no unread rows the
  toggle is not rendered. Fix: render the toggle above the empty state.

  `done: 2026-09-20` — The controls moved above every state rather than inside one. **The spec found the same
  trap one layer up:** toggling the filter re-enters `isPending`, which also early-returned
  a skeleton, so the button removed itself on click.
### Low — a wrong edge, a wrong number, or a promise in a doc the code does not keep

- [ ] `R.23` **SIGTERM is ignored while boot is hung** (`main.ts`: the handler is
  `started.then(...)`, and `start()` blocks on an unreachable queue Redis). Race `started` against a
  hard exit on a boot-phase signal.
- [ ] `R.24` **The `deliver` de-duplication window is "the last thousand completions"** — the
  publisher always sets `count: 1_000` and the consumer raises only `age`. Same fact as `23.1`.
- [ ] `R.25` **The projection checkpoint can permanently skip a row that commits late** — no
  settle lag on `(occurred_at, id)`. An `occurred_at < now() - interval` guard is the usual shape.
- [x] `R.26` **`/platform/analytics` prefetches a query gated by a different permission than the
  route** (`platform.retention.read` via `PlatformQueries.retention`); a role with analytics but
  not retention gets the error boundary.
  `done: 2026-09-20` — the retention read is no longer prefetched; the component gates it on `platform.retention.read`.
- [x] `R.27` **CORS omits `last-event-id`**, so a cross-origin stream (the Tauri origin) can never
  resume.
  `done: 2026-09-20` — `last-event-id` added to the allowlist, with a spec beside the `x-api-key` one it mirrors.
- [x] `R.28` **`redis-cache` sets an eviction policy but no `maxmemory`**, so it never evicts and is
  OOM-killed instead. `infra/docker-compose.yml:143`.
  `done: 2026-09-20` — `--maxmemory` is now set from `REDIS_CACHE_MAXMEMORY`, default 256mb. The policy was
  unreachable without it: the default ceiling is 0, meaning none.
- [x] `R.29` **`.env.example` ships an `AUTH_SECRET` placeholder that passes the only check**
  (46 characters against `min(32)`). Shorten it below 32 or refine against it.
  `done: 2026-09-20` — The placeholder is nine characters, so it fails the schema's own `min(32)` rather than
  booting. A placeholder that boots is one that reaches production.
- [x] `R.30` **`apps/web/docs/reference/env.md` names `AUTH_BOOTSTRAP_ORGANIZATION_SLUG`**; the key
  is `BOOTSTRAP_ORGANIZATION_SLUG`.
  `done: 2026-09-20` — The doc names `BOOTSTRAP_ORGANIZATION_SLUG`, which is the key the schema has.
- [x] `R.31` **`check:architecture` §7 does not look at `apps/*`** — a `"use client"` under
  `apps/web/src` passes.
  `done: 2026-09-20` — Assertion 7 walks `sourceDirs()` now, so `apps/*` is covered. Proved with a temporary
  `"use client"` under `apps/web/src`, which it caught.
- [x] `R.32` **A `documentId` containing `:` becomes a 500** (BullMQ rejects `:` in a job id).
  `done: 2026-09-20` — the id is hashed, so no character a caller supplies reaches the job id.
- [ ] `R.33` **Validation rules emitted with no copy behind them** — `unknown`, `past`, `format`,
  `range`, `min` are absent from `FIELD_RULE_COPY` and fall back to "Something went wrong".
- [ ] `R.34` **Grant and revoke permission are a read-modify-write race.** Likely.
- [x] `R.35` **A stale allowlist in the procedure-coverage spec** — `AWAITING_A_PROCEDURE` still
  names `platform.analytics.read`, `platform.analytics.manage`, `platform.storage.read` and
  `platform.tenant.manage`, all gated since Phases 19–20 (re-read 2026-09-20: still stale). Only
  `platform.shards.manage` belongs there until `24.2`.
  `done: 2026-09-20` — Four gated keys removed; only `platform.shards.manage` remains, and it waits on `24.2`.
  Each of the four was checked against `PROCEDURE_PERMISSIONS` before removing it.
- [ ] `R.36` **An in-flight duplicate send writes two rows** — the retry finds the claim held and
  `findById` null while the first transaction is still open. Likely.
- [ ] `R.37` **A `scope: "goal"` role can be assigned as an organization membership role.** No
  goal-scoped keys ship today. Likely.
- [x] `R.38` **The digest includes categories the user did not set to digest.**
  `done: 2026-09-20` — `forDigest` replaces `wantsDigest`, and the count is the digestable rows.
- [ ] `R.39` **The archive's only pre-drop verification is a `HEAD`** — `putStream` sends no
  whole-object checksum; a truncated object is first detected after the drop.
- [ ] `R.40` **Tenant export loses `role_permissions` rows past five thousand** — the keyset is on
  `permission`, which is not unique within a tenant, with no tie-break.
- [x] `R.41` **`PgShardAssignmentRepository.all` uses the numeric offset as a text keyset cursor.**
  No caller today; `24.2` will be the first.
  `done: 2026-09-20` — `all(after, limit)` takes a cursor; the fake sorts and cuts the way the real one does.
- [x] `R.42` **A malformed keyset cursor becomes a Postgres `22P02`** — `KeysetCursor` validates the
  timestamp but not `id`.
  `done: 2026-09-20` — the id half is validated as a uuid before the cursor decodes.
- [x] `R.43` **`PgTenantStorageReader.byTenant` offset-pages over an unstable order** (no tie-break).
  `done: 2026-09-20` — the order gains `organization_id` and `table_name` as tie-breaks.
- [x] `R.44` **A dead "Move" control on the shard map** — `disabled={moves === "unavailable"}` and
  no `onClick`. Goes live and does nothing the day `25.5` flips the flag.
  `done: 2026-09-20` — Gated on a handler as well as on the server's `moves`, and nothing passes one yet —
  `25.5` supplies both. Without that it goes live doing nothing the day the flag flips.
- [ ] `R.45` **Two specs whose assertion does not check what their name claims** —
  `use-app-mutation.spec.tsx` "cancels queries" (never observes `cancelQueries`) and
  `realtime.context.spec.tsx` "stays disconnected" (asserts `"off"`, the initial state before
  the effect runs). Both re-checked 2026-09-20 and both still true.
  **The third bullet is closed:** `packages/feature/tests/support/transport-error.ts` is the
  wire-shape fixture whose absence let `R.3` ship, and two specs use it.

**The specs that would have caught the high ones, and do not exist:** a `sweepDeleted` spec under
`tests/cold/` (`R.1`, `R.5`); a two-node drain in the sharded smoke, gated on `24.1` (`R.2`); a
feature spec whose mock rejects with the wire shape (`R.3`); a digest spec with no stored rows
(`R.4`); the pagination spec with one untouched conversation (`R.11`); the preferences spec
asserting a value rather than `!== undefined` (`R.14`).

---

## 3. `archive/STUCK.md` — what a session could not do, and exactly why

- [ ] `S.1` **The browser walk, `23.5`–`23.12`.** The Claude in Chrome extension reports
  `Browser extension is not connected`; installing it and signing in is not something an agent can
  do. The stack was up, migrated and seeded, and the built server answered `/` with 200 — the
  application was ready. `archive/STUCK.md` holds the thirteen-step checklist (two accounts in two browser
  profiles, then seven observations, about twenty minutes). Fix `23.3` first or leave `23.6` unticked.
- [ ] `S.2` **`23.14`, the analytics reader, is gated on data that does not exist yet.** Step one is
  done (ClickHouse up, schema applied, four smoke cases passing). Step two is waiting: run the
  worker for days so the projection fills. No session can do it.
- [ ] `S.3` **Phase 24 is gated on a second shard being provisioned**, and one container is not
  that. Half of `24.5` and half of `24.6` are done; the rest waits on `24.1`, which is deliberately
  filed until a production node exists.

---

## 4. Unfinished work buried inside ticked items

Each of these sits under a `[x]` in `archive/PLAN.md` as an `unfinished:`, `concern:` or `corrected:` note.
Re-checked against the tree on 2026-09-20; the ones that turned out to be resolved are listed at
the end so nobody chases them.

- [ ] `19.19` **`19.15`'s preview does not take an optional `organizationId`** — the screen
  previews the table's own numbers, not a tenant's override.
  `packages/application/src/platform/preview-retention-change.use-case.ts` has no such input
  (still true). The entry also expected the override to be edited from the shard map's tenant row;
  `25.4` shipped a count there and a link to storage, and the editor is `tenant-retention.form.tsx`
  on `/platform/retention`. — `archive/PLAN.md:2306`
- [ ] `19.20` **`shards.invalidate(key)` is never called on a tenant delete.** The note said
  Phase 22's resolver did not exist yet; it does now, `PgShardResolver` has `invalidate`, and
  `delete-organization.use-case.ts` still calls only `capabilities.invalidateOrganization`
  (still true). A deleted tenant's placement stays cached for up to 300 s. — `archive/PLAN.md:2330`
- [ ] `19.20` `concern:` **the archive runs inside the request.** For a large tenant that is minutes
  of streaming on a pooled connection; when it bites, make it a `tenant-delete` job the way
  `19.18` and `19.21` are. — `archive/PLAN.md:2340`
- [ ] `17.2` / `22.1` **The `activity_archive` drop migration has not been written.** The table
  still exists in `pg/schema/archive.schema.ts`, and `application/src/primitive/shard.ts:23`
  lists it in the catalog with the comment "goes with its drop migration". Its `TENANT_EXEMPT`
  history is in `22.18`. Write it once no deployment can hold objects under the old
  `activity-archive/` key. — `archive/PLAN.md:1466`, `2831`
- [ ] `16.12` **`TENANT_CEILING=2000 pnpm smoke` was not run** — 100 and 500 were; the page says
  so. About fifty minutes of creation and half an hour of cleanup. — `archive/PLAN.md:1352`
- [ ] `26.8` **`FAN_OUT_SCALE=250000` was not run** — 10× of the largest §3 column, deferred to a
  machine that can afford a `users` row per recipient. Curves are linear across 1 000–25 000. — `archive/PLAN.md:4202`
- [ ] `23.13` **The permissions counterpart of §24 is still not a `check-architecture`
  assertion.** The property — every key in `CATALOG` named by a `PROCEDURE_PERMISSIONS` entry —
  lives only in `procedure-permissions.spec.ts`, whose allowlist is stale (`R.35`). — `archive/PLAN.md:3570`

**Checked and already resolved**, so the notes in `archive/PLAN.md` and `archive/OPEN.md` are stale rather than
open: `22.12`'s "the two unit-of-work instances are not bound per slice yet" —
`container.ts` binds `routedUnitOfWork` to notification, messaging and ai and `catalogUnitOfWork`
to the rest. `archive/OPEN.md` A.10's "`vitest.smoke.config.ts` has no sweep" — it has
`globalSetup: ["tests/support/orphan-sweep.ts"]`. Phase 20's Exit note "not fixed: a teardown in
every integration spec" — the global sweep is that fix. `T-031`'s "not yet run against a
database" — walked on 2026-09-13 in the communication plan's Phase 2 Exit.

---

## 5. Verification owed — browser, manual, or a scale not run

Every phase is unit-tested and most are verified against live containers; these are the clauses
the record says were *not* proven, beyond the eight in `23.5`–`23.12`.

- [ ] **Phase 18 Exit, browser half** — "signed in as alice with a customer tenant active,
  `/platform/status` renders and the nav shows the module; as a tenant owner it redirects to
  `/forbidden`". Every link in the chain is asserted; the round trip is not. — `archive/PLAN.md:1998`
- [ ] **Phase 19 screens** — `/platform/retention` and `/platform/storage`: wired, typechecked,
  use-cases unit-tested, no clause below the API clicked. — `archive/PLAN.md:2419`
- [ ] **Phase 20 screen** — `/platform/analytics`, the same. — `archive/PLAN.md:2642`
- [ ] **Phase 21 screen** — the archived section on `/notifications`, the same. — `archive/PLAN.md:2767`
- [ ] **`25.4` rendered page** — `/platform/shards` answers 200 for a real platform admin and both
  procedures answer with live data; the *rendered* expanded panel is browser-only. — `archive/PLAN.md:4094`
- [ ] **`26.9` resend button** — the procedure is proved over `/api/rpc`; the button is not. — `archive/PLAN.md:4241`
- [ ] **`T-029`'s ten-step manual pass** — organization switch, accept, switcher, found, and
  **step 5**: an RPC immediately after a switch answers for the new tenant inside the sixty-second
  `session.cookieCache` window. `archive/TODO.md` says "still owed"; `archive/IMPLEMENTATION-PLAN.md:2523`
  lists it in the whole-plan verification; nothing records it walked. — `archive/TODO.md:228–241`
- [ ] **The whole-plan verification** — `archive/PLAN.md`'s own closing section: the command block, then
  each phase's Exit line by hand, and the one that cannot be automated: a tenant owner typing
  `/platform/retention` into the address bar and being redirected. — `archive/PLAN.md:4284`
- [ ] **`archive/REVIEW.md`'s own gap** — the `infrastructure` integration specs and the smoke suites were
  not run in the review session (no Docker). They were green on 2026-09-20 in `archive/OPEN.md` C, so this
  is closed unless the review's fixes land without re-running them.

---

## 6. Conditional work — "reopen when"

Not open today. Each is a trigger written into a ticked item so the next person does not decide on
a feeling.

- `24.7` **pooled partition** — when the pruned read's planning time passes 5 ms or the runway run
  passes ten minutes at a plausible tenant count (`16.12`). — `archive/PLAN.md:1349`
- `21.1` **per-user object layout for `notifications`** — when p95 on the archived view passes
  500 ms; every page turn gunzips the whole tenant-month object today. — `archive/PLAN.md:2691`
- `16.7` **`unreadCounts` pruning assertion** — reopen if the read changes; its floor is
  `last_read_at`, a correlated subquery. — `archive/PLAN.md:1235`
- `26.12` **`publishMany` on the realtime port** with a real Redis pipeline — when 31 µs a frame
  is the bottleneck again; today the notification rows are. — `archive/PLAN.md:4275`
- `23.14` **analytics reader** — when somebody wants an aggregate nobody precomputed. A driver
  flag returns only with a second implementation. — `archive/PLAN.md:3592`
- `24.1` **user delete as a maintenance job** — at a few thousand tenants on a node, under either
  option. — `archive/PLAN.md:3968`
- `19.20` **tenant delete as a job** — when a large tenant's in-request archive bites. — `archive/PLAN.md:2340`
- `23.21` **skip versus fail an unplaceable tenant** in the projection — left open on purpose. — `archive/PLAN.md:3832`
- **Two policy-shaped constants** — the two-month runway and the thirty-day cold grace could move
  onto `platform_policy` in an afternoon if an operator asks. — `archive/PLAN.md:1745`
- `26.10`, `26.11`, `26.3` — each carries its own trigger in section 1.
- `D29` — "a few hundred tenants per node" was replaced by `16.12`'s numbers; two thousand stays
  unmeasured (section 4).

---

## 7. `archive/TODO.md` — the three ledger rows

`archive/TODO.md` is history since 2026-09-17 and these are its only open lines.

- [ ] `T-036` **Communication plan** `P1`. Done when Phases 9–13 **and 26** are closed, plus
  `23.1`–`23.3` and `23.5`–`23.12`. Phases 9–13 are done; 26 is filed by decision, so as written
  the row cannot close while Phase 26 stays filed. Either narrow the "Done when" to the walk
  (`23.12` says the walk closes it) or accept it stays open. — `archive/TODO.md:140`
- [ ] `T-037` **Database scaling plan** `P1`. Done when Phases 14–17, 21 and 22 report their Exit
  lines true, Phase 24 filed. **All six are met** (`archive/PLAN.md` Exit notes dated 2026-09-13 to 19).
  This row can be ticked. — `archive/TODO.md:159`
- [ ] `T-038` **Platform admin** `P2`. Done when Phases 18–20 report their Exit lines true,
  Phase 25 filed. **All three are met** (2026-09-19). This row can be ticked. — `archive/TODO.md:170`

---

## 8. Doc housekeeping still owed

Two real edits, both in shipped documentation rather than in a plan.

- [ ] **Four doc sentences describe the transactional outbox as a backlog item.** It shipped as
  Phase 10 on 2026-09-12. The paths were repointed at `plans/archive/TODO.md` on 2026-09-20 so
  §15 still passes, which fixed the link and not the tense:
  `packages/composition/docs/index.md:134`,
  `packages/composition/docs/reference/test-container.md:133`,
  `docs/setup/17-composition-container.md:317`, `docs/setup/12-application-package.md:553`.
  A fifth, `packages/content/docs/reference/namespace.md:122`, cites `T-035`, which is `23.15`.
- [ ] **`AWAITING_A_PROCEDURE`** in `procedure-permissions.spec.ts` — the same stale list as
  `R.35`, listed here too because it is a comment claiming "only shrinks" over a set that did not.
- [ ] **Three independent `DATABASE_SHARD_<n>_URL` parsers**, with two different contiguity
  algorithms — `apps/web/src/env.ts:143`, `apps/worker/src/env.ts:117` and
  `packages/infrastructure/shard-env.ts:14`. Found while unifying env on 2026-09-20 and left
  alone: the two `env.ts` copies cannot be merged into a package, which `docs/setup/25:144`
  forbids by name, so the fix is narrower than it looks and wants its own decision.
- [ ] **Three disagreeing ClickHouse default sets.** `env.ts` defaults database and user to
  `default` and then *rejects* that value when a URL is set; `clickhouse-migrate.ts` uses
  `ratchet` and `default`; `vitest.smoke.config.ts` uses `ratchet` for both. Same session, same
  reason for leaving it: it is a defaults decision, not a mechanical fix.
- [ ] **`partitions.ts` defaults `S3_FORCE_PATH_STYLE` to true**, the opposite of both schemas,
  by reading `!== "false"` where they read `=== "true"`.
- [ ] **Nine broken relative links in the docs**, found 2026-09-20 by resolving all 1 503 of them.
  Nothing in CI checks a link target: §15 checks a **backticked** path, so a `](…)` that resolves
  nowhere passes. Eight are one `../` short in `apps/*/docs/reference/` — from there `packages/`
  is `../../../../`, not `../../../`: `enforcement-surfaces.md`, `env.md` (web),
  `consumers.md` ×2, `env.md`, `schedules.md` ×2, `shutdown.md` (worker). The ninth is
  `docs/setup/12-application-package.md` naming `15-infrastructure-clickhouse.md`, which has been
  `15-infrastructure-package.md` since `T-013`. **Worth doing with it:** widen §15 to resolve link
  targets as well as backticked spans, which is the assertion that would have caught all nine.

### Do not fix these — they are frozen by design

Six lines inside `archive/` were stale the day the files moved. **They are not tasks.** A file in
`archive/` records what was believed when it was written, and correcting one would make it a worse
record, not a better one. Listed so nobody reads them as current on the way to an entry's body.

| Where | What it says | What is true |
|---|---|---|
| `archive/PLAN.md:34–81` | eighteen phases built, "start at Phase 19" | twenty-two built; the queue is Phase 23 |
| `archive/PLAN.md:87` | `check:architecture` "21/21 today; 23 after Phase 22" | 26 |
| `archive/PLAN.md:3347` | Phase 23 is "three fixes, eight clauses, three from `TODO.md`, and `23.16`" | `23.16` is done; `23.17`–`23.24` came later |
| `archive/OPEN.md:763` | "45 commits on `main`, nothing pushed" | merged as PR #18; `origin/main..HEAD` is empty |
| `archive/OPEN.md:544` | section B line numbers, taken 2026-09-19 | drifted by that night's edits; the IDs are right |
| `archive/REVIEW.md` | line numbers as of `d98c9f3` | one commit behind `885e144`; accurate until the first fix |

**One of them is not stale and is still owed:** `archive/OPEN.md` section D's table of what changed
on this machine — `.env.backup-2026-09-20`, three compose profiles up, 25 000 `<n>@fan-out.test`
users left on purpose, four organizations with no directory row. That is the state to undo when the
work is finished, and nothing else records it.

---

## Changelog

| Date | Who | Change |
|---|---|---|
| 2026-09-20 | @sami | Created at `885e144` from a full read of `PLAN.md`, `OPEN.md`, `REVIEW.md`, `STUCK.md`, `TODO.md` and every file already in `archive/`. Every "still true" and "already resolved" claim in section 4 was re-read from the source tree rather than from the plan |
| 2026-09-20 | @sami | Ten more review defects, all verified against the tree before being marked: `R.12` notification mail linked to relative paths, fixed in the renderer both templates share; `R.13` the digest footer printed a uuid, so `OrganizationReader` gained `nameOf`; `R.22` the inbox trapped a reader in `unread only`, **and its spec found the same trap one layer up** — the pending skeleton removed the toggle too, so toggling deleted the button on click; `R.27` CORS omitted `last-event-id`, so a cross-origin stream could never resume; `R.28` an eviction policy with no ceiling never evicts; `R.29` a placeholder secret that booted; `R.30` a doc naming a key the schema does not have; `R.31` assertion 7 never walked `apps/*`; `R.35` four keys that had been gated since phases 19 and 20; `R.44` a live button with no handler. `R.45` narrowed to the two bullets still true |
| 2026-09-20 | @sami | `R.2` fixed, and it was less blocked than the entry said. Both cross-node passes were handed the catalog unit of work, which never reads `ShardScope`, so `eachShard` looped the nodes and every iteration wrote to node 0; `Container` now builds a third `local`-placed `PgUnitOfWork` for them. That exposed the second bug the review flagged under the same binding — `sweepExpired` deletes three catalog tables from a `local` gateway, and was correct only by the node-0 fallback — so it uses `catalogDb`, the sanctioned crossing. **Proved on two real nodes:** `24.1` gates only the outbox half, because that needs a row whose foreign key is the `23503`; a month partition needs no key, so the sharded smoke asserts the runway lands on node 1 and not on the catalog, and it fails on the old binding. All four High defects are now closed |
| 2026-09-20 | @sami | `R.1` and `R.5` fixed together, which is what the review said one tombstone would do. `partition_archive.deleted_at` is stamped by the delete and read by the nightly sweep, which had been keyed on `archived_at` — so the window measured how old each *month* was rather than how long ago the tenant went, and a tenant with a year of cold storage lost all but the newest months the night after the delete. The same predicate destroyed every `outbox_event` archive on every deployment, because that table has no tenant level and its months sit under a nil uuid no `organizations` row can match. Seven specs in `tests/cold/sweep-deleted.spec.ts`, the file the review named as missing; three fail on the old predicate. `R.4`'s `unverified:` note closed too, with eight cases running its two queries against Postgres |
| 2026-09-20 | @sami | One env file, and ports that do not collide. Four env files became one: compose read `infra/.env` because `infra/` is its project directory, and `dotenv`'s cwd lookup layered `packages/infrastructure/.env` under five scripts with `DATABASE_URL` on a different port again. Both deleted; `tooling/scripts/compose.mjs` passes `--env-file` when the root file exists, which is conditional because `--env-file` errors on a missing file and CI has none. `dotenv` dropped entirely for Node's own loader. Every published port is the well-known one with a `1` in front, which is the scheme the README already taught, and `WEB_PORT` is now read rather than ignored. Assertion §27 pairs each `*_PORT` with the URL that dials it, checks every compose default against the template, and refuses a second `.env` anywhere. **It was written wrong first and the fixture caught it:** the template is CRLF, `.` matches no carriage return, and the `$`-anchored parse silently returned nothing, so the assertion passed on every tree including the broken ones |
| 2026-09-20 | @sami | `R.3` and `R.4` fixed, the two High defects that did not need a second node. `R.3` in `ErrorNormalizer` rather than in `api-client`, because the normaliser covers the in-process SSR client too — and the spec found a second hole the review had not: an unknown wrapped code adopted the wrapper's own. `R.4` moved the digest's candidate list off `notification_preferences` and onto `notifications`, deleted the two preference methods rather than leaving them beside the new ones, and keyed the policy default by kind because one category holds two kinds that disagree. Seven red-then-green specs for `R.3`, eight for `R.4`; the two Postgres queries under `R.4` are `unverified:`, with the command. Two pre-existing blockers cleared on the way: `pnpm typecheck` needed a package build, and `pnpm lint` had been red since the fan-out commit on a dead pair of locals |
| 2026-09-20 | @sami | The five ledgers moved to `archive/` and this file became the only open one. Their relative links were repaired for the new depth, the nine inbound references from `docs/` and `packages/*/docs/` were repointed so §15 still passes, and `docs/data-flow.md`'s "what is planned and not yet built" now names this file. Section 8 split: two doc edits still owed, six stale lines inside `archive/` marked frozen rather than filed |
| 2026-09-20 | @sami | Ten more, six of them the commit before this one had fixed and not ticked. `R.16`/`R.32` were one line: a caller's `documentId` reached the BullMQ job id verbatim, which refuses a `:`, and the key held no content, so a re-index with new words returned success and indexed nothing — `JobKey` hashes both. `R.42` a cursor validated its timestamp and not its id while every consumer casts it `::uuid`; `R.41` a repository used a numeric offset as a text keyset, so page two was every key alphabetically after "25"; `R.43` an order on a sum with no tie-break under limit/offset; `R.26` a route prefetching a query gated on a permission it does not require. Then four new: `R.17` — the conversation member column's only constraint is `users.id`, which every tenant's people share, so a manager could add a user from another tenant and probe which ids exist. Its port is named `isActiveMember` rather than `isActive` **because parameters compare bivariantly**: `auth`'s reader takes the user first, and one standing in for the other typechecks and then swaps the arguments at run time. `R.14` the preferences grid read a category's default off its first event, which has no recipients; `R.38` the digest counted rows from categories already emailed one at a time; `R.20` `deleteFor` had no caller anywhere and that table carries no foreign key |
| 2026-09-20 | @sami | Every Medium review defect closed, in four commits. Three in the worker: the retention pass branched on `cold_mode` before reading the per-tenant overrides, and `drop` destroys a month, so a tenant that had bought three years lost it at the deployment's cutoff with nothing in cold storage; `deliver` jobs carried no priority, and BullMQ empties the plain wait list before it touches the prioritized set, so the drain's `priority: 1` put it exactly last rather than first; `cold-restore` and `tenant-export` named a tenant and placed nothing. Three in the web tier, all of them a client reconnecting forever: a deactivated membership still rendered the shell, a throw from inside a streaming handler never reached the error middleware because `next()` resolves when the generator is created, and the realtime provider was keyed on the api client, which an organization switch does not change. Three in messaging: a null `last_message_at` sorts first under DESC and its cursor was null, so the list truncated on any page ending on a conversation with no messages; six use-cases published outside any transaction; and the last-owner count was read before the transaction opened, so two concurrent demotions could commit a tenant down to zero owners. And one in platform: a retention save composed the ClickHouse TTL from the base months alone and erased every per-action window. **Twenty-three specs, every one red on the old code first** — the two for the conversation keyset against Postgres. `R.9` is the single one with no unit test, and the entry says why |
