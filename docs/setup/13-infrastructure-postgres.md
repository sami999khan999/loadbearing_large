# 13 · `@loadbearing/infrastructure` — the Postgres side

> Drizzle schema, the connection class, repository implementations, migrations, and seeds.
> Server-only.
>
> **This document used to build a separate database package.** It was folded into
> `@loadbearing/infrastructure` — the two were siblings with no edge between them, and the split put
> one seam in two places. Everything below is now `packages/infrastructure/src/pg/`; the other stores
> are [15](15-infrastructure-package.md).

**Delivers:** RBAC tables with `organization_id` on every one, `CapabilityRepository`, a migration pipeline whose first migration is already partitioned, and the four system roles.

**Prerequisite:** [12 · `@loadbearing/application`](12-application-package.md)

---

## Layout

**One folder per seam, plus one folder for every table.** The adapters are organised the way [15](15-infrastructure-package.md) organises its own — a folder per port, holding the class that implements it. The tables are not: they all live in `schema/`, because two tools require a single entry that names every one of them.

That split has a real cost, and it is worth naming rather than discovering. A slice's files land in two directories — `schema/task.schema.ts` and `task/pg-task.repository.ts` — so a `CODEOWNERS` line per team needs both globs. [Folders](../opinions/folders.md) argues the other way for every package that has a choice; this one does not.

```
packages/infrastructure/
├── drizzle.config.ts
├── migrations/                    ← generated, committed
└── src/
    ├── index.ts                   ← ServerOnly.assert() first among the statements
    ├── import.ts                  ← every external symbol, drizzle and pg included
    ├── schema/                    ← every table; index.ts is the drizzle-kit entry
    │   ├── index.ts               ← the one `export *` in the repository
    │   ├── rbac.schema.ts         → roles, role_permissions, memberships, …
    │   ├── auth.schema.ts         ← Better Auth CLI output, committed
    │   ├── activity.schema.ts     ← activity_log, partitioned monthly
    │   ├── analytics.schema.ts    ← snapshot tables, fed by domain events
    │   └── vector.schema.ts       ← document_chunks — see 14
    ├── primitive/                 ← what every seam folder depends on
    │   ├── index.ts
    │   ├── database.ts            → Database, DatabaseConfig, DrizzleClient
    │   └── base.repository.ts     → BaseRepository
    ├── transaction/               ← the UnitOfWork seam
    │   ├── index.ts
    │   ├── transaction-scope.ts   → TransactionScope
    │   └── pg-unit-of-work.ts     → PgUnitOfWork
    ├── repository/                ← every adapter, one file each, flat
    │   ├── index.ts
    │   ├── pg-activity.logger.ts          → PgActivityLogger
    │   ├── pg-activity-archive.gateway.ts → PgActivityArchiveGateway
    │   ├── pg-activity-replay.reader.ts   → PgActivityReplayReader
    │   ├── pg-api-key.repository.ts       → PgApiKeyRepository
    │   ├── pg-capability.repository.ts    → PgCapabilityRepository
    │   ├── pg-maintenance.gateway.ts      → PgMaintenanceGateway
    │   ├── pg-membership.reader.ts        → PgMembershipReader
    │   └── pg-vector.store.ts             → PgVectorStore — see 14
    ├── seed/                      → SystemRoleSeed
    └── migrate/                   ← the migration runner
```

**One folder per external system, and the system is the only subject.** This whole tree lives under
`packages/infrastructure/src/pg/`, beside `clickhouse/`, `loki/`, `redis/`, `s3/`, `bullmq/` and
`openai/` ([15](15-infrastructure-package.md)).

**The adapters sit flat in `repository/` rather than in a folder per seam.** They were once
`activity/`, `analytics/`, `rbac/`, `vector/` and `maintenance/`, each holding one or two files, and
that was wrong twice over.

A folder holding one file is a path, not a subject ([Simplicity](../opinions/simplicity.md)). And
`pg/analytics/` beside `clickhouse/` reads as two different things, when what it actually is — now
that ClickHouse has an implementation — is two implementations of one port. Flat, each file is
`pg-<port>.ts` beside `clickhouse-<port>.ts` one directory over, and the technology stays the axis
this package sorts on.

**Schemas are the exception to the subject-folder rule** ([Folders](../opinions/folders.md)), and it
is a tooling exception rather than a taste one: `drizzle.config.ts` needs one path that names every
table, and `drizzle(pool, { schema })` needs the same namespace at runtime or Better Auth's adapter
cannot find `users`/`sessions`/`accounts` at all — it resolves a model by looking the export name up
in that namespace ([16](16-auth-package.md)).


