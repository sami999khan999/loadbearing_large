---
title: Backlog — every task not done, in one place
updated: 2026-09-29
owner: sami
schema: backlog/v1
source: compiled 2026-09-20 at 885e144 from the five ledgers, which moved to archive/ the same day
---

# Backlog

**This is the only open ledger, and it holds only what is open.** What has closed is in
[`archive/DONE.md`](archive/DONE.md). What sessions left on a developer machine is in
[`archive/STATE.md`](archive/STATE.md). Everything else in `plans/` is history, except a plan
still being built, which its section here names.

> **How to use this file**
>
> 1. **Every entry keeps its original ID** — `24.7`, `S.2` — and points at the archived file and
>    line that hold the full text. Read the body before acting on a summary.
> 2. **Close it by moving it.** Fix the item, move its entry to [`archive/DONE.md`](archive/DONE.md)
>    under the same section number with its proof, and add the changelog row there.
> 3. **Nothing here is a place to argue a decision.** The argument is in the archived body. A new
>    decision goes in the entry and says it supersedes.
> 4. **Line numbers are as of `885e144`** and stable, because the archived files no longer change.
>    If one is ever off, the ID is the truth.

| Section | What | Open | Closed, in `archive/DONE.md` |
|---|---|---|---|
| 1 | `archive/PLAN.md` boxes, Phases 23–25 | 1 | 32 |
| 3 | `archive/STUCK.md` blockers | 2 | 1 |
| 6 | Conditional work — triggers, not tasks | 5 | — |
| 10 | Code review of 2026-09-25 — [`archive/REVIEW-2026-09-25.md`](archive/REVIEW-2026-09-25.md) | 2 | 47 |
| 11 | Communication features — [`archive/COMMUNICATION.md`](archive/COMMUNICATION.md) | 8 | 1 |
| 12 | Communication performance plan, what is left — [`archive/COMMUNICATION-PERFORMANCE-PLAN.md`](archive/COMMUNICATION-PERFORMANCE-PLAN.md) | 1 | 8 |
| 13 | Access and visibility plan — [`ACCESS-AND-VISIBILITY-PLAN.md`](ACCESS-AND-VISIBILITY-PLAN.md) | 4 | — |
| 14 | Code review of 2026-09-28, and the plan's review before it starts | 8 | 8 |

Sections 2, 4, 5, 7, 8 and 9 are closed in full: 45 defects, 6 buried items, 9 verifications, 3
ledger rows, 6 doc fixes and 8 performance items. Their entries are in `archive/DONE.md` under the
same numbers.

**Sections 1, 3 and 6 cannot be closed by writing code today.** `24.7` and the triggers wait for
a number no node has reached. `S.2` waits for real traffic. `S.3` waits for a provisioned server.
**Section 10 is down to two narrowed remainders** of the 2026-09-25 review; the other forty-seven,
the shipped security defects among them, are closed. **Section 11 is the next work**: the
communication features, which waited on the performance plan and are built on top of it now.
**Section 12 is measurement and hand checks** a session without a person at the browser cannot do.
**Section 13 is a live plan**, agreed 2026-09-27 and not started: flags, entitlement, per-user
overrides, the platform deny and the dashboard's widgets. Its boxes are ticked in the plan itself
until it is archived.

---

## 1. `archive/PLAN.md` — the one open box

- [ ] `24.7` **A pooled partition for the long tail** — small tenants share one `<table>_pool`
  list partition and graduate on a size line. **Its gate is relation count now, measured by
  `PF.0`**: a tenant-level attach grows with siblings (~3 ms at 100 tenants, ~27 ms at 2 000), and
  one unpruned read of `notifications` at full retention exhausts the lock table at ~1 800 tenants
  (`PF.7`). Plan time is flat and the runway is 1.6 s at 2 000, so the old triggers would never
  fire. — `archive/PLAN.md:4015`

## 3. `archive/STUCK.md` — what a session could not do, and why

