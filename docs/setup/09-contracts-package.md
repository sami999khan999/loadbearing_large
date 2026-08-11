# 09 · `@ratchet/contracts`

> The shared kernel, half two. Zod contract classes, domain entities, the oRPC contract router, and the procedure→permission map.

**Delivers:** One schema per boundary, entities that carry their own rules, and a contract implementable by oRPC today or NestJS later.

**Prerequisite:** [08 · `@ratchet/permissions`](08-permissions-package.md)

---

## The four file roles

Every feature slice in this package has the same four files, and each answers a different question.

| File | Class | Answers |
|---|---|---|
| `<subject>.contract.ts` | `TaskContract` | What shape is this data? (Zod schemas, static readonly members) |
| `<subject>.entity.ts` | `TaskEntity` | What does this data know about itself? (behaviour, no I/O) |
| `<subject>.procedures.ts` | `TaskProcedures` | What operations exist, at what path? (oRPC contract) |
| `<subject>.permissions.ts` | — | Which permission gates each procedure path? (fragment) |

```
packages/contracts/src/
├── index.ts
├── contract-router.ts         → contract, AppContract     (merges fragments)
├── procedure-permissions.ts   → ProcedurePermissions      (merges fragments)
├── primitive/
│   ├── index.ts
│   ├── identifiers.ts         → Identifiers, GoalId, TaskId, UserId, …
│   ├── envelope.ts            → Envelope
│   └── pagination.ts          → Pagination
└── <subject>/
    ├── index.ts
    ├── <subject>.contract.ts
    ├── <subject>.entity.ts
    ├── <subject>.procedures.ts
    ├── <subject>.permissions.ts
    └── <subject>.entity.spec.ts
```

```js
// packages/contracts/eslint.config.js
export { default } from "@ratchet/eslint-config/oop";
```

---

## Step 9.1 — Branded identifiers

**`packages/contracts/src/primitive/identifiers.ts`**

```ts
import { z } from "zod";

export class Identifiers {
  private constructor() {}

  public static readonly userId = z.uuid().brand<"UserId">();
  public static readonly roleId = z.uuid().brand<"RoleId">();
  public static readonly goalId = z.uuid().brand<"GoalId">();
  public static readonly taskId = z.uuid().brand<"TaskId">();
  public static readonly apiKeyId = z.uuid().brand<"ApiKeyId">();
}

export type UserId = z.infer<typeof Identifiers.userId>;
export type RoleId = z.infer<typeof Identifiers.roleId>;
export type GoalId = z.infer<typeof Identifiers.goalId>;
export type TaskId = z.infer<typeof Identifiers.taskId>;
export type ApiKeyId = z.infer<typeof Identifiers.apiKeyId>;
```

**Branding is not decoration.** Without it, every identifier is `string` and `reactivateTask(goalId, taskId)` compiles happily when the arguments are swapped. With it, that is a compile error at the call site. In a system with a dozen UUID-shaped identifiers this catches a real bug roughly once a month, and each one would otherwise have been found in production by a query that returned nothing.

The cost: constructing a branded value requires parsing. `Identifiers.taskId.parse(raw)` at the boundary, and everything downstream is typed. That boundary is exactly where you wanted validation anyway.

---

## Step 9.2 — The response envelope

**`packages/contracts/src/primitive/envelope.ts`**

```ts
import { z } from "zod";

export class Envelope {
  private constructor() {}

  public static paginated<T extends z.ZodTypeAny>(item: T) {
    return z.object({
      items: z.array(item),
      total: z.number().int().nonnegative(),
      limit: z.number().int().positive(),
      offset: z.number().int().nonnegative(),
    });
  }

  public static readonly acknowledged = z.object({
    ok: z.literal(true),
  });
}
```

**`packages/contracts/src/primitive/pagination.ts`**

```ts
import { z } from "zod";

export class Pagination {
  private constructor() {}

  public static readonly query = z.object({
    limit: z.number().int().positive().max(100).default(25),
    offset: z.number().int().nonnegative().default(0),
  });
}

export type PaginationQuery = z.infer<typeof Pagination.query>;
```

Decide the list shape once, here, and every list procedure in the product inherits it. The alternative — each feature inventing its own `{ data, meta }` or `{ results, nextCursor }` — means the query layer has a special case per feature and the UI has a different empty state per feature.

`max(100)` on `limit` is a denial-of-service guard living in the schema rather than in a handler, which means it applies to the worker and the offline queue too.

---

## Step 9.3 — A contract class

Contract classes are **static readonly Zod schemas on a class**. This is the data-shape exemption to the no-free-exports rule: a Zod schema is a value describing a shape, not behaviour, and it stays namespaced on the class the way a free `export const taskEntitySchema` would not.

**`packages/contracts/src/task/task.contract.ts`** — illustrative; the starter kit ships no feature slices.

