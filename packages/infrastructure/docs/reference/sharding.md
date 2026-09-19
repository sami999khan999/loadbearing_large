---
title: Sharding
description: One key, one node, three placements — how a query finds its database, and the tripwire that makes a single-Postgres deployment reveal every use-case a split would break.
---

# Sharding

Nothing here is about running more than one Postgres. It is about being able to, later, without
finding out then which twenty use-cases assumed one.

| Piece | Where | What it answers |
|---|---|---|
| `ShardingStrategy` | `composition/src/shard/` | what a request is placed *by* |
| `ShardResolver` | `pg/repository/pg-shard.resolver.ts` | which node that key lives on |
| `ShardAssignmentRepository` | `pg/repository/` | the directory both read |
| `ShardScope` | `pg/transaction/shard-scope.ts` | which shard the ambient work belongs to |
| `DatabaseCluster` | `pg/primitive/database-cluster.ts` | the pool for a node |
| `TablePlacement` | `application/src/primitive/shard.ts` | which of the three a *table* is |

## The organization is the shard, and there is no number in between

Decision D28 removed the virtual shard. A key resolves straight to a physical node, so
`shard_assignments` is `(shard_key, node)` and nothing has to be told how many virtual buckets
exist or rebalanced when that changes.

The cost is that moving one tenant is moving one tenant's rows, with no batching of a thousand at
a time. The benefit is that there is no second numbering scheme to keep in step, and the directory
is legible: one row per customer, naming a machine.

## `keyOf` runs once per request, and so does `resolve`

The strategy runs in the middleware after the principal is built, and the resolve runs there too.
Both results go into `ShardScope` together, as `{ key, node }`.

**That is what lets `BaseRepository.db` stay synchronous.** A resolver called per query would make
every repository method await a directory lookup before it could pick a pool; called once, the
node is already known and `this.db` is a property read. One `await` per request rather than one
per query, and the 183 call sites that read `this.db` never learned that sharding exists.

The cache is a read-through on `shard:key:<key>` with a **300-second** TTL —
`CapabilityCache`'s shape and deliberately not its sixty seconds. A capability changes when
somebody edits a role; a placement changes when somebody moves a tenant, which is a yearly event
with an explicit `invalidate` attached to it.

## Three placements, and the tripwire between them

Every table is `catalog`, `local` or `routed`, and `TablePlacement.of` is the only thing that
says which. Each repository **declares** its placement rather than deriving one, because a
repository that guessed would guess wrong exactly once.

- **catalog** — what a principal is built from before a key is known, plus RBAC, the two
  tenant-less lookups, the archive index and the policy rows. Nineteen tables.
- **local** — present on every node, written in whichever transaction is open: `activity_log`
  and `outbox_event`.
- **routed** — everything a tenant produces. It is the **default**, so a new slice's table needs
  no edit here, and an unplaced table routes rather than silently reading the catalog.

`BaseRepository.db` compares its own placement against the open transaction's and throws when
they disagree. `local` is compatible with both of the others, which is what its name means.

`tests/primitive/placement.spec.ts` is what holds all of this: a routed read with no key throws,
so does a routed `run`, a catalog read inside a routed transaction throws, a routed transaction
nested in a catalog one throws — and the same-placement case still goes through, which is the
assertion that keeps the other four from being satisfied by breaking everything.

**The point is that this throws on one node.** A catalog repository used inside a routed
transaction is not a bug today — one Postgres holds both — and it is a data-corruption bug the
day there are two. Failing now, in every environment, is the difference between finding those
call sites in a test run and finding them in production.

`PgUnitOfWork` carries the same rule one level up: a routed `run` nested inside a catalog one
throws rather than becoming a savepoint. A catalog use-case calling a routed one inside its
transaction is precisely the coupling a split cannot honour.

## The one read that crossed, and how it was split

`PgNotificationRecipientReader.conversationMembers` joined routed `conversation_members` to
catalog `users` and `memberships` in one statement. It is now two: the routed ids first, then the
catalog resolve — see
[notification recipients](notification-recipients.md).

That was the only crossing in the repository, so `CROSS_PLACEMENT_KNOWN` in
`check-architecture` §22 is **empty**. An assertion with an exception set that is never emptied
records a rule rather than guarding one.

## A sweep is placed on a node, not on a tenant

`ShardScope` holds `{ key, node }`, and `key` is `null` in a cross-tenant pass:
`ShardScope.atNode` is what the outbox drain, the partition runway and the digest fan-out run
inside, through `Container.eachShard`. Serial, not `Promise.all` — these are DDL and drain passes,
and running them against every node at once multiplies this process's pool by the shard count.

