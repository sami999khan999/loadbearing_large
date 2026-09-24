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
| 1 | `archive/PLAN.md` unchecked boxes, Phases 23–25 | 2 | 31 |
| 2 | `archive/REVIEW.md` defects | 0 | 45 |
| 3 | `archive/STUCK.md` blockers | 2 | 1 |
| 4 | Unfinished work buried inside ticked items | 0 | 6 |
| 5 | Verification owed — browser, manual, or a scale not run | 0 | 9 |
| 6 | Conditional work — "reopen when" | 7 | — |
| 7 | `archive/TODO.md` ledger rows | 0 | 3 |
| 8 | Doc housekeeping still owed | 0 | 6 |
| 9 | Performance — the tenant/partition layer | 0 | 8 |

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
> lines in `.env`. That is what proved half of `R.2`, and `24.1`, `24.2` and `24.5` were built and
> proved against it. An entry that is blocked says so.

**Every archived plan was checked and carries nothing of its own.** Every `[ ]` in
`archive/COMMUNICATION-PLAN.md`, `DB-SCALING-PLAN.md`, `PLATFORM-ADMIN-PLAN.md` and
`IMPLEMENTATION-PLAN.md` maps through `archive/PLAN.md`'s **Where the old IDs went** table to an item that
is either ticked there or listed in section 1 below. The four blockquoted Exit clauses in the
communication plan are `23.5`–`23.11`. `DB-SCALING-DEFERRED.md`'s two items were reopened and
delivered as Phases 18–20. `P2.20` was dropped as moot; `P8.3` is `23.4`, done.

---

## Where work stopped — 2026-09-25

**Every item on the 2026-09-24 list is done except one**, and that one is skipped with its reasons
in its entry. Everything is committed on `dev` and **not pushed**. Build, typecheck, lint, all 29
architecture assertions with none skipped, the full test suite and the smoke suite are green. What
closed, each with its proof in [`archive/DONE.md`](archive/DONE.md):

| ID | What | Proof |
|---|---|---|
| `24.2b` | a job re-reads its placement per transaction | red without it, twice: a spec and a live move |
| `24.3` | read replica per node, used only once caught up | live standby; red without the caught-up check |
| `25.1` · `25.2` | replica status and the switch, on `/platform/status` | over the API; standby +42 vs +0 scans per run |
| `25.3` | colder storage class, a MinIO tier | the live bucket takes a `COLD` transition and refuses an unknown one |
| `24.6` | routed writes at 1× and 10× across two nodes | 0 errors, no misplaced row, 142–159 writes/s at 10× |
| `24.4` | the catalog, measured | zero catalog reads per warm routed write; nothing built |
| `T-036` | the communication row | "Done when" narrowed, as decided |

**Skipped: `23.14`**, the analytics reader. Its gate is not met and its first query is a product
choice. See the entry.

**What is left is not a session's to do.** `S.2` waits for real traffic. `S.3` waits for a node
that is provisioned rather than a second container. Section 6 is triggers, none fired. The
whole-plan verification's reading pass was done on 2026-09-25 and is in section 5.

---

## 1. `archive/PLAN.md` — the two open boxes

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
  - **Skipped 2026-09-25, and not because of the store.** The order was ClickHouse, decided. Two
    things block it, and neither is the kind a session should settle alone:
    1. **The gate is not met.** On the machine this session ran on, ClickHouse held **242 rows
       across 3 days**. Most of them are spec debris: `test.commit.*`, `test.kept.*`, and
       `organization.created` for 73 integration tenants. The entry's order is "let it fill and
       reconcile for days, *then* write the reader against real data", and there is none to write
       it against.
    2. **The first dashboard is a product choice.** "A dashboard with a real query" names no
       question. Which aggregate the first screen answers — actions per day, members joined, time
       to first message — decides the port's first method. A guessed one is the shape `5.12`
       deleted for having no caller.
  - **To unblock:** name the first dashboard's question, and run the worker somewhere it sees real
    use for a few days. The four carried decisions stand.

### Phase 24 — The physical split 📁

