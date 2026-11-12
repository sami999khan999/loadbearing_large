---
title: Review — every defect a full read of the code found, ranked
updated: 2026-09-20
owner: sami
schema: review/v1
---

# Review

A full read of the working tree on 2026-09-20 at `d98c9f3`, hunting for errors and bugs rather
than style. Every entry was verified by reading the code and its callers; the ones marked
**runtime-proved** were also reproduced with a script against the installed dependencies.
Nothing here was fixed. Line numbers are as of that commit and drift once anything above them
moves.

**What the gates said first.** On Node 24 with a clean install, `pnpm build:packages`,
`pnpm --filter @loadbearing/web build`, `pnpm typecheck`, `pnpm lint`, `pnpm check:architecture`
(26/26), `pnpm check:contrast`, `pnpm deps:check` and `pnpm repo:check` all pass. `pnpm test`
passes in every package except `infrastructure`, whose Postgres-backed specs cannot run without
the compose stack, which this session's container could not start (no Docker daemon). So every
finding below is one that a green build does not catch, which is the point of a review.

**Not verified here.** The `infrastructure` integration specs, the `smoke` suites, and every
browser-only clause `STUCK.md` S.1 lists.

**How to read an entry.** Where, what is wrong, the concrete failure, the shape of the fix, and
what would prove it landed. Confidence is *confirmed* (read end to end, or reproduced) or
*likely* (the logic is unambiguous but the failure needs concurrency or a second node to show).

**Overlap with the existing ledgers.** R.24 is the same fact as `OPEN.md` `23.1` seen from the
other bound; R.2 is the bug behind `24.6`'s unrunnable half. Everything else is new.

---

## High — data loss, a page that crashes, or a feature that never happens

### R.1 — The nightly sweep destroys every `outbox_event` cold archive after thirty days

**Where.** `packages/infrastructure/src/pg/repository/pg-partition-archive.gateway.ts` lines
512–517 (`sweepDeleted`), 662–676 (`childrenOf` for a table with no tenant level).
Caller: `apps/worker/src/consumer/maintenance.consumer.ts` lines 282–292.

**What is wrong.** `outbox_event` has no tenant level, so its month objects are recorded in
`partition_archive` under `PartitionArchiveGateway.NO_TENANT`, the nil uuid. `sweepDeleted`
selects every row with `archived_at < now - 30d` whose `organization_id` has no `organizations`
row. No organization ever has the nil uuid, so every outbox archive older than thirty days
matches.

**Failure.** The outbox prune archives `cold/outbox_event/2026/07/00000000-…-000000000000.ndjson.gz`.
Thirty days later the `retention` job deletes the object and the index row, logging
`cold.objects.swept { reason: "tenant_deleted" }`. `retention_policy.cold_months` for
`outbox_event` is never honoured and the month is unrecoverable.

**Fix.** Exclude `NO_TENANT` rows from the sweep's predicate, or better, give the sweep a
deletion marker to key on (see R.5). **Prove.** A spec in `tests/cold/` that archives an
outbox month, ages `archived_at`, runs `sweepDeleted` and asserts the row survives. None exists
today, which is how this shipped.

**Confidence.** Confirmed.

### R.2 — Every cross-node pass runs its transaction on node 0

**Where.** `packages/composition/src/container/container.ts` lines 564–568
(`PgMaintenanceGateway` bound to `this.catalogUnitOfWork`) and 620–624 (`PgOutboxGateway`,
same). `packages/infrastructure/src/pg/transaction/pg-unit-of-work.ts` line 65: for placement
`"catalog"`, `handle()` returns `this.cluster.catalog().client` and never reads `ShardScope`.
`packages/infrastructure/src/pg/primitive/base.repository.ts` line 14: `local` is declared
compatible with an open `catalog` transaction, so `this.db` inside `run()` is node 0's client.

**What is wrong.** `Container.eachShard` sets the shard scope per node (`container.ts` line
1239), but both gateways open their transaction through a unit of work that ignores it. The
outbox drain (`apps/worker/src/consumer/outbox.consumer.ts` lines 90–102) and the monthly
runway (`maintenance.consumer.ts` line 206 onward) therefore loop the node count and hit node
0 every time.

**Failure.** With `DATABASE_SHARD_1_URL` set and a tenant on node 1: that tenant's outbox is
never drained, while `reportLag` (which runs outside a transaction and so *does* reach node 1)
logs an ever-growing `outbox.drain.lagged`. `ensureMonthlyPartitions` runs
`create table … (like activity_log_<tenant>)` on node 0 where that parent does not exist, the
`partitions` job throws on the first node-1 tenant, and node 1's inserts fail on the first of
the month. `apps/worker/docs/reference/consumers.md` lines 251–258 state the opposite. The
scripts above `src/` avoid it only by building a one-node `DatabaseCluster.single` per
iteration.

**Fix.** Bind both gateways to a `local`-placed `PgUnitOfWork`; that branch of `handle()`
already follows `shards.current()?.node`. **Prove.** The sharded smoke, once `24.1` lets a
routed write reach node 1: drain on both nodes, then assert node 1's `outbox_event` has no
`published_at is null` rows.

