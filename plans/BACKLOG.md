---
title: Backlog — every task not done, from every plan file, in one place
updated: 2026-09-21
owner: sami
schema: backlog/v1
source: compiled 2026-09-20 at 885e144 from the five ledgers, which moved to archive/ the same day
---

# Backlog

**This is the only open ledger. Everything else in `plans/` is history.**

Everything not done, gathered once. Five files used to hold open work and each held a different
kind: `archive/PLAN.md` the unchecked boxes, `archive/REVIEW.md` forty-five defects nothing has
fixed, `archive/STUCK.md` what a session could not do and why, `archive/OPEN.md` the ledger of what
closed and what did not, `archive/TODO.md` three ledger rows. All five moved to `archive/` on
2026-09-20 and this file replaced them. They are still the place each item's **full argument**
lives — every entry below is a summary with a pointer — but nothing is ticked there any more.

> **How to use this file**
>
> 1. **Every entry keeps its original ID** — `23.3`, `R.7`, `S.1`, `T-036` — and points at the
>    archived file and line that hold the full text. Read the body before acting on a summary.
> 2. **Tick it here.** `archive/` is not edited: a file in it is the record of what was decided,
>    not a checklist. Fix the item, tick or delete the line here, and add a changelog row.
> 3. **Nothing here is a place to argue a decision.** The argument is in the archived body. A new
>    decision goes in the entry here and says it supersedes.
> 4. **Line numbers are as of `885e144`** and are stable, because the archived files no longer
>    change. If one is ever off, the ID is the truth and the number is the hint.
> 5. Every claim below about the *tree* — "still true", "already resolved" — was re-read from the
>    source on 2026-09-20 rather than copied from the plan that made it.

**The count.**

| Section | What | Open |
|---|---|---|
| 1 | `archive/PLAN.md` unchecked boxes, Phases 23–26 | 21 |
| 2 | `archive/REVIEW.md` defects | 0 |
| 3 | `archive/STUCK.md` blockers | 2 |
| 4 | Unfinished work buried inside ticked items | 4 |
| 5 | Verification owed — browser, manual, or a scale not run | 2 |
| 6 | Conditional work — "reopen when" | 11 |
| 7 | `archive/TODO.md` ledger rows | 1 |
| 8 | Doc housekeeping still owed | 1 |

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
> lines in `.env`. That is what proved half of `R.2`. What still needs a decision rather than a
> container is `24.1`, the foreign-key call, and the items behind it — `24.2` and the outbox half
> of `R.2`'s proof. An entry that is blocked says so.

**Every archived plan was checked and carries nothing of its own.** Every `[ ]` in
`archive/COMMUNICATION-PLAN.md`, `DB-SCALING-PLAN.md`, `PLATFORM-ADMIN-PLAN.md` and
`IMPLEMENTATION-PLAN.md` maps through `archive/PLAN.md`'s **Where the old IDs went** table to an item that
is either ticked there or listed in section 1 below. The four blockquoted Exit clauses in the
communication plan are `23.5`–`23.11`. `DB-SCALING-DEFERRED.md`'s two items were reopened and
delivered as Phases 18–20. `P2.20` was dropped as moot; `P8.3` is `23.4`, done.

---

## 1. `archive/PLAN.md` — the twenty-one open boxes

All in Phases 23–26. Phases 1–22 have no open box. Each line: what, where it stands, what it waits
on, and the `archive/PLAN.md` line that holds the entry. Seven of the original thirty-five closed
on 2026-09-20 with the browser walk; `23.25`, `23.26` and `23.27` are new and were found doing it.

### Phase 23 — Loose ends, no gate

**Fixes with a recommendation filed and not taken.** Each is a decision the owner has to make; the
recommendation under the entry was measured, not argued.

- [x] `23.1` **The `jobId` duplicate-suppression window is ~5 s, not 86 400 s.**
  `done: 2026-09-21` — **the recommendation was taken, and `R.24` had already delivered it.**
  Accepting the seconds-long window is the decision; correcting the comments is the work, and
  `R.24` did all three plus the reference page on 2026-09-20 without anyone ticking this.
  Re-read today against the tree, because a ledger that says "recommended" over a change already
  made is the kind of entry somebody re-does: `DELIVERY_RETENTION_SECONDS` says "the window we
  *ask* for"; `JobOptions.removeOnCompleteAgeSeconds` says "an upper bound only"; and
  `consumers.md` carries the paragraph beginning "The window it actually gets is seconds". No
  behaviour change, and none wanted — the subscribers are idempotent on `event.id`. Giving the
  drain a queue of its own would restore the long window and stays filed. — `archive/PLAN.md:3354`
- [x] `23.2` **`pnpm smoke` publishes a probe job onto the live `MAINTENANCE` queue.**
  `done: 2026-09-21` — the recommendation, unchanged: one local `SMOKE_QUEUE = "smoke"` replacing
  all seven references, and `QueueName` leaves the spec's imports with them. `publish` takes a
  string, so the enum gains nothing — it names queues the application owns, and this is not one.
  **Verified against the running instance**, which is the only place this was ever visible:
  8 cases pass and the probes are on `bull:smoke:*`, with `bull:maintenance:*` untouched by the
  run. — `archive/PLAN.md:3397`
- [x] `23.3` **The QueryClient is not dehydrated.** `done: 2026-09-21` — option (d), as filed
  and this time kept. `RouterDehydrated` gains `queries: DehydratedState`, `dehydrate` puts
  `dehydrate(queryClient)` in the payload and `hydrate` calls `hydrate(queryClient, …)` back out.
  No dependency added: `apps/web` already had `@tanstack/react-query`, so the three names join
  `src/import.ts` beside `QueryClient`.
  - **The judgement was taken rather than dodged.** `SerializableExtensions` is global, so
    nothing else in the app may now declare `DehydratedState` as something the wire cannot
    carry. The alternative was a cast, and a cast would have hidden exactly the failure the
    serializer exists to catch.
  - **Proved on the same route that measured it.** A cold `/settings/roles` called `role/list`
    from the browser on 2026-09-20 and does not today; what is left is `notification/unreadCount`
    and `realtime/stream`, and neither is a loader prefetch — one is the bell, which no loader
    asks for, and the other is a stream, which cannot be dehydrated at all.
  - **`staleTime` is what finishes the job.** `createQueryClient` sets 30 s, so hydrated data is
    fresh on mount. At the library default of 0 the render would come from cache and the refetch
    would go out anyway, which is the shape of this fix that looks like it works and does not.
  - **`23.6` went with it**, once the loader had something to dehydrate. — `archive/PLAN.md:3429`

**Exit clauses that needed a browser — walked on 2026-09-20.** The Claude in Chrome extension
connects now, which is the whole of what `S.1` was waiting on. **Six of the seven held on the
day**; `23.6` needed `23.3` and a prefetch that did not exist, and closed on 2026-09-21.

Two accounts, one browser profile. Ada is in Chrome; Grace acts over `/api/rpc` with her own
cookie jar. The checklist asked for a second profile, and it does not need one: in every clause
the second session only has to *act*, and the thing under test is the first session reacting.
Latency was simulated by delaying one call in the page's own `fetch` rather than in devtools,
which is also what let the optimistic window be observed rather than guessed at.

- [x] `23.5` **The inviter's second tab refetches the member list without a reload.**
  `done: 2026-09-20`
  - Two tabs on `/settings/members`, both Ada. Tab B's network log was **cleared**, then tab A
    invited. Tab B issued exactly two calls — `member/list` and `member/listInvitations` — and
    grew the pending row. It was never reloaded, and the cleared log is what rules out a refetch
    that was already in flight.
  - The same mechanism moved something nobody asked it to: when Grace's sign-up enrolled her, the
    open tab grew her member row and dropped her invitation, live.
- [x] `23.6` **The loader's prefetch of page 1 and the unread count reach the browser.**
  `done: 2026-09-21` — and it took both halves, which is why it outlived `23.3`.
  - **The prefetch did not exist.** The entry read as though the loader fetched and the payload
    dropped it; in fact `/notifications` ensured the copy namespace and nothing else. Page one is
    now `ensureInfiniteQueryData(NotificationQueries.list(…))` on the route, and the count is
    `ensureQueryData(NotificationQueries.unreadCount(…))` on `_authenticated` — the layout, not
    the page, because the bell renders on every route under it.
  - **The count is gated the way the bell is.** `CapabilitySet.from(…).can("notification.inbox.read")`,
    the same key `<Can>` checks, so a member without an inbox issues no query rather than one
    the procedure refuses. `(shell)/index.tsx` already had this shape.
  - **`PAGE` is shared with the component.** The query key is built from `limit` and
    `unreadOnly`, and `NotificationList` defaulted `limit` itself — a loader prefetching 25 into
    a key the component read at some other number would have looked exactly like this bug.
  - **Measured on a cold load**, which is the clause: `notification/list` and
    `notification/unreadCount` are both gone, the rows and the badge render from the payload.
    What remains is `notification/archivedMonths`, which belongs to a different component behind
    a different permission and prefetches nothing, and `realtime/stream`, which is a stream and
    cannot be dehydrated at all. — `archive/PLAN.md:3523`
- [x] `23.7` **The bell count moves on refocus.** `done: 2026-09-20` — Grace sent Ada a direct
  message; the badge went **1 → 2** in an already-open tab, with no reload and no refocus. Worth
  correcting the clause while it is being ticked: focus is not the mechanism. The stream
  invalidates the key, which is why `NotificationQueries.unreadCount` sets no
  `refetchOnWindowFocus` and says so.
- [x] `23.8` **A row is marked read optimistically and stays read after refetch.**
  `done: 2026-09-20` — `notification/markRead` was held four seconds. The row lost its unread
  badge **while the request was still in flight**, kept it after the response landed and the list
  refetched, and the bell went 2 → 1 on settle rather than on click.
- [x] `23.9` **Killing the web process and restarting it reconnects the stream, and a `resync`
  frame arrives.** `done: 2026-09-20` — the web process was killed and restarted under an open
  tab. `realtime/stream` and `message/stream` each answered **503 twice** while it was down, then
  200, with no user action. The first frame on the re-opened stream, read off a clone of the
  response body, was `{"kind":"resync","id":"01a0beb0-c59a-…"}` — which the router yields **only**
  when the client resumes with a `last-event-id`, so the frame is itself the proof of the resume.
