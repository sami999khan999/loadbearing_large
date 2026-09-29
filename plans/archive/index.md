# Archived plans

**Nothing here is edited — with one exception, named below.** Every other file is the record of
what was planned, decided and believed at the time it was written. A line that has since gone
stale stays stale: correcting it would make the record worse, not better. The open ledger is
[`../BACKLOG.md`](../BACKLOG.md), and that is the only file in `plans/` where a box is ticked.

**The exception is [`DONE.md`](DONE.md), and it is appended to rather than edited.** It is the
closed half of `BACKLOG.md`, split out on 2026-09-22 when eighty-four closed entries were crowding
nineteen open ones. When something closes, its entry moves there with its ID and its proof. That is
growth, not revision: no line already in it is rewritten.

**One exception, and it is not content: a link broken by the move itself is repaired.** A file one
folder deeper needs `../../docs/` where it wrote `../docs/`, and leaving that would make the record
unnavigable rather than faithful. Every relative link in this folder resolves; nothing a link points
*at* was touched.

**What is still worth reading here**, and it is most of it: every entry in `BACKLOG.md` is a summary
with a pointer, and the body it points at is in one of these files. Read the body before acting on
a summary.

| File | What it holds | Moved |
|---|---|---|
| [`DONE.md`](DONE.md) | **The only file here that grows.** Every entry `BACKLOG.md` has closed — 84 of them — with the proof each was ticked on, and that file's changelog | 2026-09-22 |
| [`ACCESS-AND-VISIBILITY-PLAN.md`](ACCESS-AND-VISIBILITY-PLAN.md) | Eleven phases of access and visibility — flags, entitlement plans and the module kill switch, per-user overrides, the platform deny and account suspend, `<Zone>`, `<Widget>` and `/dashboard`, widget preferences, the inspector and the `lazy()` ban. Built 2026-09-28 to 2026-09-30, and walked end to end; what is left is `BACKLOG.md` §13 | 2026-09-30 |
| [`REVIEW-2026-09-25.md`](REVIEW-2026-09-25.md) | Forty-nine findings from five reviews of `dev` at `b58e748` — bugs, scaling limits, leaks and security. The bodies only: every box is in `BACKLOG.md` §10, pointing at a line here | 2026-09-26 |
| [`COMMUNICATION-PERFORMANCE-PLAN.md`](COMMUNICATION-PERFORMANCE-PLAN.md) | Seven phases that took realtime, messaging, notifications and email off the web app's path — the `apps/realtime` stream process, `packages/api-server`, the outbox lease, batched fan-out and digest, longer retries. Built 2026-09-26; what is left is `BACKLOG.md` §12 | 2026-09-26 |
| [`COMMUNICATION.md`](COMMUNICATION.md) | Messaging, email and notification features deferred whole on 2026-09-22, the decisions reached for them, and three things their older entries get wrong. Every item is a box in `BACKLOG.md` §11 | 2026-09-26 |
| [`STATE.md`](STATE.md) | What sessions left on the two developer machines on purpose — accounts, tenants, archived months, `.env` edits, compose profiles — and how to undo each. Extends `OPEN.md` section D | 2026-09-26 |
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

**Why three moves.** On 2026-09-17 the four original plans were consolidated into `PLAN.md` and moved
here. On 2026-09-20 `PLAN.md` itself, with the four ledgers that had grown around it, was compiled
into `BACKLOG.md` and followed them. The 2026-09-17 note said every still-open item had been carried
into `PLAN.md` text-unchanged; the same is true of `BACKLOG.md`, except that it summarises rather
than copies, which is why these files are kept rather than deleted. On 2026-09-22 `BACKLOG.md`
was split in half and its closed entries became `DONE.md` — the first file here that is a live
ledger's other half rather than a finished plan.