**Related.** `PgMaintenanceGateway` is declared `local` but `sweepExpired`
(`pg-maintenance.gateway.ts` lines 49–71) deletes from `sessions`, `verifications` and
`invitations`, three catalog tables. §22 passes because it checks the tables agree with each
other, never with the declared placement. Outside a shard scope `local` falls back to node 0,
which is the catalog, so it works today; inside a node loop it would sweep the wrong database.

**Confidence.** Confirmed by reading; manifests only with two nodes.

### R.3 — Server errors reach the browser with `context` and `fields` stripped, and three screens crash on a refusal

**Where.** `packages/errors/src/normalizer/error-normalizer.ts` lines 14–23 (`isAppError` is
structural: known `code` plus a `toJSON` function). `apps/web/src/server/orpc/error.interceptor.ts`
lines 17–20 throw `new ORPCError(code, { data: envelope })`. `packages/api-client/src/client/api-client.ts`
lines 38–48 build the `RPCLink` with no interceptor that unwraps `data`. Nothing in
`api-client`, `query`, `feature` or `apps/web` calls `AppError.from`, though
`packages/errors/docs/index.md` line 98 says the client does.

**What is wrong.** A decoded `ORPCError` has a known `code` and a `toJSON`, so `normalize()`
returns it unchanged and `.toJSON()` yields oRPC's own shape. The AppError envelope sits unread
inside `data`. **Runtime-proved** with the installed `@orpc/client@1.15.0`:

```
{"defined":false,"code":"CONFLICT","status":409,"message":"Conflict",
 "data":{"code":"CONFLICT","context":{"resource":"member","reason":"self"},"traceId":"t"}}
```

`envelope.context` is `undefined` on every server error the browser ever sees.

**Failure.** Three components dereference `envelope.context.<x>`:

- `packages/feature/src/member/member-list.tsx` lines 121–126. An owner deactivates the last
  other owner, the server answers `ConflictError("member", "lastOwner")`, and the members page
  throws `TypeError: Cannot read properties of undefined (reading 'reason')` into the error
  boundary instead of showing the last-owner sentence.
- `packages/feature/src/rbac/use-role-failure.ts` lines 30–38, reached from `RoleList`,
  `RoleMatrix` and `CreateRoleForm`. A user without `rbac.role.read` opening the roles page gets
  a blank page rather than the refusal callout. Any CONFLICT on create, rename or delete
  crashes the same way.
- `packages/feature/src/apikey/use-api-key-failure.ts` lines 20–22 and 28–32. FORBIDDEN on key
  creation crashes the form; the BAD_REQUEST branch reads `fields`, which is always `undefined`.

Everywhere else `useErrorMessage().fields` is always `[]` for a server validation error, so
no field-level copy ever renders from the wire.

**Why the suite is green.** Every feature spec rejects with an `AppError` instance
(`packages/feature/tests/member/member-list.spec.tsx` line 46), never the decoded wire shape.

**Fix.** An `RPCLink` client interceptor in `api-client` that rethrows
`AppError.from(error.data)` when `data.code` is known, or the same unwrap inside
`ErrorNormalizer`. **Prove.** One feature spec per crash site whose mock rejects with a real
`ORPCError` carrying the envelope in `data`.

**Confidence.** Confirmed, runtime-proved.

### R.4 — The default email mode is `digest`, and the digest never selects anyone on the default

**Where.** `packages/application/src/notification/notification.policy.ts` lines 53 and 71
(`member.joined` and `message.sent` default `email: "digest"`).
`packages/application/src/notification/deliver-notification.use-case.ts` lines 176–178 skip
anything that is not `immediate`.
`packages/application/src/notification/send-notification-digest.use-case.ts` line 40 asks
`preferences.digestRecipients(...)`, whose Pg implementation
(`packages/infrastructure/src/pg/repository/pg-notification-preference.repository.ts` lines
107–127) selects only **stored** rows with `mode = 'digest'`; `organizationsWithDigest` (lines
96–103) likewise.

**Failure.** A fresh tenant where nobody has opened the preferences page. A member joins or a
message arrives: the row is written, the in-app frame is sent, the email is skipped because the
mode is `digest`, and the nightly digest never selects the user because there is no stored row.
No email, ever, for every user on defaults. Only a user who explicitly saved `digest` gets one.

**Fix.** The digest query has to union the policy defaults: every member of the tenant with
unread rows in a category whose default is `digest` and no stored row saying otherwise.
**Prove.** A spec for `SendNotificationDigestUseCase` with an in-memory preference repository
holding no rows and one unread notification, asserting one mail is published.

**Confidence.** Confirmed. No spec covers the default-mode path of the digest job.

---

## Medium — wrong data, a promise the code does not keep, or a user with no way out

### R.5 — The thirty-day recovery window after a tenant delete covers only the months archived during the delete