---

## Step 13.1 — The tripwire and the barrel

**`packages/infrastructure/src/pg/index.ts`**

```ts
export {
  BaseRepository,
  Database,
  type DatabaseConfig,
  type DrizzleClient,
} from "./primitive/index.js";
export {
  type ApiKeyRow,
  PgActivityArchiveGateway,
  PgActivityLogger,
  PgActivityReplayReader,
  PgApiKeyRepository,
  PgCapabilityRepository,
  PgMaintenanceGateway,
  PgMembershipReader,
  PgVectorStore,
} from "./repository/index.js";
export { PgUnitOfWork, TransactionScope } from "./transaction/index.js";
```

**`schema/`, `migrate/` and `seed/` are deliberately absent.** drizzle-kit and the two runners reach
them by path, and nothing outside this package may name a table.

The `ServerOnly.assert` tripwire lives one level up, in `packages/infrastructure/src/index.ts`, above
every export — so it runs the moment the module is evaluated in a browser rather than after a Drizzle
import has already been pulled in. `import` statements are hoisted regardless of where the assert
sits, so being first among the *statements* is what matters, not first in the file.

The assert sits above every export, so it runs the moment the module is evaluated in a browser rather than after a Drizzle import has already been pulled in. The two `import` lines above it are hoisted regardless of where the statement sits, so putting the assert first among the *statements* is what matters, not first in the file.

**`Database` builds the schema namespace with two statements, not `export * as schema from`.** That
form is a star export and `noReExportAll` rejects it ([05](05-lint-and-format.md)) — `import * as`
followed by a named use is the same thing to the module graph and passes.

---

## Step 13.2 — `Database`

**`packages/infrastructure/src/pg/primitive/database.ts`**

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

## Step 13.3 — The schema

Drizzle tables stay **declarative** — the same data-shape exemption Zod schemas get. They are `pgTable` calls at module scope, not classes. **All access goes through repository classes**; nothing outside `packages/infrastructure/src` imports a table.

**`packages/infrastructure/src/pg/schema/rbac.schema.ts`**

```ts
import { relations } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { OrganizationId, UserId } from "@loadbearing/contracts";
import { users } from "./auth.schema.js";

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    scope: text("scope", { enum: ["org", "goal"] }).notNull(),
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("roles_key_uq").on(t.organizationId, t.key),
    index("roles_organization_idx").on(t.organizationId),
  ],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
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
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: uuid("user_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("memberships_uq").on(t.userId, t.roleId),
    index("memberships_user_idx").on(t.organizationId, t.userId),
    index("memberships_role_idx").on(t.roleId),
  ],
);

export const goalMembers = pgTable(
  "goal_members",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    goalId: uuid("goal_id").notNull(),
    userId: uuid("user_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("goal_members_uq").on(t.goalId, t.userId, t.roleId),
    index("goal_members_user_idx").on(t.organizationId, t.userId),
    index("goal_members_goal_idx").on(t.goalId),
    index("goal_members_role_idx").on(t.roleId),
  ],
);

// Per-user overrides. effect='deny' beats every grant, including the wildcard.
export const permissionOverrides = pgTable(
  "permission_overrides",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: uuid("user_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    goalId: uuid("goal_id"), // null = org scope
    permission: text("permission").notNull(),
    effect: text("effect", { enum: ["grant", "deny"] }).notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("permission_overrides_user_idx").on(t.organizationId, t.userId),
    index("permission_overrides_goal_idx").on(t.goalId),
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

### Five modelling notes

**`user_id` is a real `uuid` foreign key to `users.id`, from the first migration.** That is only true because [16](16-auth-package.md) configures the auth library to mint `Uuid.v7()` identifiers rather than accepting its default opaque string. Take that configuration away and this column has to become `text` to match whatever format the library chose — which is the version of this document you may have read before, and the reason the constraint used to arrive a chapter late.

The ordering consequence is worth stating plainly: **these tables reference `users`, so `auth.schema.ts` has to exist before this migration is generated.** The two schema files are written together and land in one migration; there is no window in which `memberships` exists without the constraint.

**The constraint is declared here, in the schema, and never in a hand-authored migration.** drizzle-kit generates by diffing this file against the migration history, so a foreign key it cannot see is a foreign key the next generated migration drops — silently, and in the migration nobody reads closely because it was supposed to be about something else.

**What has not changed is that there is exactly one users table.** Generating your own alongside the auth library's and syncing them is the mistake that produces two identity systems, and no amount of correct column typing rescues it.

**`permission` is `text`, not an enum.** A Postgres enum would need a migration every time a permission is added, and the vocabulary lives in `PermissionRegistry` where it belongs. The column is untrusted text and `isKnown()` is the gate. This is the same reason `role_permissions` has no foreign key to a permissions table: there is no permissions table.

**`memberships_user_idx` and `goal_members_user_idx` are not optional.** `CapabilityRepository.resolveFor()` is the hottest query in the system — it runs on essentially every request that misses the capability cache — and it filters both tables by user. Without those indexes it is two sequential scans per request.

**`organization_id` is on every table, and it is the sharding key.** Not because multi-tenancy is planned, but because it is the one column that cannot be added cheaply later: retrofitting it means touching every table, every query, every permission check and every test, on a live database. It costs a column and a `WHERE` clause now. See [Data and scale](../opinions/data-and-scale.md) §4.1.

The consequence that catches people is **`roles_key_uq`**. Keyed on `(key)` alone, two organizations cannot both have an `owner` role — the second insert fails with a unique violation and it looks like a seeding bug. Every unique index on a tenant-scoped table leads with `organization_id`, and the ones that do not — `memberships_uq`, `goal_members_uq` — are already unique on columns that are themselves tenant-scoped.

**Postgres does not index foreign keys for you.** `roleId` on `memberships` and `goalMembers`, `goalId` on `goal_members` and `permission_overrides` — every one is a column something filters or joins on, and none of them is covered by the unique indexes above. An unindexed FK is also what makes deleting a role scan every membership row. The rule is mechanical: **every FK column gets an index, every filtered column gets an index**, and the review question is "which index serves this predicate" rather than "does this look slow".

---

## Step 13.4 — The schema barrel

**`packages/infrastructure/src/pg/schema/index.ts`**

```ts
export * from "./activity.schema.js";
export * from "./analytics.schema.js";