- [ ] `S.2` **Check the analytics projection and `/analytics` against real traffic.**
  - **Narrowed 2026-09-25.** The reader was built against seeded data, decided with the user, so
    nothing waits on this any more. What is left is the check: run the worker on real traffic for
    a few days, let the reconciliation come back clean, and look at `/analytics` against it.
  - Its history, and why `23.21` had to come first, is in `archive/DONE.md`, "Moved out of
    `BACKLOG.md`". — `archive/STUCK.md`
- [ ] `S.3` **Phase 24 wants a second node that is provisioned**, not a second container on one
  machine. Everything Phase 24 built is proved against the two-node compose profile, including
  `24.6`'s load test. What only a real server gives is numbers a capacity plan can use: the
  commit time here is Docker Desktop's `fsync`, about 100 ms. — `archive/STUCK.md`

---

## 6. Conditional work — "reopen when"

Not open today. Each is a trigger written into a ticked item, so the next person does not decide on
a feeling.

- `24.7` **pooled partition** — ~~when planning passes 5 ms or the runway passes ten minutes~~;
  **re-stated 2026-09-24**: when a node heads past ~1 800 tenants, the point where one unpruned
  read exhausts the lock table, or a tenant-level attach passes ~50 ms. Section 1 has the numbers.
  — `archive/PLAN.md:1349`
- `21.1` **per-user object layout for `notifications`** — when p95 on the archived view passes
  500 ms; every page turn gunzips the whole tenant-month object today. — `archive/PLAN.md:2691`
- `16.7` **`unreadCounts` pruning assertion** — reopen if the read changes; its floor is
  `last_read_at`, a correlated subquery. — `archive/PLAN.md:1235`
- `24.1` **user delete as a maintenance job** — at a few thousand tenants on a node, under either
  option. — `archive/PLAN.md:3968`
- **Two policy-shaped constants** — the two-month runway and the thirty-day cold grace could move
  onto `platform_policy` in an afternoon if an operator asks. — `archive/PLAN.md:1745`

**`max_locks_per_transaction` stays 1 024** until a node heads toward `24.7`'s ~1 800 tenants. Past
that, one unpruned read of `notifications` at full retention exhausts the lock table. Nothing in the
application issues one. — `PF.7`, `archive/DONE.md` §9

---

## 10. Code review of 2026-09-25 — what is left of it

Forty-seven of the forty-nine findings are closed and in [`archive/DONE.md`](archive/DONE.md) §10,
each with its proof. These two were fixed in their main part and each keeps a smaller one; the
bodies are in [`archive/REVIEW-2026-09-25.md`](archive/REVIEW-2026-09-25.md) at the line given.

- [~] `CR.20` **A caught-up tenant still costs the projection three round trips.** The run now
  rotates its start, passes a failing tenant and stops paging once its budget is spent, so no
  tenant starves. What is left is that a run is O(tenants) for tenants with nothing to project.
  — `archive/REVIEW-2026-09-25.md:157`
- [~] `CR.33` **An index job still carries its text through Redis.** An older re-index can no
  longer land last — the job carries its request's time and is skipped when a newer one is
  indexed. Each job still holds up to 100 KB in the `noeviction` queue instance.
  — `archive/REVIEW-2026-09-25.md:224`

---

## 11. Communication features — `archive/COMMUNICATION.md`

Deferred whole on 2026-09-22 because they shared one unstated requirement — messaging, email and
notifications must not slow the app down. That requirement is the performance plan, and it is
built; what it changed for each item is on the item. The decisions reached for them are
`archive/COMMUNICATION.md:51`, and three things their older entries get wrong are `:71`.
The full original text is in `archive/PLAN.md` under the same IDs.

### Messaging

- [ ] `26.1` **Threads, reactions, attachments.** `messages` is partitioned, so a thread's
  `parent_id` cannot reference `id` alone; `StorageGateway.presignUpload` already exists with no
  caller. Thread reads should take the first page's `upTo` bound (`CP2.2`). — `archive/COMMUNICATION.md:25`
