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
made visible before anyone pays it. Nine routed tables carry a foreign key to a catalog one, every
one `ON DELETE CASCADE`: `notifications` → `organizations`, `users`; `notification_preferences` →
`organizations`, `users`; `conversations` → `organizations`; `conversation_members` →
`organizations`, `users`; `messages` → `organizations`; `document_chunks` → `organizations`.
Which of them trips first depends on insert order, which is why the expectation names the class.
Phase 24 decides what happens to all nine.

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
