---
title: Backlog — closed
updated: 2026-09-26
owner: sami
schema: backlog/v1
source: split out of plans/BACKLOG.md on 2026-09-22
---

# Backlog — closed

Every entry `plans/BACKLOG.md` has ticked, with the proof it was ticked on, and that file's
changelog. **Eighty-four closed entries against nineteen open ones** is a ledger you scroll past
four-fifths of to reach the work, which is a ledger nobody opens. So the halves were split.

**This file is appended to, and in that it is unlike everything else in `archive/`.** The plans
beside it are frozen records of what was believed on one day and are never edited. This is the
other half of a live ledger: when something in `BACKLOG.md` closes, its entry moves here, keeping
its ID and its proof.

Nothing was rewritten in the move. IDs are unchanged — `R.7`, `23.15`, `S.1`, `T-037` all still
resolve — and every pointer into `archive/PLAN.md` and the rest still points where it did.

## 1. `archive/PLAN.md` — Phase 23, closed

- [x] `23.14` **An analytics reader, with the first dashboard** `done: 2026-09-25` — **decided
  with the user the same day**: the first dashboard is *activity over time*, and it was built
  against seeded data rather than waiting days for real traffic. `/analytics` shows a tenant's
  events per UTC day and per action over the last 30 or 90 days, gated on a new org-scoped
  `analytics.activity.read`. `owner` and `admin` hold it: the seed grants it, and migration
  `0039` backfilled 74 of each. The four carried decisions hold, as built. `AnalyticsReader` is a
  new port in `application/src/analytics/` with no write method. `GetActivityTrendUseCase` hands
  it the principal's tenant. The days are ISO strings. `ClickHouseAnalyticsReader` reads
  `FINAL`. Without ClickHouse the answer is `configured: false`, and the screen says so. There is
  no driver flag. The screen is two tables rather than a chart, because `ui` has no chart
  primitive and a table is what a chart needs beside it for a screen reader.
  - **Proved at every layer.** A use case spec (4) covers the window arithmetic, which is whole
    UTC days with today included. `analytics-reader.smoke.spec.ts` (2) runs on the live store,
    fed by the real projector. It covers day boundaries at both edges, another tenant's rows, and
    a redelivered row counted once; **with `FINAL` removed that row counts twice.** The panel
    spec (4) covers the two tables, the period switch reaching the procedure, the
    not-configured state and the empty state.
  - **End to end on the running app, with seeded ClickHouse rows** that were deleted afterwards.
    For the owner: 30 days returned 4 rows, and 90 days included a 60-day-old one. 7 days is a
    400. A platform admin with no tenant key got a 403 from the API and `/forbidden` from the
    page. The server-rendered page showed `Events: 4`, both tables, and the nav entry active.
  - **What the wait was for still holds, and is `S.2`'s:** the projection and the nightly
    reconciliation should run on real traffic for a few days. The reader can be checked against
    that data then. It no longer has to wait for it.
- [x] **Found while doing it: every sign-up failed on more than one node** `fixed: 2026-09-25` —
  a defect `24.2a` introduced on 2026-09-24. With two nodes configured, `PgActivityLogger` asks
  the directory where a catalog transaction's tenant lives. The founder writes the directory row
  and then `organization.created` in one transaction. The resolver reads through its own pool,
  cannot see the uncommitted row, and threw "No shard assignment". The sign-in that enrols a
  personal organization returned 500. Single-node specs could not see it. **The fix:** a placement
  already in scope for the tenant is the answer, and the founder records the audit row placed on
  node 0, which is where it just put the tenant. `pg-organization.founder.spec.ts` gains a case on a
  two-node cluster. It failed with the production error before the fix and passes after it. The
  same sign-in then returned 200 on the live stack.

- [x] `24.6` **Load test the routed paths at 10×** `done: 2026-09-25` — the write half, which
  `24.1` unblocked. `routed.smoke.spec.ts` gains "routed writes under load". Eight tenants, four
  per node. Each write is a placement read through the real Redis cache, then a routed
  transaction inserting a message. Pools of 20 per node. 1× is 4 writers and 10× is 40, 1 000
  writes each (`ROUTED_SCALE=1000`). Run twice, and both runs agree:

  | Level | Writes/s | p50 | p95 | p99 | Errors |
  |---|---|---|---|---|---|
  | 1× | 23 / 22 | 151 / 164 ms | 324 / 326 ms | 467 / 460 ms | 0 |
  | 10× | 142 / 159 | 265 / 238 ms | 498 / 397 ms | 577 / 417 ms | 0 |

  Every acknowledged row is on its tenant's node and none is on the other. **Routing is under 1 ms of a
  150 ms write.** The rest is the commit's `fsync` on Docker Desktop, about 100 ms by itself. 10×
  the writers buys ~6× the throughput, and p50 grows less than 2×. The stale third case, a routed
  insert on node 1 asserted to *fail*, is gone: since `24.1` it only failed because its tenant had
  no partitions. The numbers are one machine's disk; a provisioned node's are `S.3`'s.
- [x] `24.4` **The catalog is the last single primary — measure first** `done: 2026-09-25` —
  measured, and it does not hurt, so nothing was built. Reads of the six catalog-only tables around
  the 2 000 routed writes above: `shard_assignments` +17, `organizations` +16, `roles`,
  `role_permissions`, `memberships` and `users` +7 each. The eight tenants' first resolves and
  their own setup and teardown account for the first two. **Zero catalog reads per write** once the
  placement is warm, which it stays for five minutes per key. The catalog's writes are sign-ups
  and role edits, and `PF.0` measured a whole founding transaction at 21 ms. **If it ever hurts,
  the replica already exists**: node 0 is the catalog, `24.3` gave it a standby, and a catalog
  read that tolerates it moves with `BaseRepository.reader()` and nothing else.

- [x] `25.3` **Colder storage class** `done: 2026-09-25` — built with a MinIO tier, as decided.
  `LifecycleRule` gains an optional `transition: { storageClass, afterDays }`, and
  `StoragePolicyGateway.coldTier()` answers the deployment's from `S3_COLD_STORAGE_CLASS` and
  `S3_COLD_TRANSITION_DAYS`, both or neither. The gateway holds it because the class is the
  bucket's, so no use case gained a constructor argument. `RetentionRules.lifecycleFor(rows, tier)`
  gives every `cold/<table>/` rule the transition. The `export/` rule never gets one, and neither
  does a rule whose transition would land on or after its expiry, since S3 rejects the whole
  configuration for one of those. `RetentionRules.describe` spells a rule `…=731>COLD@30`. The
  screen, the save and the nightly converger all compare that, so a bucket that lost its
  transition is drift and gets put back.
  - **One refusal the entry did not foresee.** `restore()` and the re-projection read a cold object
    with `GetObject`. `GLACIER` and `DEEP_ARCHIVE` answer that with `InvalidObjectState` until an
    hours-long restore has run. So both apps refuse those two at boot and name the three that read
    at once. The entry's "once someone pays for Glacier" means `GLACIER_IR`.
  - **Compose:** `minio-cold` and `minio-cold-init` under a `cold-tier` profile, registering a
    second MinIO on `minio` as tier `COLD`. The first version never registered it:
    `mc ilm tier info` exits 0 for a missing tier, so the `||` never ran. It uses `tier ls | grep`
    now, and was run twice to prove it is idempotent.
  - **Proved:** `lifecycle.smoke.spec.ts`, 3 passed against the live bucket. A transition to `COLD`
    is written and read back equal, an unregistered class is refused, and the bucket's own
    configuration is put back afterwards (checked with `mc ilm rule ls`: `export/` only).
    `retention.rules.spec.ts` +4 and `maintenance.consumer.spec.ts` +1. The latter shows the
    nightly job restoring a transition removed by hand, and its drift line naming the class.

- [x] `24.3` **Read replica per shard** `done: 2026-09-25` — built as filed, with one design
  choice the entry did not make: **a read uses the replica only once it has caught up.**
  `DatabaseCluster.readerAt(node)` asks the primary for `pg_current_wal_lsn()` and the replica
  whether it has replayed that far. It uses the replica if so, and the primary if not or if the
  replica cannot be reached. So no caller reasons about lag. `DATABASE_REPLICA_URL` and
  `DATABASE_SHARD_<n>_REPLICA_URL`, read by all three shard readers (assertion 29 still holds);
  `BaseRepository.reader()`, the transaction inside one; `PlacedShard.replica`, which `withShard`
  passes from the platform switch. **What moved onto it is the analytics projection**,
  `PgActivityReplayReader.since` and `dailyCounts`: the worker's biggest batch read, as `25.2`
  said. The web app reads nothing there.
  - **Compose:** `postgres-replica` under a `replica` profile, `pnpm infra:up:replica`. It clones
    itself with `pg_basebackup -R` on an empty volume. The primary now starts with `hba_file` on
    `infra/pg_hba.conf`: the image's rules plus replication from the network.
  - **Proved on a live standby.** `replica.smoke.spec.ts`, 4 passed. Fifty rows, each found by
    the read straight after its insert and again by the first read the replica is chosen for.
    **Red with the caught-up check removed**: the first read after the first insert missed its
    row. `database-cluster.spec.ts` covers no replica, an unreachable one, and a primary
    configured as its own replica.
  - **And end to end, with the worker running.** Scans of `activity_log` partitions over one
    projection run: switch off, standby +0 and primary +81; switch on, standby +42 and primary +0.
  - **One trap found and fixed on the way.** A failing `toBe` on a `Database` makes vitest print
    a live `pg` pool, and the whole smoke run died out of heap. The committed tree was run
    to confirm the new spec was the cause. The assertions compare booleans now; 42 passed.
- [x] `25.1` **Status** `done: 2026-09-25` — `InspectPlatformStatusUseCase` returns
  `replica: { healthy, lagSeconds, readsEnabled } | null`, from `PlatformHealthReader.replica()`,
  every node's standby folded into one reading. Kept out of `healthy` on purpose: a standby that
  falls behind slows batch reads and takes nothing down. Lag is `now() -
  pg_last_xact_replay_timestamp()`, and **zero when replay has reached receive**, because an idle
  primary sends nothing and the timestamp alone would read as growing lag. Rendered on
  `/platform/status` as a row and a lag line. Read over the live API: `{"healthy":true,"lagSeconds":0,"readsEnabled":false}`.
