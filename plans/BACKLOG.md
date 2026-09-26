---
title: Backlog — every task not done, in one place
updated: 2026-09-25
owner: sami
schema: backlog/v1
source: compiled 2026-09-20 at 885e144 from the five ledgers, which moved to archive/ the same day
---

# Backlog

**This is the only open ledger, and it holds only what is open.** What has closed is in
[`archive/DONE.md`](archive/DONE.md). Messaging, email and notifications, deferred whole, are in
[`COMMUNICATION.md`](COMMUNICATION.md). What sessions left on a developer machine is in
[`archive/STATE.md`](archive/STATE.md). Everything else in `plans/` is history.

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
| 10 | Code review of 2026-09-25 — [`archive/REVIEW-2026-09-25.md`](archive/REVIEW-2026-09-25.md) | 49 | 0 |

Sections 2, 4, 5, 7, 8 and 9 are closed in full: 45 defects, 6 buried items, 9 verifications, 3
ledger rows, 6 doc fixes and 8 performance items. Their entries are in `archive/DONE.md` under the
same numbers.

**Sections 1, 3 and 6 cannot be closed by writing code today.** `24.7` and the triggers wait for
a number no node has reached. `S.2` waits for real traffic. `S.3` waits for a provisioned server.
**Section 10 can, and it is the work**: forty-nine findings from the 2026-09-25 review, three of
them security defects already shipped.

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

## 10. Code review of 2026-09-25 — forty-nine findings

Each finding's body is in [`archive/REVIEW-2026-09-25.md`](archive/REVIEW-2026-09-25.md), at
the line given, with its `file:line`, scenario, fix direction and how sure it is. **PLAUSIBLE**
findings are reasoned, not traced: verify before fixing. The boxes are here; the review file
holds only the bodies.

**Suggested order:** `CR.1`–`CR.3` · then `CR.13`, `CR.14`, `CR.44` · then `CR.37`–`CR.39` · then
`CR.21`, `CR.22`, `CR.11`, `CR.15` · then the rest by subsection. — `archive/REVIEW-2026-09-25.md:324`

### 10.A Security and tenant isolation

- [ ] `CR.1` **high — any role that can invite can make an owner**, and so take over the tenant.
  Shipped. — `archive/REVIEW-2026-09-25.md:42`
- [ ] `CR.2` **high/medium — deactivation does not revoke**: API keys skip `isActive`, and the
  capability cache is never invalidated. — `archive/REVIEW-2026-09-25.md:52`
- [ ] `CR.3` **medium — a key can mint a permanent key** that outlives its own revocation.
  — `archive/REVIEW-2026-09-25.md:61`
- [ ] `CR.4` **medium — a stream is authorized once**, then trusted for 30 minutes after the
  member is removed. — `archive/REVIEW-2026-09-25.md:66`
- [ ] `CR.5` **medium — conversation streams have no per-user cap.** — `archive/REVIEW-2026-09-25.md:71`
- [ ] `CR.6` **medium — nothing on the oRPC surface is rate-limited**: invite mail-bombing, paid
  embedding calls. — `archive/REVIEW-2026-09-25.md:75`
- [ ] `CR.7` **medium — deactivated in the last-active tenant locks a user out of all of them.**
  — `archive/REVIEW-2026-09-25.md:80`
- [ ] `CR.8` **low/medium — document indexing ignores goal scope.** — `archive/REVIEW-2026-09-25.md:85`
- [ ] `CR.9` **low — the capability cache can re-cache a revoked set**, for 60 s. PLAUSIBLE.
  — `archive/REVIEW-2026-09-25.md:90`
- [ ] `CR.10` **low — the shard resolver has the same fill race** during a move. PLAUSIBLE.
  — `archive/REVIEW-2026-09-25.md:94`
- [ ] `CR.11` **medium — the move freeze is enforced only inside `PgUnitOfWork.run`**, so writes
  outside a transaction are lost at the flip. — `archive/REVIEW-2026-09-25.md:99`
- [ ] `CR.12` **medium — the OpenAI call has no timeout**, and its network errors do not retry.
  — `archive/REVIEW-2026-09-25.md:107`

### 10.B Lost work, the worker and its queues

- [ ] `CR.13` **high — job retries run out in seconds**; a 40 s outage drops mail and events for
  good. `CR.49` is fixed with it. — `archive/REVIEW-2026-09-25.md:115`
- [ ] `CR.14` **high — one down node stops every node after it** in the outbox, runway and digest
  passes. — `archive/REVIEW-2026-09-25.md:122`
- [ ] `CR.15` **high — an archive cut off mid-way hides a month for good.** — `archive/REVIEW-2026-09-25.md:127`
- [ ] `CR.16` **medium-high — cold restore and re-projection load a whole month into memory.**
  — `archive/REVIEW-2026-09-25.md:134`
