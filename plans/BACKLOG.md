---
title: Backlog — every task not done, from every plan file, in one place
updated: 2026-09-24
owner: sami
schema: backlog/v1
source: compiled 2026-09-20 at 885e144 from the five ledgers, which moved to archive/ the same day
---

# Backlog

**This is the only open ledger.** What it has closed is in
[`archive/DONE.md`](archive/DONE.md); what was deferred whole is in
[`COMMUNICATION.md`](COMMUNICATION.md); everything else in `plans/` is history.

Everything not done, gathered once. Five files used to hold open work and each held a different
kind: `archive/PLAN.md` the unchecked boxes, `archive/REVIEW.md` forty-five defects nothing has
fixed, `archive/STUCK.md` what a session could not do and why, `archive/OPEN.md` the ledger of what
closed and what did not, `archive/TODO.md` three ledger rows. All five moved to `archive/` on
2026-09-20 and this file replaced them. They are still the place each item's **full argument**
lives — every entry below is a summary with a pointer — but nothing is ticked there any more.

**Split on 2026-09-22.** This file had grown to eighty-four closed entries against nineteen open
ones, and a ledger you scroll past four-fifths of to reach the work is one nobody opens. Every
closed entry moved to [`archive/DONE.md`](archive/DONE.md) with its proof intact and its ID
unchanged, and the changelog went with them. What is left here is the work.

> **How to use this file**
>
> 1. **Every entry keeps its original ID** — `23.3`, `R.7`, `S.1`, `T-036` — and points at the
>    archived file and line that hold the full text. Read the body before acting on a summary.
> 2. **Tick it here, then move it.** Fix the item, tick the line, move the entry to
>    [`archive/DONE.md`](archive/DONE.md), and add the changelog row there. `archive/DONE.md` is
>    the one file in `archive/` that is appended to — the plans beside it are frozen records of
>    what was believed on a day, and editing one would make it a worse record, not a better one.
> 3. **Nothing here is a place to argue a decision.** The argument is in the archived body. A new
>    decision goes in the entry here and says it supersedes.
> 4. **Line numbers are as of `885e144`** and are stable, because the archived files no longer
>    change. If one is ever off, the ID is the truth and the number is the hint.
> 5. Every claim below about the *tree* — "still true", "already resolved" — was re-read from the
>    source on 2026-09-20 rather than copied from the plan that made it.

**The count.**

| Section | What | Open | Closed |
|---|---|---|---|
| 1 | `archive/PLAN.md` unchecked boxes, Phases 23–25 | 10 | 23 |
| 2 | `archive/REVIEW.md` defects | 0 | 45 |
| 3 | `archive/STUCK.md` blockers | 2 | 1 |
| 4 | Unfinished work buried inside ticked items | 1 | 5 |
| 5 | Verification owed — browser, manual, or a scale not run | 1 | 8 |
| 6 | Conditional work — "reopen when" | 8 | — |
| 7 | `archive/TODO.md` ledger rows | 1 | 2 |
| 8 | Doc housekeeping still owed | 0 | 6 |
| 9 | Performance — the tenant/partition layer | 8 | 0 |

The closed column is [`archive/DONE.md`](archive/DONE.md), section for section. Section 6 holds no
boxes: it is triggers, not tasks.

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

## 1. `archive/PLAN.md` — the ten open boxes

All in Phases 23–25; Phase 26 moved out on 2026-09-22 and Phases 1–22 have no open box. Each line:
what, where it stands, what it waits on, and the `archive/PLAN.md` line that holds the entry. Seven
of the original thirty-five closed on 2026-09-20 with the browser walk; `23.25`, `23.26` and
`23.27` are new and were found doing it.

### Phase 23 — Loose ends, no gate

**One box left of nineteen.** The three recommendations, the eight browser clauses and the eight
found-on-the-day fixes all closed between 2026-09-20 and 2026-09-22; they are in
[`archive/DONE.md`](archive/DONE.md) §1 with what each was measured against.