- [x] `25.2` **The switch** `done: 2026-09-25` — `toggle-replica-reads.use-case.ts` under a new
  `platform.replica.manage` key; procedure `platform.updateReplicaSwitch`, `PUT
  /platform/policy/replica`; `ReplicaSwitchPanel` on `/platform/status`, beside the lag it
  governs. It refuses `ConflictError("replica", "not_configured")` with no standby, as the
  projection switch does. Audited on the platform tenant as `platform.replica.enabled` /
  `disabled`. `pnpm db:seed` gave `platform_admin` the key, 10 platform keys now. Flipped over
  the API with a throwaway platform admin: the row saved and the audit row landed. It is back
  **off**, the default.

- [x] `24.2b` **The move's settle does not cover a long job** `done: 2026-09-25` — built as the
  entry's recorded design: **a job re-reads its placement at the start of every transaction; a
  request does not**, because the settle covers it. `PlacedShard.recheck`; `DatabaseCluster.placementOf`,
  the resolver's cached `{ node, frozen }`; `PgUnitOfWork.run` re-reads it when it *opens* a
  non-catalog transaction with `recheck` set, and throws `ForbiddenError("shard.move.inFlight")`
  if the tenant is frozen or its node changed. `Container.placed` takes `{ recheck }` and the
  worker's `withShard` passes `true`, so every consumer job gets it and no request does.
  - **Proved twice, and red both times without it.** `pg-unit-of-work.spec.ts` gains four
    cases: frozen, moved to another node, one resolve per transaction and none per savepoint,
    and a request and a catalog transaction left unchecked. With the call removed, three fail.
    `tenant-move.smoke.spec.ts` on two live nodes gains a job placed on node 0 before the move
    and writing only after the flip. It is refused and its row is on neither node. With
    `recheck: false` the same write **lands on node 0**, after its page was copied, which is
    the gap reproduced rather than argued. The file is 6 passed.
  - **The cost is one cached resolve per job transaction:** 979 µs on this machine, a Redis
    `GET` averaged over 2 000, against the 914 µs `S.3` recorded for a warm resolve. A savepoint
    and a catalog transaction pay nothing.
  - `sharding.md`'s "What the settle does not cover" is now "A job re-reads its placement at
    every transaction".

- [x] `24.2a` **A moved tenant's catalog-written rows** `done: 2026-09-24` — decided with the user
  as a **third option** to the two filed: the audit row goes through node 0's outbox. A catalog
  transaction is on node 0 whatever the tenant, so `PgActivityLogger` asks the directory. For a
  tenant off node 0 it publishes `activity.recorded` in the same transaction instead of inserting.
  That keeps the row saved with the action, which "send it after the action" would have given up.
  `ActivityRelaySubscriber`, placed on the tenant, writes it on the tenant's node with the event's
  id and time, `on conflict do nothing`. A tenant on node 0 is unchanged. All three consequences go
  with it: node 0's runway no longer has to cover a moved tenant, nothing archives the same
  tenant-month from two nodes after the grace week, and the projection finds the row where it
  reads. The reclaim now **carries** node-0 audit rows newer than an hour before the flip onto the
  target, then drops node 0's `activity_log` partition too. That closes the one window the
  move's count check cannot see, a catalog write between the verify and the flip. Proved in
  `tenant-move.smoke.spec.ts` on two live nodes, 6 passed: the row goes to node 0's outbox and
  not its log; a relay delivered twice writes one row on node 1; and a stray row survives the
  reclaim on node 1 while node 0's partition is gone. **Red with the routing off**: node 0's log
  grew. The row arrives about a second late; with the worker down it waits and is never dropped.
- [x] `24.1` **The foreign-key decision** `done: 2026-09-22` — **(a), as recommended: dropped.**
  Ten `cascade` keys crossed from a shard to the catalog. Postgres enforces no foreign key across
  two databases, so every one was impossible the day a shard becomes a separate server — keeping
  them was not the cautious choice, it was the choice to abandon the split.
  - **Nine were already doing nothing, and that is what sized the change.**
    `DeleteOrganizationUseCase` calls `dropTenantPartitions` *before* it removes the
    `organizations` row, so six found no rows left to take. The three naming `users` never fired
    at all: there is no user-delete path in `src/`.
  - **`outbox_event` was the one doing real work.** It has `tenantKey: null`, so no partition drop
    reaches it and this cascade was its only reaper. `PurgeOrganizationUseCase` sweeps it by hand
    now — and the leak proved itself immediately: the global orphan sweep took **16 real rows** on
    its first run after the migration, left by specs that had been relying on the cascade.
  - **Migration `0035`, one `DROP CONSTRAINT` per breakpoint.** Each takes `ACCESS EXCLUSIVE` on
    the parent *and* every partition under it, so ten in one transaction is a lock storm. Applied
    to both nodes and verified on each: zero keys remain from those seven tables.
  - **The smoke case inverted rather than being deleted.** It used to assert the `23503`; it now
    asserts a routed write landing on node 1 with the catalog untouched, and a second case pins
    that the author is a `users` row the shard has never heard of. The red-then-green is clean by
    construction — the old assertion passed before the migration, the new one after, and the
    migration is the only change. `sharded.smoke.spec.ts` is **6 passed**.
  - **The guarantee moved rather than being dropped.** A nightly `orphans` job at 04:00 names any
    tenant with rows on a node whose `organizations` row is gone — two reads, never a join, with
    the candidates coming from partition names rather than a scan. It logs at `warn` and carries
    the ids, because with no key left this is the only place a leaked tenant is named.
  - **It also found `19.20`.** The delete was placed on the admin's node rather than the tenant's,
    so on two nodes it dropped nothing and reported success. See that entry.
  - `tenant-cascade.spec.ts` now asserts the two halves apart: catalog rows still go with the
    tenant, routed rows do not and say why. `data.md` and `data-and-scale.md` both stated the old
    rule and both were rewritten. — `archive/PLAN.md:3907`

- [x] `24.2` **Tenant move** `done: 2026-09-24` — a `tenant-move` job on `QueueName.MAINTENANCE`,
  and the three commits before it (`d545a47`, `815f595`, `261e3ee`) had built half of it: the
  columns, the freeze in `PgUnitOfWork.run`, the gateway, both use-cases and the wiring. What was
  missing was the job, the reclaim, the procedure and every spec — and finishing it found **two
  defects in the half that existed**, either of which made the move unusable or unsafe:
  - **No established tenant could have moved.** `prepare` ran `TenantPartitionSeed`, which creates
    the current month and the next two. A tenant with one message from last year needs last year's
    partition on the target, so the copy would have failed with "no partition of relation found
    for row" and rolled back — safely, every time. `prepare` now reads the source's months out of
    `pg_inherits` and creates each with the same bounds.
  - **A retry kept stale rows.** An abandoned attempt left its copy on the target, and the next one
    wrote `on conflict do nothing` over it — so a row updated or deleted between the attempts came
    back in its old state, and `verify` (target ≥ source) could not see it. `prepare` now empties
    the target's routed rows first.
  - **And the freeze had a gap nothing closed.** A request places itself once, so one that resolved
    a moment before `beginMove` could still write to the source while the copy ran, and the flip
    lost the row. `quiesce` closes it in two halves: a settle (`moveSettleMs`, 60 s) for writers
    that have not opened a transaction, then a `SHARE` lock on the tenant's partitions for those
    that have. **It does not cover a job placed before the freeze and still opening transactions
    after the settle** — `sharding.md` says so, and `24.2b` carries it.
  - `ReclaimMoveSourcesUseCase` is the grace sweep, run from the nightly cleanup rather than a
    schedule of its own. A move onward while a source copy is on a third node is refused with
    `sourcePending`, in `MoveTenantUseCase` and in `beginMove`'s `where`: the flip would overwrite
    `moved_from`, the only column naming that copy. A move *back* to `moved_from` is allowed.
  - **The copy paged on `id::text`**, which no index serves, so every page sorted the tenant's whole
    partition. Native `uuid` order now; every key here leads with `id`.
  - Measured by: 26 application specs (the request, the job, the sweep), 3 worker cases, and
    `tenant-move.smoke.spec.ts` on two live nodes — 4 passed, three runs out of three. — `archive/PLAN.md:3971`
- [x] `24.5` **Two-node proof** `done: 2026-09-24` — the second clause, a tenant move under load
  with no lost writes. `tenant-move.smoke.spec.ts`: four writers place themselves per write, the
  way a request does, and a straggler holds its transaction open for 1.5 s across the start of
  the move. Every acknowledged write is on node 1 afterwards, and some writes were refused, so the
  freeze demonstrably engaged. **The spec was checked against a sabotaged `quiesce`** — made a
  no-op, it lost the straggler on three runs out of three. Before the straggler it caught the loss
  one run in three, because `prepare`'s DDL happened to outlast a short write; the straggler is
  what makes the proof deterministic. The first clause was already green
  (`sharded.smoke.spec.ts`, 6 passed). — `archive/PLAN.md:3987`
- [x] `25.5` **The move button** `done: 2026-09-24` — `platform.moveTenant` (`POST
  /platform/shards/move`, `platform.shards.manage`), its router handler, `useMoveTenant`, and a
  confirmation on `/platform/shards`: the row's button opens it rather than moving, the warning
  names the freeze before the buttons, and the targets are the other nodes by name — never a
  number typed into a field. `PERMISSION_AWAITING_A_PROCEDURE` is empty. `R.44`'s concern had
  already been met — the button was disabled without a handler — so this replaced the `onMove`
  prop with the mutation rather than wiring it. Measured by: `shard-map.panel.spec.tsx`, 7 passed,
  two of them new. — `archive/PLAN.md:4114`