- [x] `23.10` **A sent message appears optimistically** and is reconciled, not duplicated, on a
  throttled connection. `done: 2026-09-20` — `message/send` was held six seconds. The row rendered
  before the request returned, re-rendered from the server's row when it did, and `messages` holds
  exactly one row for that `client_id`.
- [x] `23.11` **Typing indicator clears** within its timeout with no further keystroke.
  `done: 2026-09-20` — Grace signalled four times across four seconds and stopped. Ada's notice
  was gone inside the 4 s expiry with nothing further sent. **Two defects in the indicator
  itself**, neither of which this clause covers: `23.25`.
- [x] `23.12` **Record the walk** `done: 2026-09-20` — recorded **here**, not in
  `archive/COMMUNICATION-PLAN.md`: rule 2 of this file is that `archive/` is not edited, and the
  entry predates that rule. `T-036` is section 7 and **still cannot close** — its "Done when"
  names Phase 26, filed by decision, and `23.1`–`23.3`, open. The walk is done; the narrowing
  the row asks for is the owner's.

**From `archive/TODO.md`.**

- [ ] `23.14` **Bring back an analytics reader, with the first dashboard** `P3` `~8h`. Gated on
  its own order: let the projection fill and reconcile for days first, then write the reader
  against real data. Four decisions carry over (new port, read-only, resolved scope, ISO periods).
  Step one is done **and this time it is running** — the container is up, `CLICKHOUSE_URL` is set,
  and the projection has written rows rather than merely being able to (`S.2`). — `archive/PLAN.md:3586`
- [x] `23.15` **The English fallback layer is dead payload** `done: 2026-09-21` — the first of
  the two decisions the entry allowed, and the one it recommended: the base layer is dropped, and
  `NamespaceBundle` stays total. **Not both**, which the entry was explicit about.
  - **Verified before touching it, because this removes a safety net.** Every `en` bundle was
    compared against its `bn` twin: 14 namespaces, 453 keys, **zero** missing and zero orphans.
    And that is enforced rather than lucky — a `bn` bundle is typed `NamespaceBundle<"nav">`,
    a total `Record`, so a key added to `en` without a translation fails `tsc`. The layer beneath
    could not be reached by anything that ships.
  - **Measured red then green**, off the source rather than out of the HTML, for the namespaces
    `/sign-in` loads:

    | locale | before | after |
    |---|---|---|
    | `en` | 3 707 chars | 3 707 |
    | `bn` | 7 495 chars | **3 792** |

    English is unchanged, because it was always one layer wearing two names — it now arrives in
    `overrides` like every other locale. Bengali loses **3 703 characters, 49 %** of its message
    payload. The page itself went 15 210 → 11 541 bytes.
  - **What it gives up, and the entry said so first:** adding a third language is now
    all-or-nothing at runtime as well as at compile time. It already was at compile time, and a
    contributor landing a partial locale meets `tsc` long before they meet a page.
  - **`Translator` keeps both layers** — `t`, `has`, `with` and `merge` are untouched, and
    `translator.spec.ts` still proves an override beats a base. A CMS behind `ContentSource` is a
    different implementation and is free to fill `base`; that is what the port is for.
  - **Five specs moved with it**, four of them assertions that read the English out of `base` on
    an `en` page — which was never the fallback doing anything. The one that proved a per-key
    fallback used a hand-built partial catalog the type system forbids, and its own comment said
    so; the mechanism it covered lives in `Translator` and is tested there. — `archive/PLAN.md:3610`

**Found on 2026-09-20, filed rather than fixed.**

- [x] `23.20` **The shipped configuration warns about itself on every worker boot.**
  `done: 2026-09-21` — **(a), the recommendation.** `DATABASE_POOL_MAX` is 20 in `.env.example`
  and in both schema defaults, so the shipped numbers no longer disagree with themselves: six
  consumers sum to exactly twenty — embedding 4, mail 4, event 8, notification 2, maintenance 1,
  analytics 1.
  - **Checked downstream before choosing the number**, because a pool ceiling that does not fit
    is a stall rather than a warning. pgBouncer is `POOL_MODE: transaction` with
    `DEFAULT_POOL_SIZE: 20` and `MAX_CLIENT_CONN: 1000`, so twenty per process is twenty *client*
    connections multiplexed onto a shared twenty backend ones. Web and worker at twenty each is
    forty clients against a ceiling of a thousand. The entry's "twenty is not twenty backend
    connections" holds.
  - **Verified on a real boot**, which is where it was found: the warning is gone and
    `process.started {consumers: 6}` is the whole of the boot's own commentary.
  - **(c) is still the honest model and is still open** — `DATABASE_POOL_MAX` remains one variable
    read by two processes with unlike profiles, which is section 8's entry. This makes the default
    correct; it does not make the coupling right. Worth taking when somebody has tuned them apart
    in anger, which is what the entry said. — `archive/PLAN.md:3767`
- [x] `23.21` **The worker's first boot against a real stack is not clean.** `done: 2026-09-21`
  — both halves, both as recommended.
  - **(1) `lockDuration: 300_000` on the maintenance `Worker`.** BullMQ's default is 30 s, which
    is a number for short jobs; `partitions-boot` logged nothing for 29.9 s at 78 tenants, the
    lock expired, and the job was re-delivered and ran a second time. Idempotent, so it was waste
    rather than damage. The named constant says what the number is for, because five minutes
    chosen silently reads as superstition.
  - **(2) `withShard` moved inside `projectTenantOrReport`'s `try`.** A tenant with no
    `shard_assignments` row threw past the per-tenant guard, so the run died reporting
    `queue.job.failed` and the line a projection dashboard filters on was never emitted. The
    checkpoint read in the `catch` stays *outside* the shard scope deliberately — it is
    ClickHouse, one store for the deployment, not a routed table.
  - **Proved red then green.** Two specs; the first fails on the old code with
    `analytics.projection.failed` never emitted. The second asserts the run still fails, which is
    the behaviour that was never in question and is the easy thing to break while fixing this.
  - **The larger question is still open on purpose:** skip an unplaceable tenant, or fail the
    run. Today it fails, now audibly. That is a decision about whether a derived store should
    keep working for everyone else while somebody fixes a directory row.
  - **(2) is confirmed in the wild, 2026-09-20, and it is what stopped `S.2`'s clock.** One
    leftover tenant from an integration run had no `shard_assignments` row, and the 12:05 run
    logged `shard.resolution.failed` then `queue.job.failed` sixty milliseconds later — **not**
    `analytics.projection.failed`, exactly as the entry predicts. It had already written the
    first tenant's 37 rows, so the symptom is a projection that half-runs and then stops every
    five minutes forever, with an error naming the queue rather than the projection. The orphan
    was given a node-0 assignment to get the machine moving; **the defect is untouched**, and so
    is the decision under it.
  - **(1) has a companion in the same boot:** `worker.pool.oversubscribed` is logged on every
    start, which is `23.20`. Two of the three things filed against the worker's first boot are
    therefore reproducible on demand rather than remembered.
- [x] `23.25` **The typing indicator named you.** `done: 2026-09-21` — the half that was a
  defect. `useConversationStream` takes the reader's id and drops a `typing` frame carrying it,
  so nobody is told they are typing. Filtered in the hook rather than at the publisher, because
  the frame is legitimately addressed to the whole channel and every other member wants it. The
  id rides a `useRef` for the same reason `queryClient` does — naming it as a dependency would
  tear the stream down and reopen it the moment the session resolves, on every page load.
  - **The spec caught itself first.** The obvious shape — yield the reader's own frame, assert
    the list is empty — **passes on the unfixed code**, because empty is also the state before
    any frame lands. It yields the reader's frame first and waits for a second one from somebody
    else, so the assertion cannot be satisfied until both have been processed. That is `R.45`'s
    failure mode, found in a spec written to close a different entry.
- [ ] `23.26b` **The typing indicator names a uuid**, and it is not a one-line fix — the
  recommendation in `23.25` was wrong about this and is corrected here. `TypingNotice` takes an
  optional `nameFor` and nothing passes one, but there is nothing to pass: `ConversationContract.member`
  is `{ userId, role, joinedAt, lastReadAt }` and carries **no name**. Nor is this local to the
  indicator — **messaging resolves no names anywhere**: `conversation.list.tsx` titles a direct
  conversation `t("messaging.inbox.direct")` rather than naming the other person, and
  `message.list.tsx` renders no author at all. So this is a missing feature in the slice, not a
  defect in one component, and it wants a name on the member DTO — which is a contract, a
  repository read and a use-case. Filed at its real size. — found 2026-09-21
- [x] `23.26` **A notification row's unread badge was labelled with the filter's copy.**
  `done: 2026-09-21` — `notification.inbox.markRead` in both locales, so the control that marks
  **one** row read no longer reads "Unread only" like the filter directly above it. That string
  was the button's whole accessible name, so a screen reader heard the collision too. The Bengali
  matches `notification.peek.markRead`, which is the same action one component over. — found 2026-09-20
- [x] `23.27` **`pnpm dev` raced its own package watchers and the worker lost.**
  `done: 2026-09-21` — `dev` filters to `./apps/*`, so `build:packages` produces the `dist/`
  the two apps import and nothing then empties it underneath them. Every package's `dev` is
  `tsup --watch` over a `clean: true` config, and `-r --parallel` started all fifteen of them in
  the same wave as the apps.
  - **Verified by running it.** Before: `apps/worker` died on
    `ERR_MODULE_NOT_FOUND … @loadbearing/application/dist/index.js` and `packages/ui`'s DTS build
    failed on `TS7016 … no declaration file for '@loadbearing/permissions'` — the same emptied
    directory seen from both sides. After: two dev scripts run and they are `apps/web` and
    `apps/worker`, **zero** `tsup --watch` processes, web listening on 13000 and
    `process.started {consumers: 6}`, with no module or build error in the whole run.
  - **A package watcher is now something you start deliberately** when you are editing that
    package, which is what `pnpm --filter @loadbearing/<pkg> run dev` is for and what the
    workflow rules already tell you to prefer. — found 2026-09-20
