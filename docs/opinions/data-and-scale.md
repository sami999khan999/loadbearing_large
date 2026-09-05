---
title: Data and scale
description: Which store owns which data, what is derived, what to build now, and the order every scaling move happens in.
---

# Data and scale

Four streams of data with genuinely different properties, and one rule that decides where each one
lives. Then the work that has to happen before load arrives, and the work that waits until it does.

**The rule:**

> **Postgres owns anything a transaction depends on or a user reads immediately after writing.
> Everything else is a derived store behind a port.**

That sentence answers every future question of this kind without another conversation. The rest of
this page is what follows from it.

---

## 1. The four streams

| Stream | Written by | Store | Property |
|---|---|---|---|
| **Domain data** — tasks, goals, RBAC | use-cases | Postgres | Transactional; read after write |
| **Audit trail** — business facts | `ActivityLogger` | Postgres, partitioned | Must not be lost; in-transaction |
| **Diagnostics** — operator signal | `JsonLogger` | stdout → **Loki** | May be lost; 30-day retention |
| **Analytics** — aggregates over time | worker, from domain events | Postgres snapshots → ClickHouse | Derived; rebuildable |

The first three distinctions already exist in the codebase.
[Vocabulary](vocabulary.md) draws the line between an activity name and a log event code:
`task.reactivated` is a business fact a user may read, `queue.job.failed` is a diagnostic an
operator reads. **A business fact in stdout is lost on restart; a diagnostic in Postgres is a
retention bill.** The fourth stream is the one this page adds.

### Why audit is not a log

`ActivityLogger` writes inside the transaction ([12](../setup/12-application-package.md)). That is
what guarantees a state change and its audit row commit together. No external store can join that
transaction — so a task reactivation commits, the audit write is in flight, the process restarts,
and there is a state change with no record of who made it.

Under the audit requirements that is the highest-value class of record, and it is exactly the
failure a compliance review finds. **Audit is Postgres, at every scale on this page.** If audit
*search* gets slow, replicate to an analytical store for querying and keep Postgres as the record.

> [!IMPORTANT]
> **In-transaction is a claim about the code, not about intent.** `UnitOfWork` has to actually
> enrol the repositories that run inside it, or this guarantee is decorative — the audit row and
> the state change commit separately and the failure above is live. See
> [13](../setup/13-infrastructure-postgres.md).

### Why diagnostics are not a database

`JsonLogger` already emits structured JSON with a level and a correlation ID, and it is the one file
in the repository allowed to call `console` ([05](../setup/05-lint-and-format.md)). Ship stdout to a
log platform. Retention, full-text search, alerting, and level filtering become configuration rather
than code.

**Loki, and the choice is about ecosystem rather than engineering.** VictoriaLogs is technically
better — faster full-text search, no cardinality trap, lower disk usage. On pure merit it wins. But
"best overall" includes whether a new engineer can find an answer at 2am, whether the project exists
in five years, whether it integrates with what is already running, and whether there is a paid path
if self-hosting stops being worth it. Loki wins all four: Grafana Labs behind it, CNCF-default in the
Kubernetes ecosystem, years of answers already written down, and Grafana Cloud runs the identical
thing if you stop wanting to operate it — a config change, not a migration.

**Nothing self-hosted reads it back.** Loki is storage plus a `query_range` API, and the reader is
the super admin dashboard — the same surface that already knows what an organization is, which is the
one thing a generic log console cannot know. Grafana was in this stack and was removed for exactly
that reason: two consoles for one operator, and the query that matters — *these logs, for this
tenant, joined to that tenant's audit rows* — was the one it could not express.

**The seam for that dashboard exists: `LogReader`, implemented by `LokiLogReader`.** It is `fetch`
against `query_range`, built only when `LOKI_URL` is set, and it changes nothing about the write path
— `JsonLogger` still goes to stdout and still has never heard of Loki. That asymmetry is the design:
the write path has no seam because it has no dependency.

Its `LogQuery` type offers the four labels and a substring filter over the line body, and nothing
else — so the cardinality rule below is enforced by the shape of the port rather than by convention.

