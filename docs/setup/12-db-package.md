# 12 · `@loadbearing/db`

> Drizzle schema, the connection class, repository implementations, migrations, and seeds. Server-only.

**Delivers:** RBAC tables, `CapabilityRepository`, a working migration pipeline, and the four system roles.

**Prerequisite:** [11 · `@loadbearing/application`](11-application-package.md)

---

## Layout

**Organised by subject, not by layer.** A `schema/` + `repository/` split would put every slice's files in two directories that no single glob can capture, and `CODEOWNERS` would silently miss half of each team's files — the worst kind of miss, because it looks covered.

```
packages/db/
├── drizzle.config.ts
├── migrations/                    ← generated, committed
└── src/
    ├── index.ts                   ← ServerOnly.assert() on line two
    ├── database.ts                → Database
    ├── schema.ts                  ← barrel re-exporting every *.schema.ts
    ├── base.repository.ts         → BaseRepository
    ├── unit-of-work.ts            → PgUnitOfWork
    ├── rbac/
    │   ├── index.ts
    │   ├── rbac.schema.ts         → roles, role_permissions, memberships, …
    │   ├── auth.schema.ts         ← Better Auth CLI output, committed
    │   ├── api-key.schema.ts
    │   └── capability.repository.ts → PgCapabilityRepository
    ├── activity/
    │   ├── index.ts
    │   ├── activity.schema.ts
    │   └── activity.logger.ts     → PgActivityLogger
    ├── vector/                    ← infrastructure, not a slice — see 13
    │   ├── index.ts
    │   ├── vector.schema.ts
    │   └── pg-vector.store.ts     → PgVectorStore
    └── seed/
        ├── index.ts
        └── system-role.seed.ts
```

---

## Step 12.1 — The tripwire and the barrel

**`packages/db/src/index.ts`**

```ts
import { ServerOnly } from "@loadbearing/core";

ServerOnly.assert("@loadbearing/db");

export * from "./activity/index.js";
export * from "./base.repository.js";
export * from "./database.js";
export * from "./rbac/index.js";
export * from "./unit-of-work.js";
export * from "./vector/index.js";
export * as schema from "./schema.js";
```

The assert is the second line, before any other export, so it runs the moment the module is evaluated in a browser rather than after a Drizzle import has already been pulled in.

---

## Step 12.2 — `Database`

**`packages/db/src/database.ts`**

```ts
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

export interface DatabaseConfig {
  readonly url: string;
  readonly maxConnections?: number;
  readonly statementTimeoutMs?: number;
}

export class Database {
  private readonly pool: Pool;
  public readonly client: NodePgDatabase<typeof schema>;

  constructor(config: DatabaseConfig) {
    this.pool = new Pool({
      connectionString: config.url,
      max: config.maxConnections ?? 10,
      statement_timeout: config.statementTimeoutMs ?? 30_000,
      idleTimeoutMillis: 30_000,
    });
    this.client = drizzle(this.pool, { schema });
  }

  public async healthy(): Promise<boolean> {
    try {
      await this.pool.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}
```

**`statement_timeout` is not optional.** Without it, one accidental cross join holds a connection until someone notices, and with a pool of ten that is the whole application. Thirty seconds is generous for anything an HTTP request should be doing; the worker can construct its own `Database` with a longer timeout for batch work.

**`max: 10` per process, and count your processes.** Web instances plus worker instances multiply against your Postgres `max_connections`. Three web replicas and two workers at ten each is fifty connections, which is fine; at a hundred each it is not. This is the number to check first when connection-exhaustion errors appear.

**`Database` takes a config object, not a URL string.** It is one extra brace today and it means adding pool tuning later does not change every call site.

---

## Step 12.3 — The schema

Drizzle tables stay **declarative** — the same data-shape exemption Zod schemas get. They are `pgTable` calls at module scope, not classes. **All access goes through repository classes**; nothing outside `packages/db/src` imports a table.

**`packages/db/src/rbac/rbac.schema.ts`**

