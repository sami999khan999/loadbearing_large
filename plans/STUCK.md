---
title: Stuck — what could not be done on 2026-09-20, and exactly why
updated: 2026-09-20
owner: sami
---

# Stuck

What an agent working through [`OPEN.md`](OPEN.md) section B on 2026-09-20 could not finish, with
enough detail that nobody re-derives the blocker. One section per blocked item. **A section leaves
this file when the blocker lifts and the work lands**, not when someone decides it is unimportant.

---

## S.1 — The browser walk, `23.5`–`23.12`, needs a browser this session did not have

**Eight boxes**, every Exit clause in Phases 10–13 that can only be proven in a browser:
`23.5` the inviter's second tab, `23.6` the loader prefetch, `23.7` the bell count on refocus,
`23.8` the optimistic read, `23.9` the stream reconnect, `23.10` the optimistic message,
`23.11` the typing indicator, and `23.12` which records the walk.

**The blocker.** Browser automation here runs through the Claude in Chrome extension, and it
reports `Browser extension is not connected`. Both obvious things were tried: Chrome was started
(it was not running), and the tab context was requested again after it came up. The message is
unchanged. The extension has to be installed in that Chrome profile and signed into the same
account, and neither is something an agent can do on someone's behalf.

**What was *not* the blocker**, so nobody looks there. The stack is up and healthy —
`pnpm infra:up:sharded` ran clean, `pnpm db:migrate` applied on node 0, the full suite is green,
and the built web server answers `/` with 200 and 6 124 bytes of server-rendered HTML under
`node --env-file=.env tooling/scripts/boot-smoke.mjs web`. The application is in a state where the
walk would have been possible.

**`23.6` is blocked twice over**, and would have failed even with a browser. The QueryClient is
not dehydrated (`23.3`), so a loader prefetch is thrown away and the client refetches. `23.6`
cannot be ticked before `23.3` is decided and fixed, whoever does the walk.

**To pick this up:** install the Claude in Chrome extension and sign in, or do the walk by hand —
it is seven observations, each a sentence in `PLAN.md`. The stack is the one the walk needs:
`pnpm infra:up`, `pnpm db:migrate && pnpm db:seed`, `pnpm dev`, and **the worker running**, because
every message in this system is a job on `QueueName.MAIL` and Mailpit is on `:8025`.

---

## S.2 — `23.14`, the analytics reader, is gated on data that does not exist yet

Not stuck on a tool: stuck on its own entry, which says so. `23.14` asks for the reader to be
written **after** `CLICKHOUSE_URL` is set and the projection has filled and reconciled for days,
against a store with real data and a dashboard with a real query. Writing it tonight would be the
thing `5.12` deleted — a shape guessed at with no consumer to check it against.

**Step one is done, 2026-09-20.** The analytics profile is up, `pnpm ch:migrate` reports the schema
applied, and the four ClickHouse cases in the smoke suite pass rather than fail. What is left is
waiting: run the worker for a few days and the projection fills. No session can do step two.

---

## S.3 — Phase 24 is gated on a second shard being provisioned, and one container is not that

`24.1`–`24.7` are decisions and mechanisms for a real second node. The `sharded` compose profile
was up for this session, which is enough to *run* `sharded.smoke.spec.ts` and not enough to
**decide** `24.1` — that decision is about what a production catalog and a production shard do to
each other under a tenant delete, and it is deliberately filed until the node exists.

**Done 2026-09-20, and it closes half of `24.5` and half of `24.6`.** The two `DATABASE_SHARD_1_URL` /
`DATABASE_SHARD_1_DIRECT_URL` lines are now in this machine's `.env` with the `sharded` profile up.
`pnpm db:migrate` reports "migrations applied on node 0 / node 1 … across 78 tenants on 2 node(s)",
and `sharded.smoke.spec.ts` is **4 passed** rather than skipped. Comment both lines out to go back
to one node.

What is still missing from `24.5` is its second clause — a tenant move under load with no lost
writes — and that needs `24.2`'s move job, which does not exist.

**`24.6` is blocked, and not on a tool.** Its read half ran: a warm placement resolve is 679 µs,
one cache read. Its write half cannot, because a routed insert on node 1 is a `23503` before it can
be timed — every routed table carries a foreign key to a catalog one, and that is `24.1`. There is
no routed throughput number until that decision is made.