### Phase 23 — Loose ends, no gate

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
  names Phase 26, which moved to [`COMMUNICATION.md`](COMMUNICATION.md) rather than closing. The
  walk itself is done.
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
- [x] `23.26b` **Messaging resolves names now.** `done: 2026-09-21` — built at the size the entry
  filed it at: a port, an adapter, a contract field, three use-cases and three components.
  - **The name cannot be a join, and that is the whole shape of it.** `conversation_members` is
    routed and `users` is catalog, so no repository may read both — §22 is the assertion.
    `ConversationNaming` does it in the use-case, after the routed read returns: one statement
    for a whole page, because twenty-five conversations of a hundred members each is two queries
    that way and twenty-six the obvious way. Attached **by key, never zipped by index**, which a
    spec pins with a reader that answers about somebody else.
  - **`CreateConversationUseCase` names the row after the commit, not inside `unitOfWork.run`.**
    A catalog read inside a routed transaction is the crossing `data.md` forbids and it is
    invisible on one node, so the spec asserts the ordering rather than a reviewer noticing it —
    red on the shape that reads more naturally, which is exactly where it would have been written.
  - **Its own port rather than `NotificationRecipientReader`, and the first reason is the one that
    matters.** `Recipient` carries an email address, and a use-case holding one is a spread away
    from putting it on a member DTO. `users()` there also filters out deactivated memberships —
    right for a recipient list, and for a thread it is how every message somebody wrote goes back
    to rendering a uuid the day they leave. `namesOf` returns names and nothing else.
  - **Nullable, because `24.1` will make it reachable.** Today `conversation_members` has a
    foreign key to `users`; once the ones crossing to the catalog are dropped, a membership row
    can outlive the row that named it. `null` reaches the client and `messaging.member.unknown`
    renders — never the id, in any of the three components.
  - **`ConversationEntity` answers all three questions**, rather than a second helper doing it
    again. `otherMember(self)` was written for exactly this and had no caller; it returns the
    member now, and `displayTitle` and `nameOf` are built on it. The entity is constructed once
    per fetch rather than per render — `from` parses, and the typing map changes on every
    keystroke somebody else makes.
  - **Verified on the wire, not only in specs.** `conversation/create`, `conversation/get` and
    `conversation/list` over `/api/rpc` against live Postgres all return
    `"name":"Bob Example"` beside the id. Thirteen unit and component cases, six integration
    cases for the tenant scope and the deactivated member, and the argument is in
    `packages/application/docs/reference/messaging.md`. — found 2026-09-21
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
## 2. `archive/REVIEW.md` — forty-five defects a green build does not catch

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
  - **The two call sites are covered now** `done: 2026-09-22` — `use-role-failure.ts` and
    `use-api-key-failure.ts` have twenty-three cases between them, each hook rendered through a
    probe component so the harness is the one every other spec in the package uses. Both read a
    decoded envelope as well as an `AppError`, which is the half `R.3` could not reach.
  - **Writing them found a defect neither hook was filed for.** `reason in CONFLICT_COPY` walks
    the prototype chain, so a `CONFLICT` whose reason is `toString` resolved to
    `Object.prototype.toString` and the screen rendered **nothing** — not the specific sentence,
    not the generic one. The same shape was in two more places, both reachable from the wire:
    `FIELD_RULE_COPY[violation.rule] ?? "error.unexpected"` never saw its fallback, because an
    inherited method is truthy; and `BY_CODE[error.code]` in `BetterAuthErrorNormalizer` returned
    a function that, called, hands back the string `"[object Undefined]"` where an `AppError` is
    declared. All three now use `Object.hasOwn`, which is what `AppError.isKnownCode` already did
    and says why. Seven specs, red on the old code.
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
## 3. `archive/STUCK.md` — what a session could not do, and exactly why

- [x] `S.1` **The browser walk, `23.5`–`23.12`.** `done: 2026-09-20` — **the blocker lifted and
  the work landed**, which is the only thing that closes a section here. The extension connects,
  and six of the seven observations hold; the seventh, `23.6`, is not a browser problem and its
  entry in section 1 now says what it actually is. The checklist's "two browser profiles" turned
  out to be unnecessary — the second account only ever has to act, so it acted over `/api/rpc`.
## 4. Unfinished work buried inside ticked items

- [x] `19.20` `concern:` **the archive runs inside the request** `done: 2026-09-22` — it is a
  `tenant-delete` job now, the way `19.18` and `19.21` are. The entry's own trigger was "when it
  bites"; it was pulled forward because implementing `24.1` found a second and worse reason.
  - **The delete was running on the wrong node.** `shardMiddleware` places every request on
    `context.principal` — the *actor's* organization — and `DeleteOrganizationUseCase` contained
    no placement of its own. A platform admin on node 0 deleting a tenant on node 1 therefore
    called `dropTenantPartitions` on node 0, found nothing, and **reported success** while the
    rows stayed. Same class as `R.2`, and invisible only because the admin and every test tenant
    sit on node 0 today.
  - **A job fixes it by construction**, which is why this was the answer rather than a new seam:
    `withShard(container, organizationId, work)` places by organization id, where the middleware
    places by principal. `application` has no way to enter a node's scope and inventing one for
    this would have been an abstraction with a single caller.
  - **The use-case splits on the request boundary.** `DeleteOrganizationUseCase` keeps all four
    guards — the permission, the tenant, the tier, the slug — and queues; a spec pins that nothing
    is queued until every one passes. `PurgeOrganizationUseCase` does the work and asserts no
    permission, because a job has no actor; the actor rides in the payload so `tenant.deleted`
    still names who asked. It returns early when the tenant is already gone, because jobs retry.
  - **The wire changed with it.** `deleteTenant` answers a job id rather than a tally, which is
    what `tenant-export` and `cold-restore` already do, and the panel says "queued as …".
  - Nineteen specs across the two, plus the `outboxRows` count on `tenant.purge.completed` — a
    zero there when the tenant had events is the shape of `24.1`'s sweep silently not running.
    — `archive/PLAN.md:2340`
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
- [x] `17.2` / `22.1` **The `activity_archive` drop migration** `done: 2026-09-22` — `0034`, and
  the gate was a fact rather than a judgement, which is why it went unchecked for two phases.
  - **"No deployment can hold objects under the old key" was checkable.** There is no deployment:
    `.github/workflows/ci.yml` builds and tests and has no deploy job, there are no tags and no
    releases, and the only bucket this system has ever written to holds `cold/` and `export/`.
    No object under `activity-archive/` exists anywhere to orphan.
  - **Nothing read the table.** Outside the migrations that made it and their snapshots, the two
    live references were the schema and `shard.ts`'s catalog list — no repository, no gateway, no
    spec. `0025` had already carried every row into `partition_archive` under
    `table_name = 'activity_log'`, keeping the object key rather than rewriting it.
  - **Generated, not hand-written**, so `0034_snapshot.json` is the diff base the next
    `db:generate` reads. One statement. Applied to **both nodes** and verified there:
    `to_regclass` is null on each, and `partition_archive` still holds node 0's three months.
  - The catalog entry that stood in for a `TENANT_EXEMPT` line went with it, and so did
    `cold-storage.md`'s "What `activity_archive` is still doing here" and setup 26's mention.
    — `archive/PLAN.md:1466`, `2831`
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
- [x] `16.12` **`TENANT_CEILING=2000 pnpm smoke`** `done: 2026-09-24` — run twice, before and
  after section 9, and closed by `PF.0`. Plan time 0.2–0.7 ms at every count, so `D29`'s "a few
  hundred tenants per node" is replaced by measurement. The numbers are in `partitions.md`, "What a
  node carrying tenants actually costs", and §9 below.

## 5. Verification owed — browser, manual, or a scale not run

- [x] **The whole-plan verification** `done: 2026-09-25` — `archive/PLAN.md`'s closing section,
  both halves. **The command block** ran end to end in one pass: `build:packages`, the web and
  worker builds, `check:architecture` 29 of 29 with none skipped, `typecheck`, `lint`, `test` (205
  files), `db:migrate`, `db:seed`, `ch:migrate` and `smoke` (9 files, 3 skipped by opt-in).
  **The Exit lines were read by hand**, all 26, and each was checked against the tree. Phases 1–15
  are true in the tree. 11–13 and 18–21 are true by their recorded walks. Phases 23, 24 and 26
  have no Exit line: their ledgers say all closed except `23.14` and the conditional `24.7`, and
  Phase 26 went to `COMMUNICATION.md`. **One clause is false, and on purpose.** Phase 22's
  "`sharded.spec.ts` fails on exactly the foreign-key constraint `24.1` names" was true when
  written. `24.1` dropped those keys, and the spec now asserts the write *succeeding*
  (`sharded.smoke.spec.ts:319`). The rest is stale wording in a frozen file: assertion counts of
  20, 21 and 23 against 29; `TENANT_EXEMPT`, which is `shard.ts`'s `CATALOG` list now;
  `sharded.spec.ts` for `sharded.smoke.spec.ts`; `/health` for `/api/health`; "nine platform
  keys" for ten. Listed in `BACKLOG.md`'s "do not fix" table rather than edited.

- [x] **`archive/REVIEW.md`'s own gap** `done: 2026-09-22` — the review session had no Docker, so
  neither the `infrastructure` integration specs nor the smoke suites ran against it, and the
  forty-five fixes then landed without either being re-run. Both have now run on the tree that
  holds them: **278 integration tests** across 40 files, and **31 smoke tests** — 30 in
  `infrastructure` over 6 files, 1 in `apps/web` against the built server end to end over HTTP.
  - **One suite would have skipped, and finding that was the point.** `LOKI_URL` was commented out
    in `.env` while Loki itself was up and answering `/ready` with a 200, so
    `observability.smoke.spec.ts` gates on `describe.skipIf(!stack.loki)` and would have reported
    nothing at all. That is `S.2`'s ClickHouse trap exactly — the container running, the URL
    commented, the check quietly proving nothing. Uncommented, and the file runs **5 cases**
    covering the Loki and ClickHouse read-back paths.
  - **Three files skipped and are meant to.** `routed`, `fan-out` and `tenant-ceiling` gate on
    `ROUTED_SCALE`, `FAN_OUT_SCALE` and `TENANT_CEILING`, which are opt-in by design. They are
    `24.6`, `COMMUNICATION.md`'s fan-out test and `16.12` — separate open items, not a hole in
    this one. A skip is unverified, which is why they are named here rather than counted as green.
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
## 7. `archive/TODO.md` — the three ledger rows

- [x] `T-036` **Communication plan** `P1`. `done: 2026-09-25` — **its "Done when" narrowed, as
  decided, and this supersedes the 2026-09-22 note** that kept the row open. The row now closes on
  Phases 9–13, `23.1`–`23.3` and `23.5`–`23.12`, and every one of those is closed: Phases 9–13
  before this ledger existed, `23.1`–`23.3` on 2026-09-21, and `23.5`–`23.12` on the browser walk.
  Phase 26 is not dropped. It moved whole to [`COMMUNICATION.md`](COMMUNICATION.md) on
  2026-09-22 as the input to a performance and isolation plan not yet written, and that plan will
  carry its own row. The 2026-09-22 note's objection still stands, and it is now true: a `P1` row
  reading "done" sits above eight unbuilt items. That is the trade the decision accepted. The
  items are recorded in `COMMUNICATION.md`, not here. — `archive/TODO.md:140`

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
## 8. Doc housekeeping still owed