**`24.1`–`24.6` are built, and `24.7` waits on a relation count no node has reached** —
[`archive/DONE.md`](archive/DONE.md) §1. A tenant can be moved, a move under load loses no
acknowledged write, a moved tenant's catalog audit rows reach its own node through the outbox, a
job still writing after the settle is refused rather than landing on the source, and the
projection reads from a standby once it has caught up.

- [ ] `24.7` **A pooled partition for the long tail** — small tenants share one `<table>_pool`
  list partition and graduate on a size line. **Its gate is relation count now, measured by
  `PF.0`**: a tenant-level attach grows with siblings (~3 ms at 100 tenants, ~27 ms at 2 000), and
  one unpruned read of `notifications` at full retention exhausts the lock table at ~1 800 tenants
  (`PF.7`). Plan time is flat and the runway is 1.6 s at 2 000, so the old triggers would never
  fire. — `archive/PLAN.md:4015`

### Phase 25 — The replica panel and the shard map 📁

**Empty.** `25.1` and `25.2` closed with `24.3` on 2026-09-25, and `25.3` the same day —
[`archive/DONE.md`](archive/DONE.md) §1.


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

**`R.2`'s last owed spec was written on 2026-09-24**: `sharded.smoke.spec.ts` publishes an event
for a tenant on node 1 and drains it from node 1's outbox, and it is red with the catalog unit of
work `R.2` fixed. The file is 7 passed.

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
  not a tool.** ~~`24.1` is deliberately filed until that node exists~~ — **superseded
  2026-09-22**: `24.1` was decided and built, the routed insert on node 1 lands, and
  `sharded.smoke.spec.ts` is 6 passed. What is left of this entry is a node that is *provisioned*
  rather than a second container on one machine, which is `24.6`'s load test and a deploy.

---

## 4. Unfinished work buried inside ticked items

Each of these sits under a `[x]` in `archive/PLAN.md` as an `unfinished:`, `concern:` or `corrected:` note.
Re-checked against the tree on 2026-09-20; the ones that turned out to be resolved are listed at
the end so nobody chases them. **None is open**: `16.12`, the last, closed with `PF.0` on
2026-09-24 — [`archive/DONE.md`](archive/DONE.md) §4.

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

**The whole-plan verification closed on 2026-09-25**, both halves — the command block and all 26
Exit lines by hand. [`archive/DONE.md`](archive/DONE.md) §5 has what was found.

---

## 6. Conditional work — "reopen when"

Not open today. Each is a trigger written into a ticked item so the next person does not decide on
a feeling.

- `24.7` **pooled partition** — ~~when planning passes 5 ms or the runway passes ten minutes~~;
  **re-stated 2026-09-24**: when a node heads past ~1 800 tenants, the point where one unpruned
  read exhausts the lock table, or a tenant-level attach passes ~50 ms. Section 1 has the numbers.
  — `archive/PLAN.md:1349`
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

---

## 7. `archive/TODO.md` — the three ledger rows

**Empty.** `T-036` closed on 2026-09-25 with its "Done when" narrowed as decided, so Phase 26
lives in [`COMMUNICATION.md`](COMMUNICATION.md) rather than on this row. `T-037` and `T-038`
closed on 2026-09-21. All three are in [`archive/DONE.md`](archive/DONE.md) §7.

---

## 8. Doc housekeeping still owed

**Empty.** All six closed on 2026-09-21 and 2026-09-22 —
[`archive/DONE.md`](archive/DONE.md) §8. The last of them was never a doc edit at all: three
copies of the `DATABASE_SHARD_<n>_URL` reader, which stay three copies and now run one algorithm,
held together by assertion 29.

---

## 9. Performance — the tenant/partition layer

**Empty. All eight closed on 2026-09-24** and are in [`archive/DONE.md`](archive/DONE.md) §9, each
with its before and after. The short version, at 2 000 tenants on one node:

| | before | after |
| --- | --- | --- |
| a signup, whole founding transaction | ~126 ms inline, and its DDL grows with the node | **21 ms** on a spare |
| `SHARE ROW EXCLUSIVE` on `conversations` per 20 signups | 2 227 samples | **0** |
| the monthly runway pass | 35.6 s | **1.6 s** |
| dropping one tenant | one transaction over seven parents | one statement per table |

