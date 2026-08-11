# 11 · `@ratchet/application`

> **The package that makes the plan reversible.** `Principal`, `Authorizer`, domain errors, and every abstract port. Zero framework imports, zero third-party runtime dependencies.

**Delivers:** The complete port surface the rest of the system implements, plus the authorization primitive every use-case opens with.

**Prerequisite:** [10 · Local Infrastructure](10-local-infrastructure.md)

---

## Why this package exists

If `ReactivateTaskUseCase` lives inside a TanStack Start server function, swapping transports means rewriting business logic. If it lives here, the transport is a hundred lines of adapter.

That is the whole argument, and it has a mechanical test: `grep -r "@orpc\|@tanstack\|@nestjs\|drizzle\|ioredis\|aws-sdk" packages/application/src` must return nothing. Three workspace dependencies — `core`, `contracts`, `permissions` — and no third-party ones at all.

Everything outside itself is reached through an abstract class in `port/`. That is what lets the entire system be constructed in a test with a fake database, a fake S3, and a frozen clock.

```
packages/application/src/
├── index.ts
├── principal.ts              → Principal
├── authorizer.ts             → Authorizer
├── error/
│   ├── index.ts
│   ├── domain.error.ts       → DomainError (base)
│   ├── forbidden.error.ts    → ForbiddenError
│   ├── not-found.error.ts    → NotFoundError
│   ├── conflict.error.ts     → ConflictError
│   └── validation.error.ts   → ValidationError
└── port/                     ← abstract classes only, no implementations
    ├── index.ts
    ├── activity.logger.ts    → ActivityLogger
    ├── cache.store.ts        → CacheStore
    ├── embedding.provider.ts → EmbeddingProvider
    ├── event.bus.ts          → EventBus
    ├── queue.publisher.ts    → QueuePublisher
    ├── session.resolver.ts   → SessionResolver
    ├── storage.gateway.ts    → StorageGateway
    ├── unit-of-work.ts       → UnitOfWork
    └── vector.store.ts       → VectorStore
```

```js
// packages/application/eslint.config.js
export { default } from "@ratchet/eslint-config/oop";
```

---

## Step 11.1 — `Principal`

**`packages/application/src/principal.ts`**

```ts
import type { UserId } from "@ratchet/contracts";
import type { CapabilitySet, PermissionKey } from "@ratchet/permissions";

export type PrincipalKind = "user" | "api_key" | "system";

export class Principal {
  constructor(
    public readonly userId: UserId,
    public readonly capabilities: CapabilitySet,
    public readonly kind: PrincipalKind = "user",
  ) {}

  /** An API key is a principal whose capabilities cannot exceed its issuer's. */
  public static apiKey(issuerId: UserId, caps: CapabilitySet): Principal {
    return new Principal(issuerId, caps, "api_key");
  }

  /**
   * The worker's actor for scheduled work. Given an explicit, narrow capability
   * set — never a wildcard. A background job that can do anything is a job that
   * will eventually do something it shouldn't.
   */
  public static system(id: UserId, caps: CapabilitySet): Principal {
    return new Principal(id, caps, "system");
  }

  public can(permission: PermissionKey, goalId?: string): boolean {
    return this.capabilities.can(permission, goalId);
  }
}
```

Four credential types — a browser cookie, a desktop bearer token, an integration's API key, and the worker's scheduled run — collapse into one `Principal` before any use-case executes. A use-case cannot tell how the actor arrived, and must not care.

**`Principal.system()` takes an explicit capability set.** The tempting shortcut is a wildcard principal for the worker. Don't. The overdue sweep needs exactly `task.read` and `task.update`; giving it everything means a bug in a schedule can do anything. See [24](24-worker-app.md).

---

## Step 11.2 — `Authorizer`

**`packages/application/src/authorizer.ts`**

```ts
import type { PermissionKey } from "@ratchet/permissions";
import { ForbiddenError } from "./error/forbidden.error.js";
import type { Principal } from "./principal.js";

export class Authorizer {
  public assert(principal: Principal, permission: PermissionKey, goalId?: string): void {
    if (!principal.can(permission, goalId)) {
      throw new ForbiddenError(permission, goalId);
    }
  }

  public assertAll(
    principal: Principal,
    permissions: readonly PermissionKey[],
    goalId?: string,
  ): void {
    for (const permission of permissions) this.assert(principal, permission, goalId);
  }
}
```