- [x] `23.24` **`apps/web` has a smoke suite.** `done: 2026-09-21` — the cheapest useful subset
  the entry named, and it is the one thing nothing else in the repository proved: **a realtime
  frame reaching an HTTP client**. `redis.smoke.spec.ts` proves publisher to subscriber, and
  `23.5`–`23.11` proved the rest by eye.
  - **Both decisions taken, and recorded here rather than left implicit.** It runs in the
    `compose` job, which is the only one with Mailpit up and so the only one where the sign-up
    leg means anything. It creates accounts in the same database `pnpm test` uses, with a global
    sweep — the answer `packages/infrastructure` already gives.
  - **One case, and it is the whole chain**: sign up over `/api/auth`, wait for the mail (a job
    on `QueueName.MAIL`, so it only passes with a worker up), follow the verification link, sign
    in and keep the cookie, open `realtime/stream` and **start reading before causing anything** —
    pub/sub has no replay — then invite from a second connection and read `member.changed` off
    the open one. 2.6 s against the built server.
  - **The sweep deletes the tenant, not just the user**, which is the half that is easy to miss:
    `personal` enrolment founds an organization per sign-up, and one left behind is exactly what
    `23.21` found aborting the projection. Bounded by the run's own start rather than by a
    membership join, because an organization whose members have gone is invisible to a join.
  - **`boot-smoke.mjs`'s spawn-and-wait is extracted** to `tooling/scripts/boot-app.mjs` and used
    by both, as the entry asked. Two findings came out of that. The helper now takes `env`
    with no default — a boot helper that silently inherits is how a child gets half a
    configuration. And it can wait on a **socket** rather than a log line: under vitest the
    child's pipes deliver nothing to the runner, and for a server an answered request is the
    better signal anyway. `boot-smoke.mjs` keeps the line, because asserting the line is its job.
  - **A trap worth stating once:** the suite waits for the worker's `process.started`, which it
    emits at `info`. An early draft set `LOG_LEVEL=warn` for tidiness and then waited the full
    sixty seconds for a line that was never going to be printed. — `archive/PLAN.md:3875`

### Phase 24 — The physical split 📁

Filed until a second node is provisioned. One compose container is enough to *run* the smoke and
not enough to *decide* `24.1` (`S.3`).

- [ ] `24.1` **The foreign-key decision.** Ten `cascade` FKs cross from a shard to the catalog —
  nine on routed tables, one on local `outbox_event`, referencing only `organizations` and
  `users`. **Recommended (a):** drop them, sweep routed rows by `organization_id` per shard, count
  orphans nightly. The measurement behind it: a `users` delete already costs a
  `conversation_members` scan per tenant partition (300 users exceeded a 30 s `statement_timeout`
  at 82 tenants); (b) would fire that on every node, (a) prunes a tenant delete to one partition.
  Carry into whichever lands: a *user* delete becomes a maintenance job at a few thousand tenants.
  `R.2` is gated on this. — `archive/PLAN.md:3907`
- [ ] `24.2` **Tenant move** as a `MaintenanceConsumer` job — `shard_assignments.moving_to`,
  `ensureTenantPartitions` on the target, keyset copy, verify counts, flip `node`,
  `resolver.invalidate`, drop the source after a grace period; write freeze as a `ForbiddenError`
  from `shardMiddleware`. Lands with `25.5`'s procedure and flips `Container.hasShardMoves`. — `archive/PLAN.md:3971`
- [ ] `24.3` **Read replica per shard** — `DATABASE_SHARD_<n>_REPLICA_URL`, `cluster.reader(key)`,
  dashboard and analytics reads moved onto it. `25.1`, `25.2` and the `platform.replica.manage`
  key wait on this. — `archive/PLAN.md:3979`
- [ ] `24.4` **The catalog is the last single primary** — measure first; a replica for its reads
  if it hurts. — `archive/PLAN.md:3983`
- [ ] `24.5` **Two-node proof** — half done: `sharded.smoke.spec.ts` is **4 passed** with the
  `sharded` profile and the two `DATABASE_SHARD_1_*` lines. The second clause, a tenant move under
  load with no lost writes, waits on `24.2`. — `archive/PLAN.md:3987`
- [ ] `24.6` **Load test the routed paths at 10×** — half ran (`tests/smoke/routed.smoke.spec.ts`,
  `ROUTED_SCALE=1`): a warm placement resolve is 679 µs, a miss 2 568 µs, the cross-node walk is
  serial. **The write half cannot run**: a routed insert on node 1 is a `23503` before it can be
  timed, which is `24.1`. — `archive/PLAN.md:3997`
- [ ] `24.7` **A pooled partition for the long tail** — small tenants share one `<table>_pool`
  list partition and graduate on a size line. Not built until `16.12`'s number says so (section 6). — `archive/PLAN.md:4015`

### Phase 25 — The replica panel and the shard map 📁

- [ ] `25.1` **Status** — `InspectPlatformStatusUseCase` grows `replica: { healthy, lagSeconds } | null`.
  Waits on `24.3`. — `archive/PLAN.md:4036`
- [ ] `25.2` **The switch** — `platform_policy.replica_reads_enabled` exists since `20.8` and is
  read by nothing; `toggle-replica-reads.use-case.ts` under `platform.replica.manage` lands with
  `24.3`. — `archive/PLAN.md:4040`
- [ ] `25.3` **Colder storage class** — `transitionAfterDays` and a storage class on
  `LifecycleRule`, once someone pays for Glacier; MinIO needs a configured tier. — `archive/PLAN.md:4046`
- [ ] `25.5` **The move button** — rendered and disabled today; `move-tenant.use-case.ts`
  (`platform.shards.manage`) and the `shards.move` procedure land with `24.2`. `R.44` notes the
  button has no `onClick`, so it goes live and does nothing the day `hasShardMoves` flips. — `archive/PLAN.md:4114`

### Phase 26 — Communication follow-ups 📁

Each names its trigger. `26.2`, `26.8`, `26.9` and `26.12` closed on 2026-09-20.

- [ ] `26.1` **Threads, reactions, attachments** — `messages.parent_id`, `message_reactions`,
  `message_attachments` over `presignUpload`; each its own slice increment. — `archive/PLAN.md:4133`
- [ ] `26.3` **Web push** — a `PushPublisher` port beside `MailPublisher`; lands with its first
  adapter and `Container` line or not at all. — `archive/PLAN.md:4159`
- [ ] `26.4` **Message archive** — old `messages` partitions to S3 behind a per-tenant retention
  setting. Note `messages` is `retentionMonths: null` by decision D47, so this needs that decision
  revisited first. — `archive/PLAN.md:4162`
- [ ] `26.5` **Redis Streams behind `RealtimeSubscriber`** — `XADD`/`XREAD` from
  `last-event-id`, a real replay on reconnect. Same port. `R.27` (CORS omits `last-event-id`) is
  worth fixing before this. — `archive/PLAN.md:4165`
- [ ] `26.6` **Global stream cap and presence** — `INCR` with TTL per user in the cache Redis. — `archive/PLAN.md:4168`
- [ ] `26.7` **Per-tenant digest hour**, channel mentions, notification grouping — also holds the
  recipient list, count and opt-out that `23.4` called product work. — `archive/PLAN.md:4171`
- [ ] `26.10` **A delivery log, if the question arrives** — an append-only table written by the
  consumer, built only when "was this sent" cannot be answered from Loki or the provider. — `archive/PLAN.md:4248`
- [ ] `26.11` **Move from SMTP to a provider API** — one adapter behind `EmailSender`; moves the
  entry from Tier 0 to Tier 2 in `dependencies.md`. — `archive/PLAN.md:4254`

---

## 2. `archive/REVIEW.md` — forty-five defects a green build does not catch

A full read at `d98c9f3`, verified by reading callers; **runtime-proved** means reproduced with a
script. Each line: where, the failure, the shape of the fix. The full entry with the proof is in
`archive/REVIEW.md` under the same ID. Ranked as the review ranked them.

**All forty-five are fixed**, on 2026-09-20. Every entry below carries a `done:` line saying what
the fix was; the ones with something a reader should still know say it there. **Two are worth
finding again without reading the whole list:** `R.9` is the one defect that ships with no unit
test, because `session.fn.ts` calls `createServerFn` at module scope and hangs under vitest; and
`R.24` changed no behaviour at all, only comments that were untrue, because the behaviour behind it
is `23.1`'s decision to take.

### High — data loss, a page that crashes, or a feature that never happens

- [x] `R.1` **The nightly sweep destroyed every `outbox_event` cold archive** `done: 2026-09-20`
  - Fixed with `R.5`'s tombstone rather than by excluding `NO_TENANT`, because one column
    answers both: an outbox row is never stamped, so the sweep never sees it.
    `retention_policy.cold_months` for `outbox_event` is honoured for the first time.
- [x] `R.2` **Every cross-node pass ran its transaction on node 0** `done: 2026-09-20`
  - **Both gateways were handed the catalog unit of work**, whose `handle()` returns the catalog
    client and never reads `ShardScope`. They declare themselves `local`, and `local` is
    deliberately compatible with an open `catalog` transaction, so `this.db` inside returned node
    0 rather than tripping the wire. `eachShard` set the scope per node; the transaction ignored
    it. `Container` now builds a third, `local`-placed `PgUnitOfWork` and binds both to it.
  - **The second bug under the same binding is fixed with it.** `PgMaintenanceGateway` is `local`,
    but `sweepExpired` deletes from `sessions`, `verifications` and `invitations` — all catalog.
    It worked only because `local` falls back to node 0 outside a scope, and binding it correctly
    would have made it sweep whichever node the loop was on. It uses `catalogDb` now, which is the
    sanctioned crossing from `local` and exists for exactly this.
  - **Proved on two real nodes**, which the entry said was impossible. `24.1` gates the *outbox*
    half only: that needs a row in node 1's `outbox_event`, whose foreign key to `organizations`
    is the `23503`. The runway half needs no key, so `sharded.smoke.spec.ts` now asserts a month
    partition lands on node 1 **and not on the catalog** — it fails on the old binding.
  - **Still owed, and it is the outbox half:** with two nodes, a spec that drains node 1's outbox.
    It waits on `24.1` like the rest of Phase 24. The binding that fixes it has landed; what is
    missing is the proof.