**Where.** `pg-partition-archive.gateway.ts` lines 512–517 (`sweepDeleted` keys on
`archived_at`), 255–269 (`record`'s `onConflictDoUpdate` does not refresh `archived_at`).
`packages/application/src/platform/delete-organization.use-case.ts` lines 478–493
(`archiveEverything`).

**What is wrong.** `docs/ai/rules/data.md` and `docs/reference/cold-storage.md` promise thirty
days *after deletion*. The predicate is on the archive time, and nothing records the deletion
time, because the `organizations` row is simply gone.

**Failure.** A tenant with twelve months already cold is deleted on day D. At 03:30 on D+1 the
`retention` job deletes all twelve objects and rows. Only the current and previous month, which
`archiveEverything` re-archived at delete time, live thirty days.

**Fix.** A tombstone: stamp a `deleted_at` onto the tenant's `partition_archive` rows in
`DeleteOrganizationUseCase`, and sweep on that column. It also closes R.1 cleanly. **Prove.**
The same `tests/cold/` spec as R.1, with a year-old `archived_at` and a fresh delete.

**Confidence.** Confirmed.

### R.6 — `coldMode: "drop"` ignores per-tenant retention overrides

**Where.** `apps/worker/src/consumer/maintenance.consumer.ts` lines 403–412: the `drop`
branch calls `dropMonthlyPartitionsBefore(table, null, cutoff)` with the table's default cutoff
and returns before line 416 reads `tenantRetentionPolicies.forTable(table)`.
`packages/application/src/platform/update-retention-policy.use-case.ts` accepts `drop` for
any allowlisted table; `update-tenant-retention.use-case.ts` accepts an override for any
tenant-partitioned table. Nothing prevents both on `activity_log`.

**Failure.** Platform sets `activity_log` to `{ hotMonths: 13, coldMode: "drop" }`; tenant T
overrides `hotMonths: 36`. The monthly pass drops T's month 14 outright: no object, no index
row, unrecoverable. The same override is honoured under `archive`.

**Fix.** Read the overrides before branching on mode, and walk tenants for `drop` as
`pruneByTenant` already does for `archive`. **Prove.** A consumer spec with one override and
`drop`, asserting the overridden tenant's partition survives.

**Confidence.** Confirmed.

### R.7 — The outbox drain runs *behind* every `deliver` job, the opposite of what its priority says

**Where.** `apps/worker/src/schedule/outbox-drain.schedule.ts` line 29 sets `priority: 1` on
the repeatable `drain`. `deliver` jobs (`apps/worker/src/consumer/outbox.consumer.ts` lines
115–126) are published with no priority. Both are on `QueueName.EVENT`.

**What is wrong.** In BullMQ 5.81.3 `moveToActive-11.lua` (lines 74–86) pops the wait list
first and consults the prioritized set only when the wait list is empty. A job with no priority
sits in the wait list; a job with any priority sits in the prioritized set. So every
unprioritized `deliver` runs before the prioritized `drain`.

**Failure.** One drain fans out three hundred deliveries, or a failing subscriber keeps
re-entering `wait` for five attempts with backoff. With `WORKER_EVENT_CONCURRENCY=8` the next
drain waits until the wait list is empty. Commits made meanwhile sit unpublished, which is
exactly the starvation the comment above the option says it prevents, and
`apps/worker/docs/reference/consumers.md` line 218 repeats.

**Fix.** Give `deliver` a priority higher in number than `drain`'s, or drop the priority from
both and rely on the one-second repeat. **Prove.** A BullMQ spec that enqueues ten `deliver`
jobs and one `drain`, with concurrency 1, and asserts the order of the `active` events.

**Confidence.** Confirmed.

### R.8 — `cold-restore` and `tenant-export` never place a shard, so they always read node 0

**Where.** `apps/worker/src/consumer/maintenance.consumer.ts` lines 120–167 (`restore`) and
171–185 (`export`). Neither wraps its work in `withShard`. Both gateways are `local`, and
`BaseRepository.pool()` (`base.repository.ts` line 73) falls back to `shards.current()?.node ?? 0`.

**Failure.** A platform admin exports tenant T, placed on node 1. `exportTenant`
(`pg-partition-archive.gateway.ts` lines 341–360) selects from node 0's tenant tables, finds
zero rows, `exportTable` deletes the empty object and returns `null`, and the manifest holds
only catalog tables while `cold.tenant.exported` logs `rows: 0`. A restore of T's month creates
the scratch table on node 0 and attaches it to node 0's parent, never reaching T's data.

**Fix.** Resolve the tenant's placement and run both inside `withShard`, as the projection does.
**Prove.** The sharded smoke, exporting a node-1 tenant and asserting a non-zero row count.

**Confidence.** Confirmed by reading; latent on one node.

### R.9 — The SSR session ignores a deactivated membership, and the shell then retries the stream forever

**Where.** `apps/web/src/server/session.fn.ts` lines 28–36 check only that
`activeOrganizationId` is present. `packages/auth/src/principal/principal.builder.ts` line 27
returns `null` when `memberships.isActive(userId, organizationId)` is false. The docs say the
two paths must agree.

**Failure.** An admin deactivates member M while M holds a valid session on that tenant. M's
next navigation: `fetchSession` returns a user, `RouteGuard.requireSession()` passes, the
`_authenticated` shell renders, `RealtimeProvider` opens `realtime.stream` with
`retry: Infinity`, `principalMiddleware` answers UNAUTHORIZED, and `ClientRetryPlugin`
reconnects every two seconds indefinitely. Every loader that prefetches throws UNAUTHORIZED
into the root error boundary. M is never sent to `/sign-in` and has no way out but the sign-out
button.

**Fix.** Add `container.memberships.isActive(...)` to the `Promise.all` in `fetchSession` and
return `anonymous()` when false. **Prove.** A `session.fn` spec with a deactivated membership
asserting the anonymous shape.

**Confidence.** Confirmed.

### R.10 — An error thrown inside a streaming handler bypasses the error interceptor

**Where.** `apps/web/src/server/orpc/base.ts` lines 86–117 (`errorMiddleware`).
`apps/web/src/server/orpc/message.router.ts` lines 33–39: the handler is an
`async function*`, and `getConversation.execute` is awaited inside it.
`apps/web/src/server/orpc/realtime.router.ts` line 13 and
`packages/infrastructure/src/redis/redis-realtime.subscriber.ts` lines 42 and 95
(`assertUnderCap` throws `RateLimitedError`, also from inside the generator).

**What is wrong.** For a generator handler, `next()` resolves as soon as the generator object
exists; the body runs on the first pull, after `errorMiddleware` has returned and logged
`http.request.completed` with status 200. Anything thrown there never reaches
`ErrorInterceptor.toTransport`, `log.failure` is never called, and oRPC's `toORPCError` turns
a non-`ORPCError` into an opaque `INTERNAL_SERVER_ERROR` event on the stream. The comment at
line 32 says membership is asserted "before the subscription"; it is before the Redis
subscribe, not before the middleware returns.

**Failure.** A non-member opens `/messages/<id>` of someone else's conversation.
`useConversationStream` (`packages/query/src/messaging/use-conversation-stream.ts` lines 36–39)
opens with `retry: Infinity`; the server throws FORBIDDEN inside the iterator; the client sees
INTERNAL_SERVER_ERROR, which `useErrorMessage` cannot name, and reconnects every two seconds,
each attempt costing a query, logged nowhere. The ninth tab past `REALTIME_MAX_STREAMS_PER_USER`
loops the same way.

**Fix.** Run the membership assertion and the cap check before returning the iterator (a
middleware, or an async handler that awaits the checks and then returns the generator), or wrap
the iterator's `next` in `errorMiddleware` the way `shardMiddleware` wraps scope. **Prove.** A
router spec that opens the stream as a non-member and asserts a FORBIDDEN frame and one
`http.request.failed` line.

**Confidence.** Confirmed; the client-visible code is likely.

### R.11 — The conversation list truncates when a page ends on a conversation with no messages

**Where.** `packages/infrastructure/src/pg/repository/pg-conversation.repository.ts` lines
77–93. `ORDER BY last_message_at DESC, id DESC` puts NULL `last_message_at` first in Postgres,
and `nextCursor` is emitted only when `last?.lastMessageAt` is non-null.

**Failure.** A user in sixty conversations, fifty-five of them freshly created with no message,
`limit: 50`. Page one is fifty empty conversations with `nextCursor: null`. The other five, and
every conversation that actually has messages, are unreachable from the list. The spec
(`tests/messaging/pg-conversation.repository.spec.ts` line 157) touches every conversation
before paging, so the null case is never exercised. Once a cursor is issued from a non-null
row, `(NULL, id) < ($at, $id)` is NULL, so the scheme cannot represent a position inside the
null run at all.

**Fix.** Sort on `coalesce(last_message_at, created_at)` and cursor on the same expression, and
keep `conversations_recent_idx` in step. **Prove.** The pagination spec with one untouched
conversation at the page boundary.

**Confidence.** Confirmed.

### R.12 — Notification and digest emails link to relative URLs

**Where.** `notification.policy.ts` lines 54, 63 and 72–73 produce `/settings/members` and
`/messages/<id>`; `deliver-notification.use-case.ts` line 184 passes `row.link(event)` as
`url`; `send-notification-digest.use-case.ts` line 79 passes `"/notifications"`.
`packages/composition/src/mail/content-mail.renderer.ts` lines 103 and 130 write `params.url`
straight into the `href` and the text part. Only `queued-invitation.mailer.ts` line 24 prefixes
`config.email.baseUrl`.

**Failure.** Every `notification.single` and `notification.digest` mail carries
`href="/settings/members"`, which resolves to nothing in a mail client.

**Fix.** Prefix `config.email.baseUrl` where the invitation mailer does, in one place the two
notification mailers share. **Prove.** A renderer spec asserting an absolute `href`.

**Confidence.** Confirmed.

### R.13 — The digest footer names the organization by its UUID

**Where.** `send-notification-digest.use-case.ts` line 78: `organization: input.organizationId`.
The copy (`packages/content/src/message/en/email.ts` line 10) reads "You are receiving this
because you belong to {organization}."

**Failure.** Every digest ends "…because you belong to 018f8c00-0000-7000-…".

**Fix.** Resolve the organization name through the reader the use-case already has, or pass it
in from the consumer. **Prove.** A use-case spec asserting the published param.

**Confidence.** Confirmed.

### R.14 — The preferences screen shows `off / off` as the membership default

**Where.** `packages/application/src/notification/get-notification-preferences.use-case.ts`
lines 28–41 take the **first** policy row per category as the category's default.
`NotificationPolicy.events()` yields `member.invited` first, whose row (`notification.policy.ts`
lines 40–46) is `off / off` because its recipients are `none`.

**Failure.** A user with no stored rows opens preferences and sees membership as
`in_app: off, email: off`, while delivery actually uses `member.joined` (immediate / digest) and
`member.role.changed` (immediate / immediate). The spec
(`tests/notification/notification-preferences.use-case.spec.ts` line 71) asserts only
`mode !== undefined`.

**Fix.** Derive the category default from the rows that have recipients, or declare the default
on the category rather than the row. **Prove.** The spec asserting the membership default is
`immediate`.

**Confidence.** Confirmed.

### R.15 — Saving a retention row rewrites the ClickHouse TTL without its per-action clauses

**Where.** `packages/application/src/platform/update-retention-policy.use-case.ts` line 82
calls `projector.applyRetention(RetentionRules.clickhouseTtlFor(input.hotMonths))`, the base
clause only, with no compare-before-write. `list-retention-policies.use-case.ts` line 93
computes `expected` the same way. `update-projection-policy.use-case.ts` lines 70–77 and the
nightly job (`maintenance.consumer.ts` lines 246–253) use `clickhouseTtlFrom(retentionRows,
projectionRows)`, which `packages/application/docs/reference/platform.md` says is the one
composer.

**Failure.** Per-action TTLs exist. An operator saves the `clickhouse` hot-months row:
`MODIFY TTL` is issued unconditionally with the base-only expression, which materialises every
part, the per-action windows are gone until the nightly job rewrites the table again, and the
retention screen shows "applied ≠ expected" drift whenever per-action rows exist.

**Fix.** Both call sites compose through `clickhouseTtlFrom` and compare before writing.
**Prove.** A use-case spec with one per-action row asserting the applied expression contains it.

**Confidence.** Confirmed.

### R.16 — Re-indexing a document within an hour is silently dropped

**Where.** `packages/application/src/ai/queue-document-index.use-case.ts` line 51 uses
`jobId: <org>_<documentId>`. `packages/infrastructure/src/bullmq/bullmq-queue.publisher.ts`
line 24 keeps completed jobs for 3 600 s, and BullMQ returns the existing job for a duplicate
id without error. The contract (`packages/contracts/src/document/document.contract.ts` lines
21–23) says supplying `documentId` "re-indexes a document in place".

**Failure.** Index `d1` with text A. Twenty minutes later index `d1` with text B: the use-case
returns success, no job is enqueued, the chunks still hold text A.

**Fix.** Append a content hash or a version to the job id, or drop the dedupe for re-index.
**Prove.** A publisher spec enqueuing the same document twice and asserting two jobs.

**Confidence.** Confirmed.

### R.17 — A conversation can hold users who are not members of the organization

**Where.** `packages/application/src/messaging/add-conversation-member.use-case.ts` lines
23–31 and `create-conversation.use-case.ts` lines 47–59 write `input.userId` / `memberIds`
with no membership check. The only constraint is `conversation_members.user_id → users.id`
(`packages/infrastructure/src/pg/schema/messaging.schema.ts` lines 68–71), not memberships.

**Failure.** A `messaging.conversation.manage` holder in org A adds the id of a user who exists
only in org B. The row is written, they appear in the member list, and `memberIds()` fans
frames to `org:A:user:X`. It is also an existence oracle: a real user id succeeds, a random one
fails the foreign key with a 500. The recipient reader joins memberships, so no cross-tenant
email results.

**Fix.** Assert `memberships.isActive` for every added user, inside the tenant. **Prove.** A
use-case spec adding a non-member and asserting `NotFoundError`.

**Confidence.** Confirmed.

### R.18 — Six messaging use-cases publish outbox events outside any transaction

**Where.** `packages/application/src/messaging/` — `edit-message.use-case.ts` lines 35–51,
`delete-message.use-case.ts` 35–49, `add-conversation-member.use-case.ts` 26–36,
`remove-conversation-member.use-case.ts` 32–37, `rename-conversation.use-case.ts` 23–28,
`leave-conversation.use-case.ts` 32–37. None takes a `UnitOfWork`; the port
(`port/domain-event.publisher.ts` lines 7–8) and `docs/ai/rules/data.md` require the outbox
row in-transaction. `PgOutboxPublisher.publish` writes through `this.db`, which is autocommit
when nothing is open.

**Failure.** `messages.edit` commits, then the `outbox_event` insert fails on a pool timeout.
The edit exists, no `message.edited` event, no realtime frame for the other members, no durable
path. The inverse of what `create-conversation` and `send-message` guard against.

**Fix.** Inject the routed unit of work and wrap write plus publish, as `send-message` does.
**Prove.** Each spec asserting the fake unit of work saw one `run`.

**Confidence.** Confirmed.

### R.19 — Last-owner protection is check-then-act outside the transaction

**Where.** `packages/application/src/member/change-member-role.use-case.ts` lines 45–47 call
`assertNotLastOwner` before `unitOfWork.run` at line 49; `set-member-active.use-case.ts` lines
38 and 53–56 do the same. No lock.

**Failure.** Two owners. Two admins demote (or deactivate) one owner each at the same moment;
both count two, both commit, zero active owners, which the code says "cannot be recovered from
inside the product".

**Fix.** Count inside the transaction under `select … for update` on the tenant's owner rows, or
a per-tenant advisory lock as the invitation claimer uses. **Prove.** Two concurrent executions
in the Pg spec, one of which must throw `lastOwner`.

**Confidence.** Likely; needs concurrency, but the logic is unambiguous.

### R.20 — Tenant delete never sweeps `tenant_retention_policy`

**Where.** `packages/application/src/platform/delete-organization.use-case.ts` lines 70–82.
`TenantRetentionPolicyRepository.deleteFor` (`tenant-retention-policy.repository.ts` lines
27–29, "for the delete path") has no caller anywhere under `packages/` or `apps/`. The schema
(`packages/infrastructure/src/pg/schema/platform.schema.ts` lines 91–93) deliberately has no
foreign key and says "swept by the delete path rather than cascaded".

**Failure.** Delete a tenant with overrides: the rows remain forever, and `forTable()` keeps
returning the dead tenant to the prune pass.

**Fix.** Call `deleteFor` inside the delete transaction. **Prove.** The delete spec asserting
the in-memory repository is empty afterwards.

**Confidence.** Confirmed.

### R.21 — The realtime stream stays subscribed to the previous tenant after an organization switch

**Where.** `packages/query/src/realtime/realtime.context.tsx` lines 38–81 open the stream once
per `client` identity. The browser `ApiClient` is a router-level singleton
(`apps/web/src/router.tsx` line 31). The server binds the channel to `principal.organizationId`
at open time (`apps/web/src/server/orpc/realtime.router.ts` lines 17–20). `refreshSession`
(`apps/web/src/route/-session.ts` line 26) clears the query cache and re-runs loaders but
neither remounts `RealtimeProvider` nor changes `client`.

**Failure.** Switch from org A to org B. B's `member.changed`, `notification.created` and
`message.sent` never arrive, so the bell count and lists go stale until the thirty-second
backstop or a reload, while A's frames keep triggering refetches.

**Fix.** Key `RealtimeProvider` on the active organization id so the switch remounts it.
**Prove.** A provider spec that changes the key and asserts a second `stream` call.

**Confidence.** Likely.

### R.22 — The notification inbox traps the user in "unread only"

**Where.** `packages/feature/src/notification/notification.list.tsx` lines 100–106: with
`unreadOnly` on and no rows, the component returns only `<EmptyState>`; the toggle at line 110
is not rendered.

**Failure.** Click "Unread only" with nothing unread. The empty state shows and there is no
control to return to the full list short of a reload.

**Fix.** Render the toggle above the empty state too. **Prove.** A component spec toggling with
zero unread rows and asserting the button is still present.

**Confidence.** Confirmed.

---

## Low — a wrong edge, a wrong number, or a promise in a doc the code does not keep

### R.23 — SIGTERM is ignored while boot is hung

`apps/worker/src/main.ts` lines 33–47: the handler is `started.then(() => bootstrap.stop())`.
`start()` awaits `PartitionsSchedule.runOnce()` and seven `queue.add` calls on an ioredis client
with `maxRetriesPerRequest: null`, which block indefinitely while the queue Redis is
unreachable. A rollout with the wrong `REDIS_QUEUE_URL` cannot be rolled back with SIGTERM;
nothing logs `process.stopping` and the pod lives until the kill grace period. Race `started`
against a hard exit on a boot-phase signal. Confirmed.

### R.24 — The `deliver` de-duplication window is "the last thousand completions", not twenty-four hours

`bullmq-queue.publisher.ts` line 24 always sets `removeOnComplete: { age, count: 1_000 }`;
`outbox.consumer.ts` line 124 raises only `age`. BullMQ prunes on whichever bound is hit first,
so after a thousand deliveries the older ids are gone and a re-publish of the same
`<subscriber>_<eventId>` is accepted. `consumers.md` lines 207–211 call the 24 h window "the
guarantee". The same bound applies to `digest_<org>_<day>`. `OPEN.md` `23.1` records the
other side of this: the window is shorter than the doc says either way. Confirmed.

### R.25 — The projection checkpoint can permanently skip a row that commits late

`apps/worker/src/consumer/analytics.consumer.ts` lines 262–302 advance on `(occurred_at, id)`
of the last row read; `pg-activity-replay.reader.ts` lines 39–48 has no settle lag.
`occurred_at` is `clock.now()` at record time inside the use-case's transaction. A transaction
that records at 12:00:00.100 and commits at 12:00:00.900, read by a projection at 12:00:00.500
whose last row is 12:00:00.400, is never projected; `reconcile` reports the drift and nothing
self-heals. An `occurred_at < now() - interval` guard on the read is the usual shape. Likely.

### R.26 — `/platform/analytics` prefetches a query gated by a different permission than the route

`apps/web/src/route/(app)/_authenticated/platform/analytics.tsx` line 21 requires
`platform.analytics.read`; line 28 prefetches `PlatformQueries.retention`, which is
`platform.listRetention`, gated on `platform.retention.read`
(`packages/contracts/src/catalog/platform.permissions.ts` line 9); line 40 reads it again
unconditionally. A role with analytics but not retention gets the whole page as the root error
boundary instead of the panels it may see. Likely.

### R.27 — CORS omits `last-event-id`, so a cross-origin stream can never resume

`apps/web/src/server/cors.ts` line 20 allows `content-type,authorization,x-api-key`. The oRPC
client sends `last-event-id` on every reconnect and it is not a safelisted header. From the
Tauri origin in `AUTH_TRUSTED_ORIGINS`, a dropped stream fails preflight on every retry,
forever, and the resume-with-resync path `server-functions.md` documents cannot work. The
same-origin web app is unaffected. Confirmed by reading.

### R.28 — `redis-cache` sets an eviction policy but no `maxmemory`, so it never evicts

`infra/docker-compose.yml` line 143: `--maxmemory-policy allkeys-lru` with no `--maxmemory`
(default 0, unlimited) is never applied. The instance grows until the container is OOM-killed,
losing every session and capability entry at once, the opposite of what `.env.example` lines
27–28 promise. The queue instance is right: `appendonly yes`, `noeviction`, a volume. Confirmed.

### R.29 — `.env.example` ships an `AUTH_SECRET` placeholder that passes the only check

`.env.example` line 57 is 46 characters; `apps/web/src/env.ts` lines 37–39 check
`z.string().min(32)`. A `.env` copied from the example boots and signs cookies with a public
value. Shorten the placeholder below 32, or refine against it. Confirmed.

### R.30 — The env reference names a variable nothing reads

`apps/web/docs/reference/env.md` line 28 says `AUTH_BOOTSTRAP_ORGANIZATION_SLUG`; the schema
key is `BOOTSTRAP_ORGANIZATION_SLUG` (`apps/web/src/env.ts` line 61). Boot still fails loudly
naming the right key, so the cost is confusion only. Confirmed.

### R.31 — `check:architecture` §7 does not look at `apps/*`

`tooling/scripts/check-architecture.mjs` lines 299–300 iterate `packageDirs()` only, while the
rule ("`"use client"` appears only in ui, query, feature") is repo-wide and every other source
assertion uses `sourceDirs()`. A `"use client"` in `apps/web/src/**` passes. Confirmed.

### R.32 — A `documentId` containing `:` becomes a 500

`queue-document-index.use-case.ts` line 51 puts the caller's `documentId`
(`z.string().min(1).max(200)`) into the job id; BullMQ throws `Custom Id cannot contain :`.
Input `doc:1` is INTERNAL instead of BAD_REQUEST. Confirmed.

### R.33 — Validation rules emitted with no copy behind them

Rules `unknown` (`rbac/role.rules.ts` line 41, `apikey/api-key.rules.ts` line 38, several
platform use-cases), `past` (`create-api-key.use-case.ts` line 41), `format`, `range` and `min`
are absent from `FIELD_RULE_COPY` (`packages/content/src/message/error-copy.ts` lines 22–27)
and fall back to `error.unexpected`. Granting an unknown permission or entering a past expiry
shows "Something went wrong" rather than the field message. Confirmed.

### R.34 — Grant and revoke permission are a read-modify-write race

`grant-permission.use-case.ts` lines 34–46 and `revoke-permission.use-case.ts` lines 24–43
read `role.permissions`, build a new list and `save`, which reconciles to the list. Two
concurrent grants of `a` and `b` lose one. Likely.

### R.35 — A stale allowlist in the procedure-coverage spec

`packages/contracts/tests/registry/procedure-permissions.spec.ts` lines 53–59 list
`platform.analytics.read`, `platform.analytics.manage`, `platform.storage.read` and
`platform.tenant.manage` as "awaiting a procedure"; all four are gated in
`catalog/platform.permissions.ts`. The comment says the list "only shrinks"; as written the
test would not notice those keys losing their procedures. Confirmed.

### R.36 — An in-flight duplicate send writes two rows

`send-message.use-case.ts` lines 61–74: a retry arriving while the first attempt is still
inside its transaction finds the claim held but `findById` null (uncommitted), takes over the
claim and writes a second message. The doc covers "rolled back", not "still running". Likely.

### R.37 — A `scope: "goal"` role can be assigned as an organization membership role

`change-member-role.use-case.ts` lines 39–40 and `invite-member.use-case.ts` lines 43–44 check
only that the role belongs to the tenant. `PgCapabilityRepository.resolveFor` (lines 48–58)
turns any membership role's permissions into org-level grants regardless of `roles.scope`. No
goal-scoped keys ship today. Likely.

### R.38 — The digest includes categories the user did not set to digest

`send-notification-digest.use-case.ts` lines 61–66 list unread rows across every category for
anyone with a `digest` row on *any* category. A user with `membership: immediate` and
`messaging: digest` receives the membership items twice. Confirmed.

### R.39 — The archive's only pre-drop verification is a `HEAD`

`packages/infrastructure/src/s3/s3-storage.gateway.ts` lines 116–123; used at
`pg-partition-archive.gateway.ts` lines 224–227, whose own comment says "A `HEAD` is not
enough". `putStream` sends no whole-object checksum. A truncated object is first detected by
`S3ColdArchiveReader.rows` after the drop. Documented as "verified before drop"; it is
existence only. Confirmed.

### R.40 — Tenant export loses `role_permissions` rows past five thousand

`pg-partition-archive.gateway.ts` line 62 keys the table's export on `permission`, which is not
unique within a tenant (the primary key is `(organization_id, role_id, permission)`), and the
keyset has no tie-break. A page boundary inside a run of equal values skips the rest of the
run. The comment at line 424 ("every table here has a unique one within the tenant") is false
for this table. Confirmed.

### R.41 — `PgShardAssignmentRepository.all` uses the numeric offset as a text keyset cursor

`pg-shard-assignment.repository.ts` lines 65–82: `after = String(page.offset)` then
`gt(shardAssignments.shardKey, after)`, so page two is every key text-greater than `"25"`. No
caller today; the move job is not registered. Confirmed.

### R.42 — A malformed keyset cursor becomes a Postgres `22P02`

`packages/infrastructure/src/pg/primitive/keyset-cursor.ts` lines 14–23 validate the timestamp
but not `id`; every consumer casts `${after.id}::uuid`. A cursor
`base64url("2026-01-01T00:00:00.000Z|x")` passes `decode` and fails as a 500, not the
`ValidationError` the comment promises. Confirmed.

### R.43 — `PgTenantStorageReader.byTenant` offset-pages over an unstable order

`packages/infrastructure/src/pg/repository/pg-tenant-storage.reader.ts` lines 31–46:
`ORDER BY sum(bytes) DESC` with no tie-break under `LIMIT/OFFSET`. Equal totals can appear on
two pages or on neither. Confirmed.

### R.44 — A dead "Move" control on the shard map

`packages/feature/src/platform/shard-map.panel.tsx` lines 149–151: the button has
`disabled={moves === "unavailable"}` and no `onClick`. When the server reports moves available
it renders live and does nothing. Confirmed.

### R.45 — Three specs whose assertion does not check what their name claims

- `packages/query/tests/runtime/use-app-mutation.spec.tsx` lines 164–187, "cancels queries on
  the key before it writes", asserts only that `seen` contains `"success"`; `cancelQueries` is
  never observed.
- `packages/query/tests/realtime/realtime.context.spec.tsx` lines 87–95, "stays mounted and
  disconnected when the stream cannot open", asserts `"off"`, which is the initial state before
  the effect runs.
- No spec in `feature` or `api-client` feeds a decoded `ORPCError`, which is why R.3 shipped.

Confirmed.

---

## The gaps in the suite that let the high ones through

| Finding | The spec that would have caught it, and does not exist |
|---|---|
| R.1, R.5 | any spec for `sweepDeleted` under `tests/cold/` |
| R.2 | a two-node drain in the sharded smoke, gated on `24.1` |
| R.3 | a feature spec whose mock rejects with the wire shape rather than an `AppError` |
| R.4 | a digest spec with no stored preference rows |
| R.11 | the pagination spec with one untouched conversation |
| R.14 | the preferences spec asserting a value, not `!== undefined` |

---

## Covered and found clean

Read in full and found nothing to report: `packages/errors`, `packages/core`,
`packages/permissions`, `packages/contracts` source, `packages/observability`,
`packages/ui`, `packages/content`, `packages/asset`. The auth chain (api-key hashing and
constant-time compare, expiry and revocation, deactivated members resolving empty, invitation
claim under an advisory lock, cookie flags, trusted origins). Interceptor order and the error
envelope on non-stream procedures. Mail escaping and dedupe keys. The two Redis roles, worker
lifecycle and shutdown, `process.env` confined to `env.ts`. The outbox claim-relay-mark
transaction, the archive detach-stream-record-verify-drop order, the ClickHouse idempotent
projection, schema-versus-migration drift, zod enums against DB enums. Every repository
predicate carrying `organization_id`, every `inArray` guarded. Query keys, invalidation and
optimistic shapes, effect cleanup, guard keys, i18n key parity across `en` and `bn` (449 each,
placeholders identical), no literal colour outside `packages/ui/src/theme/color/`. Every route
guard, redirect validation, the server-only import boundary, hydration, search-param
validation, and the compose, pgbouncer, Loki and Alloy configuration.