- [x] **Four doc sentences describing the transactional outbox as a backlog item.**
  `done: 2026-09-21` — all four now say it shipped, and say it shipped *whole*: a port, an adapter
  and a `Container` line in one change, which is the shape the `EventBus` deletion argued for.
  The fifth, `packages/content/docs/reference/namespace.md`, was wrong twice — it cited `T-035` as
  an open trade-off and described an English fallback layer `23.15` has since dropped. Verified
  against the tree before rewriting: `StaticContentSource` leaves `base` empty.
- [x] **`AWAITING_A_PROCEDURE`** `done: 2026-09-21` — closed by `23.13` moving the property it
  guarded. `R.35` had already cut the list to one key; the entry stayed open because one list in a
  spec and one property is still the wrong number of places. Both now live in assertion 28.
- [x] **Three independent `DATABASE_SHARD_<n>_URL` parsers** `done: 2026-09-22` — **the copies
  stay and the rule does not.** The decision the entry asked for, taken: there is no package that
  could hold the parser. `docs/setup/25:144` forbids a shared schema by name, and the narrower
  read does not help either — `apps/web/src/env.ts` is under the server-only ban, so it cannot
  reach `@loadbearing/infrastructure` at all, and a fourth package left of that boundary is one
  invented for twenty lines.
  - **The drift was real and this is what it did.** `shard-env.ts` walked upward from 1 and then
    scanned separately for an orphan, where both apps collect, sort and check contiguity. A name
    set to an *empty* value — what a commented-out line in `.env` leaves behind — was one node to
    the apps, and to the scripts an error reading *"DATABASE_SHARD_1_URL has no shard 1 before
    it"*: an index named as its own missing predecessor.
  - **`shard-env.ts` now runs the apps' algorithm**, and `shardUrls` keeps node 0 on the front
    where each app's `Env` leaves it off — a script walks every node, `Container` builds node 0
    itself. Nine specs in `tests/platform/shard-env.spec.ts`, **eight of which were already true
    of both readers**; the ninth is the empty value, and it is the one that was red.
  - **Assertion 29 holds the three together** — bodies compared with comments and the signature
    stripped, so each copy still explains itself where it sits. Proved by making one copy differ
    and by renaming one away, with five fixture cases in `check-architecture.spec.mjs`.
    `docs/setup/26` §29 carries the argument.
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

---

## 9. Performance — the tenant/partition layer

All eight measured by `tests/smoke/tenant-ceiling.smoke.spec.ts` at 100, 500 and 2 000 tenants,
once before and once after, on 2026-09-24. **The machine was not idle during either run**, so the
comparisons that carry weight are the ones inside one run, or ones far larger than the noise.

- [x] `PF.0` **Measure, and land the 2 000 row** `done: 2026-09-24` — the smoke's `Reading` grew
  signup DDL split probe / create / attach from `pg_stat_statements` over twenty signups, the attach
  mean by parent, every lock mode another backend held on `conversations` meanwhile, and one fresh
  tenant dropped with its wait events sampled. **One confound, recorded rather than hidden:** the
  smoke runs the migrator after each count, and `0037` was already generated, so the first run's
  2 000 row was taken without the keys. Closes `16.12` and `D29`, and re-states `24.7`'s gate.
- [x] `PF.1` **The two sibling keys dropped** `done: 2026-09-24` — migration `0037`, both nodes,
  verified in `pg_constraint` on each. At 500 tenants, in one run: `conversation_members` attached
  in **116.1 ms** against 9.6 for a table with no key, and **6.7 against 6.4** without. `SHARE ROW
  EXCLUSIVE` on `conversations`: 2 227 samples → 0, at every count. The nightly `orphans` job
  counts conversation ids a member or a message names and nothing holds
  (`danglingConversations`, one anti-join per node). `tenant-partition.spec.ts` asserts no key
  points into any tenant-partitioned table; `send-message` pins that a missing conversation is
  refused by `assertMember` before anything is written — as `FORBIDDEN`, not `NOT_FOUND` as the
  entry guessed.
- [x] `PF.2` **The drop's lock window** `done: 2026-09-24` — `TenantPartitionSeed.drop`: one probe
  for every name, no detach, no transaction, fifty names to a statement. `dropTenantPartitions` and
  `dropOn` both delegate, and `dropOn` keeps its rule that a `local` partition on node 0 is never
  dropped. One tenant: 706 → 43 ms at 100, 127 → 42 ms at 2 000. **The spec is red on the old
  code**: with a reader holding one table, the old drop left all seven partitions visible for 15 s;
  the new one drops the other six at once. The sweep that cleared the killed run's leftovers put a
  number on the detach: 60 of its 142 s were `conversations` alone.
- [x] `PF.3` **Warm spares** `done: 2026-09-24` — catalog table `spare_tenants`, migration `0038`;
  a `spares` job every five minutes tops node 0 up to twenty, each spare's row and partitions in one
  transaction; `PgOrganizationFounder` claims the oldest with `SKIP LOCKED` and seeds inline when
  the pool is empty or held. The orphan count and both test sweeps treat a spare as live. Measured
  with the real founder: **126 ms → 21 ms** median for the whole founding transaction on a small
  node, and the inline half grows with the node (377 ms of DDL at 2 000). Specs: a spare is claimed
  and leaves the pool; every spare locked by another transaction falls through to a fresh id; the
  top-up makes exactly the shortfall and is not an orphan.
- [x] `PF.4` **Sixteen probes, one query** `done: 2026-09-24` — `TenantPartitionSeed` reads which of
  its names are absent in one `unnest(string_to_array(…))` rather than sixteen `to_regclass` calls,
  and `missing(ids)` answers it for a page. `migrate.ts` seeds only the tenants `missing` names:
  both nodes, 6 tenants, **0 partitions ensured** in one read each. A spec drops one runway month
  and gets exactly that tenant back.
- [x] `PF.5` **The runway, one read and one transaction per page** `done: 2026-09-24` —
  `ensureMonthlyPartitionsFor`: the advisory lock, then one `pg_inherits` read for 200 tenants,
  then only the missing months; `monthsAhead` off the same read, so `partition.runway.low` still
  reports what the run found. The prune pass reads every tenant's months in one query too.
  **Runway: 3.2 s → 70 ms at 100, 11.6 s → 0.27 s at 500, 35.6 s → 1.6 s at 2 000** — the target
  was under 3 s. The ceiling smoke calls the paged method, so it times what the worker runs.
- [x] `PF.6` **A month ceiling on cursor pages** `done: 2026-09-24` — the inbox's and a
  conversation's later pages carry `created_at <= at` beside the row constructor, and every month
  newer than the cursor leaves the plan. **Two claims corrected on the way, both by `EXPLAIN`:**
  the plan was never a `Sort`-free walk (on tables this small the old query sorts too, so the
  assertion that said so was measuring the wrong thing); and the `OR` rewrite does not sort
  either — it drops the cursor out of the `Index Cond` into a row-by-row `Filter`, on a different
  index. The spec asserts the row constructor stays an index condition on every leaf left.
- [x] `PF.7` **The lock arithmetic** `done: 2026-09-24` — measured, not estimated: one
  `select count(*)` of a root takes (months + 1) × (1 + indexes) locks per tenant, 175 predicted
  against 176 read from `pg_locks`. 1 024 × 200 = 204 800 slots, so one unpruned read of
  `notifications` at full retention fails at **~1 800 tenants — not the ~5 000 the entry
  estimated**. No application query issues one, and a named prepared statement against a
  partitioned parent is now a stated rule. The compose comment citing the deleted `users` cascade
  is rewritten. No config change.

---

## 10. Code review of 2026-09-25 — closed

Bodies in [`REVIEW-2026-09-25.md`](REVIEW-2026-09-25.md), at the line each backlog entry gave.
Twenty closed with the communication performance plan, pushed as `14d49db..45633e6` and listed
in that plan's changelog; twenty-six more closed on 2026-09-26 in the per-layer commits after
`e265714`, three of them the rest of what the plan had closed in part. Three stay open in `BACKLOG.md` §10, narrowed to what is left of them: `CR.16`,
`CR.20` and `CR.33`. **Every proof below is a spec that runs in `pnpm test` or `pnpm smoke`**,
unless it says otherwise.

### 10.A Security and tenant isolation

- [x] `CR.1` **Any role that can invite could make an owner** `done: 2026-09-26` — a role now
  goes only to someone who could have granted every key of it: `RoleRules.assertAssignableBy`,
  in both `InviteMemberUseCase` and `ChangeMemberRoleUseCase`, asks the new
  `CapabilitySet.canTenantWide`. `owner` holds every key, so only an owner hands it out.
  `invite-member.use-case.spec.ts` and `member-lifecycle.use-case.spec.ts` refuse and save nothing;
  `capability-set.spec.ts` covers the org-level question for a goal-scoped key.
- [x] `CR.2` **Deactivation did not revoke** `done: 2026-09-26` — `ApiKeyResolver` checks the
  issuer's `isActive`, in parallel with the capability read, as the session path does;
  `SetMemberActiveUseCase` flushes the cached set after the commit, which reaches the platform
  axis. `api-key.resolver.spec.ts`, `member-lifecycle.use-case.spec.ts`. The latent half — goal
  grants and overrides unfiltered by `deactivated_at` in `resolveFor` — is unreachable while both
  paths refuse a deactivated principal first.
- [x] `CR.3` **A key could mint a permanent key** `done: 2026-09-26` — `CreateApiKeyUseCase`
  refuses any `api_key` principal. `api-key.use-case.spec.ts`.
- [x] `CR.4` **A stream was authorized once** `done: 2026-09-26` — `StreamRevalidation` asks
  again every sixty seconds and ends the subscription the first time the answer is no; a check
  that throws keeps it. The user stream asks `isActive`, the conversation stream the new
  `WatchConversationUseCase`, which it also opens with instead of the roster-loading
  `getConversation`. `stream-revalidation.spec.ts`.
- [x] `CR.5` **Conversation streams had no per-user cap** `done: 2026-09-26` — every stream
  counts against its owner's cap. `CP7.4` in
  [`COMMUNICATION-PERFORMANCE-PLAN.md`](COMMUNICATION-PERFORMANCE-PLAN.md).
- [x] `CR.6` **Nothing on the oRPC surface was rate-limited** `done: 2026-09-26` —
  `rateLimitMiddleware` in `authed`, per principal and procedure, on the six procedures
  `RateLimitPolicy` names: invitations, document search and index, message send, conversation
  create. A fixed window in the cache Redis; open when the counter cannot be reached.
  `rate-limit.spec.ts` (429 past the limit, per person, fails open, every name a real procedure),
  `redis.smoke.spec.ts` (the window).