- [x] `R.3` **Server errors reached the browser with `context` and `fields` stripped**
  `done: 2026-09-20`
  - **Fixed in `ErrorNormalizer`, not in `api-client`.** The review offered either; the normaliser
    is the one place both transports pass through, so the in-process SSR client is covered by the
    same branch. A new `wrappedEnvelope` check runs **before** the structural `isAppError` check,
    which a decoded transport error was passing — it carries a known `code` and a `toJSON`, so
    `.toJSON()` answered oRPC's shape and `context` was `undefined`.
  - **A second hole, found by the spec rather than by the review.** When the wrapped code is one
    the catalog does not hold, the old fall-through adopted the *wrapper's* code and handed back
    the broken shape again. It collapses to `INTERNAL` now: an envelope is untrusted input, and
    `AppError.from` already refuses an unknown code.
  - **Proved red then green.** Five specs in `errors` and two in `feature` fail with the fix
    stashed and pass with it. The feature pair click Deactivate and assert the last-owner and
    self sentences — the two reasons share a code, so `context` is the only thing telling them
    apart, and it was exactly what the wire dropped.
  - **The gap the review named is closed:** `tests/support/transport-error.ts` is the first
    fixture in `feature` that rejects with the decoded wire shape rather than an `AppError`
    instance. `R.45`'s third bullet is this same gap and goes with it.
  - **Still open, and cheap now:** `use-role-failure.ts` and `use-api-key-failure.ts` have no
    spec of their own. The mechanism is proved, the two call sites are not.
- [x] `R.4` **The digest selected nobody on the shipped default** `done: 2026-09-20`
  - **The candidate list was the bug, not the filter.** `digestRecipients` read
    `notification_preferences` for `mode = 'digest'`, and the shipped default *is* digest with no
    row — so a tenant where nobody opened the preferences screen sent nothing, ever.
    `organizationsWithDigest` had the same shape, so the fan-out never even queued the job.
  - **Both now read `notifications`.** `recipientsWithUnreadSince` and
    `organizationsWithUnreadSince` on `NotificationRepository` replace them; the two preference
    methods are deleted rather than left beside the new ones, so there is one answer to "who gets
    a digest". The use-case then resolves each unread row as `stored ?? policy default` and keeps
    anyone with at least one row on digest.
  - **The default is keyed by kind, not by category** — `NotificationPolicy.defaultModeForKind`,
    built once at module load from the rows that actually write a notification. `membership`
    holds one kind on digest and one on immediate, so a category-level default cannot answer.
    Rows with `recipients: none` are excluded: they write nothing, so their modes describe no row.
  - **Eight specs**, including the one the review asked for: no stored preferences, one unread
    row, one mail published. Also the inverse — `off` and `immediate` both send nothing.
  - **`verified: 2026-09-20`** — the `unverified:` note is closed. Eight cases in
    `tests/notification/pg-notification.repository.spec.ts` run both queries against Postgres,
    against **two** tenants so the cross-tenant predicate cannot pass by having nothing to leak.
  - **Left alone deliberately:** `R.14` is the same missing concept seen from the preferences
    screen, and it needs a *category*-level default, which is a separate decision.

### Medium — wrong data, a promise the code does not keep, or a user with no way out

- [x] `R.5` **The recovery window measured the age of a month, not the age of the delete**
  `done: 2026-09-20`
  - **A tombstone**, as the review prescribed. Migration `0032_archive_tombstone` adds
    `partition_archive.deleted_at` with a partial index; `DeleteOrganizationUseCase` stamps it
    before the row goes; `sweepDeleted` reads that and keeps `not exists (organizations)` as the
    second half, so a mis-stamped row on a live tenant is still never swept.
  - **The stamp is idempotent** — `where deleted_at is null` — so a second delete pass cannot
    push the window out to sixty days.
  - **Seven specs in `tests/cold/sweep-deleted.spec.ts`**, the file the review named as missing.
    Three fail on the old predicate and pass on the new one, including one case per defect.
  - **Docs corrected**, because both stated the promise the code did not keep:
    `cold-storage.md` and `docs/ai/rules/data.md`.
- [x] `R.6` **`coldMode: "drop"` ignores per-tenant retention overrides** — the `drop` branch in
  `maintenance.consumer.ts:403–412` returns before reading `tenantRetentionPolicies`. A tenant with
  a longer override loses its month unrecoverably. Fix: read overrides before branching on mode.
  `done: 2026-09-20` — the overrides are read before the mode branch, and the tenant walk drops at each tenant's own cutoff.
- [x] `R.7` **The outbox drain runs *behind* every `deliver` job**, the opposite of its
  `priority: 1`. BullMQ pops the wait list before the prioritized set, and `deliver` jobs carry no
  priority. Fix: give `deliver` a higher-numbered priority, or drop the priority from both.
  `done: 2026-09-20` — `deliver` takes `priority: 10`. A job with none goes on the plain wait list, which `moveToActive` empties before it looks at the prioritized set — so the drain's `priority: 1` had put it exactly last.
- [x] `R.8` **`cold-restore` and `tenant-export` never place a shard**, so they always read node 0.
  Neither `restore` nor `export` in `maintenance.consumer.ts` wraps in `withShard`. Fix: resolve the
  tenant's placement and run inside it, as the projection does. Latent on one node.
  `done: 2026-09-20` — the restore places per archive entry, because the index is catalog and the scratch table and its ATTACH are the tenant's; the export places the tenant it names.
- [x] `R.9` **The SSR session ignores a deactivated membership, and the shell then retries the
  stream forever.** `session.fn.ts` checks only that `activeOrganizationId` is present;
  `PrincipalBuilder` returns null for an inactive membership. A deactivated user gets the shell,
  an UNAUTHORIZED stream reconnecting every two seconds, and no way out but sign-out. Fix: add
  `memberships.isActive` to `fetchSession`'s `Promise.all`.
  `done: 2026-09-20` — the membership check rides in the same `Promise.all` as the capabilities. **No unit test:** `session.fn.ts` calls `createServerFn` at module scope and hangs under vitest without the react-start plugin. `apps/web/docs/reference/server-functions.md` now names this second case of the rule it already stated.
- [x] `R.10` **An error thrown inside a streaming handler bypasses the error interceptor.** For an
  `async function*` handler, `next()` resolves before the body runs, so a FORBIDDEN from
  `message.stream` or a `RateLimitedError` from `assertUnderCap` becomes an opaque
  `INTERNAL_SERVER_ERROR` on the stream, logged nowhere, and the client reconnects forever. Fix:
  run the membership assertion and the cap check before returning the iterator, or wrap the
  iterator's `next` the way `shardMiddleware` does.
  `done: 2026-09-20` — `errorMiddleware` wraps a streaming output the way `shardMiddleware` already wraps one, so each frame's rejection goes through the interceptor.
- [x] `R.11` **The conversation list truncates when a page ends on a conversation with no
  messages.** `ORDER BY last_message_at DESC` puts NULLs first and `nextCursor` is null for a null
  row. Fix: sort and cursor on `coalesce(last_message_at, created_at)`, keep
  `conversations_recent_idx` in step.
  `done: 2026-09-20` — the sort key is `coalesce(last_message_at, created_at)`, never null, and `conversations_recent_idx` moves with it in `0033_conversation_keyset`. `mapWith` on the expression: drizzle hands a raw timestamp back as a string, and the cursor was being built from one.
- [x] `R.12` **Notification and digest emails link to relative URLs** (`/settings/members`).
  Only the invitation mailer prefixes `config.email.baseUrl`. Fix: prefix in one place the two
  notification mailers share.
  `done: 2026-09-20` — Fixed in `ContentMailRenderer`, which is the one place both notification templates
  pass through: it takes the base url and absolutises a relative one, leaving an already
  absolute link alone. Three renderer specs.
- [x] `R.13` **The digest footer names the organization by its UUID.**
  `send-notification-digest.use-case.ts:78` passes `input.organizationId` as `organization`.
  `done: 2026-09-20` — `OrganizationReader` gains `nameOf` — one method on a port that already existed, so
  the container's port count is unchanged. Resolved once per run, not per recipient.
- [x] `R.14` **The preferences screen shows `off / off` as the membership default** — the use-case
  takes the *first* policy row per category, and `member.invited` (recipients `none`) comes first.
  Fix: derive the default from rows that have recipients, or declare it on the category.
  `done: 2026-09-20` — `NotificationPolicy.defaultModeForCategory`, built from the rows that have recipients, so the grid and delivery read the same table.
- [x] `R.15` **Saving a retention row rewrites the ClickHouse TTL without its per-action clauses**
  — `update-retention-policy.use-case.ts:82` composes the base clause only, with no
  compare-before-write; `list-retention-policies` computes `expected` the same way. Fix: both
  through `clickhouseTtlFrom`, compare first.
  `done: 2026-09-20` — both go through `clickhouseTtlFrom`, and the save compares before it writes.
- [x] `R.16` **Re-indexing a document within an hour is silently dropped** — `jobId:
  <org>_<documentId>` with completed jobs kept 3 600 s. Fix: a content hash or version in the id.
  `done: 2026-09-20` — `JobKey.of(documentId, text)`; the text is in the key, so new words are a new job.
- [x] `R.17` **A conversation can hold users who are not members of the organization** —
  `add-conversation-member` and `create-conversation` never check membership; also an existence
  oracle. Fix: assert `memberships.isActive` for every added user.
  `done: 2026-09-20` — `TenantMembershipReader`, a new port. Named apart from `auth`'s `isActive`: parameters compare bivariantly and the two take their arguments in opposite orders.
- [x] `R.18` **Six messaging use-cases publish outbox events outside any transaction** — edit,
  delete, add member, remove member, rename, leave. Fix: inject the routed unit of work and wrap
  write plus publish, as `send-message` does.
  `done: 2026-09-20` — all six take the routed unit of work and wrap write plus publish, as `send` does.
- [x] `R.19` **Last-owner protection is check-then-act outside the transaction** in
  `change-member-role` and `set-member-active`. Two concurrent demotions leave zero owners. Fix:
  count inside the transaction under `for update` or a per-tenant advisory lock. Likely.
  `done: 2026-09-20` — the count moves inside the transaction and takes `for update` on the owner rows. Promotion and reactivation take no lock: they cannot drop the count, and locking there would serialise every membership edit in the tenant.
- [x] `R.20` **Tenant delete never sweeps `tenant_retention_policy`** — `deleteFor` has no caller
  anywhere. Fix: call it inside the delete transaction.
  `done: 2026-09-20` — `tenantRetention.deleteFor` inside the delete transaction.
- [x] `R.21` **The realtime stream stays subscribed to the previous tenant after an organization
  switch** — `RealtimeProvider` opens once per `client` identity and nothing remounts it. Fix: key
  the provider on the active organization id. Likely.
  `done: 2026-09-20` — the provider takes the active tenant and reopens on it, and opens nothing before there is one.