export * from "./rbac.schema.js";
export * from "./vector.schema.js";
```

One file that drizzle-kit points at, and one file to edit when a slice adds tables. Forgetting to add a slice here is the most common reason a new table does not appear in a generated migration.

> [!NOTE]
> **This is the only `export *` in the repository**, and it has its own `noReExportAll: "off"` override keyed on this exact path ([05](05-lint-and-format.md)). The rule elsewhere exists to keep a package's public surface deliberate; this file is not a public surface. `drizzle-kit` and `drizzle(pool, { schema })` need every table, relation, and enum the package defines, `index.ts` republishes the whole thing as one namespace, and hand-listing several dozen table objects would drift out of date on the first migration nobody double-checked.

---

## Step 13.5 — Drizzle Kit

**`packages/infrastructure/drizzle.config.ts`**

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
  verbose: true,
});
```

> This file reads `process.env` and that is fine — it is a build-time tool config, not package runtime code. No extra ignore is needed: the base config's `"**/*.config.ts"` pattern already covers it.

Add to **`packages/infrastructure/package.json`**:

```json
"scripts": {
  "db:generate": "drizzle-kit generate",
  "db:migrate": "tsx migrate.ts",
  "db:push": "drizzle-kit push",
  "db:studio": "drizzle-kit studio",
  "db:seed": "tsx src/seed/index.ts"
}
```