- [ ] `26.6` **A cluster-wide stream cap, and presence from open streams.** The per-person cap now
  counts every stream a tab opens (`CP7.4`), per process; presence lives naturally in
  `apps/realtime`. — `archive/COMMUNICATION.md:28`
- [ ] `26.4` **Old `messages` partitions archived to S3.** Parked pending a discussion: it reopens
  decision D47. The reads that grew with it are bounded now (`CP2.2`, `CP2.3`), which weakens the
  case. — `archive/COMMUNICATION.md:29`
- [ ] `26.8` **The 250 000-recipient fan-out load test.** Needs a machine that can hold a `users`
  row per recipient. Measures the paged fan-out and batched suppression from `CP4.3`, `CP4.6`.
  — `archive/COMMUNICATION.md:32`

### Email

- [ ] `26.11` **SMTP configurable from the dashboard** — a platform default plus a per-tenant
  override, `auth.*` always on the platform sender, passwords under `MAIL_SECRET_KEY`. The pooled
  sender (`CP4.7`) becomes one pool per sender. — `archive/COMMUNICATION.md:37`
- [ ] `26.10` **A delivery log.** Today the record is the log lines, and a failed send is kept a
  week in the queue's failed set with `pnpm queue:replay` (`CP3.1`, `CP3.7`). The trigger is still
  "was this sent?" becoming unanswerable — tenant SMTP makes it likely. — `archive/COMMUNICATION.md:39`

### Notifications

- [ ] `26.3` **Web push** — whole or not at all, a third channel in the preference grid.
  — `archive/COMMUNICATION.md:45`
- [ ] `26.7` **Per-tenant digest hour, channel mentions, grouping**, plus the recipient list, count
  and opt-out `23.4` called product work. The digest fan-out is per tenant now (`CP4.5`), which is
  the shape a per-tenant hour needs. — `archive/COMMUNICATION.md:46`

---

## 12. Communication performance plan — what is left

Built on 2026-09-26 and archived; every body is on its item in
[`archive/COMMUNICATION-PERFORMANCE-PLAN.md`](archive/COMMUNICATION-PERFORMANCE-PLAN.md), by ID and line.

- [~] `CP7.9` **Web stops serving streams** — the second release: drop `realtime.*` from web's
  handler and point the stream smoke spec at `apps/realtime`. — `archive/COMMUNICATION-PERFORMANCE-PLAN.md:525`

---

## 13. Access and visibility plan — `ACCESS-AND-VISIBILITY-PLAN.md`

Agreed 2026-09-27; Phases 1–9 done 2026-09-28 and 2026-09-29. Seventy-two items in eleven phases, IDs `AX<phase>.<n>`; the
boxes live in [`ACCESS-AND-VISIBILITY-PLAN.md`](ACCESS-AND-VISIBILITY-PLAN.md) while it is being
built, and whatever is open when it is archived comes back here. The decisions are its
"Decisions recorded up front"; extensions were scrapped the same day.

- [x] Phase 1 — the rules, written before the first fragment (`AX1.1`–`AX1.6`)
- [x] Phase 2 — the kernel in `permissions`: requirements, flags, widgets, zones, the mask (`AX2.1`–`AX2.7`)
- [x] Phase 3 — flags end to end, and `check-architecture` §31, built with Phase 9 (`AX3.1`–`AX3.7`)
- [x] Phase 4 — entitlement: plans, adjustments, the module kill switch (`AX4.1`–`AX4.9`)
- [x] Phase 5 — per-user overrides: expiring grants, permanent denies, the drift overlay (`AX5.1`–`AX5.9`)
- [x] Phase 6 — the platform deny and the account suspend (`AX6.1`–`AX6.9`)
- [x] Phase 7 — `<Zone>` in `ui` (`AX7.1`–`AX7.3`)
- [x] Phase 8 — `<Widget>`, the dashboard zone, `/dashboard`, and §30 (`AX8.1`–`AX8.8`)
- [x] Phase 9 — widget preferences, rolled out behind `widget.dismissal` (`AX9.1`–`AX9.8`)
- [ ] Phase 10 — the widget inspector (`AX10.1`–`AX10.3`)
- [ ] Phase 11 — lint, the flag's retirement, the hand walk (`AX11.1`–`AX11.3`)