- [x] `R.22` **The notification inbox traps the user in "unread only"** — with no unread rows the
  toggle is not rendered. Fix: render the toggle above the empty state.

  `done: 2026-09-20` — The controls moved above every state rather than inside one. **The spec found the same
  trap one layer up:** toggling the filter re-enters `isPending`, which also early-returned
  a skeleton, so the button removed itself on click.
### Low — a wrong edge, a wrong number, or a promise in a doc the code does not keep

- [x] `R.23` **SIGTERM is ignored while boot is hung** (`main.ts`: the handler is
  `started.then(...)`, and `start()` blocks on an unreachable queue Redis). Race `started` against a
  hard exit on a boot-phase signal.
  `done: 2026-09-20` — the wait for boot is bounded at five seconds; past it the worker logs and exits non-zero rather than pretending to drain.
- [x] `R.24` **The `deliver` de-duplication window is "the last thousand completions"** — the
  publisher always sets `count: 1_000` and the consumer raises only `age`. Same fact as `23.1`.
  `done: 2026-09-20` — **no behaviour change**, because the behaviour is `23.1`'s decision. Three comments and `consumers.md` stop claiming a 24-hour window the queue does not have: BullMQ trims on every completion by whichever of age and count bites first, and the drain's repeat job trims this queue to ten every second. Nothing depends on it — the subscribers are idempotent on `event.id`.
- [x] `R.25` **The projection checkpoint can permanently skip a row that commits late** — no
  settle lag on `(occurred_at, id)`. An `occurred_at < now() - interval` guard is the usual shape.
  `done: 2026-09-20` — the walk and the lag query stop thirty seconds behind the clock. `occurred_at` is stamped at write and rows commit out of that order, so a slow transaction landed below a checkpoint already past it and the keyset never looked back.
- [x] `R.26` **`/platform/analytics` prefetches a query gated by a different permission than the
  route** (`platform.retention.read` via `PlatformQueries.retention`); a role with analytics but
  not retention gets the error boundary.
  `done: 2026-09-20` — the retention read is no longer prefetched; the component gates it on `platform.retention.read`.
- [x] `R.27` **CORS omits `last-event-id`**, so a cross-origin stream (the Tauri origin) can never
  resume.
  `done: 2026-09-20` — `last-event-id` added to the allowlist, with a spec beside the `x-api-key` one it mirrors.
- [x] `R.28` **`redis-cache` sets an eviction policy but no `maxmemory`**, so it never evicts and is
  OOM-killed instead. `infra/docker-compose.yml:143`.
  `done: 2026-09-20` — `--maxmemory` is now set from `REDIS_CACHE_MAXMEMORY`, default 256mb. The policy was
  unreachable without it: the default ceiling is 0, meaning none.
- [x] `R.29` **`.env.example` ships an `AUTH_SECRET` placeholder that passes the only check**
  (46 characters against `min(32)`). Shorten it below 32 or refine against it.
  `done: 2026-09-20` — The placeholder is nine characters, so it fails the schema's own `min(32)` rather than
  booting. A placeholder that boots is one that reaches production.
- [x] `R.30` **`apps/web/docs/reference/env.md` names `AUTH_BOOTSTRAP_ORGANIZATION_SLUG`**; the key
  is `BOOTSTRAP_ORGANIZATION_SLUG`.
  `done: 2026-09-20` — The doc names `BOOTSTRAP_ORGANIZATION_SLUG`, which is the key the schema has.
- [x] `R.31` **`check:architecture` §7 does not look at `apps/*`** — a `"use client"` under
  `apps/web/src` passes.
  `done: 2026-09-20` — Assertion 7 walks `sourceDirs()` now, so `apps/*` is covered. Proved with a temporary
  `"use client"` under `apps/web/src`, which it caught.
- [x] `R.32` **A `documentId` containing `:` becomes a 500** (BullMQ rejects `:` in a job id).
  `done: 2026-09-20` — the id is hashed, so no character a caller supplies reaches the job id.
- [x] `R.33` **Validation rules emitted with no copy behind them** — `unknown`, `past`, `format`,
  `range`, `min` are absent from `FIELD_RULE_COPY` and fall back to "Something went wrong".
  `done: 2026-09-20` — five keys in both locales, and `format` reuses `invalidFormat`.
- [x] `R.34` **Grant and revoke permission are a read-modify-write race.** Likely.
  `done: 2026-09-20` — `savePermission` and `deletePermission` write one row, and the answer is re-read inside the transaction.
- [x] `R.35` **A stale allowlist in the procedure-coverage spec** — `AWAITING_A_PROCEDURE` still
  names `platform.analytics.read`, `platform.analytics.manage`, `platform.storage.read` and
  `platform.tenant.manage`, all gated since Phases 19–20 (re-read 2026-09-20: still stale). Only
  `platform.shards.manage` belongs there until `24.2`.
  `done: 2026-09-20` — Four gated keys removed; only `platform.shards.manage` remains, and it waits on `24.2`.
  Each of the four was checked against `PROCEDURE_PERMISSIONS` before removing it.
- [x] `R.36` **An in-flight duplicate send writes two rows** — the retry finds the claim held and
  `findById` null while the first transaction is still open. Likely.
  `done: 2026-09-20` — a claim younger than ten seconds is the first attempt still writing, and is refused rather than taken over.
- [x] `R.37` **A `scope: "goal"` role can be assigned as an organization membership role.** No
  goal-scoped keys ship today. Likely.
  `done: 2026-09-20` — `RoleRules.assertMembershipScope`, called by invite and change-role. The rule is "not goal", never "org only": `platform_admin` is `scope: "platform"` and *is* a membership row in the tier.
- [x] `R.38` **The digest includes categories the user did not set to digest.**
  `done: 2026-09-20` — `forDigest` replaces `wantsDigest`, and the count is the digestable rows.
- [x] `R.39` **The archive's only pre-drop verification is a `HEAD`** — `putStream` sends no
  whole-object checksum; a truncated object is first detected after the drop.
  `done: 2026-09-20` — the stored length is compared against the bytes streamed, through a new `sizeOf` on the port. A multipart upload that lost a part answers the same `HEAD`.
- [x] `R.40` **Tenant export loses `role_permissions` rows past five thousand** — the keyset is on
  `permission`, which is not unique within a tenant, with no tie-break.
  `done: 2026-09-20` — `(role_id, permission)` as a row constructor, and a spec checks every export table's keyset against the unique indexes Postgres actually has.
- [x] `R.41` **`PgShardAssignmentRepository.all` uses the numeric offset as a text keyset cursor.**
  No caller today; `24.2` will be the first.
  `done: 2026-09-20` — `all(after, limit)` takes a cursor; the fake sorts and cuts the way the real one does.
- [x] `R.42` **A malformed keyset cursor becomes a Postgres `22P02`** — `KeysetCursor` validates the
  timestamp but not `id`.
  `done: 2026-09-20` — the id half is validated as a uuid before the cursor decodes.
- [x] `R.43` **`PgTenantStorageReader.byTenant` offset-pages over an unstable order** (no tie-break).
  `done: 2026-09-20` — the order gains `organization_id` and `table_name` as tie-breaks.
- [x] `R.44` **A dead "Move" control on the shard map** — `disabled={moves === "unavailable"}` and
  no `onClick`. Goes live and does nothing the day `25.5` flips the flag.
  `done: 2026-09-20` — Gated on a handler as well as on the server's `moves`, and nothing passes one yet —
  `25.5` supplies both. Without that it goes live doing nothing the day the flag flips.
- [x] `R.45` **Two specs whose assertion does not check what their name claims** —
  `use-app-mutation.spec.tsx` "cancels queries" (never observes `cancelQueries`) and
  `realtime.context.spec.tsx` "stays disconnected" (asserts `"off"`, the initial state before
  the effect runs). Both re-checked 2026-09-20 and both still true.
  **The third bullet is closed:** `packages/feature/tests/support/transport-error.ts` is the
  wire-shape fixture whose absence let `R.3` ship, and two specs use it.
  `done: 2026-09-20` — the cancel case spies on `cancelQueries` and pins the ordering; the disconnected case waits for the attempt, and a second case covers the transition a failure-to-open cannot show.

**The specs that would have caught the high ones, and do not exist:** a `sweepDeleted` spec under
`tests/cold/` (`R.1`, `R.5`); a two-node drain in the sharded smoke, gated on `24.1` (`R.2`); a
feature spec whose mock rejects with the wire shape (`R.3`); a digest spec with no stored rows
(`R.4`); the pagination spec with one untouched conversation (`R.11`); the preferences spec
asserting a value rather than `!== undefined` (`R.14`).

---

## 3. `archive/STUCK.md` — what a session could not do, and exactly why

- [x] `S.1` **The browser walk, `23.5`–`23.12`.** `done: 2026-09-20` — **the blocker lifted and
  the work landed**, which is the only thing that closes a section here. The extension connects,
  and six of the seven observations hold; the seventh, `23.6`, is not a browser problem and its
  entry in section 1 now says what it actually is. The checklist's "two browser profiles" turned
  out to be unnecessary — the second account only ever has to act, so it acted over `/api/rpc`.
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
  not a tool.** `24.1` is a decision about what a production catalog and a production shard do to
  each other under a tenant delete, and it is deliberately filed until that node exists.

---

## 4. Unfinished work buried inside ticked items

Each of these sits under a `[x]` in `archive/PLAN.md` as an `unfinished:`, `concern:` or `corrected:` note.
Re-checked against the tree on 2026-09-20; the ones that turned out to be resolved are listed at
the end so nobody chases them.

- [x] `19.19` **`19.15`'s preview takes an optional `organizationId`.** `done: 2026-09-21` —
  the screen previewed the table's numbers while the operator was editing one tenant's override,
  which is a different set of partitions and usually a far larger one.
  - **The port and the adapter were already there.** `MaintenanceGateway.partitionsBefore` has
    taken an optional tenant since `19.15`, and `PgMaintenanceGateway` scopes the parents on it;
    only the use-case never passed one. The change is the input, the contract and the wiring.
  - **The refusal is the save's, exactly.** A tenant preview is narrowed to a table that is
    tenant-partitioned *and* has non-null `retentionMonths` — the same predicate
    `UpdateTenantRetentionUseCase` enforces — so the screen cannot preview an override that would
    be refused on save. The table-wide preview of that same table is still allowed, because
    nothing is being saved and the number is an honest answer.
  - **The tenant is in the query key and echoed in the response.** Two previews in flight over
    two tenants are two answers, not one refetched, and a slow response cannot render under the
    wrong heading.
  - **`tenant-retention.form.tsx` now keeps the same contract the table-wide form does**: the save
    waits for a preview of the value on screen. Six specs. — `archive/PLAN.md:2306`