- [x] `CR.7` **Deactivated in the last-active tenant locked a user out of all of them**
  `done: 2026-09-26` — `activeOrganizationFor` and `organizationsFor` skip a deactivated
  membership, and the switch asks `isActive`. `isMember`, left with no caller, is gone from the
  port. `pg-membership.reader.spec.ts` against Postgres, `organization.plugin.spec.ts`.
- [x] `CR.8` **Indexing ignored goal scope** `done: 2026-09-26` — `QueueDocumentIndexUseCase`
  asserts `ai.embedding.write` for the goal named and for the goal the document is in now, read
  by the new `VectorStore.sourceOf`. Both keys are org-scoped today, so it binds the day one is
  not. `document.use-case.spec.ts`, `pg-vector.store.spec.ts`.
- [x] `CR.9` **The capability cache could re-cache a revoked set** `done: 2026-09-26` — every
  flush repeats itself two seconds later, taking a racing read-through's write with it.
  `capability.cache.spec.ts`, on fake timers.
- [x] `CR.10` **The shard resolver's fill race** `done: 2026-09-26` — `quiesce` invalidates the
  cached placement again once the settle is over. `tenant-move.smoke.spec.ts` on two nodes, 6 of 6.
- [x] `CR.11` **The move freeze only inside `PgUnitOfWork.run`** `done: 2026-09-26` — the six
  routed writes that opened no transaction open a unit of work now: both mark-read use-cases,
  the preference, the conversation's read position, `DeliverNotification`'s `saveMany`, the
  search's audit row. `notification-preferences.use-case.spec.ts` refuses on a frozen unit.
- [x] `CR.12` **The OpenAI call had no timeout** `done: 2026-09-26` — twenty seconds a batch,
  and a network failure is `UnavailableError`, which retries. `openai-embedding.provider.spec.ts`.

### 10.B Lost work, the worker and its queues

- [x] `CR.13` **Retries ran out in seconds** `done: 2026-09-26` — `CP3.1`; replay is
  `pnpm queue:replay`. The hand walk through a mail outage is `BACKLOG.md` §12.
- [x] `CR.14` **One down node stopped every node after it** `done: 2026-09-26` — `CP3.5`.
- [x] `CR.15` **An archive cut off mid-way hid a month** `done: 2026-09-26` — the detach is
  inside the `try`, and the retention pass calls `recover(table)` on each node before it lists
  months: detach-pending children are finalized, standalone month tables attached again, and each
  one is a `cold.partition.recovered` line. `pg-partition-archive.gateway.spec.ts` recovers a
  detached month, archives it, and leaves a `_restore` scratch table alone.
- [x] `CR.17` **One failed boot run switched off the boot runway** `done: 2026-09-26` —
  `removeOnFail: true` on `partitions-boot`.
- [x] `CR.18` **Fixed job ids swallowed repeat admin requests** `done: 2026-09-26` — the four
  operator jobs dedupe only while one is queued or running: `JobOptions.inFlightId`, BullMQ's
  simple-mode deduplication. `redis.smoke.spec.ts` publishes twice, finishes, publishes again.
- [x] `CR.19` **One failure at 07:00 cancelled every digest** `done: 2026-09-26` — `CP3.4`.

### 10.C Scaling limits in the database layer

- [x] `CR.21` **The nightly orphan check scanned every message** `done: 2026-09-26` — one
  statement per tenant, each pruned to that tenant's partitions and committed alone.
  `orphaned-tenants.spec.ts`; the case the backlog called flaky took 1.9 s.
- [x] `CR.22` **The digest's tenant scan ran out of locks** `done: 2026-09-26` — `CP4.6`.
- [x] `CR.23` **Archiving rescanned the partition for every page** `done: 2026-09-26` — a month of
  more than one page gets `<child>_walk` on `(column, id)`, on the detached table through the
  direct pool; the unwind and `recover` drop it before attaching.
- [x] `CR.24` **The export sorted every table for every page** `done: 2026-09-26` — compared and
  ordered on the native key columns. Checked by `EXPLAIN` against the dev database: an Index Only
  Scan on `role_permissions_uq` with the cursor inside the index condition.
- [x] `CR.25` **The first page and `unreadCounts` touched every month** `done: 2026-09-26` —
  `CP2.3`, `CP2.4`.
- [x] `CR.26` **Conversation reads loaded every member** `done: 2026-09-26` — the hot path in
  `CP2.1`; the list now brings a sample, at most five per row with the reader always in it.
  `pg-conversation.repository.spec.ts` with a nine-member channel.
- [x] `CR.27` **The outbox drain held a transaction across Redis calls** `done: 2026-09-26` — `CP4.2`.
- [x] `CR.28` **N+1 in notification fan-out and the digest** `done: 2026-09-26` — `CP4.3`, `CP4.4`.
- [x] `CR.29` **The replay keyset used the `OR` form** `done: 2026-09-26` — the row constructor
  plus a redundant bound. `pg-activity-replay.reader.spec.ts` asserts it is an index condition.
- [x] `CR.30` **Conversation recency could move backwards** `done: 2026-09-26` — `CP2.5`.
- [x] `CR.31` **Cursor precision dropped rows** `done: 2026-09-26` — `conversations.created_at`
  is `timestamptz(3)`, migration `0041_conversation_created_at_ms`, applied to both local nodes.
- [x] `CR.32` **Creating a conversation checked members one by one** `done: 2026-09-26` — `CP2.6`.

### 10.D Resource lifetimes, timeouts and the client

- [x] `CR.34` **The web process never disposed its container** `done: 2026-09-26` — the Redis half
  and the dev cache in `CP5.1` and `CP7.8`. The shutdown: srvx fires no Nitro hook on `SIGTERM`
  and never exits, so `server/container.ts` disposes the container `SERVER_SHUTDOWN_TIMEOUT` plus a
  second after the signal. **Checked by build**, which puts it in the server bundle and nowhere
  else; the real signal on Linux is `BACKLOG.md` §12's `CP7.5`.
- [x] `CR.35` **The S3 clients had no timeouts** `done: 2026-09-26` — `S3ClientFactory`, five
  seconds to connect and sixty of socket inactivity, for both gateways.
- [x] `CR.36` **One failed close in `dispose()` skipped the rest** `done: 2026-09-26` — `CP3.5`.
- [x] `CR.37` **Streams ended at 30 minutes and never reopened** `done: 2026-09-26` — `CP1.3`.
- [x] `CR.38` **Reconnects retried every 2 s forever** `done: 2026-09-26` — `CP1.3`.
- [x] `CR.39` **One message refetched every loaded page, twice** `done: 2026-09-26` — `CP1.4`,
  `CP1.6`. The measurement is `BACKLOG.md` §12's `CP1.9`.
- [x] `CR.40` **Failed jobs were bounded by age only** `done: 2026-09-26` — `CP3.2`.
- [x] `CR.41` **ClickHouse `query` buffered the whole response** `done: 2026-09-26` — rows are
  parsed as their lines arrive. `clickhouse.connection.spec.ts` splits a row across two chunks.
- [x] `CR.42` **`RealtimeProvider` re-rendered every consumer** `done: 2026-09-26` — `CP1.7`.
- [x] `CR.43` **The pool check counted the wrong consumers** `done: 2026-09-26` — `CP4.8`.

### 10.E From the 2026-09-25 unpushed work

- [x] `CR.44` **The analytics skip check could hide the failure it followed** `done: 2026-09-26`
  — the directory lookup and the checkpoint read after a failure are both guarded, so the
  original error is the one thrown and `analytics.projection.failed` is emitted.
  `analytics.consumer.spec.ts`.
- [x] `CR.45` **The analytics loader blocked on ClickHouse** `done: 2026-09-26` — prefetched
  rather than ensured.
- [x] `CR.46` **A comment in `container.ts` described the wrong field** `done: 2026-09-26` — back
  above `notification`.
- [x] `CR.47` **The same, in `query-key.ts`** `done: 2026-09-26` — `CP1.8`.

### 10.F Docs that said something the code did not

- [x] `CR.48` **Four reference pages contradicted the code** `done: 2026-09-26` — each fixed with
  its finding: `partitions.md` with `CR.21` and `CR.22`, `cold-storage.md` with `CR.16`, `env.md`
  and `messaging.md` with `CR.37` and `CR.39`. Each re-read against the code on the day.
- [x] `CR.49` **"Roughly a minute" was about 30 s** `done: 2026-09-26` — rewritten with `CR.13`.

---

## 11. Communication features — closed

- [x] `26.5` **Replay on reconnect** `done: 2026-09-26` — every `event` frame is logged to a Redis
  Stream per channel before it is published, in one `MULTI`: about two hundred entries, expiring
  an hour after the last write. A resume passes `lastEventId` as `after`; the subscriber attaches
  first, reads the log, and replays what came after it ahead of anything live, dropping a live
  frame the replay already carried. Past the log it resyncs as before. Server-side only, as the
  entry said: the client already sent `lastEventId`, and a replayed frame routes like a live one.
  Typing frames are neither logged nor given an SSE id. Proved by
  `redis-realtime.subscriber.spec.ts` (replay then live, the duplicate dropped, resync past the
  log, resync with no log) and `redis.smoke.spec.ts` against the live instance. The body is
  [`COMMUNICATION.md`](COMMUNICATION.md) line 26.

---

## 12. Communication performance plan — closed

- [x] `CP7.8` **The web process's SIGTERM dispose** `done: 2026-09-26` — it was blocked on where
  a Nitro plugin would live, and the answer is that one would not help: the Node preset serves
  through srvx, whose shutdown fires no Nitro `close` hook and does not exit. The container is
  disposed from `server/container.ts` once srvx's window is over. `CR.34` above.

**Checked by hand on 2026-09-26**, with web, worker and realtime running in dev on one Windows
machine. The scripts were throwaway and are not in the repository; the accounts they made are
`hand-*`, `owner-*`, `outage-*`, `exhaust-*` and `split-*` at `example.test`.

- [x] `CP3.1` **Mail survives an outage** `done: 2026-09-26` — Mailpit stopped at 13:50:53 and a
  member invited in the same second; Mailpit back at 13:53:55; the invitation arrived at 13:55:46,
  through the retries. Then past them: stopped at 13:56:44 and invited, back at 14:09:45, **nothing
  arrived by 14:10:15** — the job had failed for good — and `pnpm queue:replay mail` answered "1
  failed mail job(s) queued again" at 14:10:20, when the invitation arrived.
