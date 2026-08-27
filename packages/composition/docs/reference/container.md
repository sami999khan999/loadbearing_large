---
title: Container
description: The four rules that govern the DI root — abstract types on the public surface, no request state, no process.env, reverse-order disposal — plus where use-cases go and why lazy instantiation is banned.
---

# `Container`

Roughly a hundred lines, no decorators, no reflection, no module graph. Four rules make it work, and
each of them prevents a specific failure.

## 1. Ports are exposed as their abstract types

```ts
public readonly vectors: VectorStore;      // not PgVectorStore
```

If the concrete type leaks into the public surface, a consumer eventually calls a Postgres-specific
method and the swap stops being one line. **The annotation is what enforces it** — TypeScript infers
`PgVectorStore` from the assignment otherwise, and nothing about the file would look wrong.

Two fields are deliberately concrete. `capabilities: CapabilityCache` and
`principals: PrincipalBuilder` are not adapters over a seam; they *are* the caching decision and the
credential-collapsing decision, and there is no second implementation to be abstract about.

## 1b. Swappable ports are chosen by a `driver`, not by a `new`

```ts
this.vectors   = Container.buildVectorStore(config, this.database, this.transactions);
this.analytics = config.analytics.driver === "clickhouse" && this.clickhouse
  ? new ClickHouseAnalyticsReader(this.clickhouse)
  : new PgAnalyticsReader(this.database, this.transactions);
```

Rule 1 makes the *type* swappable. This makes the *choice* configurable, and the two are not the same
claim.

**A seam with exactly one implementation is untested by construction.** Abstract types on the public
surface prove nobody calls a Postgres-specific method; they do not prove a second implementation could
be dropped in, because until one exists nothing has tried. A discriminated `driver` on
`ContainerConfig` is exercised the first time somebody flips the value — in an environment file, with
no code change.

`buildVectorStore` is a `switch` with a `never` default, so a driver added to the union and not to the
switch is a build error rather than a runtime surprise. `VECTOR_DRIVER` has one legal value today;
that is the point of writing it as a union rather than as nothing.

### Two derived stores are absent unless configured

`analyticsProjector` and `logReader` are `T | undefined`, reached through `projector` / `logs` getters
that throw and `hasProjector` / `hasLogs` booleans the worker branches on.

**Optional fields rather than no-op implementations.** A `NullAnalyticsProjector` would let the worker
register a projection consumer that runs every five minutes and writes nowhere — indistinguishable
from a working pipeline until a quarterly report comes out wrong. Absent means the consumer is never
registered, which is the state the compose file's stopped `clickhouse` container describes.

Same reasoning as the `auth` getter one section down, and the same shape: a process that reaches a
port it was not built with fails at the call site with a sentence, rather than at the first insert
with a `TypeError`.

### The driver and the connection are two switches, on purpose

`CLICKHOUSE_URL` builds the projector. `ANALYTICS_DRIVER` moves reads. Setting the first without the
second is the supported way to adopt ClickHouse: the projection fills the store and the nightly
reconciliation reports, while dashboards still read Postgres. One combined switch would cut reads over
to a store that is still filling.

The reverse — `ANALYTICS_DRIVER=clickhouse` with no URL — throws in the constructor. The alternative
is a silent fall back to Postgres, where the dashboard keeps answering out of the store the operator
believed they had moved off.

## 2. Never build request-scoped state into the container

The `Principal` is passed as an argument to `execute()`, never held here. **One container per
process, not per request.**

Letting per-request state into the DI root couples you to a lifecycle model, and both the worker and
any future NestJS migration become expensive. It also removes the temptation to reach for
`AsyncLocalStorage` as ambient auth state — the one place this repository does use it is
`TransactionScope`, where the alternative is a `tx` parameter on every port method
([`infrastructure/docs/reference/unit-of-work.md`](../../../infrastructure/docs/reference/unit-of-work.md)).

## 3. Config arrives as a constructor argument

No `process.env` in this file or in any package. The two `env.ts` files are the boundary, and
Biome's `noProcessEnv` rule from [05](../../../../docs/setup/05-lint-and-format.md) is what keeps it
true.

**The logger's `app` and `env` are bound fields, not options.**

```ts
this.logger = new JsonLogger({
  level: config.logging.level,
  pretty: config.logging.pretty,
  bound: { app: config.logging.app, env: config.logging.env },
});
```

`JsonLoggerOptions` declares `level`, `pretty`, `sink`, `bound`, `clock` and `random` — and nothing
else. Spreading `config.logging` into it would **compile**, because excess-property checking does
not apply to a variable, and both values would be silently dropped: no error, no label, and a log
platform that cannot tell `web` from `worker`.

