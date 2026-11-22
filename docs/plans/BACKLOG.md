---
title: Backlog — every task not done, in one place
updated: 2026-11-21
owner: sami
schema: backlog/v1
---

# Backlog

**The only open ledger.** Close an entry by fixing it and deleting it; git history keeps the rest.
Each entry keeps its original ID. A new decision goes in the entry and says what it supersedes.

None of these can be closed by writing code today: each waits on hardware, real traffic, or a trigger.

## Open

- [ ] `24.7` **A pooled partition for the long tail** — small tenants share one `<table>_pool`
  list partition and graduate on a size line. Its gate is relation count, measured by `PF.0`: a
  tenant-level attach grows with siblings (~3 ms at 100 tenants, ~27 ms at 2 000), and one unpruned
  read of `notifications` at full retention exhausts the lock table at ~1 800 tenants (`PF.7`).
  **Trigger:** a node heads past ~1 800 tenants, or a tenant-level attach passes ~50 ms.
- [ ] `S.2` **Check the analytics projection and `/analytics` against real traffic.** Run the
  worker on real traffic for a few days, let the reconciliation come back clean, and look at
  `/analytics` against it. The reader was built against seeded data, so nothing else waits on this.
- [ ] `S.3` **Phase 24 on a provisioned second node**, not a second container on one machine.
  Everything is proved on the two-node compose profile, including `24.6`'s load test; only a real
  server gives capacity numbers (commit time here is Docker Desktop's `fsync`, ~100 ms).
- [ ] `26.8` **The 250 000-recipient fan-out load test.** Needs a machine that can hold a `users`
  row per recipient. Measures the paged fan-out and batched suppression from `CP4.3`, `CP4.6`.
- [ ] `AX11.2` **Retire `widget.dismissal`** — remove the flag's entry, the `flag` field on
  `core.hidden-widgets`, both `assertOn` calls and the `DISMISSAL` checks in `feature` and
  `apps/web`. **Trigger:** the flag is on for every org, and in any case before its `expiresOn` of
  2027-03-31. It is off everywhere today.

## Reopen when

- `21.1` **Per-user object layout for `notifications`** — when p95 on the archived view passes
  500 ms; every page turn gunzips the whole tenant-month object today.
- `16.7` **`unreadCounts` pruning assertion** — if the read changes; its floor is `last_read_at`,
  a correlated subquery.
- `24.1` **User delete as a maintenance job** — at a few thousand tenants on a node.
- **Two policy-shaped constants** — the two-month runway and the thirty-day cold grace could move
  onto `platform_policy` in an afternoon if an operator asks.
- **`max_locks_per_transaction` stays 1 024** until a node heads toward `24.7`'s ~1 800 tenants.
  Nothing in the application issues an unpruned read of `notifications`.
