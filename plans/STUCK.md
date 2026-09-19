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


### The walk, as a checklist

Written out because the eight entries in `PLAN.md` are each one sentence of *what* to observe, and
the setup in front of them is the part that takes the time. **The stack was left up and seeded on
2026-09-20**, so steps 1 and 2 may already be done.

**Setup, once.**

1. `pnpm infra:up` — or `pnpm infra:up:sharded`, which is what is currently running. Mailpit is on
   `http://localhost:8025` and **every message in this system goes there**, never out.
2. `pnpm db:migrate && pnpm db:seed`. The seed's tenant is `loadbearing`.
3. `pnpm dev`. It builds the packages, then runs web on `:3000` and **the worker beside it** —
   the worker is not optional here, because a verification mail and an invitation are both jobs on
   `QueueName.MAIL`.
4. Sign up at `/sign-up` as **Ada**. Verification is required, so open Mailpit, click the link, and
   sign in. `AUTH_ENROLMENT_MODE=personal` on this machine, so Ada gets an organization of her own.
5. In a **second browser profile** — not a second tab, they need different cookies — sign up as
   **Grace** and verify her the same way. She is not in Ada's tenant yet; step 6 is what puts her
   there.

**The seven observations.** Each is one `PLAN.md` entry; tick it there when it holds.

6. **`23.5` — the inviter's second tab.** As Ada, open `/settings/members` in **two** tabs. In tab
   A, invite `grace@…`. **Watch tab B**: the pending invitation appears with no reload. Then open
   the invitation link from Mailpit in Grace's profile to accept it.
7. **`23.7` — the bell count on refocus.** As Grace, send Ada a direct message from `/messages`.
   Switch to Ada's window and watch the bell: the badge moves without a reload.
8. **`23.8` — the optimistic read.** As Ada, open `/notifications` and click a row. It reads as
   read **before** the mutation returns, and it is still read once the list refetches.
9. **`23.10` — the optimistic message.** In `/messages`, throttle the connection in devtools and
   send. The message renders before the mutation returns, and when it does return the row is
   **reconciled, not duplicated** — the client dedupes by message id.
10. **`23.11` — the typing indicator.** Type in Grace's window and stop. Ada's "… is typing"
    disappears within the indicator's timeout, with no further keystroke. It is rate-limited to one
    signal per two seconds, so type for longer than that.
11. **`23.9` — the stream reconnect.** With Ada's window open on `/messages`, open the network
    panel, stop `pnpm dev`, and start it again. `EventSource` reconnects on its own — nothing
    server-side can prove it — and a `resync` frame arrives on the re-opened stream.
12. **`23.6` — the loader prefetch.** **This one will fail, and it is not the walk's fault.** The
    QueryClient is not dehydrated (`23.3`), so a loader prefetch is thrown away and the client
    refetches. Fix `23.3` first — the recommendation under it is four lines — or leave `23.6`
    unticked and say why.
13. **`23.12` — record it.** When the others are ticked, tick the matching clauses in
    `archive/COMMUNICATION-PLAN.md`'s Exit blocks and close `T-036` in `TODO.md`.

**To pick this up:** install the Claude in Chrome extension and sign in, or work the checklist
above by hand. It is seven observations and about twenty minutes once the two accounts exist.

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