```ts
import { relations } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    scope: text("scope", { enum: ["org", "goal"] }).notNull(),
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("roles_key_uq").on(t.key)],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    // A raw string. Validated through PermissionRegistry.isKnown() before it is trusted.
    permission: text("permission").notNull(),
  },
  (t) => [uniqueIndex("role_permissions_uq").on(t.roleId, t.permission)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id").notNull(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("memberships_uq").on(t.userId, t.roleId),
    index("memberships_user_idx").on(t.userId),
  ],
);

export const goalMembers = pgTable(
  "goal_members",
  {
    id: uuid("id").primaryKey(),
    goalId: uuid("goal_id").notNull(),
    userId: text("user_id").notNull(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("goal_members_uq").on(t.goalId, t.userId, t.roleId),
    index("goal_members_user_idx").on(t.userId),
  ],
);

/** Per-user overrides. effect='deny' beats every grant, including the wildcard. */
export const permissionOverrides = pgTable(
  "permission_overrides",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id").notNull(),
    goalId: uuid("goal_id"), // null = org scope
    permission: text("permission").notNull(),
    effect: text("effect", { enum: ["grant", "deny"] }).notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("permission_overrides_user_idx").on(t.userId),
    uniqueIndex("permission_overrides_uq").on(t.userId, t.goalId, t.permission),
  ],
);

export const rolesRelations = relations(roles, ({ many }) => ({
  permissions: many(rolePermissions),
  memberships: many(memberships),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
}));
```

### Three modelling notes

**`user_id` is `text`, not `uuid`.** Better Auth owns the `user` table and generates its own identifier format. Matching its type is what lets you add a real foreign key in [15](15-auth-package.md) once `auth.schema.ts` exists. Fighting it — generating your own users table and syncing — is the mistake that produces two identity systems.

**`permission` is `text`, not an enum.** A Postgres enum would need a migration every time a permission is added, and the vocabulary lives in `PermissionRegistry` where it belongs. The column is untrusted text and `isKnown()` is the gate. This is the same reason `role_permissions` has no foreign key to a permissions table: there is no permissions table.

**`memberships_user_idx` and `goal_members_user_idx` are not optional.** `CapabilityRepository.resolveFor(userId)` is the hottest query in the system — it runs on essentially every request — and it filters both tables by `user_id`. Without those indexes it is two sequential scans per request.

---

## Step 12.4 — The schema barrel

**`packages/db/src/schema.ts`**

```ts
export * from "./activity/activity.schema.js";
export * from "./rbac/api-key.schema.js";
export * from "./rbac/auth.schema.js";
export * from "./rbac/rbac.schema.js";
export * from "./vector/vector.schema.js";
```

One file that drizzle-kit points at, and one file to edit when a slice adds tables. Forgetting to add a slice here is the most common reason a new table does not appear in a generated migration.

---

## Step 12.5 — Drizzle Kit

**`packages/db/drizzle.config.ts`**

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
  verbose: true,
});
```

> This file reads `process.env` and that is fine — it is a build-time tool config, not package runtime code. No extra ignore is needed: the base config's `"**/*.config.ts"` pattern already covers it.

Add to **`packages/db/package.json`**:

```json
"scripts": {
  "db:generate": "drizzle-kit generate",
  "db:migrate": "tsx src/migrate.ts",
  "db:push": "drizzle-kit push",
  "db:studio": "drizzle-kit studio",
  "db:seed": "tsx src/seed/index.ts"
}
```

**`packages/db/src/migrate.ts`**

```ts
import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Database } from "./database.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required.");

const database = new Database({ url });
await migrate(database.client, { migrationsFolder: "./migrations" });
await database.close();

console.log("migrations applied");
```

```bash
pnpm add --filter @loadbearing/db -D dotenv
```

### Generate, never push

`db:push` diffs your schema against the database and applies the difference with no migration file. It is genuinely convenient and it is a trap:

- There is no record of what changed, so staging and production cannot be brought to the same state deterministically.
- It has no idea how to preserve data through a rename — it drops and recreates.
- Permission seeding lives in migrations ([12.8](#step-128--seeds)), so a pushed schema arrives with no roles.

Use `db:push` on a scratch database while iterating on a schema shape you have not committed. Use `db:generate` for anything that will ever reach another machine. **Migrations are committed** — they are the schema's history and CI replays them.

---

## Step 12.6 — First migration

```bash
cd packages/db
node -e "require('fs').writeFileSync('.env', 'DATABASE_URL=postgres://ratchet:ratchet@localhost:5432/ratchet\n')"
```
> A package-local `.env` for drizzle-kit only. It is already covered by the root `.gitignore`.

```bash
pnpm db:generate
```
> Writes `migrations/0000_<name>.sql` and `migrations/meta/`. **Read the SQL before applying it.** Drizzle-kit is good but it is a diffing tool, and reviewing generated DDL is a five-second habit that catches an accidental `DROP COLUMN` before it runs.

```bash
pnpm db:migrate
```

```bash
pnpm db:studio
```
> Opens a browser UI at `local.drizzle.studio` showing your tables.

---

## Step 12.7 — Repositories

**`packages/db/src/base.repository.ts`**

```ts
import type { Database } from "./database.js";