- [ ] `23.14` **Bring back an analytics reader, with the first dashboard** `P3` `~8h`. Gated on
  its own order: let the projection fill and reconcile for days first, then write the reader
  against real data. Four decisions carry over (new port, read-only, resolved scope, ISO periods).
  Step one is done **and this time it is running** — the container is up, `CLICKHOUSE_URL` is set,
  and the projection has written rows rather than merely being able to (`S.2`). — `archive/PLAN.md:3586`

### Phase 24 — The physical split 📁

**`24.1`, `24.2` and `24.5` are built** — [`archive/DONE.md`](archive/DONE.md) §1. A tenant can be
moved, and a move under load loses no acknowledged write. Two things finishing `24.2` found are
filed here as `24.2a` and `24.2b`.

- [ ] `24.2a` **A moved tenant's catalog-written rows on node 0** `P2` — found 2026-09-24. A
  catalog transaction (an invitation, a role change, an API key) writes the tenant's `activity_log`
  row and `outbox_event` on **node 0**, wherever the tenant lives. Three consequences once a tenant
  is off node 0, and the move makes that possible for the first time:
  - **The runway stops.** `MaintenanceConsumer.ensure` pages tenants *placed on* the node, so node
    0 never extends the moved tenant's `activity_log` months. Within two months a catalog write for
    it has no partition, and inviting a member to that tenant fails.
  - **Two archives, one key.** Node 0 and the tenant's node both hold that tenant's `activity_log`
    rows for a month, and the cold key is `cold/<table>/<yyyy>/<mm>/<organization_id>` — no node in
    it. Pruning both would write one object over the other.
  - **The projection misses them.** `AnalyticsConsumer` reads `activity_log` on the tenant's node,
    so a catalog-written audit row for a moved tenant never reaches ClickHouse.
  All three are read from the code, not yet reproduced. The move itself is careful not to make
  this worse — it copies both `local` tables, never empties
  them, and never drops them on node 0 — but the three above need a decision about where a
  catalog transaction's audit row belongs. Nothing is on node 1 in production yet, so this blocks
  the first real move rather than anything running today.
- [ ] `24.2b` **The move's settle does not cover a long job** `P3` — `quiesce` waits `moveSettleMs`
  (60 s) for writers that placed themselves before the freeze. A worker job placed on the tenant
  earlier, and still opening transactions after that, can land a row on the source after its page
  was read. The count check catches a late insert, not a late update. Closing it means the job
  re-reading the freeze per transaction, or the move refusing while such a job is active for the
  tenant. `sharding.md`, "The tenant move", states the gap.
- [ ] `24.3` **Read replica per shard** — `DATABASE_SHARD_<n>_REPLICA_URL`, `cluster.reader(key)`,
  dashboard and analytics reads moved onto it. `25.1`, `25.2` and the `platform.replica.manage`
  key wait on this. — `archive/PLAN.md:3979`
- [ ] `24.4` **The catalog is the last single primary** — measure first; a replica for its reads
  if it hurts. — `archive/PLAN.md:3983`
- [ ] `24.6` **Load test the routed paths at 10×** — half ran (`tests/smoke/routed.smoke.spec.ts`,
  `ROUTED_SCALE=1`): a warm placement resolve is 679 µs, a miss 2 568 µs, the cross-node walk is
  serial. **The write half is unblocked** since `24.1` dropped the keys — a routed insert on node 1
  lands now, and `sharded.smoke.spec.ts` proves it. What is left is running the load test. — `archive/PLAN.md:3997`
- [ ] `24.7` **A pooled partition for the long tail** — small tenants share one `<table>_pool`
  list partition and graduate on a size line. **Its stated triggers measure the wrong thing** —
  plan time is flat by design and the runway is fixed by `PF.5` — so `PF.0` re-states the gate as
  relation count: the drop-cost-vs-siblings reading and `PF.7`'s lock arithmetic (section 9). — `archive/PLAN.md:4015`

