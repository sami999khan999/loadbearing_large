# Archived plans

**Nothing here is edited.** Every file is the record of what was planned, decided and believed at
the time it was written. A line that has since gone stale stays stale: correcting it would make the
record worse, not better. The open ledger is [`../BACKLOG.md`](../BACKLOG.md), and that is the only
file in `plans/` where a box is ticked.

**One exception, and it is not content: a link broken by the move itself is repaired.** A file one
folder deeper needs `../../docs/` where it wrote `../docs/`, and leaving that would make the record
unnavigable rather than faithful. Every relative link in this folder resolves; nothing a link points
*at* was touched.

**What is still worth reading here**, and it is most of it: every entry in `BACKLOG.md` is a summary
with a pointer, and the body it points at is in one of these files. Read the body before acting on
a summary.

| File | What it holds | Moved |
|---|---|---|
| [`PLAN.md`](PLAN.md) | The whole project in build order — 26 phases, items `<phase>.<item>`, decisions `D1`–`D50`, and the **Where the old IDs went** table that resolves every ID below | 2026-09-20 |
| [`REVIEW.md`](REVIEW.md) | Forty-five defects a green build does not catch, found by a full read at `d98c9f3`, ranked, none fixed | 2026-09-20 |
| [`OPEN.md`](OPEN.md) | The 2026-09-19 review's ten findings, what closed on 2026-09-20, and section D — what changed on the developer's machine and how to undo each piece | 2026-09-20 |
| [`STUCK.md`](STUCK.md) | Three blockers with enough detail that nobody re-derives them, including the browser walk written out as a thirteen-step checklist | 2026-09-20 |
| [`TODO.md`](TODO.md) | `T-001`–`T-038`, the original task list; history since 2026-09-17 | 2026-09-20 |
| [`IMPLEMENTATION-PLAN.md`](IMPLEMENTATION-PLAN.md) | The implementation audit, eight phases — now `PLAN.md` Phases 1–8 | 2026-09-17 |
| [`COMMUNICATION-PLAN.md`](COMMUNICATION-PLAN.md) | Mail, outbox, notifications, real-time, messaging — Phases 9–13 and 26. Its Exit blocks hold the four clauses `23.5`–`23.11` still tick | 2026-09-17 |
| [`DB-SCALING-PLAN.md`](DB-SCALING-PLAN.md) | Pooling, partitioning, cold storage, the sharding seam — Phases 14–17, 21, 22 and 24 | 2026-09-17 |
| [`PLATFORM-ADMIN-PLAN.md`](PLATFORM-ADMIN-PLAN.md) | The platform tier, retention and projection policy, the replica panel — Phases 18–20 and 25 | 2026-09-17 |
| [`DB-SCALING-DEFERRED.md`](DB-SCALING-DEFERRED.md) | Two items deferred and reopened the same day; kept for the next deferral | 2026-09-14 |

**Two ID systems, one table.** The four 2026-09-17 plans use their own IDs — `S2.5`, `A1.10`,
`C6.3`, `P8.3` — and `PLAN.md` renumbered every one of them. Its **Where the old IDs went** table
maps all of them, and decisions map by `C-n` → `Dn`, `S-n` → `D(9+n)`, `A-n` → `D(29+n)`.

**Why two moves.** On 2026-09-17 the four original plans were consolidated into `PLAN.md` and moved
here. On 2026-09-20 `PLAN.md` itself, with the four ledgers that had grown around it, was compiled
into `BACKLOG.md` and followed them. The 2026-09-17 note said every still-open item had been carried
into `PLAN.md` text-unchanged; the same is true of `BACKLOG.md`, except that it summarises rather
than copies, which is why these files are kept rather than deleted.
