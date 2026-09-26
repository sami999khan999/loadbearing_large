---
title: Communication performance plan — realtime, messaging, notifications and email, off the app's path
updated: 2026-09-26
owner: sami
schema: plan/v1
source: tree at 14d49db (dev), 2026-09-26; three read-only surveys of the client stream path, the worker's delivery path and the process shape
---

# Communication performance plan

## Resume here

**Archived 2026-09-26. The open items and the unverified hand checks below are boxes in
`BACKLOG.md` §12; tick them there, not here.**

**All seven phases are built, in the working tree, uncommitted.** At the end: `pnpm typecheck`,
`pnpm lint`, `pnpm test` (twenty packages and apps) and `check:architecture` 29/29, all green; the
web, worker and realtime builds pass; the realtime app boots and serves; and a signed-in stream
through the dev proxy received a frame the worker published.

**Open, and why:**

| Item | State | What it needs |
|---|---|---|
| `CP1.9`, `CP4.9` | `[ ]` | the measurements — a browser, two tabs, a seeded 500-member channel |
| `CP7.8` | `[!]` | the web SIGTERM hook wants Nitro's `close` hook, not a second signal listener |
| `CP7.9` | `[~]` | its second release: drop `realtime.*` from web's handler, move the stream smoke spec |

**Decisions made while building, each on its item:** the port is 13001 (13100 is Loki's); the
package folder is `router/`, a new vocabulary row; the Vite proxy is a plugin, not `server.proxy`;
`api-server` depends on `zod` and `@orpc/contract` so its declarations type.

**Left on the machine:** migration `0040_outbox_claim_lease` on both local nodes; the `sharded`
profile up; Docker Desktop started. A throwaway signed-up account, `realtime-e2e@example.test`,
with its personal organization, a pending invitation to `realtime-e2e-invitee@example.test`, and
their three mails in Mailpit. Nothing is running.

### What is outstanding

| Phase | Open items |
|---|---|
| 1 | `CP1.9` |
| 4 | `CP4.9` |
| 7 | `CP7.8` `CP7.9` |

### Running it again

```bash
pnpm build:packages && pnpm --filter @loadbearing/web build && pnpm --filter @loadbearing/worker build
pnpm check:architecture      # 29/29 today; 29/29 after every phase, no "○ skipped"
pnpm typecheck && pnpm lint && pnpm test
pnpm infra:up && pnpm db:migrate && pnpm db:seed && pnpm dev
pnpm --filter @loadbearing/infrastructure test && pnpm smoke
```

> **How to use this file**
>
> 1. Every item has a unique ID (`CP2.3`). Never reuse or renumber one.
> 2. Change progress by editing the checkbox marker only: `[ ]` todo · `[~]` in progress ·
>    `[!]` blocked · `[x]` done · `[-]` dropped. Add `done: YYYY-MM-DD` when closing, and
>    `unverified:` naming the command when the proof needs a container the executor lacks.
> 3. Phases 1 to 5 are independent of each other and may run in any order; each ships alone.
>    **Phase 7 needs Phase 1 and Phase 6 Exit** — a graceful shutdown ends streams cleanly and
>    relies on the client reopening them, and the new app imports what Phase 6 moves.
>    Inside a phase, items run top to bottom unless **Depends on** says otherwise.
> 4. Every item that touches code lists the doc it must update. A code change with the doc
>    untouched is not done. `docs/opinions/` wins over `docs/ai/rules/`.
> 5. `BACKLOG.md` stays the only open ledger. Each item names the `CR.*` findings it closes
>    (bodies in `archive/REVIEW-2026-09-25.md`); closing the item moves those entries to
>    `archive/DONE.md` §10 with their proof, in the same commit.
> 6. This plan adds one package (`api-server`) and one app (`realtime`), so it adds two
>    commitlint scopes, each in the commit that adds the directory. No author or tool trailers
>    (`docs/ai/rules/workflow.md`).
> 7. Defects found while executing go to the bottom of the phase they were found in.

---

## Context

`COMMUNICATION.md` moved the communication features out of the backlog because they shared an
unstated requirement: **messaging, email and notifications must not slow the app down**. It said
that was a different plan, written later. This is it — for the paths that exist today, before any
of the `26.x` features lands on them.

Today the delivery work is already off the web process: every email is a `MAIL` job, and every
message and notification fan-out runs in the worker from the outbox. What is not off it:

- **The live connections.** Every open tab holds one or two server-sent-event streams in
  `apps/web`, on the event loop that renders pages. Each one opens with a full principal
  resolution (a Postgres membership read and two capability lookups).
- **The refetches a frame causes.** Every frame only invalidates. One chat message sends two
  frames, each refetches every loaded page of the conversation, for every member watching, plus the
  whole `conversation` namespace on every member's user stream (`CR.39`). That lands on `apps/web`
  wherever the stream lives.
- **Reconnects.** A stream ends cleanly at 30 minutes and nothing reopens it (`CR.37`); a stream
  that throws retries every 2 s forever, `UNAUTHORIZED` included (`CR.38`).
- **Redis.** Live frames ride the cache instance, which also serves every request's session and
  capability lookups.

And in the worker, where the work is off the app but not fast or safe: retries that give up in
~30 s and a failed set deleted after a day (`CR.13`, `CR.40`), a serial per-node loop that stops at
the first failure (`CR.14`), an outbox relay that holds its claim transaction across Redis calls
(`CR.27`), per-recipient query loops in fan-out and digest (`CR.28`), an unscoped digest scan that
runs out of locks (`CR.22`), and an SMTP transport with no pool and no timeouts. On the request
path, messaging reads load every member and touch every month (`CR.25`, `CR.26`).

The request: make all of it performant, and make it not affect the app. The user chose to move the
streams into their own process. This file is the plan: seven phases, item IDs `CP<phase>.<n>`.

### Decisions recorded up front (do not re-litigate)

1. **Streams move into a third process, `apps/realtime`.** It holds every open stream and nothing
   else. The worker and the web app keep publishing to Redis; `apps/realtime` subscribes and
   forwards. The browser still sees one origin: `/api/realtime/*` is routed to the new process by
   Vite in development and by the reverse proxy in production, so the session cookie rides along.
2. **The shared stream code lives in a new package, `packages/api-server`** — the server mirror of
   `api-client`, layered `composition → api-server → apps/{web,realtime}`. It holds oRPC's router
   side: the `authed` chain, the error interceptor, the stream routers. The HTTP adapters
   (`@orpc/server/fetch`, `@orpc/server/node`) stay in `apps/*/src/server/`. This amends
   `docs/opinions/dependencies.md`, which confines `@orpc/server` to `apps/*/src/server/`: the part
   that changes with the HTTP framework is the adapter, and the router is bound to oRPC, not to
   HTTP. Two leaf apps needing one chain is the boundary a folder cannot express. Rejected: copying
   ~180 lines of `base.ts` and `error.interceptor.ts` into the new app behind a drift assertion —
   it copies the subtlest code in the transport.
3. **No silent fallback to web.** For one release `apps/web` still answers `realtime.*` on
   `/api/rpc`, so tabs opened before the deploy keep working (`CP7.9`); then it stops. A fallback
   that stayed would put streams back on the app, unnoticed, whenever a proxy rule is missing —
   the exact outcome this plan exists to prevent.
4. **`REDIS_REALTIME_URL` is optional and defaults to the cache URL.** A small deployment runs
   nothing extra; a busy one points it at a third instance. Pub/sub keeps nothing, so the instance
   needs no persistence and no eviction policy.
5. **Refetch, never patch from a payload.** A frame's payload carries ids that narrow which keys
   refetch and let the client dedupe; it never carries data to render. Splicing a page the server
   just returned into the cache is allowed — the server still shaped every row.
6. **Both message frames stay.** The request's fast-path frame keeps sends feeling instant; the
   outbox's durable frame keeps them reliable. The client dedupes by `messageId`.
7. **Not `maxPages`.** On a one-direction infinite query it drops the newest page when the reader
   scrolls back, which is the page a chat most needs. A send refreshes the newest page alone.
8. **The dead-letter queue is BullMQ's failed set**, kept seven days and capped by count, with a
   replay script. A delivery table is `26.10`, which this plan does not build.
9. **Out of scope:** every `26.x` feature, and the security findings `CR.1`–`CR.4` and `CR.6`.
   Nothing here blocks them: `lastEventId` is carried end to end for `26.5`, and the subscriber's
   stream registry (`CP7.4`) is where `CR.4`'s per-user revoke plugs in.

### What exists and is reused (verified against the tree at `14d49db`)

- `RedisRealtimeSubscriber` — one subscriber socket per process, ref-counted channels, a bounded
  per-stream queue that sends `resync` on overflow. Kept as is; `CP7.4` adds `drain` and an owner.
- `ClientRetryPlugin` with no default — unary calls still opt in per call site; streams stop using it.
- `ERROR_CATALOG` in `@loadbearing/errors` — `retryable` and `severity` per code, already read by
  the query client's retry. The stream loop reads the same entry.
- oRPC 1.15's `ClientOptions.lastEventId` and `RPCLink`'s `url` as a function of the path.
- `KeysetCursor`, `BaseRepository`'s placement rules, `withShard`, `Container.eachShard`.
- `apps/worker` as the template for a process: `main.ts`, `env.ts`, `import.ts`, `bootstrap/`,
  SIGTERM handling, the `process.started` / `process.stopped` markers `boot-smoke.mjs` reads.
- BullMQ 5.81 `addBulk`, backoff `jitter`, `Queue.retryJobs`; nodemailer 8 `pool` over a URL.

---

## The phases

### Vocabulary fixed up front

| Thing | Name |
|---|---|
| New app | `apps/realtime`, package `@loadbearing/realtime`, commit scope `realtime` |
| New package | `packages/api-server`, package `@loadbearing/api-server`, commit scope `api-server` |
| Stream path | `/api/realtime/*`; web's unary path stays `/api/rpc/*` |
| Procedures | `realtime.stream` (user channel, unchanged), `realtime.conversation` (was `message.stream`) |
| Env | `REDIS_REALTIME_URL` (optional), `REALTIME_PORT` (13100), `REALTIME_SHUTDOWN_TIMEOUT_MS` (20 000); `REALTIME_MAX_STREAMS_PER_USER` and `REALTIME_STREAM_MAX_AGE_SECONDS` move from web to realtime |
| Redis role | `realtime` on `RedisConnection`, `realtimeClient()` |
| Client classes (`packages/query/src/realtime/`) | `RealtimeStream` (the reconnect loop), `RealtimeRefetch` (coalesced refetch); `MessagingQueries.refreshNewest` and `.splice` |
| Query keys | `QueryKeys.notification.lists()`, `QueryKeys.conversation.lists()` |
| Ports | `QueuePublisher.publishMany`, `MailPublisher.publishMany`, `RealtimeSubscriber.drain`, `NotificationRepository.unreadSubjectHolders`, `.listUnreadBetween`, `ConversationRepository.findMembership`, `TenantMembershipReader.activeMemberIds` |
| Column | `outbox_event.claimed_until timestamptz null` |
| Script | `pnpm queue:replay <queue> [jobName]` → `packages/infrastructure/queue-replay.ts` |
| Log event codes | `shard.sweep.failed` (warn, `{ node }`), `realtime.stream.drained` (info, `{ streams, durationMs }`) |
| Docs pages (new) | `packages/api-server/docs/`, `apps/realtime/docs/reference/{env,shutdown}.md` |

---

### Phase 1 — The client: streams reopen, frames stop causing storms

**Goal.** A stream that ends reopens. A stream that fails backs off with jitter and stops on an
answer that will not change. One chat message costs each watching tab at most one single-page
fetch, and a burst of frames costs at most two refetches per key per second.

**Design in one paragraph.** The frame contract gets a typed payload of optional ids. The durable
frames carry `messageId` and the user-stream frames carry `conversationId`. One class,
`RealtimeStream.run`, owns reopening for both hooks: a clean end reopens within a second with a
`lastEventId` so the server answers `resync`; an error reads `ERROR_CATALOG` and either stops or
backs off. One class, `RealtimeRefetch`, turns any number of frames per key into one refetch now
and one trailing. The route table narrows each frame to the keys its ids name. The conversation
hook dedupes by `messageId` and answers a send by refreshing only the newest page.

- [x] `CP1.1` **Typed frame payload** — `packages/contracts/src/realtime/realtime.contract.ts`:
  `payload: z.object({ conversationId?, messageId?, kind? })`, unknown keys stripped, so a
  publisher one deploy ahead still parses. **Docs:** `packages/query/docs/reference/realtime.md`
  (`contracts` has no realtime page).
  done: 2026-09-26
- [x] `CP1.2` **Ids on the durable frames** — `messaging-realtime.subscriber.ts`: `messageId` on
  `message.*` frames, `conversationId` on the per-member `conversation.changed`. Closes the
  comment in `send-message.use-case.ts` and `messaging.md:109` claiming a dedupe that did not
  exist. **Docs:** `packages/application/docs/reference/messaging.md`. Closes part of `CR.39`, `CR.48`.
  done: 2026-09-26
- [x] `CP1.3` **Jittered maximum age** — `redis-realtime.subscriber.ts`: the deadline is
  `maxAgeMs × (0.9 + 0.2 × random)`, so tabs opened together do not all reopen together.
  **Docs:** `packages/infrastructure/docs/reference/realtime.md`.
  done: 2026-09-26
- [x] `CP1.4` **`RealtimeStream`** — `packages/query/src/realtime/realtime-stream.ts`. Clean end →
  reopen after 0–1 s with the last frame's id (any valid id if none arrived). Error → stop when
  the catalog entry is `retryable: false, severity: "expected"` (401, 403, 404, 400, 2FA);
  otherwise full-jitter backoff `min(30 s, 1 s·2ⁿ)`, never under 30 s after `RATE_LIMITED`, reset
  after 60 s up. Both call sites drop `retry: Infinity`; `api-client.ts`'s comment says streams
  reconnect here. Spec: `tests/realtime/realtime-stream.spec.ts`. **Docs:**
  `packages/query/docs/reference/realtime.md`, `apps/web/docs/reference/env.md:185`. Closes `CR.37`, `CR.38`.
  done: 2026-09-26
- [x] `CP1.5` **`RealtimeRefetch`** — `realtime-refetch.ts`: single-flight per key with one
  trailing run, at least a second apart, active queries only; one instance per stream, disposed
  with it (a module-level map would be static mutable state). Spec: twenty frames → two refetches.
  **Docs:** `packages/query/docs/reference/realtime.md`.
  done: 2026-09-26
- [x] `CP1.6` **Narrow routes** — `realtime-route.ts` takes `(request, name, payload)`.
  `notification.created` → the unread count and `QueryKeys.notification.lists()`;
  `conversation.*` with an id → `conversation.lists()` and `conversation.get(id)`; `message.*` →
  `message.list(id)`; no id, and every `resync`, → the namespace. `query-key.ts` gains the two
  `lists()` keys and moves the bell comment to its key. **Docs:**
  `packages/query/docs/reference/realtime.md` ("invalidate, never patch" becomes decision 5).
  Closes `CR.47`.
  done: 2026-09-26
- [x] `CP1.7` **Conversation hook** — `use-conversation-stream.ts` runs on `RealtimeStream`, keeps
  the last 256 `name:messageId` keys, and answers `message.sent` with
  `MessagingQueries.refreshNewest` (single-flight, trailing): fetch the newest page once and splice
  it into page 0, replacing optimistic rows by `clientId`; no overlap → reset to that page. Edits,
  deletes and resyncs refetch through `RealtimeRefetch`. `messaging.queries.ts` passes `signal`
  into every `queryFn`. `realtime.context.tsx` memoises its value. Spec:
  `tests/messaging/messaging.queries.spec.ts` (splice with overlap, optimistic replacement, no
  overlap). **Docs:** `packages/query/docs/reference/realtime.md`. Closes `CR.39`, `CR.42`.
  done: 2026-09-26
- [x] `CP1.8` **Specs brought forward** — `realtime.context.spec.tsx`: narrowed keys, reopen after a
  clean end, no reopen after `UNAUTHORIZED`. `use-conversation-stream.spec.tsx`: the fast and
  durable `message.sent` for one id cause one refresh; an edit refetches the list.
  `messaging-realtime.subscriber.spec.ts`: `messageId` in the payload. A contracts spec: a payload
  with extra keys parses.
  done: 2026-09-26
- [ ] `CP1.9` **Measured** — two tabs, twenty messages in a few seconds: the network panel shows
  single-page `message.list` calls at about one a second. Record the before and after counts of
  `http.request.completed{path="message.list"}` per minute from Loki in this item's `done:` line.
  unverified: needs `pnpm infra:up && pnpm dev` and two browser tabs; not run unattended. Also run the Exit's manual checks here.

**Exit.** `REALTIME_STREAM_MAX_AGE_SECONDS=60` and a tab left open: the stream reopens every minute
and frames keep arriving. Sign out in another tab: the stream stops and does not retry. Stop the web
process: the retry gaps grow and are uneven. Twenty quick messages: at most two `message.list`
calls a second per tab, each for one page. Every suite green, `check:architecture` 29/29.

---

### Phase 2 — Messaging reads on the request path

**Goal.** Opening, listing and sending in a conversation stop loading full member rosters and
stop touching every month of `messages`.

- [x] `CP2.1` **One-query membership check** — `ConversationRepository.findMembership(org,
  conversationId, userId)` returns the header and the caller's membership in one join;
  `assertMember` in `application/src/messaging/conversation-access.ts` uses it. Only the use-cases
  that need the roster (add, remove, leave, rename, get) keep `findById`. Capping the roster in the
  contract changes the UI and is not in this plan. **Docs:**
  `packages/application/docs/reference/messaging.md`. Closes `CR.26` for the hot path.
  done: 2026-09-26
- [x] `CP2.2` **An upper bound on the first page** — `PgMessageRepository.list` takes `upTo`, and
  `ListMessagesUseCase` passes the conversation's `lastMessageAt`; a conversation with no messages
  returns an empty page without a query. **Docs:** `packages/infrastructure/docs/reference/partitions.md`
  (its fifteen-partition claim, which does not hold for `messages`). Closes part of `CR.25`, `CR.48`.
  done: 2026-09-26
- [x] `CP2.3` **A floor on `unreadCounts`** — `created_at > $floor` beside `last_read_at`, floor
  computed in the application (now − 90 days) so the literal prunes at plan time. **Docs:** the
  same page. Closes `CR.25`.
  done: 2026-09-26
- [x] `CP2.4` **`touch` only moves forward** — `PgConversationRepository.touch`:
  `where last_message_at is null or last_message_at < $at`. Closes `CR.30`.
  done: 2026-09-26
- [x] `CP2.5` **One member check for many** — `TenantMembershipReader.activeMemberIds(org, userIds)`,
  one `= any($1)` query, used by create-conversation and add-member. Closes `CR.32`.
  done: 2026-09-26
  note: add-member checks one user, so it keeps `isActiveMember`; only create-conversation looped.
- [x] `CP2.6` **Fakes and specs** — `packages/composition/src/fake/` follows each port change.
  Integration specs in `packages/infrastructure/tests/messaging/`: `upTo` honoured, the floor holds,
  `touch` never moves back, and an `EXPLAIN (FORMAT JSON)` spec that counts the partitions the first
  page and `unreadCounts` touch.
  done: 2026-09-26

**Exit.** The `EXPLAIN` spec shows the first page and `unreadCounts` touching a bounded number of
partitions on a conversation with messages spread over twelve months; `message.list` and
`conversation.list` `durationMs` in the logs are no worse than before; every suite green.

---

### Phase 3 — The worker: no lost work

**Goal.** An outage of minutes loses no mail and no event. A down node delays only its own work.
A failed job can be found and replayed for a week.

- [x] `CP3.1` **Retry windows of minutes to hours** — `bullmq-queue.publisher.ts`: default 8
  attempts, exponential from 5 s with jitter (about ten minutes); deliveries 12 (about three
  hours); mail `high` 10 and `normal` 8 (`queued-mail.publisher.ts`). The comment stops saying
  "roughly a minute". **Docs:** `apps/worker/docs/reference/consumers.md`,
  `packages/composition/docs/reference/mail-pipeline.md`. Closes `CR.13`, `CR.49`.
  done: 2026-09-26
  unverified: the Exit's Mailpit walk (stop it three minutes, invite, restart) needs `pnpm dev` with the worker; the attempt counts are asserted by `queued-mail.spec.ts` and `redis.smoke.spec.ts`.
- [x] `CP3.2` **Failed jobs kept, and bounded** — `removeOnFail: { age: 7 days, count: 10 000 }`.
  A fixed job id stuck in the failed set blocks re-adding that id for the week; the ids here are
  per event or per tenant-day, so say so in the docs. **Docs:** `docs/infra/reference/redis.md`.
  Closes `CR.40`.
  done: 2026-09-26
- [x] `CP3.3` **The drain stops trimming the delivery dedupe window** — `outbox-drain.schedule.ts`
  `removeOnComplete: true` instead of `10`, which trimmed the queue's shared completed set every
  second. **Docs:** `apps/worker/docs/reference/consumers.md` (the window is now what it says).
  done: 2026-09-26
- [x] `CP3.4` **The digest retries** — `digest.schedule.ts`: 5 attempts, backoff 60 s. Closes `CR.19`.
  done: 2026-09-26
- [x] `CP3.5` **One bad node delays only itself** — `Container.eachShard`: catch per node, emit
  `shard.sweep.failed { node }` and the failure, continue, rethrow the first error at the end so
  BullMQ retries. The code gets a catalog entry and a type (`check-architecture` §24). Spec with
  three fake nodes, the middle one throwing. **Docs:**
  `packages/infrastructure/docs/reference/sharding.md`, `apps/worker/docs/reference/consumers.md`.
  Closes `CR.14`.
  done: 2026-09-26
- [x] `CP3.6` **`dispose()` closes everything** — each step caught and logged, in the same order.
  Closes `CR.36`.
  done: 2026-09-26
- [x] `CP3.7` **Replay** — `packages/infrastructure/queue-replay.ts` above `src/`, root script
  `pnpm queue:replay <queue> [jobName]` → `Queue.retryJobs({ state: "failed" })`. Added to
  `ENV_EXEMPT` in `check-architecture.mjs` and to Biome's `noProcessEnv` override in the same
  commit, and to the package's tsconfig `include` (§26). **Docs:** `docs/ai/rules/workflow.md`
  command list, `docs/setup/26-hygiene-and-ci.md` if it names `ENV_EXEMPT`.
  done: 2026-09-26

**Exit.** Stop Mailpit for three minutes, invite a member, start it again: the invitation arrives
at `:18025`. Force a mail failure past its attempts: `pnpm queue:replay mail` sends it. The
`eachShard` spec proves node 3 runs with node 2 throwing. Every suite green.

---

### Phase 4 — The worker: throughput

**Goal.** Fan-out and digest cost a query per page, not per person; the outbox drain holds no
transaction across Redis; SMTP reuses connections and cannot hang.

- [x] `CP4.1` **Batched enqueue** — `QueuePublisher.publishMany(queue, jobs)` and
  `MailPublisher.publishMany(mails)` on BullMQ `addBulk`, in chunks of 500; the recording fakes
  follow. **Docs:** `packages/composition/docs/reference/mail-pipeline.md`.
  done: 2026-09-26
- [x] `CP4.2` **The outbox claims with a lease** — migration adds `outbox_event.claimed_until`
  (`pnpm db:generate`; check `partition-ddl.ts` handles a column on the partitioned parent, and
  that §20 accepts it). `pg-outbox.gateway.ts` becomes three steps: claim in one auto-committed
  `update … where (id, occurred_at) in (select … for update skip locked) returning`, setting
  `claimed_until = now() + 60 s`; relay outside any transaction with one `publishMany`; mark
  published. A crash between relay and mark re-relays after the lease, deduped by job id.
  **Depends on:** `CP4.1`. Specs: a throwing relay leaves a lease that is reclaimed after it;
  two concurrent drains never share a row; the relay runs with no transaction open. **Docs:**
  `packages/infrastructure/docs/reference/fan-out.md`, `unit-of-work.md:89`. Closes `CR.27`.
  done: 2026-09-26. Migration `0040_outbox_claim_lease`, applied to both local nodes. The docs changed are `ports.md`, `unit-of-work.md`, `pgbouncer.md`; `fan-out.md` never described the drain.
- [x] `CP4.3` **One suppression query per event** — `NotificationRepository.unreadSubjectHolders(org,
  userIds, kind, subjectId)` replaces the per-recipient `existsUnread` in
  `DeliverNotificationUseCase`; email goes out through one `publishMany`. **Docs:**
  `packages/application/docs/reference/notification-policy.md`. Closes part of `CR.28`.
  done: 2026-09-26
- [x] `CP4.4` **One digest query per page** — `listUnreadBetween(org, userIds, since, until,
  perUser)` with `row_number() over (partition by user_id …)`; the window is half-open,
  `[day − 1, day)`, so a row is in exactly one digest; one `publishMany` per page. Closes `CR.28`.
  done: 2026-09-26
- [x] `CP4.5` **The digest fan-out pages tenants** — drop `organizationsWithUnreadSince` and
  `ListDigestOrganizationsUseCase`; `NotificationConsumer.fanOut` pages the catalog's tenants per
  node inside `eachShard` and batch-adds one digest job per tenant, job id unchanged. A tenant with
  nothing unread costs one pruned query. The 5 000 cap goes. **Docs:**
  `packages/infrastructure/docs/reference/partitions.md` (the "nothing in the application issues
  such a read" line), `apps/worker/docs/reference/consumers.md`. Closes `CR.22`, part of `CR.48`.
  done: 2026-09-26
- [x] `CP4.6` **Member fan-out in pages** — `MessagingRealtimeSubscriber` pages `memberIds` by
  1 000 with a keyset, so a very large room is never one array.
  done: 2026-09-26
- [x] `CP4.7` **SMTP pooled and bounded** — `smtp-email.sender.ts`: `pool: true`,
  `maxConnections` (from config, default 5), `maxMessages: 100`, connection and greeting timeouts
  10 s, socket 30 s. The pool connects lazily, so `apps/web` opens no socket. **Docs:**
  `docs/infra/reference/mailpit.md`, `mail-pipeline.md`.
  done: 2026-09-26. Probed by hand: two sends through the pooled transport reached Mailpit (then deleted).
- [x] `CP4.8` **The pool warning counts the right consumers** — `warnIfOversubscribed` counts only
  consumers that hold a database connection. Closes `CR.43`.
  done: 2026-09-26. Mail is excluded; a job taking a second catalog connection is still not counted — no consumer declares that, so there is nothing to read it from.
- [ ] `CP4.9` **Measured** — seed a 500-member channel and post: record `outbox.drain.completed`
  and the delivery `durationMs` before and after; enqueue a `digest-fanout` by hand and watch Mailpit.
  unverified: needs a seeded 500-member channel and a running worker; not run unattended.

**Exit.** The outbox specs pass; one message to a 500-member channel issues one suppression query,
not five hundred; a digest run over a tenant with 1 000 unread recipients issues one read per page
of 200; every suite green.

---

### Phase 5 — A Redis role for live frames

**Goal.** Live frames can move off the instance that serves sessions and permissions, by setting
one variable, with no change when it is unset.

- [x] `CP5.1` **The role** — `redis.connection.ts`: `realtimeUrl?`, role `realtime`;
  `realtimeClient()` is the publish connection and aliases the cache client when the URL is absent
  or equal, so no extra socket; `subscriberClient()` dials it. A `closed` flag makes `resolve()`
  after `close()` throw, so a stream's `finally → detach()` cannot reopen Redis during shutdown.
  Spec: equal URLs share one socket; a different instance gets its own (use the queue instance —
  pub/sub ignores the DB index); `resolve()` after `close()` throws. Closes part of `CR.34`.
  done: 2026-09-26
- [x] `CP5.2` **Wiring** — `ContainerConfig.redis.realtimeUrl?`; `RedisRealtimePublisher` on
  `realtimeClient()`; web and worker `env.ts` read `REDIS_REALTIME_URL` and fall back to the cache
  URL; `.env.example` carries it commented; `PORT_PAIRS` (§27) gains `REDIS_CACHE_PORT` /
  `REDIS_REALTIME_URL`.
  done: 2026-09-26
- [x] `CP5.3` **Docs** — `docs/infra/reference/redis.md`: the third role, when to split it out,
  `client-output-buffer-limit pubsub` disconnecting a slow subscriber, and why eviction does not
  apply. `packages/infrastructure/docs/reference/realtime.md`.
  done: 2026-09-26

**Exit.** With `REDIS_REALTIME_URL` pointed at the queue instance, frames still reach two tabs and
`redis-cli -p 16380 PUBSUB CHANNELS` lists them; unset, the process opens the same sockets as
before; every suite green.

---

### Phase 6 — `packages/api-server`, and one namespace for streams (no behaviour change)

**Goal.** Everything a stream process needs from the web app's oRPC layer is importable by a second
app, and every stream procedure sits under `realtime`, so one namespace is one process.

- [x] `CP6.1` **The package** — `packages/api-server`: `package.json` (tsup, the `development`
  export condition, dependencies composition, contracts, errors, observability, `@orpc/server`),
  `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `src/{index.ts, import.ts,
  orpc/{index.ts, base.ts, error.interceptor.ts, realtime.router.ts}}` moved with `git mv` from
  `apps/web/src/server/orpc/`; the matching specs move to `tests/orpc/`. `orpc/` is a vendor
  folder, as in `infrastructure`. **Docs:** `packages/api-server/docs/{index.md, meta.json,
  reference/}` per `docs/ai/skills/add-docs.md`.
  done: 2026-09-26. The folder is `router/`, not `orpc/`: a vendor folder is `infrastructure`'s axis only, so `router/` is a new row in `docs/opinions/folders.md`. `zod` and `@orpc/contract` are dependencies too — the emitted `.d.ts` imports them, and without them `authed`'s inputs typed as `unknown` in `apps/web`.
- [x] `CP6.2` **The contract move** — `RealtimeProcedures.conversation` takes the conversation id
  input; `MessageProcedures.stream` goes; the permission line moves to `realtime.permissions.ts`
  as `"realtime.conversation": "messaging.conversation.read"`; `MessageRouter.stream` becomes
  `RealtimeRouter.conversation`; `use-conversation-stream.ts` calls `client.realtime.conversation`.
  Check `realtime.procedures.ts` importing the conversation contract closes no barrel cycle.
  done: 2026-09-26
- [x] `CP6.3` **Web imports it** — `apps/web/src/server/import.ts` re-exports `authed` and
  `RealtimeRouter` from `@loadbearing/api-server`; each router imports `authed` from there.
  done: 2026-09-26
- [x] `CP6.4` **The guards and the record** — Biome server-only list gains the package; commitlint
  scope `api-server`; `docs/opinions/dependencies.md` records decision 2 in its Tier 3 row and the
  `pnpm-workspace.yaml` catalog comment follows; the layering diagram in
  `docs/ai/rules/layering.md` and its opinions page (§12); every doc path that moved (§15);
  `docs/ai/skills/add-slice.md` (where `authed` comes from); `docs/setup/24-web-app.md`,
  `docs/setup/28-folder-structure.md`.
  done: 2026-09-26

**Exit.** The full build, typecheck, lint, tests and `check:architecture` 29/29; `boot-smoke web`
passes; both streams work in two tabs exactly as before.

---

### Phase 7 — `apps/realtime`, and web stops serving streams

**Depends on:** Phase 1 Exit and Phase 6 Exit.

**Goal.** Every open stream is held by `apps/realtime`. The web process holds none, and a thousand
open tabs or a reconnect wave after a deploy does not move its latency.

**Design in one paragraph.** The app is `apps/worker`'s shape with an HTTP listener instead of
consumers: `main.ts` builds the Container (with auth — it resolves principals) and a
`RealtimeBootstrap`, which starts a Node `http` server whose `StreamListener` sends
`/api/realtime/*` to `@orpc/server/node`'s `RPCHandler` over `{ realtime: RealtimeRouter.all }`
and answers `GET /healthz`. On SIGTERM it stops accepting, asks the subscriber to **drain** —
end every stream normally at a random point inside a window — so clients reopen through the proxy
to another replica, spread out, then disposes. The browser's `RPCLink` sends any `realtime.*` path
to `/api/realtime` and everything else to `/api/rpc`; Vite proxies the first in development.

- [x] `CP7.1` **The app** — `apps/realtime/{package.json, tsconfig.json, tsconfig.test.json,
  vitest.config.ts}`; `src/{main.ts, env.ts, import.ts}`, `src/server/{index.ts,
  stream-listener.ts}`, `src/bootstrap/{index.ts, realtime-bootstrap.ts}`; `tests/`; `docs/`.
  `package.json` scripts mirror the worker's (`dev` with `tsx watch --env-file-if-exists`, `build`,
  `start`, `typecheck` over tests, `test`). **Docs:** `apps/realtime/docs/index.md` (§13).
  done: 2026-09-26
- [x] `CP7.2` **`env.ts`** — the one `process.env` reader: what `ContainerConfig` requires,
  including the full `AUTH_*` set (**`AUTH_SECRET` and the cookie-cache settings must equal web's**,
  or every stream is `UNAUTHORIZED`), `REALTIME_PORT`, `REALTIME_MAX_STREAMS_PER_USER`,
  `REALTIME_STREAM_MAX_AGE_SECONDS`, `REALTIME_SHUTDOWN_TIMEOUT_MS`, `DATABASE_POOL_MAX` default 5,
  `APP` default `realtime`, and `shardsFromEnv` copied verbatim (added to `SHARD_READERS`, §29).
  The two `REALTIME_*` stream keys leave web and worker. **Docs:**
  `apps/realtime/docs/reference/env.md`.
  done: 2026-09-26. Port **13001**, not 13100 — 13100 is `LOKI_PORT`, and the first boot failed on `EADDRINUSE`. The two `REALTIME_*` stream keys stay in `apps/web/src/env.ts` for now: web still mounts the stream router until `CP7.9`'s second release, and `ContainerConfig.realtime` is required.
- [x] `CP7.3` **`StreamListener`** — `/api/realtime/*` → `RPCHandler.handle(req, res, { prefix,
  context: { container, headers } })`, keep-alive 15 s; `GET /healthz` is liveness only;
  `CORSPlugin` over `trustedOrigins` with credentials and `last-event-id`, for the desktop shell.
  Confirm under a 30-minute stream that Node's `http` timeouts do not cut it.
  done: 2026-09-26. Booted against the local stack: `/healthz` 200, a stream with no session 401 through the shared chain, an unmounted procedure 404. unverified: a 30-minute stream through Node's `http` timeouts, and `CORSPlugin` on an event stream from the desktop shell (no desktop app exists).
- [x] `CP7.4` **Drain and the owner cap** — `RealtimeSubscriber.drain(withinMs)` on the port and
  both adapters: every live stream's deadline moves to a random point in the window and wakes, so
  generators end cleanly. `subscribe(channels, signal, { owner })` with `owner` the user channel,
  so the per-user cap counts conversation streams too. Emits `realtime.stream.drained`. **Docs:**
  `packages/infrastructure/docs/reference/realtime.md`. Closes `CR.5`.
  done: 2026-09-26
- [x] `CP7.5` **`RealtimeBootstrap.stop`** — `process.stopping`; close the server and idle sockets;
  `drain(timeout / 2)` raced against `REALTIME_SHUTDOWN_TIMEOUT_MS`; close remaining connections;
  `container.dispose()`; `process.stopped`. **Docs:** `apps/realtime/docs/reference/shutdown.md`.
  done: 2026-09-26. unverified: a real SIGTERM — on Windows it terminates rather than signals, so `boot-smoke.mjs realtime` reports it not exiting cleanly exactly as it does for the worker. CI runs on Linux.
- [x] `CP7.6` **The client routes streams** — `ApiClient.overHttp(baseUrl, auth, streamUrl =
  baseUrl)` with `url: (_, path) => path[0] === "realtime" ? streamUrl : baseUrl`, both checked by
  `assertResolvable`; `apps/web/src/endpoint.ts` gains `/api/realtime`; `router.tsx` passes it.
  **Docs:** `packages/api-client/docs/reference/transport.md`.
  done: 2026-09-26
- [x] `CP7.7` **Development routing** — `apps/web/vite.config.ts` `server.proxy` and
  `preview.proxy` send `/api/realtime` to `REALTIME_PORT`, so streams stay same-origin and the
  `SameSite=Lax` cookie rides along. Confirm the proxy streams without buffering. Root
  `dev:realtime`; `pnpm dev` picks the app up on its own.
  done: 2026-09-26. corrected: `server.proxy` never saw a request — Start's middleware answers
  every path first. It is a first-in-line Vite plugin that pipes `/api/realtime` instead.
  Verified signed in, with `curl -N`: a `member.changed` frame from the worker reached a
  stream held through the proxy on `:13000`. unverified: the same in a browser tab.
- [!] `CP7.8` **The web process shuts down cleanly** — a SIGTERM hook that disposes the
  Container, and the dev container cached on `globalThis` so a Vite SSR re-evaluation does not
  build a second. Closes `CR.34`.
  blocked, half done 2026-09-26: the dev container is cached on `globalThis`. **The SIGTERM hook is not added**: the web server is Nitro's, which runs its own graceful shutdown on SIGTERM, and a second listener that disposes the container would close the pools under requests Nitro is still finishing. The fix wants Nitro's close hook (a Nitro plugin with `nitroApp.hooks.hook('close', …)`), which is a decision about where Nitro plugins live in this app. `CR.34`'s Redis half is closed by `CP5.1`.
- [~] `CP7.9` **Web stops serving streams, in two releases** — first release: web's handler still
  mounts `realtime.*`. Second: `apps/web/src/server/orpc/handler.ts` builds its `RPCHandler`
  without the namespace; `rpc-client.ts` keeps the full router for typing, since SSR never opens a
  stream.
  first release done 2026-09-26: the web app still mounts `realtime.*` on `/api/rpc`, and the client already sends streams to `/api/realtime`. The second release — drop the namespace from `apps/web/src/server/orpc/handler.ts`, and point `apps/web/tests/smoke/stream.smoke.spec.ts` at the stream process — is a deploy later, on purpose.
- [x] `CP7.10` **The repository's guards** — commitlint scope `realtime`; `.env.example` gains
  `REALTIME_PORT`, `REALTIME_SHUTDOWN_TIMEOUT_MS` (§25); `SHARD_READERS` and the "three copies"
  wording in `check-architecture.mjs`, `docs/ai/rules/workflow.md` and `docs/setup/26`;
  `boot-smoke.mjs` gains `realtime` with a `portEnv` field; `.github/workflows/ci.yml` builds it
  and runs its boot smoke; the stream smoke spec spawns the realtime `dist` and dials
  `REALTIME_PORT`.
  done: 2026-09-26, except the stream smoke spec, which moves with `CP7.9`'s second release.
- [x] `CP7.11` **Docs** — `AGENTS.md` (three processes); `docs/ai/rules/workflow.md` (`pnpm dev`
  runs three apps); `.env.example`'s `APP` note; `docs/infra/deployment.md`: a `realtime` service,
  the Caddy rule `handle /api/realtime/* { reverse_proxy realtime:13100 { flush_interval -1 } }`
  placed before web, nginx's `proxy_buffering off`, and the SIGTERM grace; the realtime pages under
  `packages/query/docs` and `apps/worker/docs/reference/subscribers.md`. Closes the rest of `CR.48`.
  done: 2026-09-26

**Exit.** `pnpm dev` runs three processes. In two tabs, stream requests go to `/api/realtime/...`,
`realtime.stream.opened` is logged only by the realtime process, and sending, the bell and Mailpit
work as before. Stopping the realtime process: streams end within the window, clients back off, and
they reconnect when it restarts; the web app keeps serving pages throughout. Open about two hundred
streams with a script: web's `/api/rpc` p95 does not move. `boot-smoke realtime` and every suite
green, `check:architecture` 29/29.

---

## Verification — the whole plan

```bash
pnpm build:packages && pnpm --filter @loadbearing/web build && pnpm --filter @loadbearing/worker build
pnpm --filter @loadbearing/realtime build          # from Phase 7
pnpm check:architecture      # 29/29; no "○ skipped"
pnpm typecheck && pnpm lint && pnpm test
pnpm infra:up && pnpm db:migrate && pnpm db:seed
pnpm --filter @loadbearing/infrastructure test && pnpm smoke
node tooling/scripts/boot-smoke.mjs web && node tooling/scripts/boot-smoke.mjs worker
node tooling/scripts/boot-smoke.mjs realtime       # from Phase 7
```

Then by hand, per phase Exit line. The one check that cannot be automated: **open the app in two
browsers, send twenty messages from one, and watch the other's network panel** — one page per
second is the plan working; a request per loaded page per frame is the defect it was written for.

---

## Changelog

| Date | Who | Change |
|---|---|---|
| 2026-09-26 | @sami | Created, from `COMMUNICATION.md`'s requirement that messaging, email and notifications must not slow the app down, and the 2026-09-25 review's findings in that code. Seven phases: the client's stream lifecycle and refetch load, messaging reads, lost work and throughput in the worker, a Redis role for live frames, a new `api-server` package, and a third process that holds every stream. Phase 1 had been started before the file existed; its items are marked in progress |
| 2026-09-26 | @sami | Built, same day, unattended: every item but `CP1.9` and `CP4.9` (measurements), `CP7.8` (blocked on where a Nitro plugin lives) and `CP7.9`'s second release (a later deploy by design). Four corrections on their items: port 13001, folder `router/`, a Vite plugin instead of `server.proxy`, and `zod` + `@orpc/contract` as `api-server` dependencies. Closes, in `BACKLOG.md` §10: `CR.5`, `CR.13`, `CR.14`, `CR.19`, `CR.22`, `CR.25`, `CR.26` (hot path), `CR.27`, `CR.28`, `CR.30`, `CR.32`, `CR.36`, `CR.37`, `CR.38`, `CR.39`, `CR.40`, `CR.42`, `CR.43`, `CR.47`, `CR.49`, and part of `CR.34` and `CR.48` — to move to `archive/DONE.md` when this is committed |
