---
title: Backlog — every task not done, in one place
updated: 2026-11-12
owner: sami
schema: backlog/v1
source: compiled 2026-09-20 at 885e144 from the five ledgers, which moved to archive/ the same day
---

# Backlog

**This is the only open ledger, and it holds only what is open.** What has closed is in
[`archive/DONE.md`](archive/DONE.md). What sessions left on a developer machine is in
[`archive/STATE.md`](archive/STATE.md). Everything else in `plans/` is history, except a plan
still being built, which its section here names, and `HANDOFF.md`.

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
| 11 | Communication features — [`archive/COMMUNICATION.md`](archive/COMMUNICATION.md) | 2 | 7 |
| 13 | Access and visibility plan, what is left — [`archive/ACCESS-AND-VISIBILITY-PLAN.md`](archive/ACCESS-AND-VISIBILITY-PLAN.md) | 1 | 8 |
| 14 | Code review of 2026-09-28, and the plan's review before it starts | 0 | 16 |
| 19 | Review of 2026-10-10 | 0 | 23 |
| 23 | Found walking the big kit in a browser, 2026-11-12 | 7 | 5 |

Sections 2, 4, 5, 7, 8, 9, 10, 12, 15, 16, 17, 18, 20, 21 and 22 are closed in full: 45 defects, 6 buried items, 9
verifications, 3 ledger rows, 6 doc fixes, 8 performance items, `CP7.9`, `BL.1`, the final
check's 17, `WC.1`, all forty-nine of the 2026-09-25 review, and the hand walks and benchmark that
closed 15, 16, 17 and 22. Their entries are in `archive/DONE.md`, the walks under §23.

**Sections 1, 3 and 6 cannot be closed by writing code today.** `24.7` and the triggers wait for
a number no node has reached. `S.2` waits for real traffic. `S.3` waits for a provisioned server.
**Section 11 is down to two that need a decision or hardware**: `26.4` reopens D47, and `26.8`
needs a machine that holds 250 000 users. **Section 13 is a trigger**, `AX11.2`. **Section 23 is
the next work**: seven things the 2026-11-12 browser walk found, `WK.1` the largest.

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

## 11. Communication features — `archive/COMMUNICATION.md`

Deferred whole on 2026-09-22 because they shared one unstated requirement — messaging, email and
notifications must not slow the app down. That requirement is the performance plan, and it is
built; what it changed for each item is on the item. The decisions reached for them are
`archive/COMMUNICATION.md:51`, and three things their older entries get wrong are `:71`.
The full original text is in `archive/PLAN.md` under the same IDs.

### Messaging

- [ ] `26.4` **Old `messages` partitions archived to S3.** Parked pending a discussion: it reopens
  decision D47. The reads that grew with it are bounded now (`CP2.2`, `CP2.3`), which weakens the
  case. — `archive/COMMUNICATION.md:29`
- [ ] `26.8` **The 250 000-recipient fan-out load test.** Needs a machine that can hold a `users`
  row per recipient. Measures the paged fan-out and batched suppression from `CP4.3`, `CP4.6`.
  — `archive/COMMUNICATION.md:32`

### Email

### Notifications

---

## 13. Access and visibility plan — what is left

Built 2026-09-28 to 2026-09-30 and archived; every body is on its item in
[`archive/ACCESS-AND-VISIBILITY-PLAN.md`](archive/ACCESS-AND-VISIBILITY-PLAN.md), by ID and line. The hand walk (`AX11.3`) passed every Exit line
on 2026-09-30.

### Waiting on a trigger

- [ ] `AX11.2` **Retire `widget.dismissal`** — remove the flag's entry, the `flag` field on
  `core.hidden-widgets`, both `assertOn` calls and the `DISMISSAL` checks in `feature` and
  `apps/web`. **Trigger:** the flag is on for every org, and in any case before its `expiresOn` of
  2027-03-31. It is off everywhere today. — `archive/ACCESS-AND-VISIBILITY-PLAN.md:1373`

---

## 14. Code review of 2026-09-28 — and the plan's review before it starts

A review of the code changed since the 2026-09-25 review (`14d49db..2ee420a`), and of
`ACCESS-AND-VISIBILITY-PLAN.md` before its first box is ticked. IDs are `RV.<n>`, new. Each body is
here rather than in an archived file, because there is no archived file for it yet; line numbers
are as of `2ee420a`. Each was checked against the code, and the scenario says what triggers it.

### Code

### The access and visibility plan — improvements before Phase 1

All seven, `RV.10`–`RV.16`, were folded into `ACCESS-AND-VISIBILITY-PLAN.md` on 2026-09-28,
before its first box was ticked. They are in [`archive/DONE.md`](archive/DONE.md) §14.

---

## 19. Review of 2026-10-10 — what is left

Two reviewers read the code both kits share after the 2026-10-10 fixes. One finding was false
(oRPC's fetch `RPCHandler` already adds `StrictGetMethodPlugin`, so no cross-site GET reaches a
mutation). Of the twenty-three logged as `RW.<n>`, twenty-two are fixed, in
[`archive/DONE.md`](archive/DONE.md) §19, and lite has each shared one too. One is left.


## 23. Found walking the big kit in a browser, 2026-11-12

`DC.9`, `UI.1`, `LP.1`, `LP.3` and `AI.2` were walked and measured on 2026-11-12, in headless
Chromium over the DevTools protocol; they are in [`archive/DONE.md`](archive/DONE.md) §23 with
five fixes found on the way. These seven were found and not fixed. IDs are `WK.<n>`, new. Lite
shares the code of all but `WK.1`, `WK.2` and `WK.4`.

- [ ] `WK.1` **Nobody can start a conversation in the browser.** `/messages` says "Start one to
  see it here" and offers nothing: `MessagingMutations.useCreateConversation` and the
  `messaging.create.*` copy exist in both locales, but no screen uses them. The walk created one
  over `conversation/create`.
- [ ] `WK.2` **A message's React and Mention pickers render as empty boxes.** Both are named for
  a screen reader (`aria-label` "React", "Mention…"), but nothing visible says what they are.
- [ ] `WK.3` **The editor never says a draft saved.** Autosave posts `docPage/save` two seconds
  after the last key and the status goes from "Unsaved changes" back to "Draft". The
  `doc.editor.saving` and `doc.editor.saved` strings are written and unused.
- [ ] `WK.4` **Retention shows an error on an untouched form.** For `messages` and
  `message_reactions`, never dropped, the page shows "Enter a whole number of months, at least
  one." with Save disabled before anything is typed. The warning above them reads "it now
  holds —", naming no value.
- [ ] `WK.5` **Revoking a doc grant drops focus to the page.** `RW.23` kept focus after revoking
  an API key; the grant panel's Revoke does not.
- [ ] `WK.6` **A grant's reason is required, and the field does not say so.** Grant access stays
  disabled until it has text, with no hint why.
- [ ] `WK.7` **The app shell has no layout.** `_authenticated.tsx` renders a bare `<header>`:
  underlined links in a row, no sidebar, the logo painted black. It has been so since
  2026-09-29, and the component library has a `Sidebar`. A decision more than a defect: whether
  the kit ships a styled shell.

---

## Changelog

**In [`archive/DONE.md`](archive/DONE.md)**, beside the entries it explains. New rows go there, at
the top.
