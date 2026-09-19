# Open — what is broken now, and what `PLAN.md` still leaves undone

The open ledger as of 2026-09-19, derived from a review of the working tree plus the four
commits ahead of `origin/main`, read against [`PLAN.md`](PLAN.md). Nothing is *build*-broken —
`pnpm check:architecture` is 23/23 — so section A is stale prose, a test that leaks, a plan item
that is done but still open, and two small code cleanups. Section B is every unchecked item in
`PLAN.md`, one line each, pointing at the line that holds the full entry.

An item leaves this file one of two ways: the fix lands, or the matching box in `PLAN.md` is
ticked. Nothing here is a third place to argue a decision — the argument stays in `PLAN.md`.

---

## A. Fix now — found by the review

Ordered by what misleads a reader or costs a run first. Each entry is small enough to be its own
commit, and each says the same four things: where, what is wrong, the exact change, and how to
prove it landed. Line numbers are as of 2026-09-19 and drift once anything above them moves.

### A.1 — The cross-node foreign-key count says nine; it is ten — **done 2026-09-19**

Landed as described, in three places: the `sharding.md` paragraph, the spec comment, and a
`corrected:` note under `PLAN.md` `24.1` naming `outbox_event` in scope for both shapes. The
`24.1` inventory's own "drops nine constraints" is now ten.


**Where.** [`packages/infrastructure/docs/reference/sharding.md`](../packages/infrastructure/docs/reference/sharding.md)
lines 183–188, and the comment at
[`packages/infrastructure/tests/smoke/sharded.smoke.spec.ts`](../packages/infrastructure/tests/smoke/sharded.smoke.spec.ts)
lines 219–220.

**What is wrong.** Both say "Nine routed tables carry a foreign key to a catalog one" and list
nine constraints across `notifications`, `notification_preferences`, `conversations`,
`conversation_members`, `messages`, `document_chunks`. `outbox_event` is not routed — it is
`local` (`packages/application/src/primitive/shard.ts` line 36) — but it carries the same
`organization_id → organizations` foreign key (`packages/infrastructure/src/pg/schema/outbox.schema.ts`
line 24), and a local table exists on every node. On node 1 the first routed transaction that
publishes a domain event fails with `23503` on `outbox_event_organization_id_organizations_id_fk`,
and `24.1` — "decides what happens to all nine" — leaves it out.

**The change.**

1. In `sharding.md`, rewrite the sentence at line 183 to count both placements and name the
   local one apart, because it is a different kind of table:

   > Ten foreign keys cross from a shard to the catalog, every one `ON DELETE CASCADE`. Nine are
   > on routed tables: `notifications` → `organizations`, `users`; … `document_chunks` →
   > `organizations`. The tenth is on a **local** table, `outbox_event` → `organizations`, and it
   > matters more, not less: a local table is on every node, so every node's outbox trips it.

   Change line 188's "all nine" to "all ten".
2. In the spec comment at lines 219–220: "Nine routed tables carry … all nine" → "Ten foreign
   keys — nine on routed tables, one on `outbox_event` — cross to the catalog, and `24.1`
   decides what happens to all ten."
3. In [`PLAN.md`](PLAN.md) `24.1` (line 3542), add one sentence naming `outbox_event` as in
   scope for whichever shape is chosen: option (a) must drop its FK as well; option (b) covers it
   for free because the catalog tables are replicated to every shard.

**Verify.** `grep -rn "nine" packages/infrastructure/docs packages/infrastructure/tests/smoke`
matches nothing about foreign keys. `pnpm check:architecture` §15 still passes (no new path).

### A.2 — The sharded smoke leaks a tenant's partitions on both nodes, every run — **done 2026-09-19**

Landed in `afterAll`, before the row deletes. One deviation from the draft below: the
`PgUnitOfWork` placement is `"catalog"`, not `"local"` — that is what `Container` passes the
maintenance gateway in production (`container.ts` line 559) and what
`cold/pg-partition-archive.gateway.spec.ts` line 120 uses. On a one-node `DatabaseCluster.single`
both resolve to the same pool; matching production is the reason to prefer it.


**Where.** `sharded.smoke.spec.ts` lines 146–158, `afterAll`.

**What is wrong.** `beforeAll` (lines 138–143) runs `TenantPartitionSeed` for two fresh-UUID
tenants, one per node. That creates every `PartitionedTable.TENANT_PARTITIONED` child and its
month children — `messages_<hex>`, `messages_<hex>_2026_09`, and so on — on node 0 for one
tenant and node 1 for the other. `afterAll` deletes the `shard_assignments`, `organizations`
and `users` rows, which cascades the *rows* away, but a partition is DDL and nothing drops it.
Each `pnpm smoke` adds a further set for tenants that no longer exist, and
`MaintenanceGateway.partitionsBefore` and the partition-pruning spec enumerate them.

**The change.** Reuse the tenant-delete path's drop, per node, before the row deletes.
`tests/cold/pg-partition-archive.gateway.spec.ts` line 117 already shows the construction:

```ts
// In afterAll, before the `delete from …` statements.
for (const [direct, organizationId] of [
  [catalogDirect, onNodeZero],
  [node1Direct, onNodeOne],
] as const) {
  const cluster = DatabaseCluster.single(direct);
  const maintenance = new PgMaintenanceGateway(
    cluster,
    scope,
    shards,
    new PgUnitOfWork(cluster, scope, shards, "local"),
  );
  await maintenance.dropTenantPartitions(organizationId);
}
```

Add `PgMaintenanceGateway` to the `../../src/pg/repository/index.js` import and `PgUnitOfWork`
to the `../../src/pg/transaction/index.js` import. The gateway detaches then drops, walks the
allowlist backwards so a referencing partition goes before the one it references, and treats an
already-absent child as a no-op — which is why it is reused rather than a `drop table if exists`
loop written here.

**Verify.** With the `sharded` compose profile up, run `pnpm smoke` twice, then on each node:

```sql
select count(*) from pg_class where relname ~ '^messages_[0-9a-f]{32}';
```