**One finding is not a task and needs a decision**: one unpruned read of `notifications` at full
retention exhausts the lock table at ~1 800 tenants, not the ~5 000 the plan estimated. Nothing in
the application issues one. `max_locks_per_transaction` stays 1 024 until a node heads there.

---

## Reference — what not to fix, and what to undo

### Do not fix these — they are frozen by design

Six lines inside `archive/` were stale the day the files moved, and the 2026-09-25 verification
added two rows. **They are not tasks.** A file in
`archive/` records what was believed when it was written, and correcting one would make it a worse
record, not a better one. Listed so nobody reads them as current on the way to an entry's body.

| Where | What it says | What is true |
|---|---|---|
| `archive/PLAN.md:34–81` | eighteen phases built, "start at Phase 19" | twenty-two built; the queue is Phase 23 |
| `archive/PLAN.md:87` | `check:architecture` "21/21 today; 23 after Phase 22" | 29 |
| `archive/PLAN.md:3347` | Phase 23 is "three fixes, eight clauses, three from `TODO.md`, and `23.16`" | `23.16` is done; `23.17`–`23.24` came later |
| `archive/OPEN.md:763` | "45 commits on `main`, nothing pushed" | merged as PR #18; `origin/main..HEAD` is empty |
| `archive/OPEN.md:544` | section B line numbers, taken 2026-09-19 | drifted by that night's edits; the IDs are right |
| Phase 22's Exit | "`sharded.spec.ts` fails on exactly the foreign-key constraint `24.1` names" | `24.1` dropped the keys; the spec asserts the write succeeding |
| Phases 17–22's Exits | 20, 21 or 23 assertions; `TENANT_EXEMPT`; `/health`; nine platform keys | 29; `shard.ts`'s `CATALOG`; `/api/health`; ten |
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

**Added on 2026-09-25, on a second machine.** This checkout had been synced from the remote with
a `.env` and a database from before the 2026-09-20 renumbering, so the stack started on the old
ports and the schema was behind. What was changed to run it:

| What | Where | Why it is there |
|---|---|---|
| every port renumbered, the `*_PORT` block appended | root `.env` | it still dialled `5432`; the old file is `.env.backup-2026-09-25` beside it |
| `POSTGRES_REPLICA_PORT`, `DATABASE_REPLICA_URL` | root `.env` | `24.3`. **Leave it**: with the switch off, nothing reads through it but the status panel |
| `pnpm db:migrate`, `pnpm db:seed` | both nodes | the schema was behind; the seed gave `platform_admin` `platform.replica.manage` |
| `replica` profile up, `pgreplicadata` volume | compose | `24.3`'s standby. The primary was recreated once to take `hba_file` |
| four leftover integration tenants placed on node 0 | `shard_assignments` | `other-…`, `drop-…` and two `pruning-…`, from 2026-09-19. Each aborted every projection run: `23.21`, still undecided |
| `replica-e2e@example.test`, `platform_admin` | `users`, `memberships` in `loadbearing` | the throwaway admin `25.2` was flipped with; verified by SQL, not by mail |
| `S3_COLD_STORAGE_CLASS=COLD`, `S3_COLD_TRANSITION_DAYS=30` | root `.env` | `25.3`. Harmless with `retention_policy` empty: the only rule is `export/`, which never transitions |
| `cold-tier` profile up, `miniocolddata` volume, tier `COLD` on `minio` | compose | `25.3`'s tier |
| four `platform.replica.*` audit rows, switch back **off** | `activity_log`, `platform_policy` | the end-to-end check: on, off, on, off |

Not left behind, and worth saying so: `platform_policy.projection_enabled` is `t` again, the two
scratch tables are gone, `retention_policy` holds no rows, and the `.env` copy taken before the
`LOKI_URL` edit was removed once the diff was confirmed to be that one line.

---

## Changelog

**Moved to [`archive/DONE.md`](archive/DONE.md) on 2026-09-22**, with the entries it explains — a
log of what closed belongs beside what closed. New rows go there, at the top, as rule 2 says.