Until the dashboard ships, reading logs is `docker compose logs`, curl, or that port. All three remain
the break-glass path afterwards: a log query that needs the app running is no use during the incident
where the app is down.

Deployment is Alloy tailing container stdout, storage on S3 or MinIO — both already running
([11](../setup/11-local-infrastructure.md)). Retention is a config line, literally
`retention_period: 720h`. **No code changes and no new environment variable;** `JsonLogger` writes
stdout and never learns the platform exists, which is what keeps it a
[Tier 0](dependencies.md) dependency and the swap a config change.

> [!WARNING]
> **Label cardinality is the one thing that decides whether Loki is fast or miserable.**
>
> ```
> ✓ labels:  app, env, level, event_code
> ✗ labels:  user_id, trace_id, task_id, organization_id
> ```
>
> A label creates one stream per distinct value, so `user_id` at 100k users means 100k streams and
> Loki falls over. This is the most common way Loki deployments fail and it is entirely avoidable.
>
> High-cardinality fields belong in the **log line**, queried after the selector has narrowed the
> streams:
>
> ```logql
> {app="web", level="error"} | json | trace_id="abc123"
> ```
>
> `Correlation` and `TraceId` from `@loadbearing/observability` are exactly the fields that must stay
> in the body. Promoting one to a label looks like an optimisation and is the opposite.

**`event_code` is a label, so `EVENT_CATALOG` is that label's cardinality budget** — plus exactly
one: `error.raised`, which is deliberately not a catalog entry because its level comes from
`ERROR_CATALOG[code].severity` rather than from a table. Every slice that adds a catalog fragment
spends the budget, which is a reason to keep event codes coarse — one code with a `queue` field beats
one code per queue.

**Revisit only if search latency becomes a real complaint during an actual incident** — that is the
only moment the difference is felt. The alternatives, if it does: **VictoriaLogs** (single Go binary,
fastest, youngest ecosystem), **OpenObserve** (best UI, S3-native), **SigNoz** (ClickHouse-backed —
considerably more attractive if ClickHouse is already being operated for analytics, on a *separate*
instance, since 30-day logs and multi-year analytics have incompatible resource profiles).
**Elasticsearch is not on that list**: several times the storage cost and constant tuning, justified
only when full-text search is the primary use case, which for diagnostics it is not.

### Why task status history is domain data, not analytics

It has three live consumers: reactivation logic reads it to decide, KPI computation aggregates it,
and users see it in a task detail view. It needs foreign keys to `tasks` and `users`, and it needs
read-your-own-writes — a user reactivates a task and immediately refreshes.

Postgres is the source. An analytical store gets a **copy** for aggregate questions.
*"What happened to this task"* is a Postgres query. *"Reactivation frequency across the org this
quarter"* is an analytics query.

---

## 2. Source of truth

Postgres is the source of truth for **domain data**. Not for everything — and the distinction is the
design, not a caveat.

### What Postgres owns

Anything a transaction depends on, or a user reads immediately after writing: tasks, goals, RBAC,
memberships, overrides, task status history, the audit trail, auth tables, user preferences. Every
one has the same property — if the write is lost or arrives late, something is wrong.

### What has a different source of truth

**Diagnostics live in the log platform**, never in Postgres. `JsonLogger` writes to stdout and does
not care if a line is lost ([05](../setup/05-lint-and-format.md)).

**Uploaded bytes live in S3.** Postgres holds the metadata row and the object key; the object store
holds the file. A genuine second source of truth, which is why deleting a resource is two operations
([12](../setup/12-application-package.md)).

**Embeddings live in pgvector today.** Physically inside Postgres, conceptually derived — they can be
regenerated from source documents, which is what makes the Qdrant swap safe
([14](../setup/14-vector-store.md)).

> [!NOTE]
> Three stores hold non-derivable things: Postgres, S3, and the log platform. They do not overlap —
> no fact lives in two of them — so there is never a question of which one is right. The failure
> "single source of truth" exists to prevent is *ambiguity*, not *plurality*.

### The test