The count is the same before and after (the seed's own tenant only). Today it grows by the
allowlist's length each run.

### A.3 — `PLAN.md` item `23.4` is finished but still open, on a premise that is now false — **done 2026-09-19**

Ticked, with the stale Goal replaced by what shipped and a `corrected:` note pointing the two
unlanded Docs at A.4 and A.5. The Phase 23 preamble now counts three fixes, not four. The
residual product work named in the old entry — recipient list, count, opt-out — is `26.7`.


**Where.** [`PLAN.md`](PLAN.md) lines 3396–3416.

**What is wrong.** The Goal says `DigestComposer` is constructed only in its spec and that
`QueueName.NOTIFICATION` and `QueueName.DOCUMENT` have no consumer or producer. None of that
holds: `NotificationConsumer` and `digest.schedule.ts` shipped in `6e31052` (2026-09-12),
`DigestComposer` is deleted, and `DOCUMENT` is removed from `queue-name.ts` in the working tree.
The "Done when" clause is met in full. A reader picking a spare-hour task from Phase 23 either
re-implements the consumer or, following the "alternative", deletes the working one.

**The change.**

1. Tick the box on line 3396.
2. Replace the Goal / Done-when / Docs / Deferred bullets with two that say what shipped and what
   is left:

   > - **Shipped** in `6e31052`: `NotificationConsumer` on `QueueName.NOTIFICATION`, sending
   >   through `container.email`; `digest.schedule.ts` enqueues daily; `DigestComposer` deleted;
   >   `QueueName.DOCUMENT` deleted 2026-09-19.
   > - **Residual:** the two docs it named were not updated — `OPEN.md` A.4 and A.5.

   The "Deferred by decision on 2026-09-06" paragraph can stay as history; the
   ship-versus-delete argument it holds was settled by shipping.
3. The Phase 23 preamble at line 3347 counts "Four … fixes found while walking earlier Exit
   lines". It is prose, not a ledger; leave it or make it three.

**Verify.** `grep -c "^- \[ \]" plans/PLAN.md` drops from 39 to 38, and section B below loses
one line.

### A.4 — The worker consumers reference contradicts itself about `NOTIFICATION` — **done 2026-09-19**

Larger than the draft below, because the gap was larger. The file documents a section per consumer
and had **none for `NotificationConsumer`**, while its summary table listed five of six and its
frontmatter said "Three consumers". So rather than deleting the stale note, the note was replaced
by a real section — the two-job split, the `digest_<org>_<day>` deduplication key, the 5 000-tenant
fan-out cap, and the point that the digest *enqueues* onto `MAIL` rather than sending, which is
what keeps the neighbouring "`MailConsumer` is the only thing that sends" true. The table gained
its row and the description now says six.


**Where.** [`apps/worker/docs/reference/consumers.md`](../apps/worker/docs/reference/consumers.md)
lines 224–227, the `> [!NOTE]` block.

**What is wrong.** It says `QueueName.NOTIFICATION` "still has no consumer", that it "gains one
in Phase 3 of `plans/archive/COMMUNICATION-PLAN.md`", and that `DigestComposer` "is deleted" as
a future act. Line 244 of the same file, in the cross-tenant table, documents
`NotificationConsumer.fanOut` looping `digestOrganizations` per node. The consumer exists; the
note describes the tree before `6e31052`.

**The change.** Delete the four-line NOTE. Nothing replaces it: the consumer's own section and
the table row at line 244 document what ships, and the `DigestComposer` history is already in
`docs/setup/25-worker-app.md` line 351, written in the past tense.

If a forward pointer is wanted, one sentence in the `NotificationConsumer` section: "The digest
and its schedule landed in `6e31052`; the follow-ups — per-tenant hour, grouping — are
`PLAN.md` `26.7`."

**Verify.** `grep -n "no consumer" apps/worker/docs/reference/consumers.md` matches only the
`MaintenanceConsumer` heading at line 31. `pnpm check:architecture` §15 passes.

### A.5 — The setup guide's `QueueName` block omits `EVENT` — **done 2026-09-19**

The block had a second problem the draft did not catch: it wrote `public static readonly ALL = [...]`,
which freezes the binding and not the array — the static mutable state
[`classes`](../docs/ai/rules/classes.md) bans, in a guide that tells the reader to write this file.
So the whole block was replaced with the real source, module constants and `Object.freeze` included,
which fixes the missing `EVENT` and the banned shape together. A short note under it says why the
freeze is there, so the next reader does not simplify it back.


**Where.** [`docs/setup/15-infrastructure-package.md`](../docs/setup/15-infrastructure-package.md)
lines 471–487, the `ts` block under Step 15.4.

**What is wrong.** The block lists five queues — `EMBEDDING`, `NOTIFICATION`, `ANALYTICS`,
`MAINTENANCE`, `MAIL` — and an `ALL` of the same five. The source,
`packages/application/src/primitive/queue-name.ts`, has six: `EVENT` carries the outbox drain
and the deliveries it fans out to. The working-tree edit to this block removed `DOCUMENT`
(correct) and did not add `EVENT`, so the documented closed union is still wrong, in the other
direction.

**The change.** Add `EVENT` in the source's position, after `MAIL`, in both the static members
and `ALL`:

```ts
  public static readonly MAIL = "mail";
  // The outbox drain and the deliveries it fans out to. Its own concern because the
  // drain must not queue behind the deliveries it just created.
  public static readonly EVENT = "event";

  public static readonly ALL = [
    QueueName.EMBEDDING,
    QueueName.NOTIFICATION,
    QueueName.ANALYTICS,
    QueueName.MAINTENANCE,
    QueueName.MAIL,
    QueueName.EVENT,
  ] as const;
```

Copy the literal from the constant declared above the class in `queue-name.ts` rather than
assuming `"event"`.

**Verify.** Every name in the doc block appears in `QueueName.ALL` and vice versa: six each.

### A.6 — `DatabaseCluster.single` re-implements `DatabaseCluster.of` — **done 2026-09-19**

Both duplicates collapsed, not just the one: `single` and `from` now delegate to `of`, which is the
only factory that reaches the private constructor. What a node carries is declared in one place, so
`24.3`'s replica handle is one edit rather than three. `from` keeps the two `new Database(` calls
that §23 asserts are the only ones in `src/`, and the empty-cluster check now lives once, in `of`.


**Where.** [`packages/infrastructure/src/pg/primitive/database-cluster.ts`](../packages/infrastructure/src/pg/primitive/database-cluster.ts)
lines 53–57.

**What is wrong.** `of(nodes, resolver)` was added for the sharded smoke and maps a list of
`{ pooled, direct }` pairs onto the constructor's `nodes` / `directNodes` arrays. `single`
predates it and does the same mapping for one pair with the `NODE_ZERO` resolver. Three static
factories — `from`, `of`, `single` — each spell what a node carries, so `24.3`'s replica handle
is a change in three places, and the "shares the pool … keeps `close()` honest" comment is
duplicated verbatim above `of` and `single`.

**The change.** Make `single` a one-line delegate and keep one comment:

```ts
  // One node, node 0, from an already-open `Database`: `of` with the resolver that
  // answers 0 for every key, which is what an unsharded deployment is.
  public static single(database: Database, direct?: Database): DatabaseCluster {
    return DatabaseCluster.of([{ pooled: database, direct: direct ?? database }], NODE_ZERO);
  }
```

`from` stays separate because it is the one place that writes `new Database(` (§23 asserts it).
It could construct the pools and then delegate to `of`, leaving one call to the private
constructor; do that if it reads cleanly, it is not required.

**Verify.** `pnpm --filter @loadbearing/infrastructure test` — every spec calling
`DatabaseCluster.single` (the cold, analytics and smoke suites) behaves as before;
`pnpm check:architecture` §23 still finds exactly one `new Database(` in `src/`.

### A.7 — Four pools are opened inside a `describe.skipIf` body — **done 2026-09-19**

The early return, and the two `?? stack.database.url` fallbacks gone with it. Confirmed by running
the spec with no `DATABASE_SHARD_1_URL`: one file skipped, no tests, no error, and vitest is happy
with a describe body that registers nothing.


**Where.** `sharded.smoke.spec.ts` lines 83–86.

**What is wrong.** `describe.skipIf(!shard1)` still *executes* its callback at collection time
so vitest can register the tests; only the tests and hooks are skipped. So without
`DATABASE_SHARD_1_URL` the four `new Database({ url })` calls run, and because `shard1` is
`undefined` the two node-1 pools are built from `shard1?.url ?? stack.database.url` — node 0's
URL. `pg` pools are lazy, so nothing connects today, but `afterAll` is skipped with the rest and
would never close them if they did, and the fallbacks exist for no reason except to keep the
callback from throwing. A future edit that let a test run outside the skip would read node 0
while believing it read node 1.

**The change.** Return early when there is no second shard and drop the fallbacks. Everything
below then sees `shard1` narrowed to defined:

```ts
describe.skipIf(!shard1)("a two-node cluster", () => {
  // Collection still runs this body when the suite is skipped; nothing below may open
  // a pool or read `shard1` unless it is there.
  if (!shard1) return;

  const logger = new RecordingLogger();
  …
  const node1 = new Database({ url: shard1.url });
  const node1Direct = new Database({ url: shard1.directUrl });
```

Vitest accepts an empty describe body and reports the suite skipped either way. The other shape
— `let` declarations assigned in `beforeAll` — also works but drags `cluster`, `resolver`,
`conversations` and `messages` into `beforeAll` with them, since they close over the pools; the
early return leaves the body as it is.

**Verify.** `pnpm --filter @loadbearing/infrastructure test tests/smoke/sharded` without
`DATABASE_SHARD_1_URL`: the suite is skipped and no `Database` is constructed (a temporary
`throw` in the constructor proves it; remove it after). With the `sharded` profile up: all four
tests pass as before.

### A.8 — `PLAN.md` `24.5` names a file that does not exist — **done 2026-09-19**

The entry names the real path and now says how to make the suite run rather than skip:
`pnpm infra:up:sharded`, then the two `DATABASE_SHARD_1_*` lines uncommented in `.env`.


**Where.** [`PLAN.md`](PLAN.md) line 3575.

**What is wrong.** "`sharded.spec.ts` green is this phase's Exit". The file that shipped in
`4b04ba3` is `packages/infrastructure/tests/smoke/sharded.smoke.spec.ts`, and it is gated on
`Stack.shard1` — it is skipped, not green, unless the `sharded` compose profile is up.
`check-architecture` §15 checks backticked paths under `docs/` and `packages/*/docs/`, not
`plans/`, so nothing catches this.

**The change.** Replace the entry with:

> - [ ] `24.5` **Two-node proof** — `packages/infrastructure/tests/smoke/sharded.smoke.spec.ts`
>   green under the `sharded` compose profile (the suite is skipped without
>   `DATABASE_SHARD_1_URL`) is this phase's Exit, plus a tenant move under load with no lost
>   writes.

Check how `docs/infra/` says the profile is started before writing that into the entry; the
point is that the Exit says how to make the suite run rather than skip.

**Verify.** `grep -n "sharded.spec.ts" plans/PLAN.md` matches nothing.

### A.9 — `packages/infrastructure/tests/` does not mirror `src/` — **decided 2026-09-19: option (a)**

The rule is amended, in `docs/opinions/files.md` and `docs/ai/rules/files.md` together. The mirror
stays the default and `infrastructure` is named as the single exemption, because its `src/` is
organised by vendor rather than by subject — mirroring `src/pg/repository/` would put twenty-five
specs in one directory, which is the pile the vendor split exists to avoid.

**The argument that decided it** was not the directory size but the spec with nothing to mirror:
`tests/rbac/tenant-cascade.spec.ts` asserts a tenant delete reaches every referencing table, and
`tests/maintenance/tenant-partition.spec.ts` covers a seed, a gateway and the allowlist at once.
Neither tests a file, so the mirror rule has no answer for them, and a rule with no answer gets one
invented per author. That is what the existing drift was.


**Where.** [`docs/ai/rules/files.md`](../docs/ai/rules/files.md): "Tests mirror `src/` and never
live inside it. `src/error/app.error.ts` → `tests/error/app.error.spec.ts`", against
`packages/infrastructure/tests/`.

**What is wrong.** The two specs added in this range —
`tests/platform/tenant-directory.spec.ts` (covering `src/pg/repository/pg-tenant.repository.ts`)
and `tests/primitive/placement.spec.ts` (covering `src/pg/primitive/base.repository.ts`) — sit
in folders named by *subject*, not by `src/` path. They are not the first: `tests/messaging/`,
`tests/rbac/`, `tests/cold/`, `tests/analytics/` already do this. The rule as written is not
what the package does, and `docs/opinions/files.md`, which wins on disagreement, should be read
before deciding which side moves.

**This is a decision, not a fix.** Two honest outcomes; pick one, and do not leave the third,
which is silence:

- **(a) Amend the rule.** In `docs/ai/rules/files.md` and `docs/opinions/files.md`, say that
  `tests/` mirrors `src/` *by default*, and that a package whose `src/` is organised by vendor
  (`infrastructure`: `pg/`, `redis/`, `s3/`) may organise `tests/` by subject, because a spec
  there exercises a slice across vendors — a repository, its schema, its seed — rather than one
  file. Name `infrastructure` as the one package that does. `check-architecture` §13 (rule files
  drifting from `docs/opinions/`) must still pass, so both files change in the same commit.
- **(b) Move the specs.** `tests/platform/tenant-directory.spec.ts` →
  `tests/pg/repository/pg-tenant.repository.spec.ts`; `tests/primitive/placement.spec.ts` →
  `tests/pg/primitive/base.repository.spec.ts`; and the same for every pre-existing folder that
  does not mirror. A larger diff with no behaviour change, touching suites this range did not.

The cheaper and more truthful answer is (a): the layout has been stable across several phases
and reflects how the package is actually tested.

**Verify.** For (a): `pnpm check:architecture` §13 passes with both files edited. For (b):
every moved spec still runs under `pnpm --filter @loadbearing/infrastructure test`, and
`git log --follow` keeps each file's history.

### A.10 — A teardown that deletes a user runs out of locks, and it has taken half the test suite with it — **done 2026-09-19**

**Fixed in three parts, and the leak is now self-cleaning.**

1. **A global teardown**, `packages/infrastructure/tests/support/orphan-sweep.ts`, registered as
   `globalSetup` in `vitest.config.ts`. After every run it drops the partitions of tenants whose
   organization row is gone. Measured end to end: orphans at 0 before a full suite run, the sweep
   reports `dropped 196 partitions` after it, and orphans are 0 again. 196 is 28 tenants × 7
   tables, which is exactly the leak rate this entry measured.
2. **The backlog is cleared.** Both nodes report **0** orphan partitions, down from 704 tenant sets
   on node 0.
3. **`max_locks_per_transaction` is 1 024 and live** on both containers, applied by recreating them
   with `pnpm infra:up:sharded`.

`pnpm --filter @loadbearing/infrastructure test` is **34 passed (34), 227 passed (227)**, and the
sharded smoke is 4 passed with no teardown error.

**Why a global teardown rather than a call in each spec**, which is what the plan below said.
`tests/support/database.ts` has exported `dropTenant` the whole time, and its comment already
explains the exact failure — twelve specs that found a tenant never called it. A thirteenth would
not either. One sweep is less code than twelve edits, and it covers specs not yet written, which is
the property this entry needs: the failure recurs, so the fix has to be one nobody can forget.

**Two things the implementation had to learn.** A `conversations` partition **cannot be dropped
directly** — Postgres hangs the `messages` and `conversation_members` foreign keys off every
partition of the table they point at, so the drop fails with "other objects depend on them". The
sweep asks `pg_constraint` whether a parent is referenced and detaches first only where it is,
which keeps the fast batched path for the other six tables. And detach is **0.56 s**, not the
2.4 s this entry recorded: that earlier figure was measured while a second sweep was running
against the same parent.

**The budget is deliberate.** The sweep drops at most 500 partitions a run, so a teardown can never
block a test run for long; a larger backlog clears over several runs. Clearing 1 756 in one pass,
for this entry, took 78 seconds with the constant temporarily raised.

**Still worth doing, not blocking:** `vitest.smoke.config.ts` has no sweep. Its two tenant-creating
specs both clean up after themselves, but a run killed half way through leaves tenants behind, which
is the case `tenant-ceiling.smoke.spec.ts` already keeps a slug for.

---

The original entry follows, as found.

**The most urgent item in this file.** `pnpm --filter @loadbearing/infrastructure test` is red:
**17 of 34 test files fail**, all with the same error. The test bodies are fine — 226 of 227
individual tests pass — and every failure is in a `beforeAll` or `afterAll` hook, which is why
`pnpm test` reports a wall of red for assertions that all passed.

**Found 2026-09-19 while verifying A.2**, against the live containers. Not caused by A.2, A.6 or
anything else in this file: every failure reproduces with those changes stashed.

**Where.** Any hook that deletes a user, including `sharded.smoke.spec.ts` `afterAll`. The failing
files are the whole of `tests/rbac/` (8), `tests/member/` (2), `tests/messaging/` (2),
`tests/maintenance/` (2), `tests/pg/partition-pruning.spec.ts`, `tests/platform/platform-tier.spec.ts`
and `tests/outbox/pg-outbox.spec.ts` — the last of which passes when run alone, so it is collateral
from the others rather than a failure of its own.

**What happens.** All four tests pass; the teardown then fails:

```
53200 out of shared memory
hint: You might need to increase "max_locks_per_transaction"
where: SQL statement "DELETE FROM public.conversation_members WHERE $1 = user_id"
```

`users` is deleted by primary key, and the cascade to `conversation_members` must take a lock on
**every partition of that table on the node** — one per tenant that has ever existed there, not
one per tenant the test touched. `max_locks_per_transaction` is Postgres's default 64 on both
containers. The dev cluster this was run against holds far more tenant partitions than live
tenants:

| Node | Live organizations | Orphan tenant partition sets |
|---|---|---|
| `postgres` (node 0) | 27 | 606 |
| `postgres-shard-1` (node 1) | 0 | 6 |

So the failure is the accumulated leak — A.2's leak, plus the tenant-ceiling measurement's —
arriving at the point where one cascading delete no longer fits in a transaction's lock table.
A.2 stops the growth. It does not clear what is already there, which is why the suite still fails
on this machine after A.2 landed.

**This is a local-database condition, not a defect in the code under test**, which is exactly what
makes it expensive: it does not reproduce on a fresh clone, it arrives gradually on a machine that
has run the suite often, and it presents as seventeen unrelated suites breaking at once rather
than as one thing. A CI run on an empty database stays green while every developer who has had the
repo for a month sees red.

**The change, in two parts — and the obvious third is not one.**

1. **Clear the backlog.** `partly done 2026-09-19 — the suite is green; ~1 860 orphan partitions
   remain.` The orphans belong to organizations that no longer exist, so nothing reachable is
   lost. The predicate is "no row in `organizations` matches this partition's hex", checked
   against the live catalog before anything was dropped: 620 orphan tenants on node 0 and 6 on
   node 1, and **0 of the 71 live tenants** in the list.

   **Node 1 is fully clear. Node 0 has `document_chunks`, `notification_preferences`, `messages`
   and `conversation_members` cleared, and still holds 620 orphan sets each of `conversations`,
   `notifications` and `activity_log`** plus their month children. That was enough: the cascade
   that was failing is `users` → `conversation_members`, so the suite went green at that point.
   The rest is housekeeping, not a blocker.

   **The backlog regrows, because A.2 fixed one spec and twelve others have the same defect.**
   Re-measured after the green test run above: the four tables cleared on node 0 were back to 28
   orphan sets each, and the three uncleared ones had gone from 620 to 648. That is 28 new orphan
   tenants from a single `pnpm --filter @loadbearing/infrastructure test`. Nineteen specs create a
   tenant and delete it; only `maintenance/tenant-partition.spec.ts`, `pg/partition-pruning.spec.ts`,
   `cold/pg-partition-archive.gateway.spec.ts`, `smoke/tenant-ceiling.smoke.spec.ts` and — since
   A.2 — `smoke/sharded.smoke.spec.ts` drop the partitions again. **The other twelve leak on every
   run**, including the whole of `tests/rbac/` and `tests/member/`.

   So clearing the backlog is worth doing once, but **the durable fix is a shared teardown**.
   Resolved by the global sweep described at the top of this entry, rather than by twelve edits.

   **Two things worth not rediscovering.** Drop the partitions **directly and in batches** —
   `drop table a, b, … ;` fifty at a time — rather than one `detach` + `drop` pair per partition.
   Per-partition detach takes an `ACCESS EXCLUSIVE` lock on a parent that has hundreds of
   partitions, which makes the sweep quadratic: measured at 2.4 s per partition, against 0.7 s per
   batch of fifty, about 170× faster. And **order by the reverse of
   `PartitionedTable.TENANT_PARTITIONED`**, which is `document_chunks`, `notification_preferences`,
   `messages`, `conversation_members`, `conversations`, `notifications`, `activity_log` — the
   allowlist's own order, not the order its `public static readonly` fields are declared in, which
   differs and will produce a dependency error on `conversations`. Each batch autocommits;
   wrapping the sweep in one transaction needs exactly the locks that are missing.
2. **Raise `max_locks_per_transaction`.** `done 2026-09-19`, in `infra/docker-compose.yml`. It was
   Postgres's default 64 on both containers and is now 1 024, on the catalog and the shard alike.
   This is headroom, not a fix — it is worth having *because* part 1 is done, not instead of it.
   **It needs a container restart to take effect**, so the green run above was achieved without it;
   it applies from the next `pnpm infra:up`.

**What does not work, so nobody spends an afternoon on it:** deleting the user's
`conversation_members` rows first, inside the two tenants under test, does **not** bound the lock
count. The cascade is a referential-integrity trigger on `users`, and it issues
`DELETE FROM conversation_members WHERE user_id = $1` with no partition key in the predicate. The
planner therefore touches every partition of the table whether or not any rows are there, so the
locks are taken on an empty sweep just the same. The lock count is a function of how many
partitions exist, and nothing the test does to its own rows changes it.

**That generalises past the tests.** Any delete of a `users` or `organizations` row in production
takes a lock per tenant partition on each referencing table, so this is the same ceiling `24.1`'s
option (a) is about — the FK inventory that A.1 corrected to ten. A tenant delete is already a
maintenance job; a *user* delete is not, and at a few thousand tenants on a node it becomes one.
Worth a line in `24.1` when that decision is made.

**Verified 2026-09-19.** `pnpm --filter @loadbearing/infrastructure test` reports **34 passed (34)
files, 227 passed (227) tests**, from 17 failing files and 1 failing test before. The sharded smoke
reports four passing tests with no `afterAll` error, and the `messages_<hex>` count on both nodes
is identical before and after the run — which is A.2's fix proved end to end on a live two-node
cluster rather than by reading it.

**The A/B that proved A.2 works**, recorded because it is the cheapest way to re-check it:
count `messages_<hex>` relations on both nodes, run the suite, count again. With A.2 the counts
held at 1898 and 18; with A.2 stashed they went to 1901 and 21. The three per node are one tenant
partition and its two month children.

### Already filed in `PLAN.md`, still true

These were found while walking earlier Exit lines and are open there; listed so this file is
complete on its own.

- `23.1` — the `jobId` duplicate-suppression window is ~5 s, not `removeOnCompleteAgeSeconds`. Not a correctness bug. **A recommendation is filed under the entry, 2026-09-20: take the seconds-long window and correct the note.** Unimplemented; the call is the owner's.
- `23.2` — `pnpm smoke` publishes a probe job onto the live `MAINTENANCE` queue; a running worker logs `queue.job.failed`. **Recommendation filed: publish to a queue name no consumer listens on**, which costs no `QueueName` member because the port takes a `string`.
- `23.3` — the QueryClient is not dehydrated, so every loader prefetch is thrown away. **Recommendation filed, and it is a fourth option: name `DehydratedState` in the router's `SerializableExtensions`.** No dependency, no cast, no version bump — written, typechecked, built, served, then reverted.
- ~~`23.16`~~ — closed 2026-09-20. The built bundle now serves `/` under `boot-smoke.mjs web`, in CI.

---

## B. Not done — every unchecked item in `PLAN.md`

Thirty-four boxes, all in Phases 23–26: thirty-two left after `23.4`, `23.13`, `23.16`, `25.4`,
`26.2`, `26.8` and `26.9` closed, plus `23.20` and `23.21`, both found that night and filed rather
than fixed. `23.17`, `23.18`, `23.19`, `23.22`, `23.23` and `26.12` were added and closed in the same night, so
none of them ever had a box here. Phases 1–22 have none. The line number is the pointer; the body is not
paraphrased here, and the numbers drift as `PLAN.md` is edited above them.

### Phase 23 — Loose ends (no gate, any spare hour)

Fixes found on the way

- `23.1` **The `jobId` duplicate-suppression window** — line 3354
- `23.2` **`pnpm smoke` publishes a probe job onto the live `MAINTENANCE` queue** — line 3370
- `23.3` **The QueryClient is not dehydrated** — line 3376
- ~~`23.4` **worker requires SMTP for a digest it never sends**~~ — closed 2026-09-19, see A.3

Exit clauses that still need a browser

- `23.5` **The inviter's second tab refetches the member list without a reload** — line 3420
- `23.6` **The loader's prefetch of page 1 and the unread count reach the browser** — line 3424 (defeated by `23.3` today)
- `23.7` **The bell count moves on refocus** — line 3429
- `23.8` **A row is marked read optimistically and stays read after refetch** — line 3433
- `23.9` **Killing the web process and restarting it reconnects the stream, and a `resync` frame arrives** — line 3437
- `23.10` **A sent message appears optimistically** — line 3441
- `23.11` **Typing indicator clears** — line 3445
- `23.12` **Record the walk** — line 3449 (ticks the Exit blocks in `archive/COMMUNICATION-PLAN.md` and closes `T-036` in `TODO.md`)

From `TODO.md`

- ~~`23.13` **Assert that every event code has an emitter**~~ — closed 2026-09-20: `check:architecture` §24, and `shard.assignment.created` gained the emitter it never had
- `23.14` **Bring back an analytics reader, with the first dashboard** `P3` `~8h` `#api` `#db` — line 3470
- `23.15` **The English fallback layer is now dead payload** `P3` `~3h` `#ui` — **recommendation filed 2026-09-20: drop the base layer**, with the measurement (3 471 characters of unreachable English on every `bn` page) and the two reasons the entry gave for keeping it, neither of which holds as built
- ~~`23.16` **The web boot smoke is still switched off for a bug that is fixed**~~ — closed 2026-09-20: `boot-smoke.mjs web` probes `/` and runs in CI

Found on the way, 2026-09-20

- `23.20` **The shipped configuration warns about itself on every worker boot** — filed with a recommendation and **not** implemented: which of three shapes is right is a defaults decision
- `23.21` **The worker's first boot against a real stack is not clean** — two more from the same forty-five seconds: `partitions-boot` stalls at 78 tenants, and one unplaceable tenant fails the whole analytics run through the wrong log line. Both filed with a recommendation, neither implemented

### Phase 24 — The physical split (gated on a second shard being provisioned)

- `24.1` **The foreign-key decision** — **recommendation filed 2026-09-20: option (a), drop the FKs and sweep**, with the measurement behind it. A `users` delete already costs a `conversation_members` scan per tenant partition; (b) would make that fire on every node, and (a) turns it into a delete that prunes to one partition
- `24.2` **Tenant move** as a `MaintenanceConsumer` job — line 3559
- `24.3` **Read replica per shard** — `DATABASE_SHARD_<n>_REPLICA_URL`, `cluster.reader(key)` — line 3567
- `24.4` **The catalog is the last single primary** — measure first — line 3571
- `24.5` **Two-node proof** — the sharded smoke green, plus a tenant move under load — line 3575 (**stale filename; see A.8**)
- `24.6` **Load test** the routed paths at 10× — **half ran 2026-09-20; the other half cannot.** A warm placement resolve is 679 µs, one cache read; a routed *write* on node 1 is a `23503` before it can be timed, which is `24.1`
- `24.7` **A pooled partition for the long tail** — line 3581

### Phase 25 — Replica panel and shard map

- `25.1` **Status** — `InspectPlatformStatusUseCase` grows a `replica` block — line 3602
- `25.2` **The switch** — `platform_policy.replica_reads_enabled`, `toggle-replica-reads.use-case.ts` — line 3606
- `25.3` **Colder storage class** — `transitionAfterDays` on `LifecycleRule` — line 3612
- ~~`25.4` **The shard map**~~ — closed 2026-09-20: `/platform/shards`, two procedures, twenty-one new tests. The rendered page against a signed-in admin is the one clause still unproven — `STUCK.md` S.1
- `25.5` **The move button** — disabled until Phase 24 — line 3626

### Phase 26 — Communication follow-ups

- `26.1` **Threads, reactions, attachments** — line 3645
- ~~`26.2` **`Popover` in `ui`**~~ — closed 2026-09-20: the bell opens a peek, and the panel is unmounted rather than hidden so no page pays for a list nobody opened
- `26.3` **Web push** — a `PushPublisher` port beside `MailPublisher` — line 3651
- `26.4` **Message archive** — old partitions streamed to S3 — line 3654
- `26.5` **Redis Streams behind `RealtimeSubscriber`** — line 3657
- `26.6` **Global stream cap and presence** — line 3660
- `26.7` **Per-tenant digest hour**, channel mentions, notification grouping — line 3663
- ~~`26.8` **Load test** the three §6 paths at 10×~~ — closed 2026-09-20: the answer is message fan-out, nineteen of twenty-four seconds, and it is not the database
- ~~`26.9` **Resend actions**~~ — closed 2026-09-20: verification already shipped; the invitation resend is a reissue, and the same-primary-key upsert is now asserted against Postgres
- `26.10` **A delivery log, if the question actually arrives** — line 3674
- `26.11` **Move from SMTP to a provider API** — line 3680

---

Ten review findings (eight fixes, one decision, one found while verifying). **All ten are done** as
of 2026-09-19, A.9 as a decision.

Verified on this machine, against the live containers:

| Check | Result |
|---|---|
| `pnpm check:architecture` | 23 of 23 |
| `pnpm lint` | clean, 1 119 files |
| `pnpm check:comments` | 0 blocks over two lines |
| `pnpm typecheck` | clean |
| `infrastructure` suite | 34 of 34 files, 227 of 227 tests |
| sharded smoke | 4 of 4, no teardown error |
| orphan partitions, both nodes | 0, and self-cleaning |

Section A is closed. What remained at that point was the four already-filed fixes restated above
(`23.1`, `23.2`, `23.3`, `23.16`) and the thirty-eight unchecked `PLAN.md` items in section B.
Section C below is what has closed since.

---

## C. Landed since — 2026-09-20

One line per section-B item that has closed, newest last. Each says what shipped and how it was
proved; the argument stays in `PLAN.md`, which is also where the tick is.

Verified on this machine at the end of that session, against the live containers — Postgres,
pgBouncer, two Redis, MinIO, Mailpit, Loki, ClickHouse and a second Postgres under the `sharded`
profile:

| Check | Result |
|---|---|
| `CI=true pnpm check:architecture` | 26 of 26, no skip |
| `pnpm typecheck` | clean |
| `pnpm lint` | clean |
| `pnpm test` | 18 packages, every file green |
| `pnpm smoke` | 6 of 6 files, 29 tests; 3 skipped are the opt-in measurements |
| `pnpm check:contrast` | 117 pairings, 108 colours in gamut |
| `pnpm check:comments` | 0 blocks over two lines |
| `pnpm deps:check` · `pnpm repo:check` | silent |
| `boot-smoke.mjs web` · `worker` | web serves `/`; worker is a Linux gate (see below) |

**One local caveat, and it is the machine's rather than the tree's:** `boot-smoke.mjs worker`
cannot pass on Windows. It reports `booted` and then `did not exit cleanly on SIGTERM`, because
Windows has no catchable `SIGTERM` — the worker gate is a Linux one, and CI is where it runs.

- `23.13` **Every event code has an emitter** — `check:architecture` §24, with five fixtures.
  It failed on its first run: `shard.assignment.created` had been declared since the routing seam
  and never emitted. `PgOrganizationFounder` emits it now, after the commit rather than inside the
  transaction. The count moved to twenty-four in `AGENTS.md`, `workflow.md` and `docs/setup/26`.
- `23.16` **The web boot smoke** — `boot-smoke.mjs web` boots `.output/server/index.mjs` on a
  kernel-assigned port and requires `/` to answer 200 with a body; `ci.yml` runs it beside the
  worker. **The entry's own "Done when" named `/api/health` and that is the wrong probe** — it
  renders no JSX, so it answers 200 straight through the `T-032` bug the gate exists for, and it
  reports dependencies, so it answers 503 for a ClickHouse nobody started. Both measured.
- `25.4` **The shard map** — `/platform/shards` behind `platform.shards.read`, all twelve steps of
  the slice. Two procedures rather than the entry's one, because a lookup that re-read the node
  list per keystroke is not a lookup. The node list counts the **directory**, not the cluster and
  not `organizations`: asking the cluster reports what `DATABASE_SHARD_<n>_URL` was set to, and
  joining `organizations` hides the row an operator most wants. Twenty-one new tests, including a
  statement-count assertion that a page costs two queries whatever it holds. **Found building it:**
  an aggregate over a timestamp column comes back as a string unless it carries `.mapWith`, because
  drizzle replaces node-postgres' parsers and converts per column.
- `26.9` **Resend actions** — **half of it already shipped** and the entry did not know:
  "resend verification" is `VerifyEmailNotice`'s button, rate-limited at three a minute in the
  auth factory. What landed is the invitation resend, and it is a **reissue** — only the digest
  is stored, so the old link stops working and the copy says so. The mail failure is *not*
  swallowed here, unlike `InviteMemberUseCase`'s: there the mail is a consequence of the work,
  here it is the work. **Checked rather than reasoned about:** the reissue re-inserts the same
  primary key, so it conflicts on `invitations_pkey` as well as on the index `ON CONFLICT` names.
  It resolves through the update path, and a spec now says so.
- `26.8` **Load test the three §6 paths** — `tests/smoke/fan-out.smoke.spec.ts`, opt-in through
  `FAN_OUT_SCALE`, with the numbers in `packages/infrastructure/docs/reference/fan-out.md`. **One
  message to 25 000 members costs about 24 seconds, and nineteen of them are Redis publishes** —
  dead linear at 0.75 ms each, one serialised round trip per member. The two paths §6 warns about
  loudest are flat: 0.2 ms a notification row, 13 µs a digest recipient. **And a fourth finding,
  from the teardown:** deleting a `users` row costs a `conversation_members` scan per tenant
  partition, which is A.10 with a number on it — three hundred users exceeded a 30-second
  `statement_timeout` at 82 tenants.
- `26.12` **The realtime fan-out goes out in chunks** — new, found by `26.8` and fixed in the same
  night, which is what a load test is for. `MessagingRealtimeSubscriber` awaited one publish per
  member; `DeliverNotificationUseCase` awaited two round trips per recipient. Both now issue their
  frames in bounded chunks: **769 ms instead of 17 944** for 25 000 members. The measurement times
  both shapes, so the difference cannot quietly disappear, and a new subscriber spec runs a room of
  1 201 members across three chunks to prove nobody is dropped or served twice.
- `24.6` **Load test the routed paths** — half of it ran and the other half **cannot**, which is
  worth knowing before somebody schedules it. A warm placement resolve is **679 µs on this stack,
  one cache read and never a query**; a miss is 2 568 µs, three round trips, once per key per five
  minutes; and the cross-tenant walk is serial by construction. **A routed write on node 1 is a
  `23503` before it is a measurement**, because every routed table carries a foreign key to a
  catalog one — so there is no routed throughput number until `24.1` is decided.
- `26.2` **`Popover` in `ui`** — the bell opens a peek of the newest unread rather than navigating.
  The panel is **unmounted, not hidden**, which is the property that makes it worth doing: the bell
  is on every authenticated page, and a hidden panel would read the notification list on every
  navigation. **Not the native Popover API**, and the reason is anchoring rather than support — a
  top-layer element is positioned against the viewport, so keeping the panel beside its trigger
  needs `anchor-name`, and the fallback is a panel centred on the screen. It is still not a
  `Dialog`: a popover is non-modal, so there is no focus trap to get wrong.
- `23.17` **`.env.example` had fallen behind the schemas** — new, and found the hard way: a `.env`
  fourteen keys behind the example made the built web server answer 500 on every request, which is
  how `23.16`'s boot smoke earned itself in an hour. The stale `.env` was this machine's; the file
  it should have been copied from had drifted too, and `WORKER_NOTIFICATION_CONCURRENCY` had never
  been documented. `check:architecture` §25 now checks both directions. **It still cannot see a
  developer's own `.env`** — that file is gitignored, and the boot smoke is what catches it.
- `24.1` **The foreign-key decision** — not closed and not closeable here, but it now has an
  argument with a number in it. A `users` delete already costs a `conversation_members` scan **per
  tenant partition**, because the cascade's predicate carries no partition key: three hundred
  synthetic users exceeded a 30-second `statement_timeout` at 82 tenants. **Option (b) makes that
  fire on every node**, since replicating the catalog replicates the cascade with it. **Option (a)
  inverts it** — with no foreign key, a tenant delete is `where organization_id = $1` per table,
  which prunes to one partition. The recommendation is filed under the entry; the decision stays
  gated on a real second node.
- `23.18` **`pnpm db:generate` could not run from a clean shell** — new, found by running it.
  drizzle-kit is a bin rather than a `tsx` entrypoint, so the `--env-file-if-exists` every sibling
  `db:*` script carries could not be handed to it, and the config threw on a missing `DATABASE_URL`
  that `.env` had all along. Two lines in `drizzle.config.ts`, Node's own `loadEnvFile`, which does
  not overwrite a variable already set — so CI's job env still wins. It answered a question nobody
  had asked, too: **the migrations are in step with the schema**, which nothing else checks.
- `23.19` **`pnpm platform:grant` crashed, and nothing typechecked it** — new, and the worst of the
  four found by running things. It called a two-argument `TransactionScope.within` that had taken
  three since Phase 22, and failed with a `TypeError` from inside `AsyncLocalStorage` that names
  nothing. It is the documented way to make the **first platform admin** and there is no other, so
  it would have failed at the one moment somebody needed it. The file sat outside its package's
  `tsconfig` include, so `tsc` had never compiled it — and adding it turned up a second thing
  nobody had compiled. **Assertion §26** is the durable half: every `*.ts` at a package root is
  named in that package's `tsconfig.json`.
- `23.20` **The shipped configuration warns about itself on every worker boot** — **filed, not
  fixed**, because which of three shapes is right is a defaults decision. `.env.example`'s own
  numbers give `worker.pool.oversubscribed {concurrency: 20, poolMax: 10}` at `warn`, once per
  boot, on a clean install. The mechanism is correct; the numbers were chosen apart from it. The
  tension underneath is that `DATABASE_POOL_MAX` is **one variable read by two processes** whose
  concurrency profiles are nothing alike. The recommendation is under the entry.
- `23.21` **The worker's first boot against a real stack is not clean** — **filed, not fixed**,
  from forty-five seconds of the worker's own output, which nothing in the pipeline reads. Two
  things beside `23.20`. **`partitions-boot` stalls**: it logs nothing for 29.9 s and BullMQ's
  default 30-second lock expires, so the job is re-delivered and the boot run happens twice — at
  78 tenants, well under decision D29's "a few hundred per node". **And one unplaceable tenant
  fails the whole projection through the wrong line**: `AnalyticsConsumer` places each tenant
  *outside* the per-tenant `try`, so a resolver throw never reaches
  `analytics.projection.failed` — which is the line a projection dashboard filters on. Both have
  a recommendation under the entry; the second is one line.

---

## D. What changed on this machine, 2026-09-20

Not the repository — the developer environment the session ran against. Listed so none of it is a
surprise, and so every piece is reversible.

| Thing | State it was left in | How to undo it |
|---|---|---|
| Docker Desktop | started | quit it |
| The compose stack | up with **three** profiles: `observability`, `sharded`, `analytics` | `pnpm infra:down` |
| `.env` | fourteen keys copied in from `.env.example`, which it was behind, plus the two `DATABASE_SHARD_1_*` lines | the original is at `.env.backup-2026-09-20`; comment out the two shard lines to go back to one node |
| Postgres | migrated on both nodes and seeded | `pnpm infra:reset` drops the volumes |
| ClickHouse | schema applied by `pnpm ch:migrate` | it goes with the analytics profile |
| Git | 45 commits on `main`, **nothing pushed** | `git log origin/main..main` is the whole of it |

**One account was created and removed.** Proving `25.4`'s Exit needed a real signed-in platform
admin, so one was signed up over `/api/auth`, verified through the link Mailpit received, granted,
and then deleted along with its personal organization. `select count(*) from organizations` is 78,
which is what it was before. Mailpit still holds that one verification mail; it is a dev inbox and
emptying it is a button.

**Two things left in the database on purpose, both named where they matter.**

- The fan-out measurement's people — up to 25 000 rows whose emails are `<n>@fan-out.test` — are
  **deterministic and reused** rather than deleted, because deleting a `users` row costs a
  `conversation_members` scan per tenant partition. `fan-out.md` explains it; one slow
  `delete from users where email like '%@fan-out.test'` clears them.
- Four organizations with **no directory row**, slugs `other-`, `drop-` and `pruning-`, left by
  specs that insert an organization directly. They are not this session's rows, so they were left
  alone — but they are what makes the analytics projection fail on this machine, which is `23.21`.
- `23.22` **A deprecated TanStack Start API** — one call site, `createServerFn().inputValidator()`,
  warned on every `pnpm dev` start. Swapped for `.validator()`; typecheck, build and the web suite
  unchanged, and the warning is gone. Found by running the dev server and reading what it printed,
  which is the fourth thing that turned up.
- `23.23` **The directory outlived four hundred tenants** — found by `25.4`'s own screen on its
  first live read: `platform.shardMap` reported **486 tenants on node 0 against 79 organizations**,
  because 411 `shard_assignments` rows had outlived the tenants they named. The screen was right —
  it counts the directory and joins nothing, which is exactly what makes such a row visible. It is
  a **test-teardown leak, not a product defect**: `PgTenantRepository.delete` sweeps the directory
  row, and specs that delete the organization row directly skip that path. The global orphan sweep
  now takes directory rows as well as partitions; 411 went on the first run, and the directory then
  read 75 against 79, which is exactly the four unplaced organizations `23.21` names.
- **`25.4`'s Exit clause is now proved as far as it goes without a browser.** A real platform admin
  — signed up over `/api/auth`, verified through the link Mailpit received, granted with
  `pnpm platform:grant` — gets **200** from `/platform/shards`, and the two procedures answer with
  node 0's row, its tenants on expand, `moves: "unavailable"`, and the seeded organization by slug.
  What is left is the rendered expanded panel, which the component spec covers.
