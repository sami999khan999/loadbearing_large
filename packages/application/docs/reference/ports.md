---
title: The ports
description: One section per port whose reasoning outgrew a two-line comment — why three of them carry no Principal, why the analytics pair is split in two, and what each abstract method is refusing to offer.
---

# The ports

An abstract class the domain calls and `infrastructure` implements; this page carries the arguments the
port files leave out.

## Four ports carry no `Principal`, and that is the design

`MaintenanceGateway`, `PartitionArchiveGateway`, `ActivityReplayReader` and `OutboxGateway` take no actor.
Nothing they touch belongs to a tenant — **an expired session is expired for everybody; a partition is a
table's property** — so no organization could authorize it. The guard is structural: wired for
`apps/worker`, called only from schedules.

### `MaintenanceGateway`

- `sweepExpired` makes `sessions`' expiry-not-partitioning trade hold.
- `ensureMonthlyPartitions` runs months ahead — **a table with no current partition rejects every
  insert** — and returns what it created.
- **The table is a `PartitionedTableName`, not a `string`:** DDL takes no bind parameters, so the closed
  union from `PartitionedTable.ALL` is all that stands between interpolation and an arbitrary name.
- `dropMonthlyPartitionsBefore` drops whole partitions (a catalog edit; `DELETE` leaves vacuum debt),
  finds children from the catalog (hand-made months count), and skips names it cannot parse.

### `PartitionArchiveGateway`

Cold storage for **every** partitioned table, so retention stops meaning deletion — and the prerequisite
for replay past Postgres retention. **Detach, upload, record, verify, drop, in that order** (dropping
before verifying is loss), per tenant-month; the period is ISO `YYYY-MM-DD`, part of `partition_archive`'s
key. `restore()` exists because **an unrestored archive is a deletion with extra steps** — into a scratch
table, never the live parent. `sweep()` closes the GDPR hole: the index has no foreign key, so nothing
cascades. Long form:
[`infrastructure/docs/reference/cold-storage.md`](../../../infrastructure/docs/reference/cold-storage.md).

### `ActivityReplayReader`

Separate from `ActivityLogger` so the cross-tenant bulk scan is not on every use-case's port.
`since()` is keyset on `(occurredAt, id)` — fewer than `limit` means caught up; **a timestamp-only cursor
cannot separate same-microsecond rows**. `ActivityRow` is not the domain event (replays predate current
definitions); `subjectId` is lifted out of the payload so ordering avoids JSON extraction.

## `ActivityLogger` stamps its own time

No `occurredAt`, no tenant: the adapter stamps time from its `Clock` and reads the organization off
`actor` — **a caller passing a timestamp could backdate audit**. `action` is past tense:
`task.reactivated`.

## The analytics pair is two ports, not one

`AnalyticsProjector` is **the only writer** of the derived store — a use-case or hand backfill writing
there makes it an undeclared source of truth. The reader is a **separate** slice port,
`analytics/analytics.reader.ts` (`ClickHouseAnalyticsReader` behind `GetActivityTrendUseCase`), because
it is request-reachable and must not carry `project()`. (An earlier unused reader and its
`ANALYTICS_DRIVER` flag were deleted.)

- `checkpoint()` reads **from the derived store itself** — a checkpoint elsewhere can silently disagree.
- `project()` is idempotent, keyed on activity id.
- `dailyCounts()` matches the authoritative half's shape, so reconciliation is a diff — catching a
  consumer that died quietly on a Tuesday.

Days are ISO strings (Postgres and ClickHouse truncate differently). The reader stays read-only, and any
scope arrives resolved — the store has no `CapabilitySet`.

## `ColdArchiveReader` has two methods for two callers, and one of them is a hole waiting

- `batches(entry, size)` — the re-projection's whole-month read, verified (checksum, count) **before** the
  first batch (`CR.16`; the old whole-month `rows()` OOMed the worker).
- `page(entry, userId, cursor, limit)` — user-facing. **The object holds the whole tenant**, so the
  adapter's filter line is all that separates a user from colleagues' notifications; the use-case takes
  tenant and user off the principal, spec-asserted.

The cursor is **opaque** (a line ordinal inside, as `KeysetCursor` is). **Stated cost:** each page gunzips
the whole tenant-month (~8 MB at four thousand users); p95 over 500 ms is the trigger for per-user objects.