- [x] `CP5.1` **A separate realtime Redis** `done: 2026-09-26` — the whole stack started with
  `REDIS_REALTIME_URL` at the queue instance. With a stream open, `PUBSUB CHANNELS` listed one
  channel on the queue instance and none on the cache; an invitation's `member.changed` frame
  reached the stream; and `26.5`'s replay log was written there too. **The log key carries the
  client's `app:` prefix**, which pub/sub channels do not — a scan for `realtime:log:*` finds
  nothing. The reference page says so now.
- [x] `CP7.3` **A stream held thirty minutes** `done: 2026-09-26` — through the dev proxy and
  the stream process: `200 text/event-stream`, held 31.5 minutes — inside the age's ±10 % — and
  ended cleanly with `done`, after 128 chunks of keep-alive. Nothing in Node's `http` timeouts cut
  it early. `CORSPlugin` on an event stream from a desktop shell stays unchecked, because there is
  no desktop shell.
- [x] `CP7.7` **The dev proxy in a tab, and two hundred streams** `done: 2026-09-26` — in Chrome, a
  signed-in tab's `fetch` to `/api/realtime/realtime/stream` answered `200 text/event-stream` and
  its first frame arrived 39 ms later, while the stream stayed open: the proxy passes it through,
  unbuffered. Two hundred streams held in the stream process, with its per-person cap raised for
  the run, left the web app's `/api/rpc` where it was — `notification.unreadCount` over 300
  calls:

  | | p50 | p95 | max |
  |---|---|---|---|
  | no streams | 16.1 ms | 31.1 ms | 68.0 ms |
  | 200 streams | 16.0 ms | 29.9 ms | 55.7 ms |

  None of the stream requests reached the web app's log; all went to the stream process.
  **One dev-only finding:** two hundred opens fired in the same tick through the Vite proxy failed
  with `fetch failed` on the client, where batches of twenty all opened. Production puts a real
  proxy there, and a browser opens one or two streams a tab, so it is recorded and not filed.
- [x] `CP1.9` **The client's refetch load** `done: 2026-09-26` — **the measurement found a gap
  and the fix is in the same commit.** Two Chrome tabs on one channel, twenty sends from the other
  member 110 ms apart: each tab made 20 `message.list` calls — one page each, not the two per
  message the review found, so the dedupe held — but one per message, where the plan expected
  about one a second. `refreshNewest` was single-flight with no floor, and each fetch finished
  just before the next frame arrived. It now holds its busy window for the rest of a second, as
  `RealtimeRefetch` does. The same burst then cost each tab **2** calls, 1.8 s apart, with all
  twenty messages rendered in both. `use-conversation-stream.spec.tsx` fails without the floor.

---

## Moved out of `BACKLOG.md` on 2026-09-25

**Verbatim, and nothing here is a task.** By 2026-09-25 the backlog held three open items and five
triggers under about three hundred lines of closed-work notes, history and state. Everything below
is that prose, moved as it stood so nothing is lost and the backlog shows only the work. Headings
keep their section numbers, and every ID resolves as before. The machine-state tables went to
[`STATE.md`](STATE.md) instead, because they are what to undo, not what was done.

### How the backlog came to be

Everything not done, gathered once. Five files used to hold open work and each held a different
kind: `archive/PLAN.md` the unchecked boxes, `archive/REVIEW.md` forty-five defects nothing has
fixed, `archive/STUCK.md` what a session could not do and why, `archive/OPEN.md` the ledger of what
closed and what did not, `archive/TODO.md` three ledger rows. All five moved to `archive/` on
2026-09-20 and this file replaced them. They are still the place each item's **full argument**
lives — every entry below is a summary with a pointer — but nothing is ticked there any more.

**Split on 2026-09-22.** This file had grown to eighty-four closed entries against nineteen open
ones, and a ledger you scroll past four-fifths of to reach the work is one nobody opens. Every
closed entry moved to [`archive/DONE.md`](archive/DONE.md) with its proof intact and its ID
unchanged, and the changelog went with them. What is left here is the work.

**Every archived plan was checked and carries nothing of its own.** Every `[ ]` in
`archive/COMMUNICATION-PLAN.md`, `DB-SCALING-PLAN.md`, `PLATFORM-ADMIN-PLAN.md` and
`IMPLEMENTATION-PLAN.md` maps through `archive/PLAN.md`'s **Where the old IDs went** table to an item that
is either ticked there or listed in section 1 below. The four blockquoted Exit clauses in the
communication plan are `23.5`–`23.11`. `DB-SCALING-DEFERRED.md`'s two items were reopened and
delivered as Phases 18–20. `P2.20` was dropped as moot; `P8.3` is `23.4`, done.

> **The stack runs again, as of 2026-09-20.** Every port it needed — 5432, 6379, 9000, 1025, 8025 —
> was held by two unrelated projects, so nothing could start: the whole of `packages/infrastructure`
> was red with an authentication error from *another project's* Postgres, and two `Container.health`
> cases timed out. Every published port is now the well-known one with a `1` in front, stated once
> in the root `.env`, which is now the only env file. `infra/.env` and `packages/infrastructure/.env`
> are gone, and `check:architecture` §27 fails the build if a port and the URL that dials it ever
> disagree. The infrastructure suite is 35 files and 236 tests green; `composition` is green.
>
> **A second node runs too**, under `pnpm infra:up:sharded` with the two `DATABASE_SHARD_1_*`
> lines in `.env`. That is what proved half of `R.2`, and `24.1`, `24.2` and `24.5` were built and
> proved against it. An entry that is blocked says so.

### Where work stopped — 2026-09-25, as the backlog recorded it


**Every item on the 2026-09-24 list is done except one**, and that one is skipped with its reasons
in its entry. Everything is committed on `dev` and **not pushed**. Build, typecheck, lint, all 29
architecture assertions with none skipped, the full test suite and the smoke suite are green. What
closed, each with its proof in [`archive/DONE.md`](archive/DONE.md):

| ID | What | Proof |
|---|---|---|
| `24.2b` | a job re-reads its placement per transaction | red without it, twice: a spec and a live move |
| `24.3` | read replica per node, used only once caught up | live standby; red without the caught-up check |
| `25.1` · `25.2` | replica status and the switch, on `/platform/status` | over the API; standby +42 vs +0 scans per run |
| `25.3` | colder storage class, a MinIO tier | the live bucket takes a `COLD` transition and refuses an unknown one |
| `24.6` | routed writes at 1× and 10× across two nodes | 0 errors, no misplaced row, 142–159 writes/s at 10× |
| `24.4` | the catalog, measured | zero catalog reads per warm routed write; nothing built |
| `T-036` | the communication row | "Done when" narrowed, as decided |

**`23.14` and `23.21` closed later the same day, decided with the user.** Doing `23.14`
end to end found a sign-up regression from `24.2a`, and that is fixed too — see
[`archive/DONE.md`](archive/DONE.md) §1.

**What is left is not a session's to do.** `S.2` waits for real traffic. `S.3` waits for a node
that is provisioned rather than a second container. Section 6 is triggers, none fired. The
whole-plan verification's reading pass was done on 2026-09-25 and is in section 5.

### §1, the closed phases' notes

### Phase 23 — Loose ends, no gate

**One box left of nineteen.** The three recommendations, the eight browser clauses and the eight
found-on-the-day fixes all closed between 2026-09-20 and 2026-09-22; they are in
[`archive/DONE.md`](archive/DONE.md) §1 with what each was measured against.

**Empty.** `23.14` closed on 2026-09-25, decided with the user — see
[`archive/DONE.md`](archive/DONE.md) §1.

**`24.1`–`24.6` are built, and `24.7` waits on a relation count no node has reached** —
[`archive/DONE.md`](archive/DONE.md) §1. A tenant can be moved, a move under load loses no
acknowledged write, a moved tenant's catalog audit rows reach its own node through the outbox, a
job still writing after the settle is refused rather than landing on the source, and the
projection reads from a standby once it has caught up.

### Phase 25 — The replica panel and the shard map 📁

**Empty.** `25.1` and `25.2` closed with `24.3` on 2026-09-25, and `25.3` the same day —
[`archive/DONE.md`](archive/DONE.md) §1.

### §2 — the closing notes


**Empty. All forty-five were fixed on 2026-09-20** and are in
[`archive/DONE.md`](archive/DONE.md) §2, each with the proof and the specs written for it.

Two are worth finding again without reading the whole list. `R.9` is the one defect that ships
with **no unit test**, because `session.fn.ts` calls `createServerFn` at module scope and hangs
under vitest. And `R.24` changed no behaviour at all, only comments that were untrue — the
behaviour behind it was `23.1`'s decision to take, and it was taken.

**`R.2`'s last owed spec was written on 2026-09-24**: `sharded.smoke.spec.ts` publishes an event
for a tenant on node 1 and drains it from node 1's outbox, and it is red with the catalog unit of
work `R.2` fixed. The file is 7 passed.

### §3 — `S.2`'s history, and `S.3` as it stood

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
  not a tool.** ~~`24.1` is deliberately filed until that node exists~~ — **superseded
  2026-09-22**: `24.1` was decided and built, the routed insert on node 1 lands, and
  `sharded.smoke.spec.ts` is 6 passed. What is left of this entry is a node that is *provisioned*
  rather than a second container on one machine, which is `24.6`'s load test and a deploy.

### §4 — the resolved notes


Each of these sits under a `[x]` in `archive/PLAN.md` as an `unfinished:`, `concern:` or `corrected:` note.
Re-checked against the tree on 2026-09-20; the ones that turned out to be resolved are listed at
the end so nobody chases them. **None is open**: `16.12`, the last, closed with `PF.0` on
2026-09-24 — [`archive/DONE.md`](archive/DONE.md) §4.

**Checked and already resolved**, so the notes in `archive/PLAN.md` and `archive/OPEN.md` are stale rather than
open: `22.12`'s "the two unit-of-work instances are not bound per slice yet" —
`container.ts` binds `routedUnitOfWork` to notification, messaging and ai and `catalogUnitOfWork`
to the rest. `archive/OPEN.md` A.10's "`vitest.smoke.config.ts` has no sweep" — it has
`globalSetup: ["tests/support/orphan-sweep.ts"]`. Phase 20's Exit note "not fixed: a teardown in
every integration spec" — the global sweep is that fix. `T-031`'s "not yet run against a
database" — walked on 2026-09-13 in the communication plan's Phase 2 Exit.

### §5 — what the walks found