**`packages/infrastructure/migrate.ts`**

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
pnpm add --filter @loadbearing/infrastructure -D dotenv
```

### Generate, never push

`db:push` diffs your schema against the database and applies the difference with no migration file. It is genuinely convenient and it is a trap:

- There is no record of what changed, so staging and production cannot be brought to the same state deterministically.
- It has no idea how to preserve data through a rename — it drops and recreates.
- Permission seeding lives in migrations ([12.8](#step-128--seeds)), so a pushed schema arrives with no roles.

Use `db:push` on a scratch database while iterating on a schema shape you have not committed. Use `db:generate` for anything that will ever reach another machine. **Migrations are committed** — they are the schema's history and CI replays them.

---

## Step 13.6 — First migration

```bash
cd packages/infrastructure
node -e "require('fs').writeFileSync('.env', 'DATABASE_URL=postgres://ratchet:ratchet@localhost:5432/ratchet\n')"
```
> A package-local `.env` for drizzle-kit only. It is already covered by the root `.gitignore`.

```bash
pnpm db:generate
```
> Writes `migrations/0000_<name>.sql` and `migrations/meta/`. **Read the SQL before applying it.** Drizzle-kit is good but it is a diffing tool, and reviewing generated DDL is a five-second habit that catches an accidental `DROP COLUMN` before it runs.

### Hand-edit the partitioned tables, before you apply it

`activity_log` and `task_status_history` are append-only, grow forever, and are always queried by a recent time window. Both are **RANGE-partitioned by month, in this first migration** — converting a large table to partitioned later is a rewrite with downtime, and it is the one structural decision on this page that is genuinely painful to retrofit.

**Drizzle cannot express `PARTITION BY`.** The schema declares an ordinary table so the query builder still types it; the generated DDL is edited by hand before it is applied. That is not a workaround bolted on — it is why migrations here are generated, read, and committed rather than pushed, and it is the same channel the permission-seeding SQL below already uses.

Replace the generated `CREATE TABLE activity_log (...)` with:

```sql
CREATE TABLE activity_log (
  id              uuid        NOT NULL,
  organization_id uuid        NOT NULL,
  actor_id        uuid        NOT NULL,
  action          text        NOT NULL,
  payload         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

CREATE INDEX activity_log_org_time_idx ON activity_log (organization_id, occurred_at DESC);

CREATE TABLE activity_log_2026_01 PARTITION OF activity_log
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
```

**The primary key is `(id, occurred_at)`, not `id`.** Postgres requires a partitioned table's primary key to include the partition key, and the same applies to every unique index on it. This is the one place the "every primary key is a UUID" rule from [07](07-core-package.md) does not hold — and it costs nothing, because `Uuid.v7()` is time-ordered, so the key and the partition column increase together and inserts still land at the tail of the B-tree.

**Create partitions ahead of time**, with a repeatable job on the maintenance queue ([25](25-worker-app.md)) or `pg_partman`. A month that arrives with no partition is an insert that fails, so the job runs monthly and creates several months out.

**Decide retention at the same time.** The usual shape is 12–24 months of detail in Postgres, aggregates kept forever in the analytics store, and older partitions detached to cold storage. Detaching a partition is instant; a `DELETE` over the same rows bloats the table and holds a lock.

> **`session` looks like the third table on this list and is not.** Better Auth updates it on refresh, deletes it on sign-out, and looks rows up by id — a predicate carrying no partition key, so every lookup would scan every partition, and its generated schema will not produce the composite primary key partitioning requires. Sessions are bounded by expiry instead, and a `DELETE ... WHERE expires_at < now()` on the cleanup schedule is the right tool ([25](25-worker-app.md)).

```bash
pnpm db:migrate
```

```bash
pnpm db:studio
```
> Opens a browser UI at `local.drizzle.studio` showing your tables.

---

## Step 13.7 — Repositories

**`packages/infrastructure/src/pg/primitive/base.repository.ts`**

```ts
import type { OrganizationId, UserId } from "@loadbearing/contracts";
import type { Database } from "./database.js";
import type { TransactionScope } from "./unit-of-work.js";

export abstract class BaseRepository {
  constructor(
    protected readonly database: Database,
    protected readonly scope: TransactionScope,
  ) {}

  // The transaction handle when one is open, the pool otherwise. Every query in
  // every subclass goes through this, which is what makes UnitOfWork real.
  protected get db() {
    return this.scope.current() ?? this.database.client;
  }

  // Every tenant-scoped query starts here. A repository method that does not
  // narrow by this is a cross-tenant read waiting to happen.
  protected tenant(actor: Principal): OrganizationId {
    return actor.organizationId;
  }
}
```

**Two things this base class exists to make unavoidable**, and both are cheap here and expensive everywhere else.

**The tenant filter.** Every repository query narrows by `organization_id`; the base class is where that becomes a habit rather than a review comment. A method that cannot be scoped to a tenant — a genuine cross-tenant aggregate — does not belong in a repository at all, it belongs in the analytics store ([Data and scale](../opinions/data-and-scale.md) §4.1).

**The transaction handle.** `db` resolves to the open transaction when there is one. Without that, `UnitOfWork.run()` opens a transaction that the repositories inside it never join — every call site *reads* as atomic and none of it *is*.

**`packages/infrastructure/src/pg/repository/pg-capability.repository.ts`**

```ts
import { and, eq, isNull, or } from "drizzle-orm";
import type { CapabilityRepository } from "@loadbearing/application";
import type { OrganizationId } from "@loadbearing/contracts";
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
  // Org role grants + goal role grants + per-user overrides, with deny winning.
  // Every raw permission string passes PermissionRegistry.isKnown() before it is
  // trusted, so a stale row can never grant a capability the registry no longer
  // defines.
  public async resolveFor(
    organizationId: OrganizationId,
    userId: UserId,
  ): Promise<CapabilitySet> {
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
      .where(
        and(
          eq(memberships.organizationId, organizationId),
          eq(memberships.userId, userId),
        ),
      );

    for (const row of orgRows) {
      if (registry.isKnown(row.permission)) org.grants.add(row.permission);
    }

    const goalRows = await this.db
      .select({ goalId: goalMembers.goalId, permission: rolePermissions.permission })
      .from(goalMembers)
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, goalMembers.roleId))
      .where(
        and(
          eq(goalMembers.organizationId, organizationId),
          eq(goalMembers.userId, userId),
        ),
      );

    for (const row of goalRows) {
      if (registry.isKnown(row.permission)) scopedFor(row.goalId).grants.add(row.permission);
    }

    const overrideRows = await this.db
      .select()
      .from(permissionOverrides)
      .where(
        and(
          eq(permissionOverrides.organizationId, organizationId),
          eq(permissionOverrides.userId, userId),
        ),
      );

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