## The three shard ports, and why there is no fourth

`ShardingStrategy.keyOf(principal)` — **what** places a request (the fork's swap point), once per
request or job, never per query. `ShardResolver` — **where** it lives, on every routed query, so cached;
it returns a physical node index (D28: the organization *is* the shard); a key with no row is refused
(`shard.resolution.failed`) — guessing node 0 would be wrong the day after a split. `ShardAssignmentRepository` — the directory, a principal-less platform seam. No
`ShardPlacementPolicy` until there is a second node to choose
([Simplicity](../../../../docs/opinions/simplicity.md)).

## `LogReader` and the four labels

`LogFilter` is closed: **the four labels are all the platform indexes**, so the port cannot express a
`userId` label (one stream per user). `contains` matches the body — trace, correlation or organization
ids. Read-only; `JsonLogger` never hears of a log platform, keeping it Tier 0. It serves the operator
surface, **the one reader that knows organizations**, and is absent without a log platform — better than
silently empty.

## `EmailSender` has exactly one method

Provider, credentials and from-address are adapter configuration. **One method — transactional mail
only**; campaigns and suppression lists are another product. Text is required (every client renders it;
it keeps mail out of spam), HTML is not. `send()` resolves on **acceptance**, never delivery (only a
provider webhook knows). The `EmailReceipt`'s `messageId` is nullable and read optionally — reading it off
an empty result once turned a sent mail into an `UnavailableError` and a retry.

## `DomainEventPublisher` is broker-shaped before there is a broker

The four properties a broker cannot give back later ([Data and scale](../../../../docs/opinions/data-and-scale.md) §7):

- **`publish` returns nothing** — a return value is RPC.
- **Handlers are idempotent on a stable event id** — at-least-once.
- **No ordering.**
- **No handler exception reaches the publisher** — a broker cannot propagate one.

**Call it inside `unitOfWork.run`:** a broker publish in a transaction cannot roll back, and after commit
a crash loses it; the outbox row commits with the state. Audit and outbox rows sit side by side but
differ — **audit is the human fact, the outbox the integration fact**.

## `OutboxGateway` hands out claimed work, and marks it only on success

`drain(limit, relay)` marks rows published **only if `relay` resolves** — a throw releases them for the
next tick (at-least-once; the fake honours the same order). **No transaction spans the relay:** the claim
is one auto-committed `UPDATE … FOR UPDATE SKIP LOCKED` stamping `claimed_until` sixty seconds out, so
replicas share the drain and Redis round trips hold no lock or snapshot (a held transaction once pinned
xmin and stalled vacuum node-wide). A dead drain's rows free when the lease passes; jobs dedupe by id.
`oldestPendingAt()` is `null` when healthy. **No inbox table** until **the first non-idempotent
subscriber**.

## `EventSubscriber` receives the event, never an actor

A subscriber builds a principal from `event.organizationId` — the actor's request-time permissions may
have changed, and the work is not on their behalf. Subscribers live **in their slice**
(`notification/notification.subscriber.ts`), run **only in the worker** (`OutboxConsumer` alone consults
`SubscriberRegistry`), and the registry rejects duplicate names or unknown events **at construction** — a
name is half of every job id, so a shared one silently skips a subscriber.

## `RealtimePublisher` is fire-and-forget, and says so

A frame published to a channel nobody is listening on is kept only as long as the adapter's
replay log keeps it — the last two hundred per channel, for an hour (`26.5`), and not at all for
a frame marked `replay: false` (`RV.3`). A resume inside that
is replayed what it missed; one outside it is handed a `resync` and refetches what it subscribes
to. The `resync` variant stays in the contract because the log is short by design, and a contract
that promised a full replay would be a lie the first time a tab slept for a day.

Channels are **tenant-leading, always**: `org:<organizationId>:user:<userId>`. Sharded pub/sub
(`SPUBLISH`), Redis Streams and a broker partitioner can all key on a prefix, and none of them can
key on something buried in the middle. `RealtimeChannel` is a branded string so a channel cannot be
assembled by concatenation at a call site, which is how one ends up without its prefix.

A user channel is **authorised by construction** — you only receive your own.

## `RealtimeSubscriber` takes a signal because the domain has no `AbortSignal`

`subscribe(channels, signal)` ends on abort or max age, buffering nothing; a signal lets *something other
than the reader* end it (shutdown, age, a cap). Its type is `CancellationSignal` in `primitive/` — `lib`
is `["ES2024"]`, so no `AbortSignal` (DOM would import every browser global); a real one satisfies it
structurally. **The fakes are unconnected by default** (most specs ask only what was published); to
assert arrival, build one `InMemoryRealtimeHub` for both. Beware the name: `MemberRealtimeSubscriber` is
an `EventSubscriber`, not this port.

## `MailPublisher` returns nothing, and `MailRenderer` knows no transport

Callers hold `MailPublisher`, the worker `MailRenderer`; neither knows the other.

- **`publish` resolves `void`** — no delivery row to hand an id for. A `dedupeKey` deduplicates in the
  queue ([mail pipeline](../../../composition/docs/reference/mail-pipeline.md)).
- **The recipient's locale, not the request's** (`users.locale`; `Translator.with()` per recipient).
- **`priority` is `"high" | "normal"`** — the one distinction: is someone waiting.
- **`MailRenderer` returns both parts, always**, and is a port because the copy and routes live in
  `composition`.

## `SendMailUseCase` asserts nothing, and that is the design

The only use-case without `authorizer.assert`: mail has no tenant (auth mail, invitations to
non-users). Guarded structurally — only the mail consumer calls it. It enforces the **manifest**: key and
`unknown` params are checked before the transport, since an unbuildable message fails every retry.

## `StorageGateway`

No bucket, region or endpoint. Keys are `<subject>/<yyyy>/<mm>/<uuid>.<ext>` (lifecycle rules match
prefixes). `putStream` serves bodies too large to buffer (an archived partition can be tens of GB), with
the checksum computed in passing for later verification. Presigning is in the port because direct browser
upload is architecture: the use-case authorizes, then issues a time-limited URL.

## `SessionResolver` and why the session carries its tenant

`RequestHeaders` is declared (no `Headers` in `lib: ["ES2024"]`) and a Web `Headers` satisfies it. The
session carries its organization because `PrincipalBuilder` gets only headers and a `Principal` needs a
tenant — one column at sign-in, not a membership query per call; switching organizations is explicit.

## The small ones

| Port | The decision |
|---|---|
| `CacheStore.deletePrefix` | Invalidating a whole subject belongs here rather than at the call site: enumerating keys by hand pushes Redis semantics into the domain |
| `CacheStore.setIfAbsent` | Returns whether it wrote, which is what makes it an idempotency claim rather than a write. One `SET … EX … NX`, evaluated on the server, so two replicas racing a key cannot both be told they won it. The send dedupe is its first caller — see [messaging](messaging.md) |
| `EmbeddingProvider.embed` | Batched by construction — one round trip per call, never one per text. A single-string signature is the shape that turns a re-index into a thousand requests. The optional `purpose` says whether the text is a `document` or a `query`: Gemini embeds them differently, and OpenAI ignores it |
| `EmbeddingProvider.model` | Recorded on every chunk it embeds, so vectors from two models are never compared |
| `QueuePublisher` | The deduplication id is a domain rule ("enqueue OCR for this receipt, once"), not queue configuration |
| `UnitOfWork` | The implementation must genuinely enrol the repositories running inside `work()`; one that does not is worse than none |
| `VectorStore.search` | `goalIds` is required so the permission filter runs on the **input** set. Filtering results means the model already saw what the actor cannot. It takes a `model` too, and compares only chunks that model wrote |
| `VectorStore.searchText` | The same shape and scope rule, ranked by Postgres full-text search over the chunk text. What `EMBEDDING_PROVIDER=none` searches with, and it calls nobody |
| `ChunkFilter` | Required on `search` and `searchText`, so every caller names its corpus. `except` is the shared corpus less the guarded source types (`ChunkSource.GUARDED`, today `doc`), whose chunks carry their own read rule. `within` is one guarded type narrowed by a metadata key the indexer wrote — `DocSearch` passes the reader's visible spaces. An empty `values` matches nothing |
| `VectorStore.stale`, `saveEmbeddings` | The re-embed pass: chunks whose vector is missing or another model's, then new vectors for them with the text untouched. `ReembedChunksUseCase` is the caller |