Three lines, and it is the single most important class in the system.

**Authorization lives in the use-case, not in transport middleware.** Middleware is bypassed by the worker, which calls use-cases directly, and by SSR direct calls. `Authorizer.assert()` is not. The middleware check in [23](23-web-app.md) is defence in depth; this is the gate.

**The shape every use-case follows:**

```ts
public async execute(actor: Principal, input: ReactivateTaskInput): Promise<TaskEntity> {
  const task = await this.tasks.findByIdOrFail(input.taskId);

  this.authorizer.assert(actor, "task.reactivate", task.goalId);   // ← always line two or three

  // ... the actual work
}
```

Load, assert, work. Because the assertion is always in the same position, reviewing "is this use-case gated" is reading one line per file rather than tracing a call graph.

**Load before you assert, when the permission is goal-scoped.** You need the task to know its `goalId`. That means a caller without permission can distinguish "does not exist" from "exists but forbidden" through timing. For most products that leak is acceptable; where it is not, have the repository take the principal and filter at the query, and say so explicitly in the port's doc comment.

---

## Step 11.3 — Domain errors

**`packages/application/src/error/domain.error.ts`**

```ts
export abstract class DomainError extends Error {
  public abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Error.captureStackTrace?.(this, new.target);
  }
}
```

**`packages/application/src/error/forbidden.error.ts`**

```ts
import { DomainError } from "./domain.error.js";

export class ForbiddenError extends DomainError {
  public override readonly code = "FORBIDDEN";

  constructor(
    public readonly permission: string,
    public readonly goalId?: string,
  ) {
    super(`Missing permission: ${permission}${goalId ? ` (goal ${goalId})` : ""}`);
  }
}
```

**`packages/application/src/error/not-found.error.ts`**

```ts
import { DomainError } from "./domain.error.js";

export class NotFoundError extends DomainError {
  public override readonly code = "NOT_FOUND";

  constructor(
    public readonly resource: string,
    public readonly id: string,
  ) {
    super(`${resource} ${id} was not found.`);
  }
}
```

Add `ConflictError` (`code = "CONFLICT"`, for optimistic-concurrency and uniqueness failures) and `ValidationError` (`code = "BAD_REQUEST"`, carrying a field map) on the same pattern.

**No `@ratchet/application` code ever knows about status codes.** `ForbiddenError` is a domain concept; `403` is a transport concept. The oRPC interceptor in [23](23-web-app.md) maps one to the other, and a NestJS exception filter would map it to `ForbiddenException`. That single discipline is most of what keeps the transport swappable — and it is also what lets the worker catch a `ForbiddenError` and log it rather than trying to interpret an HTTP artifact in a process that has no HTTP.

The `code` string is what the adapter switches on. It is a closed vocabulary rather than a class check because `instanceof` across a bundler boundary is a source of subtle failure.

---

## Step 11.4 — The ports

Every port is an **abstract class**, not an interface. Two reasons: abstract classes exist at runtime, so `extends` gives you a real prototype chain and `noImplicitOverride` catches renames; and a port can carry a shared concrete helper method where that is genuinely useful without becoming a mixin.

### `ActivityLogger`

```ts
// packages/application/src/port/activity.logger.ts
import type { Principal } from "../principal.js";

export abstract class ActivityLogger {
  public abstract record(
    actor: Principal,
    action: string,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<void>;
}
```
> `action` is a dotted past-tense string mirroring the permission vocabulary: `task.reactivated`, `rbac.role.granted`. Same nouns, past tense, so `git grep` finds the permission and the audit entry together.

### `CacheStore`

```ts
// packages/application/src/port/cache.store.ts
export abstract class CacheStore {
  public abstract get<T>(key: string): Promise<T | null>;
  public abstract set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  public abstract delete(key: string): Promise<void>;
  /** Delete every key under a prefix. Used for invalidating a whole subject. */
  public abstract deletePrefix(prefix: string): Promise<void>;
}
```
> Implemented by `RedisCacheStore` in [14](14-infrastructure-package.md) and by an in-memory fake in tests. `deletePrefix` exists because capability invalidation needs "everything for this user" and doing it by enumerating keys at the call site pushes Redis semantics into the domain.
>
> There is deliberately no `getOrSet`. Cache-aside logic with its stampede handling belongs in the adapter, not spread across use-cases.