### Phase 25 — The replica panel and the shard map 📁

- [ ] `25.1` **Status** — `InspectPlatformStatusUseCase` grows `replica: { healthy, lagSeconds } | null`.
  Waits on `24.3`. — `archive/PLAN.md:4036`
- [ ] `25.2` **The switch** — `platform_policy.replica_reads_enabled` exists since `20.8` and is
  read by nothing; `toggle-replica-reads.use-case.ts` under `platform.replica.manage` lands with
  `24.3`. — `archive/PLAN.md:4040`
- [ ] `25.3` **Colder storage class** — `transitionAfterDays` and a storage class on
  `LifecycleRule`, once someone pays for Glacier; MinIO needs a configured tier. — `archive/PLAN.md:4046`

### Phase 26 — Communication follow-ups → moved

**All eight moved to [`COMMUNICATION.md`](COMMUNICATION.md) on 2026-09-22**, with `26.4` and
`26.8`. Not because any of them is blocked — every one could be built against the local stack
today — but because messaging, email and notifications have to stop being eight features and
become one design: they must not slow the app down. That file also carries the decisions taken
before the work was deferred, so nobody pays for them twice.

---

## 2. `archive/REVIEW.md` — forty-five defects a green build does not catch

**Empty. All forty-five were fixed on 2026-09-20** and are in
[`archive/DONE.md`](archive/DONE.md) §2, each with the proof and the specs written for it.

Two are worth finding again without reading the whole list. `R.9` is the one defect that ships
with **no unit test**, because `session.fn.ts` calls `createServerFn` at module scope and hangs
under vitest. And `R.24` changed no behaviour at all, only comments that were untrue — the
behaviour behind it was `23.1`'s decision to take, and it was taken.

**One thing is still owed out of `R.2`**: with two nodes, a spec that drains node 1's outbox. The
binding landed long ago and `24.1` removed the `23503` that blocked the proof, so this is now a
spec nobody has written rather than a thing that cannot be written.

---

## 3. `archive/STUCK.md` — what a session could not do, and exactly why

- [ ] `S.2` **`23.14`, the analytics reader, is gated on data that does not exist yet.**
  **Step one was not in the state this file recorded, and now is.** On 2026-09-20 the ClickHouse
  container was `Exited (137)` five days old and `CLICKHOUSE_URL` was commented out in `.env` —
  so the projection had been writing **nowhere**, and the wait for "a few days of data" had never
  started. Both are on now, `ch:migrate` re-applied, and the projection wrote its first 37 rows
  within one five-minute cycle, `member.invited` and `member.joined` from the `S.1` walk among
  them. `ANALYTICS_DRIVER` stays `postgres`, which is the adoption order `.env` itself documents.
  **What is left is genuinely only waiting**: run the worker for days, let the nightly
  reconciliation come back clean, then write the reader against real data. No session can do that.
  - **But the waiting only works if the run does.** Turning it on immediately reproduced
    `23.21`'s second defect: one orphan tenant with no shard assignment aborted the whole run,
    after the first tenant's rows had landed. Left alone, `S.2`'s "a few days of data" would have
    been the same 37 rows on day three. The orphan is placed now; the defect is not fixed, and
    **`23.21` is a prerequisite of `23.14`** rather than an unrelated line in the same phase.
  - The count in the old note is stale too: `analytics.smoke.spec.ts` is **2** cases, not four.
- [ ] `S.3` **Phase 24 is gated on a second shard being provisioned**, and one container is not
  that. Re-measured 2026-09-20 on the renumbered ports, because the numbers in this file were
  taken before them: `sharded.smoke.spec.ts` is **5 passed**, not 4 — the fifth is `R.2`'s runway
  assertion — and a warm placement resolve is **914 µs** against the 679 µs recorded, a miss
  **3 576 µs** against 2 568 µs. The third routed case still passes for the reason it exists: a
  routed insert on node 1 is a `23503` before it can be timed. **The blocker is unchanged and is
  not a tool.** `24.1` is a decision about what a production catalog and a production shard do to
  each other under a tenant delete, and it is deliberately filed until that node exists.