> **If dropping a store loses information not recoverable from Postgres or S3, it has become a
> source of truth — whether you decided that or not.**

Run it whenever a store is added, and periodically after. The first time someone introduces
something because "it is just a cache," run it again.

### Redis

Three jobs, and they do not have the same answer.

| Use | Rebuilt from | If flushed |
|---|---|---|
| Capability cache | Postgres RBAC tables | A slow minute, then warm |
| Session cache | Better Auth's `sessions` table | Slower auth; nobody logged out |
| BullMQ queues | — | **Lost work** |

The first two are cache-aside and pass the test — `CapabilityCache` reads through to
`PgCapabilityRepository` on a miss ([16](../setup/16-auth-package.md)).

**BullMQ does not.** A queued job is not derived from anything; a lost job is work that never
happens. AOF persistence covers a crash, but a `FLUSHALL` is real data loss. Two consequences:

- **Separate Redis instances for cache and queues.** Different durability needs, and it means the
  cache can be flushed without touching pending work.
- **Make jobs reconstructible where it matters.** A nightly sweep that re-enqueues anything
  unprocessed turns a lost job into a delay rather than a gap. The idempotency rule for handlers is
  what makes that safe.

> [!WARNING]
> **The split has a consequence that is easy to get wrong.** The cache instance runs `allkeys-lru`,
> so anything on it can vanish under memory pressure. Session data reached through `CacheStore` is
> therefore a *cache in front of Postgres*, never the record — an evicted session must be a
> read-through, not a sign-out ([16](../setup/16-auth-package.md)).

> [!NOTE]
> **The sweep reconciles against Postgres, not against BullMQ.** Completed and failed job records
> age out in an hour and a day respectively ([15](../setup/15-infrastructure-package.md)), so a
> nightly sweep that reads job history finds nothing. The query is "which domain rows should have
> been processed and were not" — job history is not a durable work list.

### ClickHouse

Purely derived, and it has to stay that way — that is what makes it a performance decision rather
than a correctness one.

```
use-case → Postgres (authoritative) → domain event → worker consumer → ClickHouse
```

Drop the entire database and rebuild it by replaying the activity log.

**Two guards, because the way this fails is quiet:**

- **Nothing writes to ClickHouse except the event consumer.** No direct writes from use-cases, no
  manual backfills that are not replays.
- **A daily reconciliation job** comparing row counts per day against the activity log. The realistic
  failure is not an outage — it is a consumer that died on Tuesday, unnoticed until a quarterly
  report looks wrong.

**The way it stops being derived:** a KPI computed in a ClickHouse materialized view and stored
nowhere else. At that point it is authoritative, the rebuild story is gone, and nobody decided it.

---

## 3. Volume, by scale

Estimates for planning, not promises. What matters is which order of magnitude each row is in.

| | 500 employees | 25k employees | 100k DAU |
|---|---|---|---|
| Status changes / day | ~15k | ~750k | ~3M |
| Status changes / year | 5.5M | **270M** | **1B** |
| Activity rows / year | ~27M | **1.3B** | **5B** |
| Peak concurrent | ~100 | ~5k | ~15–20k |
| Peak writes / sec | <50 | 200–500 | **2–5k** |

Three thresholds fall out of that table:

- **Under 10M rows/year** — a single Postgres instance with good indexes. No decisions needed.
- **Around 250M rows/year** — partitioning is mandatory; analytics wants a column store.
- **Around 1B rows/year** — the single primary is at its ceiling; shard by tenant.

> [!NOTE]
> 2–5k writes/sec is reachable on one well-tuned Postgres primary, but with no headroom and with
> every schema migration becoming an event. That is the point at which sharding stops being an
> optimisation and becomes operational necessity.

---

## 4. Build now

Four things, none expensive, each of which is the difference between a future swap and a future
rewrite.

### 4.1 `organization_id` on every domain table

**The highest-value hour in the project.**

The RBAC model has an org scope but the schema assumed one organization
([16](../setup/16-auth-package.md)). Whichever way success arrives — many tenants on one deployment,
or one tenant growing large — the column is load-bearing. It is the sharding key.