- [x] `19.20` **`shards.invalidate(key)` is called on a tenant delete.** `done: 2026-09-21` —
  beside the capability flush and, like it, **after the commit**: a cache cleared first is
  refilled from rows the transaction has not removed yet, which is the stale entry it exists to
  stop. The placement cache's TTL is deliberately long — the answer changes only on a move — so
  nothing else was ever going to clear it, and a deleted tenant kept resolving to a node for up
  to five minutes.
  - **The `shard_assignments` row is left, and that is deliberate rather than missed.** Every
    reader inner-joins `organizations` (`PgShardMapReader.tenantsOn`, `findByTerm`), so an
    assignment with no tenant is invisible rather than stale. The *cache* was the problem,
    because it answers from Redis without the join. Said here so nobody adds a delete later.
  - Two specs, the first red on the old code. The second pins that a refused delete — a
    mistyped slug — forgets nothing. — `archive/PLAN.md:2330`
- [ ] `19.20` `concern:` **the archive runs inside the request.** For a large tenant that is minutes
  of streaming on a pooled connection; when it bites, make it a `tenant-delete` job the way
  `19.18` and `19.21` are. — `archive/PLAN.md:2340`
- [ ] `17.2` / `22.1` **The `activity_archive` drop migration has not been written.** The table
  still exists in `pg/schema/archive.schema.ts`, and `application/src/primitive/shard.ts:23`
  lists it in the catalog with the comment "goes with its drop migration". Its `TENANT_EXEMPT`
  history is in `22.18`. Write it once no deployment can hold objects under the old
  `activity-archive/` key. — `archive/PLAN.md:1466`, `2831`
- [ ] `16.12` **`TENANT_CEILING=2000 pnpm smoke` was not run** — 100 and 500 were; the page says
  so. About fifty minutes of creation and half an hour of cleanup. — `archive/PLAN.md:1352`
- [ ] `26.8` **`FAN_OUT_SCALE=250000` was not run** — 10× of the largest §3 column, deferred to a
  machine that can afford a `users` row per recipient. Curves are linear across 1 000–25 000. — `archive/PLAN.md:4202`
- [x] `23.13` **The permissions counterpart of §24.** `done: 2026-09-21` — assertion **28**, the same
  shape `23.13` named: every key in `CATALOG` a value of some `PROCEDURE_PERMISSIONS` entry.
  - **The module is read off the entry, never off the key's first segment.**
    `core.realtime.subscribe` *is* gated — `realtime.stream` asserts it — and `core.activity.write`
    is not, because `CapabilitySet.can()` grants every `core` key to every resolved principal
    rather than through a role. Splitting on the name exempts both and catches neither, and a
    fixture case fails if anyone tries it.
  - **The property moved rather than being checked twice**, which also closes section 8's
    `AWAITING_A_PROCEDURE` entry: two allowlists for one property is how the spec's went stale for
    two phases with four keys behind it. `procedure-permissions.spec.ts` keeps the two directions
    that need the real router — every procedure gated, no entry naming a procedure that is gone.
  - **Proved red on the tree**, not only in a fixture: an invented `member.badge.polish` fails the
    assertion by name and the tree is green with it removed. §24's fragment resolver is now shared,
    so a `...billingPermissions` added tomorrow is covered without editing either. — `archive/PLAN.md:3570`

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

**Two accounts, four organizations, and every clause below the API actually called.** What the
pass created, and what it left behind, is in the state table at the end of this file. Two findings
are worth carrying rather than burying in the ticks:

- **A platform admin is not a tenant member, and `/notifications` proves it.** Alice with
  `loadbearing` active is refused `/notifications` — `platform_admin` holds the nine platform keys
  and no `notification.inbox.read`. That is the design working, and it is also why the archived
  month had to be manufactured for a *tenant owner* rather than for her.
- **A synthetic mouse click misses in this harness and a real one does not.** Three buttons —
  pause projection, send invitation, restore — read as dead on a coordinate click and fired on
  `element.click()`. Checked before filing anything: `elementFromPoint` returned the button
  itself, so it was the input path and not an `R.44`-shaped missing handler. Worth knowing before
  the next walk files a defect against a button that works.

- [x] **Phase 18 Exit, browser half** `done: 2026-09-21` — both halves, and the customer tenant is
  the half that matters. Alice founded **Walk Co** at `/organization/new`, which switched to it on
  creation; with Walk Co active `/platform/status` renders, the nav carries the Platform link, and
  the panel names the tier it is held through — "Platform organization: Loadbearing (loadbearing)"
  — while the active tenant is something else entirely. Bob, owner of **Bob Co** and nothing more,
  gets `/forbidden` from `/platform/status`, and his nav has no Platform entry at all.
  — `archive/PLAN.md:1998`
- [x] **Phase 19 screens** `done: 2026-09-21` — and the cold path is no longer an empty state.
  - **`/platform/retention`**: `previewRetention` answered for the table-wide forms and for
    `19.19`'s tenant override, whose own table list refuses `messages` exactly as the save does.
    Against a real month it reads *"The next run drops 1 partitions, about 0 rows, 106496 bytes"*
    — the row estimate is `reltuples` on a partition nothing has analysed, the bytes are real.
    `updateRetention` saved, and **Restore a month** queued
    `cold-restore.notifications.2026-06-01.all`; the worker read both objects back and logged
    `attached: false`, which is the screen's own copy about a month outside the hot window.
  - **`/platform/storage`**: `listStorage`, `exportTenant` and `listExports`, all below the API.
    The export queued, the worker logged `cold.tenant.exported {objects: 4, rows: 50}`, and the
    five object keys appeared under the form. Cold storage by tenant renders rows now rather than
    "Nothing has been archived yet": Loadbearing 848 B / 7 rows / 2 months, Bob Co 493 B / 5 / 1.
  — `archive/PLAN.md:2419`
- [x] **Phase 20 screen** `done: 2026-09-21` — `/platform/analytics` renders the switch, the gaps
  section and all twenty-four actions grouped by module. Driven below the API and put back:
  `updateProjectionSwitch` paused it, `platform_policy.projection_enabled` went `t` → `f` → `t`,
  and the audit trail carries `platform.projection.paused` then `platform.projection.resumed`
  thirteen seconds apart. The screen refetched `getPolicy`, `listProjection` and `listGaps` on
  each. **What the run could not distinguish** is Phase 20's own correction — a paused projection
  reporting `disabled` rather than `behind` — because with no archived month behind it at the time
  the gaps list is empty either way. That half stays where it is proved, in its spec.
  — `archive/PLAN.md:2642`
- [x] **Phase 21 screen** `done: 2026-09-21` — **populated, not the empty state**, which is what
  the entry asked for and is the first time anything has read an archived month through the UI.
  - Getting there needed a month that does not exist on a three-month-old database: a June
    partition created with the seed's own create-then-attach DDL, five rows inserted,
    `notifications` set to one hot month from the retention screen, and a `partitions` job
    enqueued on the maintenance queue. The worker archived and dropped it —
    `maintenance.partition.archived` then `maintenance.partition.dropped` — so the rows the page
    renders are **only** in S3.
  - The section sits under `Can permission="notification.archive.read"`, so it is a tenant
    *owner* who sees it: bob in Bob Co. `notification/archivedMonths` and `notification/archived`
    both answered 200, the month selector offered `2026-06-01`, and all five rows rendered out of
    the gzipped object. — `archive/PLAN.md:2767`
- [x] **`25.4` rendered page** `done: 2026-09-21` — the expanded panel, rendered. `shardMap` gave
  node 0 with three tenants; **Show tenants** expanded to all three with placement, last-moved and
  retention columns; every **Move** button is `disabled` and the reason is on the page rather than
  in a tooltip — *"Tenant moves need the physical split — Phase 24."* `locateTenant` answered both
  ways: `loadbearing` → "Loadbearing (loadbearing) is on node 0", a miss → "No tenant answers to
  that." — `archive/PLAN.md:4094`
- [x] **`26.9` resend button** `done: 2026-09-21` — pressed, with the row read before and after.
  The invitation kept its `id` **and** its `created_at`, the `token_hash` changed
  (`4e23a25c…` → `6bc43c24…`), `expires_at` moved to seven days from the resend, and Mailpit
  received a **second** invitation to the same address. Every claim the procedure's entry makes,
  this time from the button. — `archive/PLAN.md:4241`
- [x] **`T-029`'s ten-step manual pass** `done: 2026-09-21` — all ten, in order, alice and bob.
  - **Step 5 is the one the entry says matters, and it holds.** Bob switched Walk Co → Loadbearing
    from the header and, **2.1 s later**, `member/list` over `/api/rpc` answered with
    Loadbearing's five — alice as `platform_admin`, joined 2026-09-13 — and not Walk Co's two,
    where alice is `owner` and joined today. Well inside the sixty-second `session.cookieCache`
    window, which is the whole of what `rebind` exists to invalidate.
  - Steps 1–4: alice invited bob into Walk Co; bob accepted from `/invitation/$token` and landed
    **switched to Walk Co**, "You are Member here", with a nav of three entries rather than an
    owner's seven; the switcher listed both memberships.
  - Steps 6–7: a full page load kept the switched tenant; sign out and back in landed him in
    Loadbearing, his last-used, not the one he had been in before the switch. The same held for
    alice, who came back to Walk Co.
  - Steps 8–9: `/organization/new` founded Bob Co and switched to it on creation. Signed out,
    `/invitation/$token` rendered the anonymous preview — "Walk Co has invited bob@example.test
    to join" — and its sign-in button carried
    `?redirect=%2Finvitation%2F…`, which returned there after signing in.
  - **Step 10 held at every step**: `users.last_active_organization_id` matched the switcher after
    the found, after the accept, after the switch, after the reload and after the re-sign-in. It
    is `null` until the first switch or found, because a plain sign-in does not write it.
  — `archive/TODO.md:228–241`
