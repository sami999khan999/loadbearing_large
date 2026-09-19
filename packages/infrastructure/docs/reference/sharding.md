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

## What is not built, and why it is not

**No placement policy.** Which node a *new* tenant lands on is a decision nobody has to make
while there is one node, and an interface with one implementation and no prospect of a second is
what [Simplicity](../../../../docs/opinions/simplicity.md) names as ceremony. It earns its place
at the split.

**No second node.** `DATABASE_SHARD_<n>_URL` is read and the cluster indexes what it finds, but
the compose file starts one Postgres. The rehearsal is `22.20`'s, and it is expected to fail on
the catalog foreign keys until `24.1` decides what happens to them.