Adding it now costs a column and a `WHERE` clause in the repository base class. Retrofitting it
across two dozen feature modules means touching every table, every query, every permission check,
and every test — while live, with customer data, under time pressure.

**The corollary: never write a query that cannot be scoped to a tenant.** A cross-tenant aggregate
in application code is a query that cannot be sharded. Those belong in the analytics store from
day one.

Three consequences that are easy to miss:

- **Every unique index gains the tenant column.** `roles_key_uq` on `(key)` alone means two tenants
  cannot both have an `owner` role.
- **`organization_id` is a branded `OrganizationId`**, like every other identifier
  ([10](../setup/10-contracts-package.md)). It is the one id where a swapped argument is a
  cross-tenant leak rather than an empty result set.
- **Spell it `organization`, not `organisation`.** The column name fixes the spelling; a codebase
  that uses both will resolve it inconsistently per file.
- **Every tenant foreign key is `ON DELETE CASCADE`, and a tenant-owned table has one.** The column
  is the sharding key; it is also the only handle a tenant delete has. A table where five keys are
  `NO ACTION` and three cascade has no delete at all — the statement fails, and `SET NULL` on
  `users.last_active_organization_id` sits there waiting for a case that cannot arise. A tenant
  table with no key at all is worse: the delete succeeds and leaves rows nothing can reach.

### 4.2 Partition the append-only tables

`activity_log` and `task_status_history`. Both grow forever, both are queried by recent time window.

```sql
CREATE TABLE activity_log (
  id              uuid        NOT NULL,
  organization_id uuid        NOT NULL,
  occurred_at     timestamptz NOT NULL,
  -- …
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);
```

Three things this buys:

- A "last 30 days" query touches one partition instead of the whole table.
- Dropping old data is `DROP PARTITION` — instant, rather than a `DELETE` that bloats the table.
- Index maintenance stays bounded, because each partition's index is small.

Create partitions ahead of time with a scheduled job, or use `pg_partman`.

> [!WARNING]
> **Set this up in the first migration.** Converting a large table to partitioned later is a rewrite
> with downtime. It is the one structural decision on this page that is genuinely painful to
> retrofit.

**Two mechanics that follow from Postgres, not from preference:**

- **A partitioned table's primary key must include the partition key**, so `activity_log` is keyed
  on `(id, occurred_at)` rather than `id` alone. Every unique index on the table inherits the same
  requirement. UUIDv7 and a time-range partition key are co-monotonic, so this costs nothing at
  insert time.
- **Drizzle cannot express `PARTITION BY`.** The schema declares an ordinary table and the generated
  DDL is hand-edited — which the workflow already accommodates, because migrations are generated,
  read, and committed rather than pushed ([13](../setup/13-infrastructure-postgres.md)).

**`session` is deliberately not on this list.** It looks like the third append-only table and is not
one: Better Auth updates it on refresh, deletes it on sign-out, and looks rows up by id — a
predicate carrying no partition key, so every lookup would scan every partition. It is bounded by
expiry instead, and a `DELETE … WHERE expires_at < now()` on the cleanup schedule is the right tool
([25](../setup/25-worker-app.md)).

**Decide the retention policy at the same time.** The common shape: 12–24 months of detail in
Postgres, aggregates forever in the analytics store, older partitions detached to cold storage.

### 4.3 The `AnalyticsReader` port

The seam, with a Postgres implementation behind it. Same pattern as `VectorStore` and
`ContentSource` — one line in `Container` when the implementation changes.

```ts
// packages/application/src/port/analytics.reader.ts
export abstract class AnalyticsReader {
  public abstract goalRiskScores(
    goalIds: readonly GoalId[],
  ): Promise<readonly RiskScore[]>;

  public abstract reliabilityTrend(
    userId: UserId,
    goalIds: readonly GoalId[],
    window: DateRange,
  ): Promise<readonly TrendPoint[]>;
}
```

**`goalIds` is a parameter, not an option.** The permission filter runs on the input set before the
query, resolved by `capabilities.goalsWith()` — identical in shape and reasoning to
`VectorStore.search()` ([14](../setup/14-vector-store.md)). An analytics store does not know the
`CapabilitySet`, so the scope has to arrive already resolved. Putting it in the signature means it
cannot be forgotten.