---

## 4. Unfinished work buried inside ticked items

Each of these sits under a `[x]` in `archive/PLAN.md` as an `unfinished:`, `concern:` or `corrected:` note.
Re-checked against the tree on 2026-09-20; the ones that turned out to be resolved are listed at
the end so nobody chases them.

- [ ] `16.12` **`TENANT_CEILING=2000 pnpm smoke` was not run** — 100 and 500 were; the page says
  so. **Running now, and it is `PF.0`'s first deliverable** (section 9). The first attempt on
  2026-09-22 found the teardown quadratic — 2 tenants a minute, a fourteen-hour projection —
  and was killed; batched, 11 611 partitions dropped in 1 m 42 s (`4f45294`). — `archive/PLAN.md:1352`

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

**All seven browser clauses were walked on 2026-09-21**, in one pass against `pnpm dev` on
`:13000` with live containers and the worker up. `pnpm platform:grant alice@example.test` was the
setup step the 2026-09-20 walk had not taken; it moves her `loadbearing` membership from `owner`
to `platform_admin`, which is the tier by construction.

**Two accounts, four organizations, and every clause below the API actually called.** What each
clause was measured against is in [`archive/DONE.md`](archive/DONE.md) §5; what the pass left
behind is in the state table at the end of this file. Two findings are worth carrying here rather
than burying in a tick, because the next walk needs them:

- **A platform admin is not a tenant member, and `/notifications` proves it.** Alice with
  `loadbearing` active is refused `/notifications` — `platform_admin` holds the nine platform keys
  and no `notification.inbox.read`. That is the design working, and it is also why the archived
  month had to be manufactured for a *tenant owner* rather than for her.
- **A synthetic mouse click misses in this harness and a real one does not.** Three buttons —
  pause projection, send invitation, restore — read as dead on a coordinate click and fired on
  `element.click()`. Checked before filing anything: `elementFromPoint` returned the button
  itself, so it was the input path and not an `R.44`-shaped missing handler. Worth knowing before
  the next walk files a defect against a button that works.

- [ ] **The whole-plan verification** — `archive/PLAN.md`'s own closing section: the command block,
  then each phase's Exit line by hand. **The clause it says cannot be automated is done**: a tenant
  owner — bob, owner of Bob Co — typed `/platform/retention` into the address bar on 2026-09-21
  and landed on `/forbidden`. What is left is the by-hand pass over every phase's Exit line, which
  is a reading job rather than a browser one. — `archive/PLAN.md:4284`

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
- `23.14` **analytics reader** — when somebody wants an aggregate nobody precomputed. A driver
  flag returns only with a second implementation. — `archive/PLAN.md:3592`
- `24.1` **user delete as a maintenance job** — at a few thousand tenants on a node, under either
  option. — `archive/PLAN.md:3968`
- `23.21` **skip versus fail an unplaceable tenant** in the projection — left open on purpose. — `archive/PLAN.md:3832`
- **Two policy-shaped constants** — the two-month runway and the thirty-day cold grace could move
  onto `platform_policy` in an afternoon if an operator asks. — `archive/PLAN.md:1745`
- `D29` — "a few hundred tenants per node" was replaced by `16.12`'s numbers; two thousand stays
  unmeasured (section 4).

---

## 7. `archive/TODO.md` — the three ledger rows

`archive/TODO.md` is history since 2026-09-17 and this is its only open line. `T-037` and `T-038`
closed on 2026-09-21, once section 5's browser clauses made their Exit lines true rather than
merely claimed — both are in [`archive/DONE.md`](archive/DONE.md) §7.

