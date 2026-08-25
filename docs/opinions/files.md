---
title: Files
description: Kebab-case everywhere, a dot-suffix for every architectural role, one class per file.
---

# Files

## Everything is kebab-case, including React component files

Case-sensitive CI plus case-insensitive macOS produces Git renames that appear to change nothing.
Kebab-case sidesteps the entire class of problem, and `forceConsistentCasingInFileNames`
([04](../setup/04-typescript-configs.md)) catches what slips through.

## A file with an architectural role takes a dot-suffix

`<subject>.<role>.ts`

| Role suffix | Example file | Exports |
|---|---|---|
| `.contract.ts` | `task.contract.ts` | `TaskContract` |
| `.entity.ts` | `task.entity.ts` | `TaskEntity` |
| `.procedures.ts` | `task.procedures.ts` | `TaskProcedures` |
| `.use-case.ts` | `reactivate-task.use-case.ts` | `ReactivateTaskUseCase` |
| `.repository.ts` | `task.repository.ts` | `TaskRepository` |
| `.gateway.ts` | `s3-storage.gateway.ts` | `S3StorageGateway` |
| `.store.ts` | `pg-vector.store.ts` | `PgVectorStore` |
| `.reader.ts` | `analytics.reader.ts` | `AnalyticsReader` |
| `.logger.ts` | `activity.logger.ts` | `ActivityLogger` |
| `.provider.ts` | `embedding.provider.ts` | `EmbeddingProvider` |
| `.publisher.ts` | `queue.publisher.ts` | `QueuePublisher` |
| `.resolver.ts` | `session.resolver.ts` | `SessionResolver` |
| `.bus.ts` | `event.bus.ts` | `EventBus` |
| `.policy.ts` | `overdue-lock.policy.ts` | `OverdueLockPolicy` |
| `.strategy.ts` | `bearer-auth.strategy.ts` | `BearerAuthStrategy` |
| `.router.ts` | `task.router.ts` | `TaskRouter` |
| `.consumer.ts` | `embedding.consumer.ts` | `EmbeddingConsumer` |
| `.schedule.ts` | `cleanup.schedule.ts` | `CleanupSchedule` |
| `.error.ts` | `forbidden.error.ts` | `ForbiddenError` |
| `.schema.ts` | `rbac.schema.ts` | Drizzle tables |
| `.permissions.ts` | `task.permissions.ts` | a catalog fragment |
| `.errors.ts` | `core.errors.ts` | an error-catalog fragment |
| `.gate.ts` | `rbac.gate.ts` | a module-gate fragment |
| `.routes.ts` | `rbac.routes.ts` | a route fragment |
| `.spec.ts` | `reactivate-task.use-case.spec.ts` | tests, in the package's `tests/` |

**Files with no layer role stay plain kebab-case**: `permission-registry.ts`, `capability-set.ts`,
`clock.ts`, `container.ts`. This is why `core` and `permissions` read differently from
`application` — those classes are not *in* a layer, they are the vocabulary the layers use.

## One class per file, and the filename derives from the class

Mechanically: strip the role suffix from the class name, kebab-case the remainder, append
`.<role>.ts`. `ReactivateTaskUseCase` → `reactivate-task.use-case.ts`.

## Two exemptions to the subject-first order

**1. Use-case files lead with the verb.** `reactivate-task.use-case.ts`, not
`task-reactivate.use-case.ts`. The class is `ReactivateTaskUseCase`, and mirroring the class
outranks folder-prefix symmetry.

**2. Implementation files lead with the technology.** `pg-vector.store.ts`, `redis.cache-store.ts`,
`s3-storage.gateway.ts`, `bearer-auth.strategy.ts`. You should be able to see what you would delete
when a vendor changes.

## Framework-dictated filenames win

`$goalId.tsx`, `-guard.ts`, `rpc.$.ts`, `vite.config.ts`, `drizzle.config.ts`, `tsup.config.ts`.
Inside `apps/web/src/route/` especially, TanStack's routing conventions are load-bearing — a `-`
prefix is what marks a file as *not* a route. Don't fight them.

## Banned filenames

`utils.ts`, `helpers.ts`, `common.ts`, `misc.ts`. They are where unowned code goes to accumulate.
A barrel may re-export; it may never contain logic.

> [!NOTE]
> `packages/content/src/message/en/common.ts` is not an exemption. `common` there is a *namespace
> name* in a closed union — the file holds one locale's copy for that namespace, and the name is
> load-bearing rather than a shrug.

## Tests mirror `src/`, and never live inside it

`src/error/app.error.ts` is covered by `tests/error/app.error.spec.ts`. That keeps `src/` equal to
the shipped surface — `tsup` builds from `src/index.ts`, and the `development` export condition
resolves into `src/` — while the mirrored path preserves the one thing colocation was good at:
knowing where a subject's test is without looking.

`*.stories.tsx` is **not** a test and stays in `src/`.