**It lives in `port/` rather than in a slice** because it is one cross-cutting read seam over many
subjects, not one port per subject — the same reason `VectorStore` is there and `TaskRepository` is
not ([12](../setup/12-application-package.md)).

**Every method is async from the first day**, even where the Postgres implementation could answer
synchronously. A ClickHouse implementation cannot be synchronous, so a synchronous seam would make
the swap a breaking change at every call site.

**Write through domain events, never from use-cases:**

```
use-case → Postgres (source of truth) → domain event → worker consumer → analytics store
```

Postgres stays authoritative. The analytics store is a derived read model that can be dropped and
rebuilt by replaying the activity log. **Protect that property.** The moment it is the only copy of
something, a rebuild becomes data loss.

#### The two deletion rules that follow

**Cascade from the tenant, `NO ACTION` between siblings.** `memberships.role_id` and
`invitations.role_id` must stop a role that is in use from being deleted — but as `NO ACTION`, not
`RESTRICT`. The difference is when the check runs: `NO ACTION` defers to the end of the statement,
so `DELETE FROM organizations` may cascade the roles and the memberships together; `RESTRICT` is
checked the moment the role row goes and would reject its own cascade.

**The audit trail is the exception, deliberately.** `activity_log.actor_id` is not a foreign key at
all: an audit row outlives the actor it names, and a cascade would erase the trail of a deleted
account exactly when it matters. Retention removes those rows, not referential integrity.

### 4.4 Index every foreign key and every filtered column

Postgres does not auto-index foreign keys, which surprises people.
`memberships_user_idx` and `goal_members_user_idx` are already called out as non-optional
([13](../setup/13-infrastructure-postgres.md)) because `CapabilityRepository.resolveFor()` runs on essentially
every request. The same reasoning applies to every FK added after.

**Add query-count assertions to integration tests now.** N+1 queries hit at 50 users, not 5,000, and
no database choice fixes them. It is the cheapest performance guardrail that exists.

---

## 5. Build when it hurts

Each of these is days, not months, because the seam already exists. **Do not build them in advance.**

| # | Move | Trigger | Cost |
|---|---|---|---|
| 1 | Add an index, rewrite a query | A single slow query | Hours |
| 2 | KPI snapshot tables | Dashboard over 1s on a warm cache | A day |
| 3 | Read replica for dashboards | Reads competing with writes | A day; one adapter change |
| 4 | pgBouncer, transaction mode | Past ~100 connections | Hours |
| 5 | ClickHouse behind `AnalyticsReader` | Snapshots stop covering ad-hoc queries | **Two env vars** |
| 6 | A dedicated vector DB behind `VectorStore` | pgvector recall or latency degrades | Days |
| 7 | Shard Postgres by `organization_id` | Writes past a single primary | Weeks — needs 4.1 |
| 8 | Broker-backed event bus | In-process dispatch saturates | Days — needs §6 |

Most products never get past #2. Each step is ordered by cost, so exhaust the cheap ones first —
"Postgres does not scale" is usually said by someone who skipped #1 and #4.

### On ClickHouse specifically

**At 500 employees it is premature.** Half a million rows a year is a Postgres table with a good
index, and snapshot tables cover the KPI rollups the spec already calls for.

**At 25k employees it is planned-for.** 1.3B activity rows makes org-wide trending a query Postgres
answers in tens of seconds. Snapshots help but only answer questions precomputed in advance —
predictive analytics and ad-hoc KPI exploration are exactly what they cannot cover.

**At 100k DAU it is required.**

Because the write path is a replay of `activity_log` from step 4.3, adopting it changes where rows
land and nothing else. **The port and the pipeline are built; the destination is a config change.**

Move #5 in the table above says "two env vars" rather than "a week" because
`ClickHouseAnalyticsReader`, `ClickHouseAnalyticsProjector`, the projection consumer and the nightly
reconciliation are written, and the container is in the compose file behind a profile:

1. `pnpm infra:up:analytics` — starts the container. Nothing writes to it.
2. `CLICKHOUSE_URL=…` — the projection starts filling it and the reconciliation starts reporting.
   Dashboards still read Postgres.
3. `ANALYTICS_DRIVER=clickhouse` — reads move.

**The two-variable arrangement is the design, not an accident.** One switch that moved reads and
writes together would cut dashboards over to a store that is still filling. Step 2 without step 3 is
the state you sit in for a few days while the reconciliation proves itself.

What is still a week, if you want it, is what the store is *for*: the rollup job at move #2, which
does not exist in either store, and the queries a real dashboard asks. The infrastructure is not the
part that was ever going to take a week.

---

## 6. What breaks before the database does

Three application patterns fail at every scale on this page, and no store choice fixes any of them.

### Capability resolution

At 10k requests/sec that is 10k `CapabilitySet` lookups per second, and a 60-second TTL means a
cache-miss storm every minute — each miss running the three-query join
([16](../setup/16-auth-package.md)).

Two fixes, and at that scale both are needed:

- **Signed capability data in the session cookie**, short TTL. Most requests then resolve permissions
  with a signature check and zero network calls.
- **An in-process LRU in front of Redis.** Twenty app instances each see a working set of maybe a
  thousand users; a 5,000-entry LRU at a 10-second TTL absorbs most reads before Redis sees them.

**The revocation window becomes the shortest TTL in that chain.** Sixty seconds and no longer — the
TTL is a backstop for an invalidation you forgot, not the primary mechanism. Every tier is bound by
that number, the cookie cache included.

**The desktop shell has no cookie**, so a bearer-token client pays full resolution and needs the LRU
to carry it ([30](../setup/30-desktop-app.md)). A long-lived desktop token and a 60-second
revocation window need reconciling explicitly rather than by accident.

### Digest fan-out

A daily digest is permission-filtered per recipient. Done naively at 100k recipients that is 100k
capability resolutions and 100k query sets, and the job runs for hours.

**Group recipients by capability shape, compute once per group, personalise at render.** Locale and
copy stay per-recipient — those are cheap. It is the capability resolution and the query set that
must be shared.

### Aggregate views

A capacity view aggregating every employee's tasks across every goal is a live join over everything.
Past a few thousand employees it must be a materialized view on a refresh schedule.

### Notification write amplification

One task change notifying five people is 5× the write rate on the notification table. That table
needs its own partitioning and an aggressive retention policy, or it becomes the largest table in
the database by an order of magnitude.

> [!TIP]
> Load-test these three paths at 10× expected volume **before** launch, with realistic data
> distribution. Everything else can be fixed reactively; these fail in ways that take a week to
> unpick.

---

## 7. What holds unchanged

Worth naming, because it is most of the system. At every scale on this page:

- **`packages/application`** — sharding is a repository concern; use-cases never learn about it.
- **`packages/permissions`** — pure computation, no I/O, identical answer in every runtime.
- **`packages/contracts`** — unchanged apart from one more branded identifier.
- **The web tier** — stateless by construction: no request state in `Container`, no module-scope
  `QueryClient`, sessions in Postgres and Redis ([17](../setup/17-composition-container.md)).
  Scaling is `replicas: 40`.
- **Workers** — BullMQ repeatable jobs dedupe across replicas, so consumers scale on queue depth
  independently of the web tier.
- **Event handlers** — moving from in-process dispatch to a broker changes the dispatcher, not the
  subscribers.

That last one has a condition attached. **Keep the event bus interface broker-shaped:** async
`publish`, no return value, idempotent handlers, no ordering assumptions. A handler that starts
depending on synchronous in-process semantics is the one thing that would make the broker swap
expensive.

---

## 8. Target topology, by scale

### Up to ~5k employees

```
Postgres (primary)      domain · audit · history · sessions · vectors
Redis (cache)           capability cache · session cache      ← allkeys-lru
Redis (queue)           BullMQ                                ← noeviction, AOF
S3 / MinIO              uploads · Loki chunks
stdout → Alloy → Loki   diagnostics, 30 days
```