export abstract class BaseRepository {
  constructor(protected readonly database: Database) {}

  protected get db() {
    return this.database.client;
  }
}
```

**`packages/db/src/rbac/capability.repository.ts`**

```ts
import { and, eq, isNull, or } from "drizzle-orm";
import type { CapabilityRepository } from "@loadbearing/application";
import {
  CapabilitySet,
  PermissionRegistry,
  type CapabilitySetDto,
  type PermissionKey,
  type ScopedSetDto,
} from "@loadbearing/permissions";
import { BaseRepository } from "../base.repository.js";
import { goalMembers, memberships, permissionOverrides, rolePermissions } from "./rbac.schema.js";

interface MutableScoped {
  grants: Set<PermissionKey>;
  denies: Set<PermissionKey>;
}

export class PgCapabilityRepository extends BaseRepository implements CapabilityRepository {
  /**
   * Org role grants + goal role grants + per-user overrides, with deny winning.
   * Every raw permission string passes PermissionRegistry.isKnown() before it is
   * trusted, so a stale row can never grant a capability the registry no longer
   * defines.
   */
  public async resolveFor(userId: string): Promise<CapabilitySet> {
    const registry = PermissionRegistry.instance;

    const org: MutableScoped = { grants: new Set(), denies: new Set() };
    const goals = new Map<string, MutableScoped>();
    const scopedFor = (goalId: string): MutableScoped => {
      const existing = goals.get(goalId);
      if (existing) return existing;
      const created: MutableScoped = { grants: new Set(), denies: new Set() };
      goals.set(goalId, created);
      return created;
    };

    const orgRows = await this.db
      .select({ permission: rolePermissions.permission })
      .from(memberships)
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, memberships.roleId))
      .where(eq(memberships.userId, userId));

    for (const row of orgRows) {
      if (registry.isKnown(row.permission)) org.grants.add(row.permission);
    }

    const goalRows = await this.db
      .select({ goalId: goalMembers.goalId, permission: rolePermissions.permission })
      .from(goalMembers)
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, goalMembers.roleId))
      .where(eq(goalMembers.userId, userId));

    for (const row of goalRows) {
      if (registry.isKnown(row.permission)) scopedFor(row.goalId).grants.add(row.permission);
    }

    const overrideRows = await this.db
      .select()
      .from(permissionOverrides)
      .where(eq(permissionOverrides.userId, userId));

    for (const row of overrideRows) {
      if (!registry.isKnown(row.permission)) continue;
      const target = row.goalId ? scopedFor(row.goalId) : org;
      if (row.effect === "deny") target.denies.add(row.permission);
      else target.grants.add(row.permission);
    }

    const freeze = (scoped: MutableScoped): ScopedSetDto => ({
      grants: [...scoped.grants],
      denies: [...scoped.denies],
    });

    const dto: CapabilitySetDto = {
      wildcard: false,
      org: freeze(org),
      goals: Object.fromEntries([...goals].map(([id, scoped]) => [id, freeze(scoped)])),
    };

    return CapabilitySet.from(dto);
  }
}
```

**Three queries, not one.** A single query with three left joins produces a cartesian product across role permissions, goal memberships, and overrides — for a user in five goals with four roles that is hundreds of rows to deduplicate in application code. Three targeted queries are faster and the code is readable.

**`isKnown()` filters every raw string on the way in.** This is the line that makes the deny-by-default model honest against a database that has outlived several refactors.

**This method is cached in [15](15-auth-package.md)**, not here. The repository does the correct expensive thing; `CapabilityCache` decides how often it runs. Mixing the two means the cache cannot be tested independently and invalidation has nowhere clean to live.

### The naming rule for implementations

`PgCapabilityRepository`, `PgActivityLogger`, `PgVectorStore` — implementations lead with their technology, because the prefix is what marks them as the swappable one. That is the second exemption to folder-prefix symmetry (the first is use-cases, which lead with a verb). The filename still mirrors the class: `capability.repository.ts` exports `PgCapabilityRepository`, and the `Pg` prefix is dropped from the filename because the folder already says `db`.

---

## Step 12.8 — Seeds

**`packages/db/src/seed/system-role.seed.ts`**

```ts
import { eq } from "drizzle-orm";
import { Uuid } from "@loadbearing/core";
import { PermissionRegistry, type PermissionKey } from "@loadbearing/permissions";
import { BaseRepository } from "../base.repository.js";
import { rolePermissions, roles } from "../rbac/rbac.schema.js";