Every phase is unit-tested and most are verified against live containers; these are the clauses
the record says were *not* proven, beyond the eight in `23.5`–`23.12`.

**All seven browser clauses were walked on 2026-09-21**, in one pass against `pnpm dev` on
`:13000` with live containers and the worker up. `pnpm platform:grant alice@example.test` was the
setup step the 2026-09-20 walk had not taken; it moves her `loadbearing` membership from `owner`
to `platform_admin`, which is the tier by construction.

**Two accounts, four organizations, and every clause below the API actually called.** What each
clause was measured against is in [`archive/DONE.md`](archive/DONE.md) §5; what the pass left
behind is in the state table at the end of this file. Two findings are worth carrying here rather
than burying in a tick, because the next walk needs them:

- **A platform admin is not a tenant member, and `/notifications` proves it.** Alice with
  `loadbearing` active is refused `/notifications` — `platform_admin` holds the nine platform keys
  and no `notification.inbox.read`. That is the design working, and it is also why the archived
  month had to be manufactured for a *tenant owner* rather than for her.
- **A synthetic mouse click misses in this harness and a real one does not.** Three buttons —
  pause projection, send invitation, restore — read as dead on a coordinate click and fired on
  `element.click()`. Checked before filing anything: `elementFromPoint` returned the button
  itself, so it was the input path and not an `R.44`-shaped missing handler. Worth knowing before
  the next walk files a defect against a button that works.

**The whole-plan verification closed on 2026-09-25**, both halves — the command block and all 26
Exit lines by hand. [`archive/DONE.md`](archive/DONE.md) §5 has what was found.

### §7 and §8 — the closing notes


**Empty.** `T-036` closed on 2026-09-25 with its "Done when" narrowed as decided, so Phase 26
lives in [`COMMUNICATION.md`](COMMUNICATION.md) rather than on this row. `T-037` and `T-038`
closed on 2026-09-21. All three are in [`archive/DONE.md`](archive/DONE.md) §7.


**Empty.** All six closed on 2026-09-21 and 2026-09-22 —
[`archive/DONE.md`](archive/DONE.md) §8. The last of them was never a doc edit at all: three
copies of the `DATABASE_SHARD_<n>_URL` reader, which stay three copies and now run one algorithm,
held together by assertion 29.

### §9 — the performance summary


**Empty. All eight closed on 2026-09-24** and are in [`archive/DONE.md`](archive/DONE.md) §9, each
with its before and after. The short version, at 2 000 tenants on one node:

| | before | after |
| --- | --- | --- |
| a signup, whole founding transaction | ~126 ms inline, and its DDL grows with the node | **21 ms** on a spare |
| `SHARE ROW EXCLUSIVE` on `conversations` per 20 signups | 2 227 samples | **0** |
| the monthly runway pass | 35.6 s | **1.6 s** |
| dropping one tenant | one transaction over seven parents | one statement per table |

**One finding is not a task and needs a decision**: one unpruned read of `notifications` at full
retention exhausts the lock table at ~1 800 tenants, not the ~5 000 the plan estimated. Nothing in
the application issues one. `max_locks_per_transaction` stays 1 024 until a node heads there.

### Do not fix these — stale lines in `archive/`, frozen by design


Six lines inside `archive/` were stale the day the files moved, and the 2026-09-25 verification
added two rows. **They are not tasks.** A file in
`archive/` records what was believed when it was written, and correcting one would make it a worse
record, not a better one. Listed so nobody reads them as current on the way to an entry's body.

| Where | What it says | What is true |
|---|---|---|
| `archive/PLAN.md:34–81` | eighteen phases built, "start at Phase 19" | twenty-two built; the queue is Phase 23 |
| `archive/PLAN.md:87` | `check:architecture` "21/21 today; 23 after Phase 22" | 29 |
| `archive/PLAN.md:3347` | Phase 23 is "three fixes, eight clauses, three from `TODO.md`, and `23.16`" | `23.16` is done; `23.17`–`23.24` came later |
| `archive/OPEN.md:763` | "45 commits on `main`, nothing pushed" | merged as PR #18; `origin/main..HEAD` is empty |
| `archive/OPEN.md:544` | section B line numbers, taken 2026-09-19 | drifted by that night's edits; the IDs are right |
| Phase 22's Exit | "`sharded.spec.ts` fails on exactly the foreign-key constraint `24.1` names" | `24.1` dropped the keys; the spec asserts the write succeeding |
| Phases 17–22's Exits | 20, 21 or 23 assertions; `TENANT_EXEMPT`; `/health`; nine platform keys | 29; `shard.ts`'s `CATALOG`; `/api/health`; ten |
| `archive/REVIEW.md` | line numbers as of `d98c9f3` | one commit behind `885e144`; accurate until the first fix |

---

## Changelog