### `StorageGateway`

```ts
// packages/application/src/port/storage.gateway.ts
export interface StoredObject {
  readonly key: string;
  readonly size: number;
  readonly contentType: string;
  readonly checksum: string;
}

export abstract class StorageGateway {
  public abstract put(
    key: string,
    body: Uint8Array,
    contentType: string,
  ): Promise<StoredObject>;

  public abstract get(key: string): Promise<Uint8Array>;
  public abstract delete(key: string): Promise<void>;
  public abstract exists(key: string): Promise<boolean>;

  /** A time-limited URL the browser can upload to directly, bypassing the app server. */
  public abstract presignUpload(
    key: string,
    contentType: string,
    expiresInSeconds: number,
  ): Promise<string>;

  /** A time-limited URL for reading. Never return a permanent public URL. */
  public abstract presignDownload(key: string, expiresInSeconds: number): Promise<string>;
}
```

**Note what is absent: no bucket name, no region, no endpoint.** Those are adapter configuration. A use-case says `storage.put("receipt/2026/01/abc.pdf", bytes, "application/pdf")` and has no opinion about where that lands. Moving from MinIO to S3 to R2 changes one constructor argument in `Container`.

**Presigned URLs are in the port because they are a domain decision.** "The browser uploads directly and the server never sees the bytes" is an architectural choice with permission implications — the use-case authorizes the upload and *then* issues the URL. If presigning lived only in the adapter, that authorization step would have nowhere obvious to go.

**Key layout convention:** `<subject>/<yyyy>/<mm>/<uuid>.<ext>`. Date-partitioned because lifecycle rules and cost reporting both work on prefixes, and a flat bucket with a million objects is painful to reason about. The UUID rather than the original filename, because filenames are user input and S3 keys are not a good place for user input; keep the display name in the database row.

### `QueuePublisher`

```ts
// packages/application/src/port/queue.publisher.ts
export interface JobOptions {
  readonly delayMs?: number;
  readonly attempts?: number;
  /** Deduplication key — a second publish with the same id is a no-op. */
  readonly jobId?: string;
}

export abstract class QueuePublisher {
  public abstract publish<T>(queue: string, payload: T, options?: JobOptions): Promise<void>;
}
```
> The use-case publishes; it never knows BullMQ exists. `jobId` is here because idempotency is a domain concern — "enqueue an OCR job for this receipt, once" is a business rule, not a queue configuration detail.

### `SessionResolver`

```ts
// packages/application/src/port/session.resolver.ts
import type { UserId } from "@ratchet/contracts";

export interface ResolvedSession {
  readonly userId: UserId;
  readonly sessionId: string;
  readonly expiresAt: Date;
}

export abstract class SessionResolver {
  public abstract resolve(headers: Headers): Promise<ResolvedSession | null>;
}
```
> `Headers` is the Web Fetch API type — global in Node 18+, available in browsers, and not a framework type. This is the port Better Auth implements in [15](15-auth-package.md), and it is what makes use-case tests need no auth library at all:
>
> ```ts
> class FakeSessionResolver extends SessionResolver {
>   constructor(private readonly userId: UserId | null) { super(); }
>   public override async resolve(): Promise<ResolvedSession | null> {
>     return this.userId
>       ? { userId: this.userId, sessionId: "test", expiresAt: new Date(Date.now() + 3_600_000) }
>       : null;
>   }
> }
> ```

### `VectorStore` and `EmbeddingProvider`

```ts
// packages/application/src/port/vector.store.ts
export interface DocumentChunk {
  readonly id: string;
  readonly sourceId: string;
  readonly goalId: string | null;
  readonly content: string;
  readonly embedding: readonly number[];
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface SearchHit {
  readonly id: string;
  readonly sourceId: string;
  readonly content: string;
  readonly score: number;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export abstract class VectorStore {
  public abstract upsert(chunks: readonly DocumentChunk[]): Promise<void>;
  public abstract deleteBySource(sourceId: string): Promise<void>;

  /**
   * `goalIds` is the caller's permitted scope. It is a required parameter so the
   * permission filter runs on the input set, before retrieval — not on results.
   */
  public abstract search(
    embedding: readonly number[],
    goalIds: readonly string[],
    limit: number,
  ): Promise<readonly SearchHit[]>;
}
```