Binding them puts `app` and `env` on every line, which is what lets the Alloy pipeline read all four
labels out of the JSON body rather than inferring two of them from container metadata that differs
between Compose, Kubernetes, and a host-run `pnpm dev`
([11](../../../../docs/setup/11-local-infrastructure.md)). The application knows what it is; the
orchestrator's name for the process is incidental.

> [!NOTE]
> **`logger` is a shared primitive, not a port.** It sits with `clock` and `authorizer` rather than
> in the port block, and there is no `Logger` abstract class in `packages/application/src/port/` —
> the domain layer does not log at all
> ([`application/docs`](../../../application/docs/index.md)). The seam lives in
> `@loadbearing/observability`, low enough in the graph that `db`, `infrastructure`, `auth`, and both
> apps can reach it.

## 4. `dispose()` closes in reverse construction order

```ts
await this.queuePublisher.close();
await this.redis.close();
await this.database.close();
```

Queues before the Redis connections before Postgres. Closing Redis while BullMQ still holds blocking
connections produces a hang on shutdown that looks like a deadlock, because it is one.

`RedisConnection.close()` quits both instances, which is why they sit behind one object rather than
as two fields on the container. Two fields is two things to remember at every shutdown path, and the
one that gets forgotten is the queue — where an unclean close means in-flight jobs are redelivered
rather than completed.

**The logger is constructed first and disposed last**, which is the same rule read from both ends.
Constructed first, because a `Database` that cannot reach Postgres should produce a structured line
rather than a stack trace on stderr. Disposed last, because everything closing above it may have
something to say on the way out.

## `healthy()` pings what callers actually hold

```ts
const [database, cache, queue, analytics] = await Promise.all([
  this.database.isHealthy(),
  this.redis.healthy("cache"),
  this.redis.healthy("queue"),
  this.clickhouse?.healthy() ?? Promise.resolve(true),
]);
```

Postgres and **both** Redis instances. A cache that is down degrades; a queue that is down silently
stops accepting work, which is worth knowing about — and the two are separate servers with different
eviction policies, so one being up says nothing about the other.

**ClickHouse only when it is part of this deployment.** A container with no ClickHouse reports healthy
without it, which is correct: it is not degraded, it is not running one.

**Loki is deliberately absent from this list**, even though `LokiLogReader.healthy()` exists. Loki
being down loses diagnostics and nothing else. Failing a readiness probe over it takes the application
down in order to protect its logs — the wrong trade in every deployment, and exactly backwards during
the incident where the logs matter most. The asymmetry is the decision: a dashboard reading from a
store that is not answering is user-visible; a log line nobody is reading right now is not.

`RedisConnection.healthy(role)` takes the role rather than handing out a client, which is what keeps
`ioredis` confined to `packages/infrastructure`. It pings the memoised connection the cache store and
the queue publisher are already using; opening a second connection to answer a health check would
report green on a socket nothing else uses.

## The one nominal binding in the repository

```ts
const membershipReader: MembershipReader = new PgMembershipReader(
  this.database,
  this.transactions,
);
```

`MembershipReader` is declared in `@loadbearing/auth` and implemented in `@loadbearing/infrastructure`, which
cannot import it — `auth` already depends on `db`, so the arrow cannot point back.
`PgMembershipReader` therefore satisfies it **structurally**, and nothing checks that until the two
meet. The annotation on this local is that check. Drop it and a signature drift compiles everywhere
and fails at sign-in.

`PgApiKeyRepository` → `ApiKeyRepository` is the same arrangement one line down, checked by the
`ApiKeyResolver` constructor rather than by an annotation.

## Where use-cases go

A container with fifty use-cases as fields is unwieldy but it is honest, and it is still simpler than
a module graph. Group by slice — one private method per module, returning a small object:

```ts
public readonly task: TaskUseCases;

// …
this.task = this.buildTaskUseCases();

private buildTaskUseCases(): TaskUseCases {
  const tasks = new PgTaskRepository(this.database, this.transactions);
  return {
    create: new CreateTaskUseCase(tasks, this.authorizer, this.activity),
    reactivate: new ReactivateTaskUseCase(tasks, this.authorizer, this.activity, this.clock),
  };
}
```

The oRPC router then reads `context.container.task.reactivate.execute(...)`, which mirrors the
contract path exactly.

**Do not add lazy instantiation.** The temptation is a `get reactivateTask()` that constructs on
first access. It saves microseconds at boot and costs you the property that a container which
constructs successfully is a container where every dependency resolved. Eager construction means a
wiring mistake is a **startup crash** rather than a request-time surprise at 3am.

## Smells

- The word `if` anywhere except reading a config flag — logic has crept in.
- A concrete class name in a public field's type annotation.
- A getter. See above.
- A field holding a `Principal`, a `Request`, or anything else that belongs to one request.