- [ ] `T-036` **Communication plan** `P1`. Done when Phases 9–13 **and 26** are closed, plus
  `23.1`–`23.3` and `23.5`–`23.12`. **Every clause but one is now met** — Phases 9–13 are done,
  `23.1`–`23.3` closed on 2026-09-21 and `23.5`–`23.12` on the walk.
  - **It stays open, and the clause it waits on left this file.** Phase 26 moved to
    [`COMMUNICATION.md`](COMMUNICATION.md) on 2026-09-22, so the row now closes when that plan
    does. The alternative, decided against the same day, was narrowing the "Done when" to the
    walk — which `23.12` says closes it. Eight items are genuinely unbuilt, and a `P1` row
    reading "done" above them is a worse record than one reading "open"; the row blocks nothing,
    so narrowing it buys only a tick. Reverse it in one line if the count matters more than the
    claim. — `archive/TODO.md:140`

---

## 8. Doc housekeeping still owed

**Empty.** All six closed on 2026-09-21 and 2026-09-22 —
[`archive/DONE.md`](archive/DONE.md) §8. The last of them was never a doc edit at all: three
copies of the `DATABASE_SHARD_<n>_URL` reader, which stay three copies and now run one algorithm,
held together by assertion 29.

---

## 9. Performance — the tenant/partition layer

Added 2026-09-22 from what the `16.12` run found. Every tenant is sixteen partitions, reads prune
to one and plan time is flat — that half works. What does not scale is **DDL against the
partitioned parents**, three ways, all measured live rather than reasoned:

- **Signup pays ~1.05 s of DDL** inside the organization-creation transaction — and not in round
  trips: 60 807 `to_regclass` probes cost 0.075 ms each. It is five `ATTACH PARTITION` statements
  on the two tables that still carry a foreign key to `conversations`: `messages` at **158 ms**
  per attach, `conversation_members` at **215 ms**, against 5–23 ms for the five tables without
  one. ~850 ms of the ~1.05 s is those two keys.
- **Each of those attaches takes `ShareRowExclusive` on `conversations`** (sampled from `pg_locks`
  during the run), which blocks every insert and update there for the attach's duration. A signup
  stalls "start a conversation" for everyone on the node, five times.
- **Dropping tenants was quadratic**: each `DETACH` locks the parent, and the parent had 11 700
  children. Fixed in the test teardown (`4f45294`); the production path `dropTenantPartitions`
  has the same shape and holds `ACCESS EXCLUSIVE` on all seven roots for one transaction.

**Two decisions, taken 2026-09-22.** The two sibling keys are **dropped** — conversations are never
deleted so `NO ACTION` never fires, and every insert path calls `assertMember` first; the keys
re-check what the code checked, and a nightly count catches what leaks, as `24.1` did one level
up. And the signup budget is **as low as possible**: drop the keys *and* build warm spares.

The argument for each stage lands in `packages/infrastructure/docs/reference/partitions.md` as the
stage produces its numbers. Each closed box moves to `archive/DONE.md` with its before and after.

- [ ] `PF.0` **Measure, and land the 2 000 row.** Extend `tenant-ceiling.smoke.spec.ts`'s
  `Reading`: `seedMs` split into probe / create / attach from `pg_stat_statements`; `dropMs` for one
  fresh tenant at T; a `wait_event_type` sample during the drop. Record the attach-by-parent table
  and the `ShareRowExclusive` finding in `partitions.md` beside the 2 000 row. **Closes `16.12`,
  settles `D29`, re-states `24.7`'s gate.** Measured by: the run itself.
- [ ] `PF.1` **Drop the two sibling foreign keys.** `messaging.schema.ts` loses
  `conversation_members_conversation_fk` and `messages_conversation_fk` (their indexes stay — the
  keyset reads use them); migration `0037`, one `DROP CONSTRAINT` per breakpoint, both nodes.
  `tenant-partition.spec.ts`'s `PARENT_KEYS` assertion inverts. The nightly `orphans` job grows a
  second check — rows whose `conversation_id` has no row — one query per node, same placement.
  A `send-message` case pins that a missing conversation is refused by `assertMember`, never by
  the database. **Measured by:** attach means for the two tables falling into the 5–23 ms band;
  signup DDL ~1.05 s → ~0.25 s; no `ShareRowExclusive` on `conversations` in the lock sample.