```ts
import { z } from "zod";
import { Identifiers } from "../primitive/identifiers.js";
import { Pagination } from "../primitive/pagination.js";

export class TaskContract {
  private constructor() {}

  public static readonly status = z.enum([
    "backlog",
    "todo",
    "in_progress",
    "blocked",
    "done",
    "overdue",
  ]);

  public static readonly priority = z.enum(["low", "medium", "high", "critical"]);

  public static readonly entity = z.object({
    id: Identifiers.taskId,
    goalId: Identifiers.goalId,
    title: z.string().min(1).max(300),
    description: z.string().max(20_000).nullable(),
    status: TaskContract.status,
    priority: TaskContract.priority,
    deadline: z.iso.datetime().nullable(),
    assigneeId: Identifiers.userId.nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  });

  public static readonly create = TaskContract.entity.pick({
    goalId: true,
    title: true,
    description: true,
    priority: true,
    deadline: true,
  });

  public static readonly listQuery = Pagination.query.extend({
    goalId: Identifiers.goalId,
    status: TaskContract.status.optional(),
  });

  public static readonly reactivate = z.object({
    taskId: Identifiers.taskId,
    mode: z.enum(["same_assignee", "reassign", "cancel"]),
    newAssigneeId: Identifiers.userId.optional(),
    newDeadline: z.iso.datetime().optional(),
    reason: z.string().min(10, "A reason is required for reactivation."),
  });
}

export type TaskDto = z.infer<typeof TaskContract.entity>;
export type CreateTaskInput = z.infer<typeof TaskContract.create>;
export type ReactivateTaskInput = z.infer<typeof TaskContract.reactivate>;
export type TaskStatus = z.infer<typeof TaskContract.status>;
```

`reason: z.string().min(10)` encodes a business requirement **once**. The server rejects a short reason, the web form shows the message, and the desktop app's offline queue rejects it before the mutation is ever enqueued. Writing that rule in a handler instead means writing it three more times.

**Derive, don't repeat.** `create` is `entity.pick(...)`, `listQuery` extends `Pagination.query`. When a field is added to the entity, the derived schemas move with it or fail to compile. Hand-written parallel schemas drift silently.

**Timestamps are ISO strings in contracts, `Date` in entities.** The contract crosses a JSON boundary and JSON has no date type. `z.iso.datetime()` at the edge, `new Date(...)` in `fromDto`, and the conversion happens in exactly one place.

---

## Step 9.4 — A domain entity

**`packages/contracts/src/task/task.entity.ts`**

```ts
import type { Clock } from "@ratchet/core";
import type { CapabilitySet } from "@ratchet/permissions";
import type { GoalId, TaskId, UserId } from "../primitive/identifiers.js";
import { TaskContract, type TaskDto, type TaskStatus } from "./task.contract.js";

export class TaskEntity {
  private constructor(
    public readonly id: TaskId,
    public readonly goalId: GoalId,
    public readonly title: string,
    public readonly status: TaskStatus,
    public readonly deadline: Date | null,
    public readonly assigneeId: UserId | null,
  ) {}

  public static fromDto(dto: TaskDto): TaskEntity {
    return new TaskEntity(
      dto.id,
      dto.goalId,
      dto.title,
      dto.status,
      dto.deadline ? new Date(dto.deadline) : null,
      dto.assigneeId,
    );
  }

  public static parse(raw: unknown): TaskEntity {
    return TaskEntity.fromDto(TaskContract.entity.parse(raw));
  }

  public isOverdueAt(clock: Clock): boolean {
    if (!this.deadline || this.status === "done") return false;
    return clock.now() > this.deadline;
  }

  public isLockedFromAssignee(): boolean {
    return this.status === "overdue";
  }

  public canBeEditedBy(actor: UserId, caps: CapabilitySet): boolean {
    if (this.isLockedFromAssignee()) return caps.can("task.reactivate", this.goalId);
    if (caps.can("task.update", this.goalId)) return true;
    return this.assigneeId === actor && caps.can("task.update.self", this.goalId);
  }
}
```

### Three rules for entities

**No I/O.** An entity never reads a database, calls a service, or touches the network. Everything it needs arrives as a constructor argument or a method parameter — including `Clock`, which is why time-dependent rules are testable.

**Behaviour, not getters.** `isLockedFromAssignee()` rather than exposing `status` and letting three call sites compare it to `"overdue"`. The moment that comparison appears in a handler *and* in a component, they will diverge.

**Private constructor, static factories.** `fromDto` and `parse` are the only ways to make one. That guarantees every entity in the system came through validation.

`canBeEditedBy` is the pattern to notice: it takes a `CapabilitySet` and answers a question the server handler, the React disabled-button state, and the offline validator all need. One implementation, three consumers, no possibility of drift.

---

## Step 9.5 — The oRPC contract

**`packages/contracts/src/task/task.procedures.ts`**

