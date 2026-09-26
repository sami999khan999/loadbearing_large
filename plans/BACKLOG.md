---
title: Backlog — every task not done, in one place
updated: 2026-09-26
owner: sami
schema: backlog/v1
source: compiled 2026-09-20 at 885e144 from the five ledgers, which moved to archive/ the same day
---

# Backlog

**This is the only open ledger, and it holds only what is open.** What has closed is in
[`archive/DONE.md`](archive/DONE.md). What sessions left on a developer machine is in
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
| 10 | Code review of 2026-09-25 — [`archive/REVIEW-2026-09-25.md`](archive/REVIEW-2026-09-25.md) | 3 | 46 |
| 11 | Communication features — [`archive/COMMUNICATION.md`](archive/COMMUNICATION.md) | 8 | 1 |
| 12 | Communication performance plan, what is left — [`archive/COMMUNICATION-PERFORMANCE-PLAN.md`](archive/COMMUNICATION-PERFORMANCE-PLAN.md) | 3 | 6 |

Sections 2, 4, 5, 7, 8 and 9 are closed in full: 45 defects, 6 buried items, 9 verifications, 3
ledger rows, 6 doc fixes and 8 performance items. Their entries are in `archive/DONE.md` under the
same numbers.

**Sections 1, 3 and 6 cannot be closed by writing code today.** `24.7` and the triggers wait for
a number no node has reached. `S.2` waits for real traffic. `S.3` waits for a provisioned server.
**Section 10 is down to three narrowed remainders** of the 2026-09-25 review; the other forty-six,
the shipped security defects among them, are closed. **Section 11 is the next work**: the
communication features, which waited on the performance plan and are built on top of it now.
**Section 12 is measurement and hand checks** a session without a person at the browser cannot do.

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

Forty-six of the forty-nine findings are closed and in [`archive/DONE.md`](archive/DONE.md) §10,
each with its proof. These three were fixed in their main part and each keeps a smaller one; the
bodies are in [`archive/REVIEW-2026-09-25.md`](archive/REVIEW-2026-09-25.md) at the line given.

- [~] `CR.16` **The archived-notifications page still reads a tenant-month whole.** Restore and
  re-projection stream now, verified, a batch at a time. The page is the one reader left holding a
  month in memory: capped at 50 MB compressed, on the request path, to filter one user's rows.
  The fix direction was a cached per-user slice. — `archive/REVIEW-2026-09-25.md:134`
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

- [ ] `CP4.9` **Measure the worker's fan-out** — a seeded 500-member channel, drain and delivery
  `durationMs` before and after. — `archive/COMMUNICATION-PERFORMANCE-PLAN.md:390`
- [~] `CP7.9` **Web stops serving streams** — the second release: drop `realtime.*` from web's
  handler and point the stream smoke spec at `apps/realtime`. — `archive/COMMUNICATION-PERFORMANCE-PLAN.md:525`

**Checked by spec, not yet by hand.** Each item below is built and its specs pass; what is missing is
the walk-through in a running app, which the unattended build could not do.

- [ ] `CP7.5` **A real SIGTERM on Linux** — streams end inside the window, clients reopen, the
  process exits 0. Windows terminates instead of signalling; CI's boot smoke covers it on Linux.
  The same walk now covers the web process too: it disposes its container
  `SERVER_SHUTDOWN_TIMEOUT` plus a second after the signal, and should exit 0 on its own (`CR.34`).
  — `archive/COMMUNICATION-PERFORMANCE-PLAN.md:507`, Exit `:544`

---

## Changelog

**In [`archive/DONE.md`](archive/DONE.md)**, beside the entries it explains. New rows go there, at
the top.
