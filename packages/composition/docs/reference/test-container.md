---
title: Test container
description: The sixteen fakes and the harness that wires them — why it returns abstract types, why it lives in src/ rather than tests/, and why query counts belong in the integration tier instead.
---

# `TestContainer`

The reason `Container` exists in this shape. **Not exported from `src/index.ts`** — leaving it off
the barrel is the difference between "test helper" and "public API", a distinction `export *` could
not have made ([Imports and exports](../../../../docs/opinions/imports.md)).

```ts
const activity = new RecordingActivityLogger();
const harness = TestContainer.build({ activity });

await new ReactivateTaskUseCase(tasks, harness.authorizer, activity, harness.clock)
  .execute(principal, { taskId });

expect(activity.actions()).toEqual(["task.reactivated"]);
```

No Postgres, no Redis, no S3, no Better Auth, no HTTP. Every use-case test builds a `Principal`
directly with a hand-made `CapabilitySet` and asserts on behaviour. Integration tests — the ones that
need real infrastructure — are then reserved for the adapters themselves and the auth routes, which
is a much smaller and much less flaky set.

## Why it lives in `src/`, not `tests/`

`files.md` says tests mirror `src/` and never live inside it. This is not a test — it is a
**compile-time completeness check**, and it has to be inside `src/` for `tsc` to see it.

`TestPorts` has one entry per abstract class in `packages/application/src/port/` — sixteen of them —
plus `content`, which is a `ContentSource` from a package to `application`'s left rather than a port
of its own. Seventeen entries, and adding a seventeenth port makes this file stop compiling until it
has a double. That is the whole claim of
[17](../../../../docs/setup/17-composition-container.md) §17.4 — *"adding a port to `application`
shows up here as one line rather than as a compile error in forty specs"* — and it only holds if the
check is `tsc`'s rather than a spec's.

## The barrel exports it, and there is no second entrypoint

`TestContainer`, `TestPorts`, `TestHarness`, `FixedClock` and the fakes come out of
`src/index.ts` alongside `Container`. They were reachable only from inside this package, so every
consumer downstream — `apps/worker` first — hand-rolled an object literal of the four members its
subject happened to touch and cast it `as unknown as Container`. That double is silent about the
port added next week, which is the exact failure `TestPorts` exists to make loud.

No subpath export, per [Imports](../../../../docs/opinions/imports.md): a package wanting a second
JavaScript entrypoint is a package that should be two.

**It reaches `dist/index.js` and neither bundle.** `tsup` emits ESM, so a consumer that imports only
`Container` shakes the rest out — `apps/web`'s client *and* server outputs contain none of these
names, which is the check worth running after touching this barrel:

```bash
pnpm --filter @loadbearing/web build
grep -rl "InMemoryVectorStore\|TestContainer" apps/web/.output/   # nothing
```

**`packages/application` is the one place that cannot use it**, and that is not an oversight.
`composition` imports `application`; the reverse edge would be a cycle in the workspace graph and
would invert the layering. Its specs keep their hand-rolled doubles, which is the cost of being
upstream of the thing that knows how to fake it. Moving the fakes into a package left of
`application` is the change that would fix it, and it is a package decision, not a file move.

## `build()` returns abstract types, on purpose

This is the one place the repository does the **opposite** of
[`Container` rule 1](container.md) — and for the same underlying reason.

`Container` annotates ports abstractly so a consumer *cannot* reach a concrete method. `TestHarness`
does the same, which means `harness.activity.recorded()` does not compile. That is deliberate: a
spec that wants to assert on a fake should **own the reference**, so the assertion reads off a
variable the test already declared rather than off a chain into a container. Construct it, pass it as
an override, keep it:

```ts
const queue = new RecordingQueuePublisher();
const harness = TestContainer.build({ queue });
// …
expect(queue.publishedTo(QueueName.EMBEDDING)).toHaveLength(1);
```

That is also why `fake/` has a barrel while `TestContainer` does not go on the package's.

## A fake for every port, including the ones a given test does not use

| Port | Fake | Behaviour |
| --- | --- | --- |
| `CacheStore` | `InMemoryCacheStore` | Map + recorded TTLs, **never enforced** — wall-clock expiry is how a suite goes flaky |
| `StorageGateway` | `InMemoryStorageGateway` | bytes in a Map; `presign*` returns a fake URL rather than throwing |
| `QueuePublisher` | `RecordingQueuePublisher` | records, and honours `jobId` dedup because that is a domain rule |
| `VectorStore` | `InMemoryVectorStore` | **real cosine**, goal filter applied to the input set |
| `AnalyticsReader` | `StubAnalyticsReader` | empty arrays, and that is enough |
| `EmbeddingProvider` | `StubEmbeddingProvider` | deterministic character histogram, no network |
| `SessionResolver` | `StubSessionResolver` | `null` by default; a use-case test never reaches it |
| `ActivityLogger` | `RecordingActivityLogger` | records actor, action and payload |
| `EventBus` | `RecordingEventBus` | the port with no production implementation — see below |
| `UnitOfWork` | `DirectUnitOfWork` | runs the work, opens nothing, counts the call |
| `ContentSource` | `StaticContentSource` | **the real one** — its catalog is a map of dynamic imports |

`StubAnalyticsReader` returning empty arrays is not laziness. The value of this file is that adding a
port is **one line** here; a fake elaborate enough to need its own tests would defeat that.

**Two exceptions worth naming.** `InMemoryVectorStore` computes cosine for real, because a fake that
scored every hit identically would let *"the top result is the right one"* pass either way — the one
assertion a retrieval use-case is actually worth testing. And `RecordingQueuePublisher` models
`jobId` deduplication, because *"enqueue OCR for this receipt, once"* is a business rule the
use-case is responsible for, not queue configuration.

## `EventBus` is faked but never wired

`Container` constructs fifteen of the sixteen ports. `EventBus` has no implementation in
`infrastructure` and no field on the container, because nothing publishes a domain event yet.
`RecordingEventBus` exists regardless — the fake is what makes the first publishing use-case testable
on the day it is written, and its absence from `Container` is a gap in
[12](../../../../docs/setup/12-application-package.md)/[17](../../../../docs/setup/17-composition-container.md)
rather than a decision taken here.

## No `auth`, no `sessions`, no `principals`

`TestHarness` carries every port plus `clock`, `logger` and `authorizer`. It does **not** carry
`AuthInstance`, `CapabilityCache` or `PrincipalBuilder`, because a use-case test never authenticates
— it constructs a `Principal` with a hand-made `CapabilitySet` and calls `execute(principal, input)`
directly. Authentication is asserted against Better Auth in the integration tier.

## Query counts belong in that integration set

A fake repository cannot tell you that `resolveFor` became 3 + N queries — only a real adapter
against a real database can. `DatabaseConfig.logger` is the seam that assertion reads, and the
assertion lives next to the repository in `packages/infrastructure` ([`infrastructure/docs`](../../../infrastructure/docs/index.md)).

That is the reason the integration tier exists at all, rather than being a slower copy of the unit
tier.