- [ ] **The whole-plan verification** — `archive/PLAN.md`'s own closing section: the command block,
  then each phase's Exit line by hand. **The clause it says cannot be automated is done**: a tenant
  owner — bob, owner of Bob Co — typed `/platform/retention` into the address bar on 2026-09-21
  and landed on `/forbidden`. What is left is the by-hand pass over every phase's Exit line, which
  is a reading job rather than a browser one. — `archive/PLAN.md:4284`
- [ ] **`archive/REVIEW.md`'s own gap** — the `infrastructure` integration specs and the smoke suites were
  not run in the review session (no Docker). They were green on 2026-09-20 in `archive/OPEN.md` C, so this
  is closed unless the review's fixes land without re-running them.

---

## 6. Conditional work — "reopen when"

Not open today. Each is a trigger written into a ticked item so the next person does not decide on
a feeling.

- `24.7` **pooled partition** — when the pruned read's planning time passes 5 ms or the runway run
  passes ten minutes at a plausible tenant count (`16.12`). — `archive/PLAN.md:1349`
- `21.1` **per-user object layout for `notifications`** — when p95 on the archived view passes
  500 ms; every page turn gunzips the whole tenant-month object today. — `archive/PLAN.md:2691`
- `16.7` **`unreadCounts` pruning assertion** — reopen if the read changes; its floor is
  `last_read_at`, a correlated subquery. — `archive/PLAN.md:1235`
- `26.12` **`publishMany` on the realtime port** with a real Redis pipeline — when 31 µs a frame
  is the bottleneck again; today the notification rows are. — `archive/PLAN.md:4275`
- `23.14` **analytics reader** — when somebody wants an aggregate nobody precomputed. A driver
  flag returns only with a second implementation. — `archive/PLAN.md:3592`
- `24.1` **user delete as a maintenance job** — at a few thousand tenants on a node, under either
  option. — `archive/PLAN.md:3968`
- `19.20` **tenant delete as a job** — when a large tenant's in-request archive bites. — `archive/PLAN.md:2340`
- `23.21` **skip versus fail an unplaceable tenant** in the projection — left open on purpose. — `archive/PLAN.md:3832`
- **Two policy-shaped constants** — the two-month runway and the thirty-day cold grace could move
  onto `platform_policy` in an afternoon if an operator asks. — `archive/PLAN.md:1745`
- `26.10`, `26.11`, `26.3` — each carries its own trigger in section 1.
- `D29` — "a few hundred tenants per node" was replaced by `16.12`'s numbers; two thousand stays
  unmeasured (section 4).

---

## 7. `archive/TODO.md` — the three ledger rows

`archive/TODO.md` is history since 2026-09-17 and these are its only open lines. **Two of the
three closed on 2026-09-21**, once section 5's browser clauses made their Exit lines true rather
than merely claimed.

- [ ] `T-036` **Communication plan** `P1`. Done when Phases 9–13 **and 26** are closed, plus
  `23.1`–`23.3` and `23.5`–`23.12`. **Every clause but one is now met** — Phases 9–13 are done,
  `23.1`–`23.3` closed on 2026-09-21 and `23.5`–`23.12` on the walk. Phase 26 is filed by
  decision, so as written the row cannot close. The choice is unchanged and is the owner's: narrow
  the "Done when" to the walk (`23.12` says the walk closes it) or accept it stays open until
  somebody unfiles Phase 26. — `archive/TODO.md:140`
- [x] `T-037` **Database scaling plan** `P1`. `done: 2026-09-21` — Phases 14–17, 21 and 22 all
  report their Exit lines true and Phase 24 is filed. It was **not** ticked on the file's own
  say-so: Phase 21's Exit carried a "not verified through a browser" note, which section 5 closed
  today with the archived section rendering five rows read out of S3.
  — `archive/TODO.md:159`
- [x] `T-038` **Platform admin** `P2`. `done: 2026-09-21` — Phases 18–20 report their Exit lines
  true and Phase 25 is filed. Same reservation as `T-037`, and the same answer: all three Exit
  lines carried a browser clause that nothing had walked, and all three were walked today — the
  round trip for 18, both screens below the API for 19, and pause-and-resume for 20.
  — `archive/TODO.md:170`

---

## 8. Doc housekeeping still owed

**Five of the six closed on 2026-09-21.** What is left is the one that was never a doc edit:
three env parsers that cannot be merged into a package, which wants its own decision.

- [x] **Four doc sentences describing the transactional outbox as a backlog item.**
  `done: 2026-09-21` — all four now say it shipped, and say it shipped *whole*: a port, an adapter
  and a `Container` line in one change, which is the shape the `EventBus` deletion argued for.
  The fifth, `packages/content/docs/reference/namespace.md`, was wrong twice — it cited `T-035` as
  an open trade-off and described an English fallback layer `23.15` has since dropped. Verified
  against the tree before rewriting: `StaticContentSource` leaves `base` empty.
- [x] **`AWAITING_A_PROCEDURE`** `done: 2026-09-21` — closed by `23.13` moving the property it
  guarded. `R.35` had already cut the list to one key; the entry stayed open because one list in a
  spec and one property is still the wrong number of places. Both now live in assertion 28.
- [ ] **Three independent `DATABASE_SHARD_<n>_URL` parsers**, with two different contiguity
  algorithms — `apps/web/src/env.ts:143`, `apps/worker/src/env.ts:117` and
  `packages/infrastructure/shard-env.ts:14`. Found while unifying env on 2026-09-20 and left
  alone: the two `env.ts` copies cannot be merged into a package, which `docs/setup/25:144`
  forbids by name, so the fix is narrower than it looks and wants its own decision.
- [x] **Three disagreeing ClickHouse default sets.** `done: 2026-09-21` — and the decision it
  needed was already made: both `env.ts` schemas reject `default` when `CLICKHOUSE_URL` is set,
  because a default naming the project is a credential in shipped code and ClickHouse's own
  `default` cannot reach the compose container. Neither script loads an `env.ts`, so each enforces
  the same rule itself — an absent name throws rather than resolving to a guess. **Verified against
  the running container**: `ch:migrate` reports `nothing to do, 1 applied`, and an empty
  `CLICKHOUSE_DATABASE` throws by name. The `default` user is the trap — it exists with no
  password, so the wrong guess fails by *connecting*.
- [x] **`partitions.ts` defaulted `S3_FORCE_PATH_STYLE` to true** `done: 2026-09-21` — it reads
  `=== "true"` now, the way both schemas do. The sweep it runs is the only caller, and it was
  defaulting to path-style addressing against real S3, where addressing is by host.
- [x] **Nine broken relative links in the docs** `done: 2026-09-21` — fixed, and **the assertion
  that would have caught them landed first**, which is what made them nine failures rather than a
  list to work through by hand. §15 now resolves a `](…)` as well as a backticked span and is
  renamed to *every path the docs name exists*.
  - **A target resolves against the page's own directory and nowhere else**, because that is what
    a renderer does. §12 also treats a `docs/…` target as root-anchored — right for the root files
    it was written for, wrong one directory down — and the spec's own fixture held a link of
    exactly that shape: passing §12, broken in a browser. Fixed with the rest.
  - A URL, a `mailto:`, an anchor-only `#jump` and a braced or globbed shape are left alone. The
    three remaining hits in the tree are regex fragments inside fences, which `outsideFences`
    already blanks.

### Do not fix these — they are frozen by design

Six lines inside `archive/` were stale the day the files moved. **They are not tasks.** A file in
`archive/` records what was believed when it was written, and correcting one would make it a worse
record, not a better one. Listed so nobody reads them as current on the way to an entry's body.

| Where | What it says | What is true |
|---|---|---|
| `archive/PLAN.md:34–81` | eighteen phases built, "start at Phase 19" | twenty-two built; the queue is Phase 23 |
| `archive/PLAN.md:87` | `check:architecture` "21/21 today; 23 after Phase 22" | 26 |
| `archive/PLAN.md:3347` | Phase 23 is "three fixes, eight clauses, three from `TODO.md`, and `23.16`" | `23.16` is done; `23.17`–`23.24` came later |
| `archive/OPEN.md:763` | "45 commits on `main`, nothing pushed" | merged as PR #18; `origin/main..HEAD` is empty |
| `archive/OPEN.md:544` | section B line numbers, taken 2026-09-19 | drifted by that night's edits; the IDs are right |
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

Not left behind, and worth saying so: `platform_policy.projection_enabled` is `t` again, the two
scratch tables are gone, and `retention_policy` holds no rows.

---

## Changelog

| Date | Who | Change |
|---|---|---|
| 2026-09-21 | @sami | **Section 5's seven browser clauses, walked in one pass.** Phases 18–21, `25.4`, `26.9` and `T-029`'s ten steps, against `pnpm dev` on `:13000` with live containers and the worker up. `pnpm platform:grant alice@example.test` was the setup step the previous walk had not taken. Every tick records what was measured: the invitation row read before and after the resend, `platform_policy` read after the pause and after the resume, `users.last_active_organization_id` read at each of `T-029`'s steps, and `member/list` called 2.1 s after a switch to prove the cookie cache was invalidated. **Phase 21 needed a month that did not exist**, so one was manufactured through the product's own machinery — a June partition, one hot month set from the retention screen, a `partitions` job on the maintenance queue — and the page then rendered five rows that live only in S3. Two findings kept out of the ticks: a `platform_admin` is refused `/notifications`, which is the tier working and not a defect; and three buttons that read as dead under a synthetic mouse click fire under `element.click()`, checked with `elementFromPoint` before anything was filed |