Inside a node-only scope a `local` table resolves to that node's pool rather than the catalog's,
which is the whole point: `outbox_event` and `activity_log` exist on every node and the row you
want is on the one you are walking. Outside any scope both fall back to node 0. Which passes loop
and which deliberately do not is [the consumers](../../../../apps/worker/docs/reference/consumers.md).

### `catalogDb` is the one sanctioned crossing

`PgPartitionArchiveGateway` detaches a partition on the node it is walking and records the object
in `partition_archive`, which is catalog. That is a genuine span, not an accident, and
`BaseRepository.catalogDb` is where it goes: it throws for any placement but `local`, and it
returns the catalog pool's client rather than the open transaction's — that transaction is on the
node being swept, and the index row does not live there.

It is deliberately the only one. A routed repository reaching the catalog is what `22.10` split a
reader to avoid, and the guard makes that call a throw rather than a review comment.

## `PgShardResolver` is not a `BaseRepository`, and takes thunks

It is what `DatabaseCluster.forKey` calls. A resolver that routed would ask itself where it
lives, so it reads the catalog pool directly.

It takes `() => Database`, `() => CacheStore` and `() => Logger` rather than the values, because
the container builds the cluster **with** this resolver: neither the pool nor the cache exists
when it is constructed. The thunks are called later, on a request, by which time the container
is fully assembled.

## A missing directory row is an error, not node 0

Every existing tenant was backfilled by migration `0031` and every new one gets a row from the
founder. So a key with no row is a tenant nobody placed — a bug in the founder, not a state to
recover from.

Guessing zero would work today and put a tenant's rows on the wrong machine the day it does not.
`shard.resolution.failed` is logged at `error` and the read throws.

## A tenant delete sweeps its own directory row

`shard_assignments.shard_key` is `text` with no foreign key, which is what lets a fork put a
region code in it — and it means nothing cascades. `PgTenantRepository.delete` therefore does two
statements: the directory row, then the organization. Without the first, the table grows with
tenant churn forever and the move job scans rows nobody owns.

It is the same reasoning `partition_archive` follows and the opposite conclusion, because the two
have opposite lifetimes. A cold object outlives its tenant on purpose — thirty days of recovery
window, swept by the nightly pass. A directory row for a tenant that no longer exists answers a
question nobody can ask.

## The directory has a screen, and it reads the directory rather than the cluster

`/platform/shards` is one row per physical node, behind `platform.shards.read`.
`PgShardMapReader` counts `shard_assignments` grouped by `node`, and that is the whole of it —
**no join to the cluster, and no join to `organizations` for the node list**.

That is worth stating because the obvious alternative is wrong in two directions at once. Asking
the cluster how many nodes it has reports what `DATABASE_SHARD_<n>_URL` was set to, which is a
statement about this process's environment rather than about where tenants are. And joining
`organizations` would hide the one row an operator most needs to see: a directory row whose
tenant is gone. A node the deployment has just added has no row here at all, which is the honest
answer — nothing is on it yet.

The tenants **under** a node are a second query and it does not run until a node is expanded.
Every node's tenants at once is the whole directory, which is the one read this screen must not
make; the expansion is paginated and ordered by name then id, so an offset means the same thing
on the second page as it did on the first.

**The move button is rendered and disabled.** `Container.hasShardMoves` is a getter returning a
constant `false` until `24.2` registers the move job, and the use-case turns it into
`moves: "unavailable" | "available"` on the wire. A screen that simply omitted the control would
say nothing about what is missing; one that showed an enabled control would lie. The disabled
one carries the reason as text — "tenant moves need the physical split".

The tenant lookup takes an organization id **or** a slug and compares
`organizations.id::text = $1`. Never `$1::uuid`: a slug cast to a uuid is a `22P02` from the
database rather than the empty answer a typed search should get.

## What routing costs a request, measured

```bash
pnpm infra:up:sharded          # plus the two DATABASE_SHARD_1_* lines in .env
ROUTED_SCALE=1 pnpm smoke
```

`tests/smoke/routed.smoke.spec.ts`, averaged over a thousand resolutions against the two-node
compose profile on one developer machine:

| Path | Per call |
|---|---|
| **warm** — one cache read | 679 µs |
| **cold** — cache read, catalog query, cache write | 2 568 µs |
| a cache invalidate, for reference | 667 µs |

The absolute numbers are this machine's: Redis in Docker on Windows, where **one round trip is
about 0.67 ms**. The invalidate row is there to say so — it is one `DEL` and nothing else, and it
costs the same as the warm resolve. On a deployment where Redis answers in 100 µs, both rows move
together.