interface SystemRole {
  readonly key: string;
  readonly name: string;
  readonly scope: "org" | "goal";
  readonly permissions: readonly PermissionKey[] | "all";
}

export class SystemRoleSeed extends BaseRepository {
  private static readonly ROLES: readonly SystemRole[] = [
    { key: "owner", name: "Owner", scope: "org", permissions: "all" },
    {
      key: "admin",
      name: "Administrator",
      scope: "org",
      permissions: ["rbac.role.read", "rbac.role.manage", "member.read", "member.invite"],
    },
    { key: "member", name: "Member", scope: "org", permissions: ["member.read"] },
    { key: "guest", name: "Guest", scope: "org", permissions: [] },
  ];

  /** Idempotent: safe to run on every deploy. */
  public async run(): Promise<void> {
    for (const definition of SystemRoleSeed.ROLES) {
      const existing = await this.db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.key, definition.key))
        .limit(1);

      const roleId = existing[0]?.id ?? Uuid.v7();

      if (!existing[0]) {
        await this.db.insert(roles).values({
          id: roleId,
          key: definition.key,
          name: definition.name,
          scope: definition.scope,
          isSystem: true,
        });
      }

      const permissions =
        definition.permissions === "all"
          ? PermissionRegistry.instance.all()
          : definition.permissions;

      if (permissions.length === 0) continue;

      await this.db
        .insert(rolePermissions)
        .values(permissions.map((permission) => ({ roleId, permission })))
        .onConflictDoNothing();
    }
  }
}
```

**`permissions: "all"` for owner resolves through `PermissionRegistry.all()` at seed time.** That means every new permission a feature adds is automatically granted to owners when the seed re-runs, which is what you want — and it is why the seed must be idempotent and re-run on every deploy rather than once at install.

**Every other role's permissions are explicit.** No wildcards outside owner. A role that grants "everything in module X" would keep granting new things as X grows, which is how a "read-only reviewer" role quietly acquires write access.

**`packages/db/src/seed/index.ts`**

```ts
import "dotenv/config";
import { Database } from "../database.js";
import { SystemRoleSeed } from "./system-role.seed.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required.");

const database = new Database({ url });
await new SystemRoleSeed(database).run();
await database.close();

console.log("seed complete");
```

```bash
pnpm db:seed
```

### Seeding versus migrating permissions

The seed grants permissions to **system** roles. Granting a new permission to a **custom** role that a customer created is a data migration, and it belongs in `migrations/` as a hand-written SQL file alongside the generated DDL. Drizzle-kit will not write it for you.

This is also the staged-rollout mechanism: until the migration that grants a module's permissions runs, the feature is invisible in the navigation and uncallable through the API, for everyone. That is not a limitation — it is the release switch.

---

## Step 12.9 — `PgUnitOfWork`

**`packages/db/src/unit-of-work.ts`**

```ts
import { UnitOfWork } from "@loadbearing/application";
import type { Database } from "./database.js";

export class PgUnitOfWork extends UnitOfWork {
  constructor(private readonly database: Database) {
    super();
  }

  public override async run<T>(work: () => Promise<T>): Promise<T> {
    return this.database.client.transaction(async () => work());
  }
}
```

> This is the simple version and it has a known limitation: the repositories inside `work()` use the pool, not the transaction handle, so they are not actually enrolled. Making that correct needs either AsyncLocalStorage-based context propagation or passing the transaction handle explicitly through the port. Pick one deliberately when the first genuinely multi-write use-case arrives — and until then, do not pretend this class gives you atomicity it does not.

---

## ✅ Gate

```bash
pnpm db:generate && pnpm db:migrate && pnpm db:seed && pnpm db:studio
```

- `migrations/` contains a committed `.sql` file.
- Studio shows `roles`, `role_permissions`, `memberships`, `goal_members`, `permission_overrides`.
- `SELECT key, is_system FROM roles;` returns four rows.
- Running `pnpm db:seed` a second time changes nothing.

Do not proceed until this passes.

---

[← `@loadbearing/application`](11-application-package.md) · [Vector Storage →](13-vector-store.md)