### Bugs found while building it, not yet fixed

Filed here now rather than when the plan is archived, because neither is the plan's own work.
The full text stays under each ID in [`ACCESS-AND-VISIBILITY-PLAN.md`](ACCESS-AND-VISIBILITY-PLAN.md).

- [ ] `AX7.5` **Every tinted `StatusBadge` shows the wrong hue.** `status-badge.css` mixes each
  status colour into `--surface` with `color-mix(in oklch, …)`, which interpolates the hue too.
  Measured in the kitchen sink on 2026-09-29: the success tint is hue 21.7, red, in every light
  theme, because their `--surface` is `oklch(1 0 0)` with hue 0 rather than `none`. In each dark
  theme it lands on the surface's own hue: slate 245, ocean 202, plum 306, midnight 267. Forest
  reads right only because its surface is green. `check:contrast` cannot see it, since the text
  still reads. **Fix:** mix `in oklab`, which has no hue path. That contradicts `color.md`, which
  prescribes `in oklch` for derived states, so the rule and `packages/ui/docs/reference/palette.md`
  change with it. Check the hover mixes of `--primary` into `--fg` in the same pass, and
  re-measure all nine theme-and-mode pairs.
- [ ] `AX3.10` **`check-architecture` §18 does not count a primary key as an index.** Postgres
  backs a primary key with a unique index, so a composite key leading with a foreign key serves
  the cascade — but §18 reads only `index()` and `uniqueIndex()` and would fail that table.
  Found with `feature_flag_organizations`, which went back to a plain unique index before `0042`
  shipped. **Fix:** teach §18 to read `primaryKey({ columns })`, with a fixture each way.

---

## 14. Code review of 2026-09-28 — and the plan's review before it starts

A review of the code changed since the 2026-09-25 review (`14d49db..2ee420a`), and of
`ACCESS-AND-VISIBILITY-PLAN.md` before its first box is ticked. IDs are `RV.<n>`, new. Each body is
here rather than in an archived file, because there is no archived file for it yet; line numbers
are as of `2ee420a`. Each was checked against the code, and the scenario says what triggers it.

### Code

- [ ] `RV.2` **Typing and resync frames become the client's resume point.** At
  `packages/query/src/realtime/realtime-stream.ts:48`, `lastEventId = frame.id` runs for every
  frame. A typing frame is never logged (`redis-realtime.publisher.ts:24`), and a resync's id is a
  fresh `Uuid.v7()` that is never logged either. After either one, the next reopen at the
  thirty-minute age or a drain always finds nothing in `RealtimeLog.since`. So it is always a
  resync, and a resync refetches every list the table names. That happens in every busy
  conversation, since typing is the most frequent frame. **Fix:** track only `kind === "event"` ids.
- [ ] `RV.3` **Every fanned-out frame writes a replay log per member.** `MessagingRealtimeSubscriber`
  publishes one `conversation.changed` per member to each user channel, and
  `RedisRealtimePublisher.publish` turns each one into `XADD` + `EXPIRE` on
  `realtime:log:<user channel>`. A message to a 25 000-member channel creates or extends 25 000
  streams, each kept an hour, on the cache instance. `RealtimeLog.since` then reads and zod-parses
  the whole stream (`XRANGE - +`) on every resume. After a drain that is every stream at once.
  **Fix:** skip the log for user-channel fan-out frames, which are only list invalidations, or
  measure the cost first at `26.8`'s scale.