```ts
import { oc } from "@orpc/contract";
import { Envelope } from "../primitive/envelope.js";
import { TaskContract } from "./task.contract.js";

export class TaskProcedures {
  private constructor() {}

  public static readonly list = oc
    .route({ method: "GET", path: "/goals/{goalId}/tasks" })
    .input(TaskContract.listQuery)
    .output(Envelope.paginated(TaskContract.entity));

  public static readonly create = oc
    .route({ method: "POST", path: "/goals/{goalId}/tasks" })
    .input(TaskContract.create)
    .output(TaskContract.entity);

  public static readonly reactivate = oc
    .route({ method: "POST", path: "/tasks/{taskId}/reactivate" })
    .input(TaskContract.reactivate)
    .output(TaskContract.entity);
}
```

**`packages/contracts/src/contract-router.ts`**

```ts
import { TaskProcedures } from "./task/task.procedures.js";

export const contract = {
  task: {
    list: TaskProcedures.list,
    create: TaskProcedures.create,
    reactivate: TaskProcedures.reactivate,
  },
};

export type AppContract = typeof contract;
```

**Write `.route({ method, path })` on every procedure, from the first one.** It costs one line now and buys three things: OpenAPI generation for external integrations, REST-shaped URLs so a partner can call your API without an oRPC client, and the path metadata `@orpc/nest` requires if you ever implement the same contract in a NestJS controller. Retrofitting it across two dozen feature modules is tedious in a way that "we'll add it later" always underestimates.

The router object is the one place a plain `export const` appears in this package. It is a data structure, not behaviour, and oRPC's type inference requires the literal shape — a class would erase it.

---

## Step 9.6 — `ProcedurePermissions`

**`packages/contracts/src/task/task.permissions.ts`** — the slice's fragment:

```ts
import type { PermissionKey } from "@ratchet/permissions";

export const taskProcedurePermissions = {
  "task.list": "task.read",
  "task.create": "task.create",
  "task.reactivate": "task.reactivate",
} as const satisfies Record<string, PermissionKey>;
```

**`packages/contracts/src/procedure-permissions.ts`**

```ts
import type { PermissionKey } from "@ratchet/permissions";
import { taskProcedurePermissions } from "./task/task.permissions.js";

/**
 * Every procedure path must appear here. The oRPC base middleware fails closed
 * on any path that does not — so forgetting an entry denies the call rather
 * than silently allowing it.
 */
export class ProcedurePermissions {
  private static readonly MAP: Readonly<Record<string, PermissionKey>> = {
    ...taskProcedurePermissions,
  };

  private constructor() {}

  public static required(path: string): PermissionKey | undefined {
    return ProcedurePermissions.MAP[path];
  }

  public static paths(): readonly string[] {
    return Object.keys(ProcedurePermissions.MAP);
  }
}
```

Fragment it the same way as the permission catalog. Each slice declares its own map next to its procedures; this file merges them. Otherwise every team edits one file on every feature and it becomes the busiest merge conflict in the repository.

### The coverage test

**`packages/contracts/src/procedure-permissions.spec.ts`**

```ts
import { describe, expect, it } from "vitest";
import { contract } from "./contract-router.js";
import { ProcedurePermissions } from "./procedure-permissions.js";

class ContractWalker {
  public static paths(node: unknown, prefix: readonly string[] = []): string[] {
    if (node && typeof node === "object" && "~orpc" in node) return [prefix.join(".")];
    if (!node || typeof node !== "object") return [];
    return Object.entries(node).flatMap(([key, child]) =>
      ContractWalker.paths(child, [...prefix, key]),
    );
  }
}

describe("ProcedurePermissions", () => {
  it("maps every procedure in the contract router", () => {
    const declared = ContractWalker.paths(contract);
    const missing = declared.filter((p) => ProcedurePermissions.required(p) === undefined);
    expect(missing).toEqual([]);
  });

  it("has no entries for procedures that no longer exist", () => {
    const declared = new Set(ContractWalker.paths(contract));
    const orphans = ProcedurePermissions.paths().filter((p) => !declared.has(p));
    expect(orphans).toEqual([]);
  });
});
```

> Check the marker property oRPC uses on a contract procedure against the version you install — `~orpc` is current but internal. If it changes, the walker is four lines to fix and the test is the reason you notice.

This is a **transport-layer guarantee that no procedure ships ungated**, and the second orphan test is what stops the map growing stale entries that look like coverage. The real authorization check still lives in the use-case; this is defence in depth, not the gate itself.

---

## Step 9.7 — The barrel

**`packages/contracts/src/index.ts`**

```ts
export * from "./contract-router.js";
export * from "./primitive/index.js";
export * from "./procedure-permissions.js";
export * from "./task/index.js";
```

---

## ✅ Gate

```bash
pnpm --filter @ratchet/contracts build
pnpm --filter @ratchet/contracts test
```

- The build succeeds and `dist/index.d.ts` exists.
- Adding a required field to `TaskContract.entity` breaks the typecheck of every consumer.
- The `ProcedurePermissions` coverage test passes.

Do not proceed until this passes.

---

[← `@ratchet/permissions`](08-permissions-package.md) · [Local Infrastructure →](10-local-infrastructure.md)