- [ ] `PF.2` **Bound the drop's lock window.** `dropTenantPartitions`: one transaction per table
  rather than one for all seven (never relied on — the purge runs it before its own transaction,
  and it is idempotent); after `PF.1` nothing is referenced, so no detach at all. A batch variant
  `dropTenantPartitionsFor(ids)`, fifty names per `drop table`; `pg-tenant-move.gateway.ts`'s
  `dropOn` delegates rather than carrying its own copy of the loop — keeping its one rule, that a
  `local` partition on node 0 is never dropped (`24.2`). The reclaim in `tenant-move.smoke.spec.ts`
  took **15.9 s** for six detaches on the catalog node, which is this entry's cost showing up in a
  second caller. **Measured by:** ceiling `dropMs`; a spec that an open `select` on one table does
  not block the drop of the other six.
- [ ] `PF.3` **Warm spares: signup pays no DDL.** Catalog table `spare_tenants(id, node,
  created_at)`, migration `0038`. The `partitions` job tops each node up to `SPARES` (20) under
  `eachShard`; `PgOrganizationFounder.found` claims one with `delete … for update skip locked
  limit 1 returning id` and skips the seed, or seeds inline when the pool is empty — no new
  failure mode. `orphanedTenants` and `orphan-sweep.ts` treat a spare as live. **Gate:** `PF.1`
  first, so spares are cheap to make. **Measured by:** the founder's transaction in the ceiling
  smoke — target, one row delete.
- [ ] `PF.4` **Sixteen probes become one query.** `TenantPartitionSeed`'s 16 `to_regclass` probes
  → one `pg_class` read; `missing(ids)` as `orphansOf` inverted. `migrate.ts` and `seed.ts` seed
  only what `missing` returns: deploy no-op from 16·T probes to one query per 500 tenants.
  **Measured by:** the idempotence case at `tenant-partition.spec.ts:123`, plus a `missing` case.
- [ ] `PF.5` **Runway and prune: one read and one transaction per page.** The runway pass is
  ~24·T statements serialized on four table-scoped advisory locks (~48 000 at 2 000 tenants), and
  `prune()` adds an undocumented 3·(T+2) catalog reads. `ensureMonthlyPartitionsFor(table, ids,
  …)`: one two-level `pg_inherits` read per page, missing months computed in memory, one
  transaction and one lock per page; `monthsAheadBefore` off the same read so
  `partition.runway.low` keeps read-before-ensure. `partitionsBefore` / `dropMonthlyPartitionsBefore`
  → one query when unscoped. Also measures the archive per tenant-month, split detach / count /
  upload / drop. **Measured by:** ceiling `runwayMs` — 6.5 s at 500 → < 1 s; ~30 s at 2 000 → < 3 s.
- [ ] `PF.6` **The month-level ceiling on cursor pages.** The row-constructor keyset does not
  prune the month level (pinned in `partition-pruning.spec.ts:592`). Keep the row constructor and
  **add** `created_at <= $at` beside it — replacing it would turn the index walk into a sort. The
  two cursor cases move out of "pinned at every month" (red first) and assert the plan is still
  `Index Scan Backward` on `notifications_inbox_idx`. **Measured by:** the spec's leaf lists.
- [ ] `PF.7` **`max_locks_per_transaction`: keep 1 024, write the arithmetic.** The `users` cascade
  that motivated it is gone (`24.1`); the reason to keep it is stronger. Locks are per relation
  *including indexes* and the table is shared — 1 024 × 200 = 204 800 slots. One unpruned scan of
  a root parent at full retention takes ~40 per tenant per month-partitioned table, so it exhausts
  the table at ~5 000 tenants. Document beside the ceiling table; fix the compose comment that
  still cites the deleted cascade; add the rule "never a named prepared statement against a
  partitioned parent". No config change.