Five stores, and all of them are in `infra/docker-compose.yml` from
[11](../setup/11-local-infrastructure.md) — including Loki, which stores into the MinIO that was
already there. Partitioning and `organization_id` are in place from day one, unused.

**ClickHouse is in that compose file too, behind an opt-in profile, and stopped.** The seam exists,
the container exists, and nothing writes to it. That is the intended state until §5's trigger fires —
a running analytics store with no consumer looks like a decision somebody made.

### ~25k employees

```
Postgres (primary + read replica)   domain · audit · history · sessions
  ├─ partitioned monthly
  └─ pgBouncer, transaction mode
Redis (cache / queue, separate)     capability cache · sessions | BullMQ
ClickHouse                          analytics aggregates, fed by domain events
pgvector or Qdrant                  embeddings, behind VectorStore
S3                                  uploads · Loki chunks
stdout → Alloy → Loki               diagnostics, 30-day retention
```

### ~100k DAU

```
Postgres, sharded by organization_id
  ├─ read replica per shard
  └─ pgBouncer per shard
Redis Cluster                       already split by concern before clustering
ClickHouse                          analytics · audit search
Qdrant                              embeddings
Kafka or Redis Streams              the event bus
S3                                  uploads · Loki chunks
stdout → Alloy → Loki               diagnostics
```

> [!IMPORTANT]
> **The architecture holds at 100k DAU. The default deployment does not.** Every move on that path is
> an adapter swap or an infrastructure change, and no business logic is touched — which is what the
> ports were for. But running sharded Postgres, ClickHouse, Redis Cluster and forty app instances is
> a platform team, not a side effect of good architecture. At 100k DAU that team exists. The
> architecture's job is to make sure it spends its time on infrastructure rather than on a rewrite.

---

## 9. The decision, in one table

| Question | Answer |
|---|---|
| Tasks, goals, RBAC | Postgres |
| Task status history | Postgres, partitioned monthly |
| Audit trail | Postgres, partitioned monthly, **in-transaction** |
| Auth sessions | Postgres + Redis cache |
| Vectors | pgvector, behind `VectorStore` — `VECTOR_DRIVER` |
| Analytics aggregates | Postgres snapshots → ClickHouse, behind `AnalyticsReader` — `ANALYTICS_DRIVER` |
| System logs | stdout → **Loki**, 30-day retention, low-cardinality labels only; read back through `LogReader` |
| Uploads | S3, presigned URLs, short TTL |

**Derived stores — rebuildable, never authoritative:**

| Store | Rebuilt from | Guard |
|---|---|---|
| Redis — capability and session cache | Postgres | Read-through on miss |
| Redis — BullMQ | **Nothing** | Separate instance; AOF; re-enqueue sweep |
| ClickHouse | Activity log replay | `AnalyticsProjector` is the only writer; nightly reconciliation |
| pgvector or a dedicated store | Source documents | Re-embed |

**Do this week:** `organization_id` everywhere · partition `activity_log` and `task_status_history` ·
`AnalyticsReader` port with a Postgres implementation · index every FK · query-count assertions in
integration tests · separate the Redis cache instance from the queue instance.

**Do not do this week:** *starting* ClickHouse, a dedicated vector database, sharding, a broker. Every
one is a swap behind a seam that already exists, and building any of them before a real query is slow
means building the wrong schema for a load pattern nobody has measured.

> [!NOTE]
> **"The seam is implemented" and "the store is running" are two different decisions, and only the
> second one costs anything to be wrong about.** The ClickHouse adapters are written and covered by
> the smoke check; the container is stopped and `CLICKHOUSE_URL` is unset. That is not a
> contradiction of the line above — writing an adapter costs a day once, while running a store you do
> not need costs an operator forever, and a store that is running with nothing writing to it looks
> like a decision somebody made.
>
> The same split applies to `VECTOR_DRIVER`, which has exactly one legal value and exists anyway: a
> seam with one implementation is untested by construction, and a discriminated `driver` on
> `ContainerConfig` is what turns "swap the implementation" from a claim into a compiler-checked edit.
