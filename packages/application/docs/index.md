---
title: "@loadbearing/application"
description: Principal, Authorizer, and the ten abstract ports. Zero framework imports and no third-party runtime dependency — the package that makes every infrastructure decision reversible.
---

# `@loadbearing/application`

If `ReactivateTaskUseCase` lives inside a TanStack Start server function, swapping the transport
means rewriting business logic. If it lives here, the transport is a hundred lines of adapter.

That is the whole argument, and it has a mechanical test:

```bash
grep -rE "@orpc|@tanstack|@nestjs|drizzle|ioredis|aws-sdk|better-auth" packages/application/src
```

It returns nothing, and `check-architecture.mjs` §1 asserts it in CI.

| | |
| --- | --- |
| **Package** | `@loadbearing/application` (private, never published) |
| **Entrypoint** | `src/index.ts` |
| **Depends on** | `@loadbearing/contracts`, `@loadbearing/core` (`ServerOnly`), `@loadbearing/errors` (`ForbiddenError`), `@loadbearing/permissions` — no third-party runtime dependency, ever |
| **Used by** | `db`, `infrastructure`, `auth`, `composition`, `apps/worker` — **never** a browser bundle |
| **Environment** | server-only; `ServerOnly.assert()` is the runtime tripwire |
| **Build** | `tsup` → `dist/index.js` + `dist/index.d.ts` |

```
packages/application/
├── vitest.config.ts
├── src/
│   ├── index.ts
│   ├── import.ts                 ← ServerOnly, ForbiddenError, ids, CapabilitySet
│   ├── primitive/
│   │   ├── index.ts
│   │   ├── principal.ts          → Principal, PrincipalKind
│   │   └── authorizer.ts         → Authorizer
│   └── port/                     ← abstract classes only, zero implementations
│       ├── index.ts
│       ├── activity.logger.ts    → ActivityLogger
│       ├── analytics.reader.ts   → AnalyticsReader, DateRange, RiskScore, TrendPoint
│       ├── cache.store.ts        → CacheStore
│       ├── embedding.provider.ts → EmbeddingProvider
│       ├── event.bus.ts          → EventBus, DomainEvent
│       ├── queue.publisher.ts    → QueuePublisher, JobOptions
│       ├── session.resolver.ts   → SessionResolver, ResolvedSession, RequestHeaders
│       ├── storage.gateway.ts    → StorageGateway, StoredObject
│       ├── unit-of-work.ts       → UnitOfWork
│       └── vector.store.ts       → VectorStore, DocumentChunk, SearchHit
└── tests/primitive/
```

## This package does not log

A use-case records a business fact through `ActivityLogger`, or it throws a typed error. That is its
entire vocabulary, and `check-architecture.mjs` §2 asserts the missing `@loadbearing/observability`
import.

Those are two of the four data streams, and they differ in the way that matters: an audit row **must
not** be lost and commits inside the transaction; a diagnostic line **may** be lost and goes to
stdout. Writing one where the other belongs is the failure
[Data and scale](../../../docs/opinions/data-and-scale.md) exists to prevent.

The rule pays for itself immediately. Nothing threads a third argument into
`execute(actor, input)`, there is no ambient request context, and a `ForbiddenError` gets logged
**once** — at the boundary that catches it, with its full structured context — rather than three
times on the way up, each layer adding a little and losing a little.

## The ten ports

Every one is an **abstract class**, not an interface: abstract classes exist at runtime, so `extends`
gives a real prototype chain and `noImplicitOverride` catches a rename.

| Port | Implemented by | Swap target |
| --- | --- | --- |
| `ActivityLogger` | `PgActivityLogger` — `db` | never; audit is Postgres at every scale |
| `AnalyticsReader` | `PgAnalyticsReader` — `db` | `ClickHouseAnalyticsReader` |
| `CacheStore` | `RedisCacheStore` — `infrastructure` | managed Redis |
| `EmbeddingProvider` | `OpenAiEmbeddingProvider` — `infrastructure` | any embedding API |
| `EventBus` | in-process dispatch — `composition` | a broker |
| `QueuePublisher` | `BullMqQueuePublisher` — `infrastructure` | managed Redis |
| `SessionResolver` | Better Auth — `auth` | any session library |
| `StorageGateway` | `S3StorageGateway` — `infrastructure` | S3, R2 |
| `UnitOfWork` | `PgUnitOfWork` — `db` | never |
| `VectorStore` | `PgVectorStore` — `db` | Qdrant |

Read that list against `container.ts` and every name lines up with one binding. **Repository ports
are not here** — each lives with its feature slice, `src/task/task.repository.ts`, so a slice is one
glob and `CODEOWNERS` stays honest. `AnalyticsReader` and `VectorStore` are the exception because
they are one cross-cutting read seam that many subjects query, not one per subject: the test is
whether a new feature adds a *method* here or a *file*.

## Two ports carry a required permitted scope

`VectorStore.search()` and `AnalyticsReader.goalRiskScores()` both take `goalIds` as a required
parameter, and that is the security design rather than a convenience.

```ts
const orgId = actor.organizationId;
const goalIds = actor.capabilities.goalsWith("document.read", await goals.idsForOrg(orgId));
const hits = await this.vectors.search(orgId, embedding, goalIds, 20);
```

Filtering *after* retrieval means the model has already seen documents the actor cannot access, and
"we filter the output" is not a defence anyone wants to explain after an incident. Putting the
permitted scope in the signature means it cannot be forgotten — a caller must produce it.

It matters more once the store is remote. There is no join back to goal membership from ClickHouse or
from Qdrant, so a scope that is not in the argument list does not exist.

## Reference

- [Authorizer](reference/authorizer.md) — the gate, the load-assert-work shape, and the one leak it accepts