| 2026-09-21 | @sami | Section 8 down to one, and `23.13` closed. **A doc link that resolves nowhere is now a build failure** — §15 read backticked paths and not link targets, so resolving all 1 503 of them found nine broken: eight pages under `apps/*/docs/reference/` one `../` short of `packages/`, and one naming a doc `T-013` renamed. The assertion landed first, which is what made them nine failures rather than a list. It also found a link in the check's own fixture that passed §12 and was broken in a browser. **Assertion 28** is §24 from the other vocabulary: a permission the catalog declares that no procedure asserts, which is a checkbox in the role editor granting nothing. The property moved out of `procedure-permissions.spec.ts` rather than being checked twice, which closed `AWAITING_A_PROCEDURE` with it. **Three env defaults that disagreed** — `partitions.ts` read `S3_FORCE_PATH_STYLE !== "false"`, so its sweep defaulted to path-style against real S3; `clickhouse-migrate.ts` and `vitest.smoke.config.ts` guessed three different database-and-user pairs between them, none of them the pair both `env.ts` schemas enforce, and the guess that reached a live container did so because ClickHouse ships a `default` user with no password. And **five doc sentences** that were out of date: four describing the transactional outbox as a backlog item since Phase 10 shipped it, and one describing an English fallback layer `23.15` dropped |
| 2026-09-20 | @sami | Created at `885e144` from a full read of `PLAN.md`, `OPEN.md`, `REVIEW.md`, `STUCK.md`, `TODO.md` and every file already in `archive/`. Every "still true" and "already resolved" claim in section 4 was re-read from the source tree rather than from the plan |
| 2026-09-20 | @sami | Ten more review defects, all verified against the tree before being marked: `R.12` notification mail linked to relative paths, fixed in the renderer both templates share; `R.13` the digest footer printed a uuid, so `OrganizationReader` gained `nameOf`; `R.22` the inbox trapped a reader in `unread only`, **and its spec found the same trap one layer up** — the pending skeleton removed the toggle too, so toggling deleted the button on click; `R.27` CORS omitted `last-event-id`, so a cross-origin stream could never resume; `R.28` an eviction policy with no ceiling never evicts; `R.29` a placeholder secret that booted; `R.30` a doc naming a key the schema does not have; `R.31` assertion 7 never walked `apps/*`; `R.35` four keys that had been gated since phases 19 and 20; `R.44` a live button with no handler. `R.45` narrowed to the two bullets still true |
| 2026-09-20 | @sami | `R.2` fixed, and it was less blocked than the entry said. Both cross-node passes were handed the catalog unit of work, which never reads `ShardScope`, so `eachShard` looped the nodes and every iteration wrote to node 0; `Container` now builds a third `local`-placed `PgUnitOfWork` for them. That exposed the second bug the review flagged under the same binding — `sweepExpired` deletes three catalog tables from a `local` gateway, and was correct only by the node-0 fallback — so it uses `catalogDb`, the sanctioned crossing. **Proved on two real nodes:** `24.1` gates only the outbox half, because that needs a row whose foreign key is the `23503`; a month partition needs no key, so the sharded smoke asserts the runway lands on node 1 and not on the catalog, and it fails on the old binding. All four High defects are now closed |
| 2026-09-20 | @sami | `R.1` and `R.5` fixed together, which is what the review said one tombstone would do. `partition_archive.deleted_at` is stamped by the delete and read by the nightly sweep, which had been keyed on `archived_at` — so the window measured how old each *month* was rather than how long ago the tenant went, and a tenant with a year of cold storage lost all but the newest months the night after the delete. The same predicate destroyed every `outbox_event` archive on every deployment, because that table has no tenant level and its months sit under a nil uuid no `organizations` row can match. Seven specs in `tests/cold/sweep-deleted.spec.ts`, the file the review named as missing; three fail on the old predicate. `R.4`'s `unverified:` note closed too, with eight cases running its two queries against Postgres |
| 2026-09-20 | @sami | One env file, and ports that do not collide. Four env files became one: compose read `infra/.env` because `infra/` is its project directory, and `dotenv`'s cwd lookup layered `packages/infrastructure/.env` under five scripts with `DATABASE_URL` on a different port again. Both deleted; `tooling/scripts/compose.mjs` passes `--env-file` when the root file exists, which is conditional because `--env-file` errors on a missing file and CI has none. `dotenv` dropped entirely for Node's own loader. Every published port is the well-known one with a `1` in front, which is the scheme the README already taught, and `WEB_PORT` is now read rather than ignored. Assertion §27 pairs each `*_PORT` with the URL that dials it, checks every compose default against the template, and refuses a second `.env` anywhere. **It was written wrong first and the fixture caught it:** the template is CRLF, `.` matches no carriage return, and the `$`-anchored parse silently returned nothing, so the assertion passed on every tree including the broken ones |
| 2026-09-20 | @sami | `R.3` and `R.4` fixed, the two High defects that did not need a second node. `R.3` in `ErrorNormalizer` rather than in `api-client`, because the normaliser covers the in-process SSR client too — and the spec found a second hole the review had not: an unknown wrapped code adopted the wrapper's own. `R.4` moved the digest's candidate list off `notification_preferences` and onto `notifications`, deleted the two preference methods rather than leaving them beside the new ones, and keyed the policy default by kind because one category holds two kinds that disagree. Seven red-then-green specs for `R.3`, eight for `R.4`; the two Postgres queries under `R.4` are `unverified:`, with the command. Two pre-existing blockers cleared on the way: `pnpm typecheck` needed a package build, and `pnpm lint` had been red since the fan-out commit on a dead pair of locals |
| 2026-09-20 | @sami | The five ledgers moved to `archive/` and this file became the only open one. Their relative links were repaired for the new depth, the nine inbound references from `docs/` and `packages/*/docs/` were repointed so §15 still passes, and `docs/data-flow.md`'s "what is planned and not yet built" now names this file. Section 8 split: two doc edits still owed, six stale lines inside `archive/` marked frozen rather than filed |
| 2026-09-20 | @sami | Ten more, six of them the commit before this one had fixed and not ticked. `R.16`/`R.32` were one line: a caller's `documentId` reached the BullMQ job id verbatim, which refuses a `:`, and the key held no content, so a re-index with new words returned success and indexed nothing — `JobKey` hashes both. `R.42` a cursor validated its timestamp and not its id while every consumer casts it `::uuid`; `R.41` a repository used a numeric offset as a text keyset, so page two was every key alphabetically after "25"; `R.43` an order on a sum with no tie-break under limit/offset; `R.26` a route prefetching a query gated on a permission it does not require. Then four new: `R.17` — the conversation member column's only constraint is `users.id`, which every tenant's people share, so a manager could add a user from another tenant and probe which ids exist. Its port is named `isActiveMember` rather than `isActive` **because parameters compare bivariantly**: `auth`'s reader takes the user first, and one standing in for the other typechecks and then swaps the arguments at run time. `R.14` the preferences grid read a category's default off its first event, which has no recipients; `R.38` the digest counted rows from categories already emailed one at a time; `R.20` `deleteFor` had no caller anywhere and that table carries no foreign key |
| 2026-09-20 | @sami | Every Medium review defect closed, in four commits. Three in the worker: the retention pass branched on `cold_mode` before reading the per-tenant overrides, and `drop` destroys a month, so a tenant that had bought three years lost it at the deployment's cutoff with nothing in cold storage; `deliver` jobs carried no priority, and BullMQ empties the plain wait list before it touches the prioritized set, so the drain's `priority: 1` put it exactly last rather than first; `cold-restore` and `tenant-export` named a tenant and placed nothing. Three in the web tier, all of them a client reconnecting forever: a deactivated membership still rendered the shell, a throw from inside a streaming handler never reached the error middleware because `next()` resolves when the generator is created, and the realtime provider was keyed on the api client, which an organization switch does not change. Three in messaging: a null `last_message_at` sorts first under DESC and its cursor was null, so the list truncated on any page ending on a conversation with no messages; six use-cases published outside any transaction; and the last-owner count was read before the transaction opened, so two concurrent demotions could commit a tenant down to zero owners. And one in platform: a retention save composed the ClickHouse TTL from the base months alone and erased every per-action window. **Twenty-three specs, every one red on the old code first** — the two for the conversation keyset against Postgres. `R.9` is the single one with no unit test, and the entry says why |
| 2026-09-20 | @sami | **Section 3 is down to two, and neither of the two is a tool.** `S.1` closed: the Claude in Chrome extension connects, and the walk it was holding — `23.5` through `23.12` — was done end to end. Six of the seven observations hold and are recorded with what was measured rather than what was seen: tab B's network log was **cleared** before the invite, so its two calls are the refetch and not something already in flight; `markRead` and `message/send` were each held open in the page's own `fetch`, which is how the optimistic window was observed rather than inferred; and the reconnect was read off a clone of the response body, where the first frame after a kill-and-restart is a `resync` the router yields **only** for a client resuming with a `last-event-id`. The checklist's second browser profile turned out to be unnecessary — in every clause the second account only has to act, so Grace acted over `/api/rpc`. **`23.6` is the one that does not hold, and the entry had only half its reason:** `23.3` is real and was measured on `/settings/roles`, but `/notifications` prefetches nothing at all, so fixing `23.3` would not tick it. Two defects found on the way, filed as `23.25` and `23.26`: the typing indicator names a uuid **and names you**, and a notification row's unread badge is labelled with the filter's copy. **`S.2` was not in the state this file recorded** — ClickHouse had been dead five days and `CLICKHOUSE_URL` was commented out, so the projection had been writing nowhere and the wait for days of data had never started; both are on, and it wrote its first 37 rows inside one cycle. **Turning it on immediately reproduced `23.21`'s second defect**, which had only ever been reasoned about: one leftover tenant with no shard assignment logged `shard.resolution.failed` and then `queue.job.failed` sixty milliseconds later — not `analytics.projection.failed` — *after* the first tenant's rows had landed. Left alone, "a few days of data" would have been the same 37 rows on day three, which makes `23.21` a prerequisite of `23.14` rather than a neighbour of it. **`S.3` re-measured on the renumbered ports** — the sharded smoke is 5 passed rather than 4, a warm resolve 914 µs rather than 679 — and its blocker is unchanged, because `24.1` is a decision and not a container |
| 2026-09-20 | @sami | **Section 2 is empty. All forty-five review defects are fixed.** The last ten, in three commits. Three were silent data loss: the projection checkpoint could pass a row that had not committed yet and the strictly-greater keyset never looked back; the archive's only pre-drop check was `exists`, and the comment above it already said a `HEAD` was not enough, so a partition could be dropped behind an object that had lost a multipart part; and the tenant export paged `role_permissions` on `permission`, which repeats once per role. Two were races: grant and revoke read the whole permission list and wrote it back, and a send retry arriving while the first attempt's transaction was still open took the claim over and wrote a second message. One was an authorization gap — a goal role assignable as an organization membership, where the rule turns out to be "not goal" rather than "org only", because `platform_admin` is `scope: "platform"` and *is* a membership row. One was an unkillable worker: SIGTERM chained off a `start()` that blocks on an unreachable queue Redis. One was five validation rules with no copy behind them. One was two specs whose assertion did not check what their name claimed. And `R.24` changed no behaviour at all — it made three comments and a reference page stop claiming a duplicate-suppression window the queue has never had |