- [ ] `RV.4` **Stream revalidation is a database query per open stream per minute.** `StreamRevalidation`
  (`packages/api-server/src/router/stream-revalidation.ts:14`) runs `isActive` or `findMembership`
  every 60 s for each stream. At 10 000 streams that is ~170 queries a second against
  `apps/realtime`'s `DATABASE_POOL_MAX` default of 5. The comment beside that default
  (`apps/realtime/src/env.ts:14-15`) still says "once per stream opened, never per frame". The checks
  can also overlap when one takes longer than the interval. **Fix:** batch the check per process,
  one query for all open streams per tick, and correct the comment and the pool sizing in
  `apps/realtime/docs/reference/env.md`.
- [ ] `RV.5` **Mail dedupe outlives BullMQ's completed-job cap only briefly.** `QueuedMailPublisher`
  turns `dedupeKey` into a `jobId` (`packages/composition/src/mail/queued-mail.publisher.ts:49`),
  but BullMQ only dedupes while the job still exists. `removeOnComplete` is
  `{ age: 3_600, count: 1_000 }` (`bullmq-queue.publisher.ts:62`). Take a digest run over a tenant
  with more than 1 000 recipients that fails on a later page and retries. The earlier pages' jobs
  have already been trimmed, so those people get the morning's digest twice. The spec
  "keys the send on the day, so a retry is one message" passes only because
  `RecordingMailPublisher` dedupes forever. **Fix:** keep completed mail jobs longer than the
  longest retry window, or dedupe on a Redis key with its own TTL.
- [ ] `RV.6` **Per-command failures inside `MULTI` are silent.** At `redis-realtime.publisher.ts:32-37`,
  ioredis `exec()` resolves with `[error, result]` pairs, so a failed `XADD` is neither thrown nor
  logged, and `realtime.publish.failed` never fires. The frame is then missing from the log, so a
  resume turns into a resync. The rate limit store reads the pairs deliberately
  (`redis-rate-limit.store.ts:19`); the publisher does not. **Fix:** check the pairs and emit the
  failure line.
- [ ] `RV.7` **`// ──` separators split a sentence to pass §14.** The rule is two comment lines, and
  a separator ends a run so that "two comment lines either side of a separator are two comments"
  (`docs/opinions/comments.md:178`). In 22 places the separator falls mid-sentence, so each is one
  comment of four or five lines. Examples: `apps/worker/src/consumer/maintenance.consumer.ts:95`,
  `analytics.consumer.ts:320` and `:336`, `packages/query/src/messaging/use-conversation-stream.ts:38`,
  `packages/content/src/source/static-content.source.ts:21`,
  `packages/application/src/platform/preview-retention-change.use-case.ts:92`,
  `purge-organization.use-case.ts:103`, `pg-organization.founder.ts:76`,
  `tenant-partition.seed.ts:134`, `shard.schema.ts:49`, `apps/web/src/router.tsx:101`, and
  `notification.list.tsx:93`. The rest are in specs. **Fix:** cut each one to two lines, with the
  argument in `docs/reference/`. Then make §14 fail a separator whose line above does not end a
  sentence.
- [ ] `RV.8` **A relative import without `.js`.** `apps/web/src/router.tsx:16` imports
  `./route-tree.gen`. `docs/ai/rules/imports.md` says `.js` on every relative import. **Fix:** add
  the extension, or record the generated file as an exemption where the rule lists its three.
- [ ] `RV.9` **§29's comments still say three readers.** At `tooling/scripts/check-architecture.mjs:1682`,
  the comment reads "parsed in three places", and the spec says "The rule all three carry"
  (`tooling/scripts/tests/check-architecture.spec.mjs:1234`). There are four readers since
  `apps/realtime`.

### The access and visibility plan — improvements before Phase 1

All seven, `RV.10`–`RV.16`, were folded into `ACCESS-AND-VISIBILITY-PLAN.md` on 2026-09-28,
before its first box was ticked. They are in [`archive/DONE.md`](archive/DONE.md) §14.

---

## Changelog

**In [`archive/DONE.md`](archive/DONE.md)**, beside the entries it explains. New rows go there, at
the top.