**Three, and an integration test should say so.** "Three queries" is a claim that decays silently — someone adds a lookup inside the loop and it becomes 3 + N, which is invisible at ten users and fatal at five thousand. Assert the count rather than the timing:

```ts
const counted = await countQueries(() => repository.resolveFor(orgId, userId));
expect(counted).toBe(3);
```

An N+1 caught by a failing assertion costs a minute. The same N+1 caught by a production trace costs an afternoon and a rollback. This is the cheapest performance guardrail available and it belongs on every repository method that loops.

**`organizationId` scopes all three queries, and it is a parameter rather than ambient state.** A user can belong to more than one organization; without the tenant predicate `resolveFor` merges their capabilities across all of them. Nothing downstream can catch that, because by the time the `CapabilitySet` exists it is already wrong — every `can()` call after it returns a confidently incorrect answer.

**`isKnown()` filters every raw string on the way in.** This is the line that makes the deny-by-default model honest against a database that has outlived several refactors.

**This method is cached in [16](16-auth-package.md)**, not here. The repository does the correct expensive thing; `CapabilityCache` decides how often it runs. Mixing the two means the cache cannot be tested independently and invalidation has nowhere clean to live.

### The naming rule for implementations

`PgCapabilityRepository`, `PgActivityLogger`, `PgVectorStore` — implementations lead with their technology, because the prefix is what marks them as the swappable one. That is the second exemption to folder-prefix symmetry (the first is use-cases, which lead with a verb). The filename still mirrors the class: `capability.repository.ts` exports `PgCapabilityRepository`, and the `Pg` prefix is dropped from the filename because the folder already says `pg`.

---

## Step 13.8 — Seeds

**`packages/infrastructure/src/pg/seed/system-role.seed.ts`**

```ts
import { and, eq } from "drizzle-orm";
import { Uuid } from "@loadbearing/core";
import type { OrganizationId } from "@loadbearing/contracts";
import { PermissionRegistry, type PermissionKey } from "@loadbearing/permissions";
import { BaseRepository } from "../base.repository.js";
import { rolePermissions, roles } from "../schema/index.js";

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

  // Idempotent: safe to run on every deploy. Runs per organization, because
  // system roles are rows in a tenant's table rather than global constants.
  public async run(organizationId: OrganizationId): Promise<void> {
    for (const definition of SystemRoleSeed.ROLES) {
      const existing = await this.db
        .select({ id: roles.id })
        .from(roles)
        .where(
          and(
            eq(roles.organizationId, organizationId),
            eq(roles.key, definition.key),
          ),
        )
        .limit(1);

      const roleId = existing[0]?.id ?? Uuid.v7();

      if (!existing[0]) {
        await this.db.insert(roles).values({
          id: roleId,
          organizationId,
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
        .values(permissions.map((permission) => ({ organizationId, roleId, permission })))
        .onConflictDoNothing();
    }
  }
}
```

**`permissions: "all"` for owner resolves through `PermissionRegistry.all()` at seed time.** That means every new permission a feature adds is automatically granted to owners when the seed re-runs, which is what you want — and it is why the seed must be idempotent and re-run on every deploy rather than once at install.

**Every other role's permissions are explicit.** No wildcards outside owner. A role that grants "everything in module X" would keep granting new things as X grows, which is how a "read-only reviewer" role quietly acquires write access.