---

## Reference — what not to fix, and what to undo

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

**Added to that table on 2026-09-20, by the `S.1` walk and by `S.2`:**

| What | Where | Why it is there |
|---|---|---|
| `CLICKHOUSE_URL` uncommented | root `.env` | `S.2` step two cannot start without it. **Leave it** until the reader is written; `ANALYTICS_DRIVER` is still `postgres`, which is the documented adoption order |
| `analytics` profile up | compose | the same |
| `ada@walk.test`, `grace@walk.test` | `users`, `memberships` in `loadbearing` | the two walk accounts. Ada was promoted to `owner` **by hand in SQL**, because `AUTH_ENROLMENT_MODE=bootstrap` enrols a sign-up as `member` and the walk needs `member.invite` |
| `hopper@walk.test`, `lovelace@walk.test` | `invitations` | never accepted, on purpose. The first is `23.5`'s pending row; the second was one auditable action, to watch the projection carry a row it had not seen |
| `01a0bd49-5cef-…` placed on node 0 | `shard_assignments` | a leftover integration tenant with no assignment, which was aborting every analytics run. See `23.21` |
| one direct conversation, two messages | `conversations`, `messages` | `23.10`'s proof that a retried optimistic send is one row |
| `redis-cache` flushed | cache Redis | after the SQL promotion, so the capability cache did not serve the old role. Rebuildable by design |

**Added on 2026-09-21 by the section 5 walk.** Left in place deliberately: the next walk needs a
platform admin, two tenants and an archived month, and manufacturing them again is the expensive
part. What was debris was removed — the two `*_2026_06_restore` scratch tables are dropped and
`retention_policy` is empty again, so an absent row is the code default exactly as before.

| What | Where | Why it is there |
|---|---|---|
| `alice@example.test` is `platform_admin` | `memberships` in `loadbearing` | `pnpm platform:grant`. It **moved** her from `owner`, which is what the script does; `ada@walk.test` is still `loadbearing`'s owner |
| **Walk Co** (`o-01a0c2c3-…`) | `organizations` | alice founded it for Phase 18's *customer tenant active* half. bob is a member of it |
| **Bob Co** (`o-01a0c2cf-…`) | `organizations` | bob founded it for Phase 18's *tenant owner is redirected* half and for Phase 21's archived section, which needs `notification.archive.read` |
| three archived months | `partition_archive`, `cold/notifications/2026/0{6,7}/` | two for `loadbearing`, one for Bob Co. **The rows exist only in S3** — the partitions were archived and dropped. Deleting the objects makes `/notifications` and `/platform/storage` empty again |
| one tenant export | `export/01a0c2c3-…/2026-09-21/` | five objects, from `/platform/storage`'s button. The bucket lifecycle deletes them after seven days |
| two invitation mails to `bob@example.test` | Mailpit | `26.9`: the second is the resend, and the pair is the proof |
| `bob@example.test` in `Walk Co` | `memberships` | `T-029` step 2. His `loadbearing` membership is untouched |

**Added on 2026-09-22, running the smoke suites.**

| What | Where | Why it is there |
|---|---|---|
| `LOKI_URL` uncommented | root `.env` | `observability.smoke.spec.ts` gates on it and skips silently without it, so the suite reported nothing about the log read-back path while Loki was up and answering. **Leave it**: it builds a `LogReader` and changes nothing about writing — `JsonLogger` goes to stdout and Alloy tails it either way |

Not left behind, and worth saying so: `platform_policy.projection_enabled` is `t` again, the two
scratch tables are gone, `retention_policy` holds no rows, and the `.env` copy taken before the
`LOKI_URL` edit was removed once the diff was confirmed to be that one line.

---

## Changelog

**Moved to [`archive/DONE.md`](archive/DONE.md) on 2026-09-22**, with the entries it explains — a
log of what closed belongs beside what closed. New rows go there, at the top, as rule 2 says.