```ts
// packages/application/src/port/embedding.provider.ts
export abstract class EmbeddingProvider {
  public abstract readonly dimensions: number;
  public abstract embed(texts: readonly string[]): Promise<readonly (readonly number[])[]>;
}
```

**`VectorStore` is declared here, not in `db`.** This is the departure flagged in [00](00-README.md). The architecture docs place it in `packages/db/src/vector/`, which works only while the implementation is Postgres — and the stated requirement is to move to a dedicated vector database later without rewrites. A use-case cannot import `db`, so the abstraction has to live where every other port lives. `PgVectorStore` still lives in `db/src/vector/`; see [13](13-vector-store.md).

**`goalIds` being a required parameter is the whole security design.** Filtering after retrieval means the model has already seen documents the actor cannot access, and "we filter the output" is not a defence you want to explain after an incident. Putting the permitted scope in the method signature means it cannot be forgotten — a caller must produce it, and `CapabilitySet.goalsWith()` is how.

### `UnitOfWork`

```ts
// packages/application/src/port/unit-of-work.ts
export abstract class UnitOfWork {
  public abstract run<T>(work: () => Promise<T>): Promise<T>;
}
```
> Transactional boundaries as a domain concept. "Write the activity entry in the same transaction as the state change, then enqueue the notification" is a rule about correctness, and it needs somewhere to be expressed that is not `db.transaction(...)` inside a use-case.

### `EventBus`

```ts
// packages/application/src/port/event.bus.ts
export interface DomainEvent {
  readonly name: string;
  readonly occurredAt: Date;
  readonly payload: Readonly<Record<string, unknown>>;
}

export abstract class EventBus {
  public abstract publish(event: DomainEvent): Promise<void>;
}
```
> The seam for cross-slice side effects. A finance use-case should not import a notification use-case; it publishes `invoice.approved` and the notification slice subscribes. Without this, slice ownership decays into a call graph where every team's code reaches into every other team's.

### The barrel

```ts
// packages/application/src/port/index.ts
export * from "./activity.logger.js";
export * from "./cache.store.js";
export * from "./embedding.provider.js";
export * from "./event.bus.js";
export * from "./queue.publisher.js";
export * from "./session.resolver.js";
export * from "./storage.gateway.js";
export * from "./unit-of-work.js";
export * from "./vector.store.js";
```

Repository ports are **not** here — each lives in its feature slice, `application/src/task/task.repository.ts`, so a slice is one glob and `CODEOWNERS` stays honest.

---

## Step 11.5 — What a repository port looks like

The starter kit ships none, but the shape is fixed. When feature 01 arrives:

```ts
// packages/application/src/task/task.repository.ts
import type { TaskEntity, TaskId } from "@ratchet/contracts";

export abstract class TaskRepository {
  public abstract findById(id: TaskId): Promise<TaskEntity | null>;
  /** Throws NotFoundError. Use when the caller has no meaningful "absent" branch. */
  public abstract findByIdOrFail(id: TaskId): Promise<TaskEntity>;
  public abstract save(task: TaskEntity): Promise<void>;
}
```

**Ports return entities, never rows.** The translation between a Drizzle row and a `TaskEntity` happens inside the repository implementation. A port that returns `{ id: string, goal_id: string }` has leaked the database into the domain, and the next thing that leaks is a `snake_case` field name into a React component.

---

## Step 11.6 — The barrel

**`packages/application/src/index.ts`**

```ts
export * from "./authorizer.js";
export * from "./error/index.js";
export * from "./port/index.js";
export * from "./principal.js";
```

---

## ✅ Gate

```bash
grep -rE "@orpc|@tanstack|@nestjs|drizzle|ioredis|aws-sdk|better-auth" packages/application/src
```

Returns **nothing**.

```bash
cat packages/application/package.json
```

Lists exactly three `dependencies`: `@ratchet/core`, `@ratchet/contracts`, `@ratchet/permissions`.

```bash
pnpm --filter @ratchet/application build && pnpm --filter @ratchet/application lint
```

Both pass. Put the grep in CI ([25](25-hygiene-and-ci.md)) — this is the check that quietly rots first if unenforced.

Do not proceed until this passes.

---

[← Local Infrastructure](10-local-infrastructure.md) · [`@ratchet/db` →](12-db-package.md)