**The shape is the finding, and it is the right one.** A routed request pays *one cache read* to
learn where it lives, never a query; a miss costs three round trips rather than one, and happens
once per key per five minutes. `resolve` runs once per request, not once per query — see above —
so this is the whole of what routing adds.

**The walk is serial and the reading says so**: two `count(*)`s across two nodes, 135 ms, one node
after the other. That is `Container.eachShard`, and a pass that fanned out would hold a connection
open on every node at once.

> [!IMPORTANT]
> **The write half of `24.6` cannot run, and that is `24.1`.** A routed insert on node 1 is a
> `23503` before it is a measurement, because every routed table carries a foreign key to a
> catalog one. The spec asserts that rather than pretending, and `sharded.smoke.spec.ts` names the
> constraint class. There is no routed throughput number until the foreign-key decision is made.

## Sharding by something else: four edits, and nothing else

A fork that shards by region, by plan, or by anything other than the organization changes four
places. Nothing else in the repository names the choice, which is the property this whole seam
exists to have.

1. **`TenantKey` on the allowlist** — `application/src/primitive/partitioned-table.ts`, today
   `"organization_id"`. It is the column name every tenant-owned table partitions by, and
   `PartitionedTable` reads it to compose the `PARTITION BY LIST` clause. Change it and every
   table's partition key changes with it.
2. **One strategy class** — `composition/src/shard/organization.strategy.ts`, whose whole body is
   `Shard.keyOf(principal.organizationId)`. `keyOf(principal)` is what the middleware calls once
   a request has a principal, and a deployment sharding on region returns the region here.
3. **`TENANT_COLUMN` in `check-architecture.mjs`** — the assertion that every domain table carries
   the column and that every unique index leads with it. Asserted equal to `TenantKey`, so the
   two cannot drift.
4. **The worker's key derivation** — `apps/worker/src/bootstrap/with-shard.ts`, which turns a
   job's payload into a principal. A job carries an organization id today; a region-sharded fork
   carries whatever its strategy reads.

**`shard_key` is opaque text and does not change.** The directory column is `text`, not a uuid and
not a foreign key, precisely so a fork can put a region code in it without a migration. And both
the generator and the seed read the alias rather than spelling the column, so neither is a fifth
place.

## Rehearsing the split

`pnpm infra:up:sharded` starts a second Postgres and its pooler; uncomment the two
`DATABASE_SHARD_1_*` lines in `.env.example` and `pnpm db:migrate` applies the same schema to
both. `tests/smoke/sharded.smoke.spec.ts` is what runs against it — gated on
`Stack.shard1`, provided by `vitest.smoke.config.ts`, because `check-architecture` §3 walks
`tests/` for `process.env` and that injection is the only door.

It creates two tenants, writes their directory rows naming node 0 and node 1, and asserts four
things:

- each key resolves to the node its row names;
- `shard_assignments` exists on the catalog and **not** on shard 1;
- a message written under a tenant placed on node 0 lands on node 0 and on no other node;
- a write under the tenant on node 1 fails with `23503` on a constraint naming a **catalog**
  table — matched against `TablePlacement.CATALOG` rather than one constraint's name.

**That last one is the point.** It is not a bug to fix now; it is the split's first real cost,
made visible before anyone pays it. Ten foreign keys cross from a shard to the catalog, every one
`ON DELETE CASCADE`. Nine are on routed tables: `notifications` → `organizations`, `users`;
`notification_preferences` → `organizations`, `users`; `conversations` → `organizations`;
`conversation_members` → `organizations`, `users`; `messages` → `organizations`; `document_chunks`
→ `organizations`. The tenth is on a **local** table — `outbox_event` → `organizations` — and it
matters more, not less: a local table exists on every node, so every node's outbox carries it, and
the first routed transaction on node 1 that publishes a domain event is what trips it.
Which of them trips first depends on insert order, which is why the expectation names the class.
Phase 24 decides what happens to all ten.

Asserted by SQLSTATE and constraint rather than by message: the message is localised and reworded
between server versions, and drizzle wraps the driver error so the constraint is one `cause` down.

## What is not built, and why it is not

**No placement policy.** Which node a *new* tenant lands on is a decision nobody has to make
while there is one node, and an interface with one implementation and no prospect of a second is
what [Simplicity](../../../../docs/opinions/simplicity.md) names as ceremony. It earns its place
at the split.

**No second node in the default stack.** `DATABASE_SHARD_<n>_URL` is read and the cluster indexes
what it finds, but `pnpm infra:up` starts one Postgres. The second is the `sharded` profile, and
starting it is a rehearsal rather than a deployment — see above.