**The seed takes an organization, because system roles are per-tenant rows.** `owner` is not one row shared by every customer — it is one row per organization, which is what `roles_key_uq` on `(organization_id, key)` enforces. Creating an organization therefore means creating its four system roles, and this method is the thing that does it. Seeding a fresh database means seeding a first organization to hang them off.

**`packages/infrastructure/src/pg/seed/index.ts`**

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

## Step 13.9 — `PgUnitOfWork`

**`packages/infrastructure/src/pg/transaction/pg-unit-of-work.ts`** and **`transaction-scope.ts`**

```ts
import { AsyncLocalStorage } from "node:async_hooks";
import { UnitOfWork } from "@loadbearing/application";
import type { Database, DrizzleClient } from "./database.js";

// The seam BaseRepository reads. One instance, shared by the unit of work and
// every repository the container builds, so "am I in a transaction" has one answer.
export class TransactionScope {
  private readonly storage = new AsyncLocalStorage<DrizzleClient>();

  public current(): DrizzleClient | undefined {
    return this.storage.getStore();
  }

  public async within<T>(tx: DrizzleClient, work: () => Promise<T>): Promise<T> {
    return this.storage.run(tx, work);
  }
}

export class PgUnitOfWork extends UnitOfWork {
  constructor(
    private readonly database: Database,
    private readonly scope: TransactionScope,
  ) {
    super();
  }

  public override async run<T>(work: () => Promise<T>): Promise<T> {
    return this.database.client.transaction((tx) => this.scope.within(tx, work));
  }
}
```

**`AsyncLocalStorage` rather than threading a handle through every port.** The alternative is a `tx` parameter on every repository method, which puts a database concept into `application` — the one thing this architecture spends its effort keeping out. `AsyncLocalStorage` is a Node built-in, costs effectively nothing, and keeps the transaction invisible above this package.

This is the one place ambient context is acceptable, and it is worth being precise about why: the value is scoped to a single `run()` call rather than to a request, it is written in exactly one place, and nothing outside `BaseRepository` reads it. That is a different thing from a request-scoped container, which [17](17-composition-container.md) still bans.

**Nested `run()` calls join the outer transaction** rather than opening a second one, because `storage.run` replaces the handle only for the duration of the inner callback and Postgres has no nested transactions to open. A use-case that calls another use-case therefore gets one atomic unit, which is the behaviour anyone reading `run()` expects.

> **This is what makes the audit trail's guarantee real.** `PgActivityLogger` writes through the same `TransactionScope`, so a state change and its audit row commit together or neither does. A `UnitOfWork` whose repositories are not enrolled is worse than none at all — every call site reads as atomic, none of it is, and the first symptom is a state change with no record of who made it after a restart ([Data and scale](../opinions/data-and-scale.md) §1).

Verify it rather than trusting it — this is a five-line test and it is the only proof that matters:

```ts
await expect(
  uow.run(async () => {
    await tasks.save(task);
    throw new Error("boom");
  }),
).rejects.toThrow();

expect(await tasks.findById(task.id)).toBeNull();   // rolled back, not written
```

---

## ✅ Gate

```bash
pnpm db:generate && pnpm db:migrate && pnpm db:seed && pnpm db:studio
```

- `migrations/` contains a committed `.sql` file.
- Studio shows `organizations`, `roles`, `role_permissions`, `memberships`, `goal_members`, `permission_overrides`, `activity_log`.
- `SELECT key, is_system FROM roles;` returns four rows, all carrying the seed organization's id.
- Running `pnpm db:seed` a second time changes nothing.
- **Every table has the tenant column.** This returns no rows:
  ```sql
  SELECT t.table_name FROM information_schema.tables t
  WHERE t.table_schema = 'public'
    AND t.table_name NOT IN ('organizations','user','session','account','verification','__drizzle_migrations')
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_name = t.table_name AND c.column_name = 'organization_id');
  ```
- **`activity_log` is partitioned.** `SELECT relkind FROM pg_class WHERE relname = 'activity_log';` returns `p`, not `r`.
- **Every foreign key has a covering index.** This returns no rows:
  ```sql
  SELECT conrelid::regclass AS tbl, conname FROM pg_constraint c
  WHERE contype = 'f' AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = c.conrelid AND (i.indkey::smallint[])[0] = c.conkey[1]);
  ```
- **The unit of work actually rolls back.** The five-line test in 13.9 passes.

Do not proceed until this passes.

---

[← `@loadbearing/application`](12-application-package.md) · [Vector Storage →](14-vector-store.md)