- [ ] `CR.17` **medium-high — one failed boot run switches off the boot runway.** — `archive/REVIEW-2026-09-25.md:143`
- [ ] `CR.18` **medium — fixed job ids swallow repeat admin requests.** — `archive/REVIEW-2026-09-25.md:148`
- [ ] `CR.19` **medium — one failure at 07:00 cancels every tenant's digest.** — `archive/REVIEW-2026-09-25.md:154`
- [ ] `CR.20` **medium — the projection starves later tenants and stops at one bad one.**
  — `archive/REVIEW-2026-09-25.md:157`

### 10.C Scaling limits in the database layer

- [ ] `CR.21` **high — the nightly orphan check scans every message**, out of locks near 1 860
  tenants. It is the "flaky" `orphaned-tenants.spec.ts`. — `archive/REVIEW-2026-09-25.md:167`
- [ ] `CR.22` **high — the digest's tenant scan runs out of locks** near 5 800 tenants.
  — `archive/REVIEW-2026-09-25.md:174`
- [ ] `CR.23` **high — archiving a month rescans the partition for every page.** — `archive/REVIEW-2026-09-25.md:179`
- [ ] `CR.24` **medium — the tenant export sorts every table in full for every page.** — `archive/REVIEW-2026-09-25.md:186`
- [ ] `CR.25` **medium — the first page of messages and `unreadCounts` touch every month.**
  — `archive/REVIEW-2026-09-25.md:189`
- [ ] `CR.26` **medium — conversation reads load every member.** — `archive/REVIEW-2026-09-25.md:195`
- [ ] `CR.27` **medium — the outbox drain holds a transaction across Redis calls.** — `archive/REVIEW-2026-09-25.md:199`
- [ ] `CR.28` **medium — N+1 in notification fan-out and the digest.** — `archive/REVIEW-2026-09-25.md:204`
- [ ] `CR.29` **low-medium — the projection's replay keyset uses the `OR` form.** PLAUSIBLE.
  — `archive/REVIEW-2026-09-25.md:209`
- [ ] `CR.30` **low — conversation recency can move backwards.** — `archive/REVIEW-2026-09-25.md:213`
- [ ] `CR.31` **low — cursor precision drops rows.** — `archive/REVIEW-2026-09-25.md:217`
- [ ] `CR.32` **low — creating a conversation checks members one by one.** — `archive/REVIEW-2026-09-25.md:221`
- [ ] `CR.33` **medium — an older re-index can overwrite a newer one.** PLAUSIBLE. — `archive/REVIEW-2026-09-25.md:224`

### 10.D Resource lifetimes, timeouts and the client

- [ ] `CR.34` **medium — the web process never disposes its Container**, and `dispose()` would
  reopen Redis. — `archive/REVIEW-2026-09-25.md:232`
- [ ] `CR.35` **medium — the S3 clients have no timeouts.** — `archive/REVIEW-2026-09-25.md:239`
- [ ] `CR.36` **low — one failed close in `dispose()` skips the rest.** — `archive/REVIEW-2026-09-25.md:243`
- [ ] `CR.37` **high — realtime streams end at 30 minutes and never reopen.** — `archive/REVIEW-2026-09-25.md:246`
- [ ] `CR.38` **high — reconnects retry every 2 s forever, on every error.** — `archive/REVIEW-2026-09-25.md:254`
- [ ] `CR.39` **medium-high — one chat message refetches every loaded page, twice, for every
  member.** — `archive/REVIEW-2026-09-25.md:260`
- [ ] `CR.40` **low — failed jobs are bounded by age only.** — `archive/REVIEW-2026-09-25.md:267`
- [ ] `CR.41` **low — ClickHouse `query` buffers the whole response.** — `archive/REVIEW-2026-09-25.md:270`
- [ ] `CR.42` **low — `RealtimeProvider` re-renders every consumer.** — `archive/REVIEW-2026-09-25.md:273`
- [ ] `CR.43` **low — the pool check counts the wrong consumers.** — `archive/REVIEW-2026-09-25.md:276`

### 10.E From the 2026-09-25 unpushed work

- [ ] `CR.44` **medium — the analytics skip check can hide the failure it follows.** — `archive/REVIEW-2026-09-25.md:283`
- [ ] `CR.45` **low/medium — the analytics loader blocks on ClickHouse.** — `archive/REVIEW-2026-09-25.md:289`
- [ ] `CR.46` **low — a comment in `container.ts` now describes the wrong field.** — `archive/REVIEW-2026-09-25.md:293`
- [ ] `CR.47` **low — the same, in `query-key.ts`.** — `archive/REVIEW-2026-09-25.md:297`

### 10.F Docs that say something the code does not

- [ ] `CR.48` **four reference pages contradict the code.** Each is fixed with its finding
  (`CR.16`, `CR.21`, `CR.22`, `CR.37`, `CR.39`), never before. — `archive/REVIEW-2026-09-25.md:303`
- [ ] `CR.49` **the retry comment says "roughly a minute"**; it is about 30 s. Fixed with `CR.13`.
  — `archive/REVIEW-2026-09-25.md:308`

---

## Changelog

**In [`archive/DONE.md`](archive/DONE.md)**, beside the entries it explains. New rows go there, at
the top.