| Date | Who | Change |
|---|---|---|
| 2026-09-26 | @sami | **Four of section 12's hand checks done in a running app**: mail through an outage and past its retries with `queue:replay`, a separate realtime Redis, a stream held thirty minutes, and the dev proxy in a Chrome tab plus two hundred streams with the web p95 unchanged. `CP7.5` still wants Linux; `CP1.9` and `CP4.9` are measurements still to make |
| 2026-09-26 | @sami | **`26.5` built: a resume is replayed what it missed.** A short log per channel beside the pub/sub, read on a resume after attaching, with a `resync` past it. The first of section 11's communication features, and the one that needed no product decision: the client already sent its last event id |
| 2026-09-26 | @sami | **Section 10 closed but for three, and `CP7.8` with it.** Twenty of the forty-nine review findings closed with the communication performance plan (`14d49db..45633e6`) and twenty-six more on 2026-09-26 in per-layer commits after `e265714`, every one with a spec except `CR.24`, checked by `EXPLAIN`, and `CR.34`, checked by build. Three shipped security defects first: an admin could invite an owner, a deactivated member's keys kept working, and a key could mint a permanent key. Then a stream that re-asks every minute, a rate limit on the six procedures that cost someone else something, the move freeze on every routed write, archive recovery, streamed cold reads, and a web process that disposes once srvx has finished. `CP7.8` was not blocked on where a Nitro plugin lives: srvx fires no Nitro hook on `SIGTERM` at all. `CR.16`, `CR.20` and `CR.33` stay open, narrowed to what is left of each |
| 2026-09-25 | @sami | **`BACKLOG.md` cut to the open work: 393 lines to 93.** Three items were open (`24.7`, `S.2`, `S.3`) and five triggers, under about three hundred lines of closed-section notes, history, walk findings and machine state. The prose moved verbatim to this file's new section, "Moved out of `BACKLOG.md`", under the same section numbers, so every ID still resolves. The machine-state tables moved to [`STATE.md`](STATE.md): they record what to undo, and they are not done work. `S.2`'s title now says what is left, which is checking against real traffic rather than waiting to build |
| 2026-09-25 | @sami | **`23.14` and `23.21` decided with the user and built, and a sign-up defect found by doing it.** The first dashboard is *activity over time*, and it was built against seeded data rather than waiting for real traffic. An unplaceable tenant is now skipped and logged rather than failing the run. It is skipped only when the directory has no row; a catalog that cannot be asked still fails the run. **Walking the dashboard end to end found that every sign-up failed on a two-node stack**, a regression `24.2a` introduced a day earlier: the audit logger resolved an uncommitted directory row through another connection. It is fixed and proved on two nodes. One migration run failed once and succeeded on the retry. Its output was not captured, so its cause is not known. Also: `orphaned-tenants.spec.ts`'s `danglingConversations` case timed out once at 30 s in the full run and passed four times alone. It is a cross-tenant scan that runs close to its budget on this disk, and nothing changed today touches it. `S.2` and `S.3` remain, and neither can be closed in a session |
| 2026-09-25 | @sami | **The 2026-09-24 list, worked through: nine closed, one skipped with its reasons.** `24.2b` first, because it was half built: a job now re-reads its placement at every transaction, and a live move shows the gap before the fix — a late job's write landed on the source. `24.3` added a streaming standby in compose and a read path that uses it only once it has caught up with the primary, so a lagging replica is a slower read and never a stale one. Removing that check made the first read after a write miss its row. `25.1` and `25.2` put the lag and the switch on `/platform/status`. Turning the switch on moved the projection's reads onto the standby (+42 scans vs +0). `25.3` gave the `cold/` prefixes a transition to a MinIO tier, and refuses `GLACIER` and `DEEP_ARCHIVE`, because a restore reads with `GetObject`. `24.6` ran the routed writes at 1× and 10×: 0 errors, and no row on the wrong node. `24.4` measured zero catalog reads per warm write and built nothing. `T-036` closed on its narrowed "done when", and the whole-plan verification ran both halves. **`23.14` was skipped**: ClickHouse held 242 rows over 3 days, mostly spec debris, and its first dashboard is a product choice. **Three things found on the way:** the checkout's `.env` predated the port renumbering and its database the last 104 commits. `mc ilm tier info` exits 0 for a missing tier. And a failing `toBe` on a `pg` pool ran the smoke suite out of heap. Nothing is pushed |
| 2026-09-24 | @sami | **`24.2a` closed, `R.2`'s owed spec written, and work stopped at a clean point on request.** `24.2a` was filed with two options, and asking produced a third that beat both: a moved tenant's catalog audit row goes through node 0's outbox and is written on its own node by a relay. It is saved with the action, so nothing can be lost, and it lives in one place, so the runway, the archive and the projection all look where it is. The reclaim carries late rows before it drops node 0's copy, which retires the old rule that node 0's audit partition is never dropped. `R.2`'s last spec drains node 1's outbox from node 1 and is red on the catalog binding; running that red check drained node 0's real outbox with a relay that delivers nothing, so it was checked afterwards: nothing was pending and nothing was marked. `24.2b` was half built and **reverted rather than committed untested**; its entry records the design and what is left |
| 2026-09-24 | @sami | **Section 9 closed, all eight, and `16.12` with it.** Measured twice at 100, 500 and 2 000 tenants, before and after. **Signup:** the two keys into `conversations` made their tables attach twelve times slower than their neighbours and took `SHARE ROW EXCLUSIVE` on `conversations` 2 227 times in twenty signups; dropped in `0037`, it is zero, and warm spares take the whole founding transaction from 126 ms to 21 ms. **The runway** is 35.6 s → 1.6 s at 2 000, one read and one transaction per page of 200. **The drop** runs a statement per table with no transaction, and its spec is red on the old code. **Three corrections, all found by measuring:** the first run's 2 000 row was taken without the keys, because the smoke's own migrate step applied `0037` mid-run; `PF.6`'s "no `Sort`" assertion was wrong, because the old query sorts too on tables this small, and what the `OR` rewrite actually loses is the index condition; and `PF.7`'s lock ceiling is ~1 800 tenants, not ~5 000, because a lock is per relation *and* per index. **Also closed here:** `24.2`'s work had been left uncommitted by the last session and was verified green and committed first, thirteen commits by layer. The four stale lines in `BACKLOG.md` are fixed: the preamble and `S.3` both said `24.1` was undecided, and `24.7`'s trigger is re-stated from the numbers |
| 2026-09-24 | @sami | **`24.2`, `24.5` and `25.5` closed — a tenant can be moved, and the proof is under load.** Half the move had been built across three commits and the backlog still listed it open. Finishing it found two defects in that half: `prepare` seeded only the runway months, so **no tenant with older rows could ever have moved**; and a retry wrote `on conflict do nothing` over a failed attempt's copy, so a row changed between attempts came back stale and the count check could not see it. And the freeze had a gap: a request places itself once, so one that resolved just before the freeze wrote to the source during the copy. `quiesce` closes it — a settle, then a `SHARE` lock — and the smoke proves it with a straggler holding its transaction across the move, which a sabotaged `quiesce` loses three runs out of three. **Two things found and filed rather than fixed:** `24.2a` — a catalog transaction writes a tenant's audit row and event on node 0 wherever the tenant lives, so after a move node 0's runway stops covering that tenant's `activity_log` and invitations for it fail within two months; and `24.2b`, the settle window does not cover a long job |
| 2026-09-22 | @sami | **Section 9 added: a performance plan for the tenant/partition layer, eight boxes `PF.0`–`PF.7`.** Nothing closed; this is new open work, filed from what the `16.12` run found rather than reasoned. Three live measurements shape it. Signup's ~1.05 s of DDL is not round trips — 60 807 probes at 0.075 ms — but five `ATTACH PARTITION` statements on the two tables still carrying a foreign key to `conversations`, at 158 and 215 ms each against 5–23 ms for the rest; each of those attaches takes `ShareRowExclusive` on `conversations` and blocks every write there for its duration; and dropping tenants was quadratic, 2 a minute at 11 700 partitions. Two decisions taken: the sibling keys are dropped (conversations are never deleted, every insert path already `assertMember`s, and a nightly count catches what leaks), and signup is to pay no DDL at all, so warm spares follow. A Plan agent corrected three things on the way and they are kept: round trips are 2–5% so there is no `DO $$` block; the archive detaches from the tenant partition, not the root, so it does not bite first; and the keyset fix is a redundant range *beside* the row constructor, never instead of it. `16.12` now points at `PF.0`, which it becomes; `24.7`'s triggers were measuring the wrong thing and are re-stated as relation count |
| 2026-09-22 | @sami | **`24.1` decided and built — the ten cross-shard foreign keys are gone.** The entry had been filed for two phases as "a decision about what a production catalog and a production shard do to each other", and the decision was (a): drop them. Mapping it first is what made it small — **nine of the ten were already doing nothing**, because the tenant delete drops partitions before it removes the `organizations` row, and nothing in `src/` deletes a user. `outbox_event` was the exception and the only real change; the leak proved itself when the orphan sweep took 16 real rows on its first run after the migration. The guarantee moved from the database to a nightly job that names the tenants rather than counting them. The smoke case that asserted the `23503` now asserts the write succeeding, which makes the pair a clean red-then-green across the migration, and `sharded.smoke.spec.ts` is 6 passed. Two rule pages stated "every tenant foreign key `ON DELETE CASCADE`" and both were rewritten to say why the rule inverted |
| 2026-09-22 | @sami | **`19.20` closed, and not for the reason it was filed.** The entry said to make the tenant delete a job "when a large tenant's in-request archive bites"; implementing `24.1` found that the delete was **running on the wrong node**. `shardMiddleware` places on the actor's principal and the use-case placed nothing of its own, so a platform admin on node 0 deleting a tenant on node 1 dropped partitions on node 0, found none and reported success. It is the same class as `R.2` and latent only while everything sits on node 0. A job fixes it by construction — `withShard` places by organization id — so `DeleteOrganizationUseCase` now keeps every guard and queues, and `PurgeOrganizationUseCase` does the work on the tenant's own node with no permission to assert and the actor carried in the payload. The wire answers a job id rather than a tally, matching `tenant-export` and `cold-restore` |
| 2026-09-22 | @sami | **`REVIEW.md`'s own gap closed, and closing it found the thing it was most likely to miss.** The review ran without Docker, so its forty-five fixes landed with neither the integration specs nor the smoke suites re-run against them; both ran today — 278 integration tests, 31 smoke. **`LOKI_URL` was commented out in `.env` while Loki was up and answering,** so `observability.smoke.spec.ts` would have skipped silently and the run would have "passed" having proved nothing about the log read-back path. That is `S.2`'s ClickHouse trap in a second place, five days after the first. Uncommented, the file runs 5 cases. The three remaining skips — `routed`, `fan-out`, `tenant-ceiling` — are opt-in scale runs gated on env vars and are their own open items, named rather than counted |
| 2026-09-22 | @sami | **`BACKLOG.md` was split in half and this file is the other half.** It held eighty-four closed entries against nineteen open ones — 106 KB you scroll four-fifths of to reach the work — so every ticked entry moved here with its proof, its ID and the changelog that explains it, and the backlog came out at 25 KB holding only what is open. Nothing was rewritten in the move and nothing was summarised: every moved line is here verbatim, checked line by line rather than trusted. Sections keep their numbers, so `R.7` and `23.15` resolve exactly as before, and the pointers into `archive/PLAN.md` still point where they did. Two prose repairs were needed where entries came out from under an intro that then introduced nothing — Phase 23's three headings and section 2's three severity bands — and both now say what closed and where it went. This is the first file in `archive/` that grows: the plans beside it are frozen records of one day, and `index.md` now names the difference rather than claiming nothing here is ever touched |
| 2026-09-22 | @sami | **Phase 26 left this file whole**, for [`COMMUNICATION.md`](COMMUNICATION.md) — all eight boxes, plus `26.4` from the same phase and `26.8` from section 4 and the two conditional entries in section 6. **Not one of them was blocked**: every item could have been built against the local stack the day it was filed, which is why the move is worth explaining. They share a requirement none of their entries carried — messaging, email and notifications must not slow the app down — and that is a performance and isolation design rather than eight features, so it gets a plan written against these as its input. The new file carries the decisions already reached so nobody pays for them twice: SMTP as a platform default plus a per-tenant override, `auth.*` always on the platform sender because a tenant must never be able to lock people out of signing in, tenant passwords encrypted under a new `MAIL_SECRET_KEY` rather than derived from `AUTH_SECRET`, web push whole or not at all as a third channel in the preference grid. It also carries three things the archived entries get wrong, each found by reading the tree: `26.1` assumes `messages` is unpartitioned and it is not, so a thread `parent_id` cannot reference `id` alone; `StorageGateway.presignUpload` already exists with an adapter, a fake and no production caller; and `26.5`'s stated blocker `R.27` was fixed on 2026-09-20. `T-036` now waits on that plan rather than on a section of this one, and `24.5`'s "4 passed" was corrected to the 5 `S.3` measured. Open boxes: 28 → 19 |
| 2026-09-22 | @sami | `17.2`/`22.1` closed with migration `0034`, and **the gate it waited two phases on was a fact, not a judgement**: "no deployment can hold objects under the old `activity-archive/` key" is checkable, and the answer is that there is no deployment — CI has no deploy job, there are no tags or releases, and the only bucket this system has written to holds `cold/` and `export/`. Outside the migrations that made it, the table had two live references and no reader: the schema and `shard.ts`'s catalog list. Generated rather than hand-written so the snapshot stays the diff base, applied to both nodes and verified on each, with `partition_archive`'s three months intact. `T-036` decided the other way and **stays open**: narrowing its "Done when" to the walk would put a `P1` row reading "done" above eight unbuilt Phase 26 boxes, and the row blocks nothing |
| 2026-09-22 | @sami | **Section 8 is empty, and `R.3`'s two uncovered call sites are covered.** The three `DATABASE_SHARD_<n>_URL` parsers wanted a decision and the answer is that the copies stay: `apps/web/src/env.ts` is under the server-only ban, so no package it could import may name the parser, and `docs/setup/25` forbids the shared schema separately. What was wrong was that there were two *algorithms* — the scripts walked upward and scanned for an orphan, the apps collect-sort-check — and they disagreed about an empty value, which is what a commented-out line in `.env` leaves behind: one node to the apps, and to the scripts an error naming shard 1 as its own missing predecessor. `shard-env.ts` runs the apps' algorithm now, nine specs cover it, and **assertion 29** compares the three bodies with comments and signatures stripped so a fourth divergence is a build failure. Then the two failure hooks, which `R.3` left owed: twenty-three cases, each reading a decoded envelope as well as an `AppError`. **Writing them found a defect nobody had filed** — `reason in CONFLICT_COPY` walks the prototype chain, so a `CONFLICT` with reason `toString` rendered an empty notice rather than any sentence at all. Two more sites had the same shape and both are reachable from the wire: `FIELD_RULE_COPY[rule] ?? "error.unexpected"` never reaches its fallback, because an inherited method is truthy, and `BY_CODE[error.code]` returned a function whose call hands back `"[object Undefined]"` where an `AppError` is declared. `Object.hasOwn` in all three, which is what `AppError.isKnownCode` already used and already explained |
| 2026-09-21 | @sami | `23.26b` built, at the size it was filed at. **A conversation member carries a name now**, and it cannot be a join: `conversation_members` is routed and `users` is catalog, so `ConversationNaming` resolves the page in one catalog statement after the routed read and attaches it by key. `CreateConversationUseCase` names the row it wrote **after** the commit rather than inside `unitOfWork.run` — a crossing that is invisible on one node, so a spec asserts the ordering and is red on the shape that reads more naturally. Its own narrow port rather than `NotificationRecipientReader`, because `Recipient` carries an email address and its `users()` hides deactivated members, which for a thread is how every message somebody wrote goes back to a uuid the day they leave. On the client `ConversationEntity` answers all three questions — its `otherMember` had been written for this and had no caller — so the typing notice, the inbox title and the author line come from one place, and none of them can print an id: `messaging.member.unknown` is the fallback. Proved over `/api/rpc` against live Postgres as well as in nineteen specs |
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
