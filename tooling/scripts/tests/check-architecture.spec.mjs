// Each assertion run against a tree that violates it, and against one that does not.
//
// The script derives ROOT from its own location, so a fixture is a temporary tree with a
// copy of it under `tooling/scripts/` — no ROOT parameter to thread through eighteen
// assertions, and the thing under test is the file the repository actually runs.

// @ts-check

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const SCRIPTS = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COPIED = ["check-architecture.mjs", "source-text.mjs"];
const made = [];

// A package is a directory under `packages/` with a manifest -- that is what makes it one
// to `packageDirs()`, and a fixture without the manifest is a directory nothing walks.
const PKG = (name) =>
  JSON.stringify({
    name: `@fixture/${name}`,
    private: true,
    scripts: { typecheck: "tsc --noEmit" },
  });

// Enough of a repository that every assertion either passes or skips. A test adds the one
// file that breaks the one it is about, so a failure elsewhere is never ambient.
const BASE = {
  "package.json": JSON.stringify({
    packageManager: "pnpm@10.17.0",
    devEngines: { packageManager: { name: "pnpm", version: "10.17.0" } },
  }),
  "pnpm-workspace.yaml": [
    "catalog:",
    '  "@orpc/client": ^1.9.3',
    '  "@orpc/server": ^1.9.3',
    "",
  ].join("\n"),
  "AGENTS.md":
    "Start at docs/ai/index.md. The rulebook is [layering](docs/ai/rules/layering.md).\n",
  "CLAUDE.md": "@docs/ai/rules/layering.md\n",
  "docs/index.md": "Docs.\n",
  "docs/ai/index.md": "Router. [layering](docs/ai/rules/layering.md)\n",
  "docs/ai/rules/index.md": "Contents. [layering](layering.md)\n",
  "docs/ai/rules/layering.md": "Dependencies point one way. See docs/opinions/layering.md.\n",
  "docs/opinions/index.md": "Opinions.\n",
  "docs/opinions/layering.md": "The argument.\n",
  "packages/application/package.json": PKG("application"),
  "packages/application/src/index.ts": 'export const NAME = "application";\n',
};

function parse(output) {
  const results = [];
  let current = null;

  for (const line of output.split("\n")) {
    const match = /^([✓✗○]) (.+?)(?: — skipped: .+)?$/u.exec(line);
    if (match) {
      current = { name: match[2] ?? "", status: match[1] ?? "", details: "" };
      results.push(current);
      continue;
    }
    if (current && line.startsWith("    ")) current.details += `${line.trim()}\n`;
  }

  return results;
}

function run(files = {}) {
  const root = mkdtempSync(join(tmpdir(), "check-architecture-"));
  made.push(root);

  for (const [path, body] of Object.entries({ ...BASE, ...files })) {
    if (body === null) continue;
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  }

  const scripts = join(root, "tooling/scripts");
  mkdirSync(scripts, { recursive: true });
  for (const name of COPIED) cpSync(join(SCRIPTS, name), join(scripts, name));

  let output = "";
  try {
    output = execFileSync("node", [join(scripts, "check-architecture.mjs")], {
      encoding: "utf8",
    });
  } catch (error) {
    // A non-zero exit is a failing assertion, and under CI=true also a skipped one. The
    // per-assertion lines are on stdout either way, which is the whole of what is read.
    output = error instanceof Error && "stdout" in error ? String(error.stdout) : "";
  }

  return parse(output);
}

function entry(results, name) {
  const found = results.find((result) => result.name === name);
  expect(found, `no assertion named ${name} in the output`).toBeDefined();
  return found;
}

function passes(results, name) {
  expect(entry(results, name).status, `${name} should pass`).toBe("✓");
}

function fails(results, name, detail) {
  const found = entry(results, name);
  expect(found.status, `${name} should fail — details: ${found.details}`).toBe("✗");
  expect(found.details).toContain(detail);
}

afterAll(() => {
  for (const root of made) rmSync(root, { recursive: true, force: true });
});

const SCHEMA_BARREL = 'export { tasks } from "./task.schema.js";\n';

function schema(body) {
  return {
    "packages/infrastructure/src/pg/schema/index.ts": SCHEMA_BARREL,
    "packages/infrastructure/src/pg/schema/task.schema.ts": body,
  };
}

describe("the fixture harness", () => {
  it("reports every assertion, and none of them fails on a clean tree", () => {
    const results = run();

    expect(results).toHaveLength(21);
    for (const { name, status } of results) {
      expect(status, `${name} failed on the base fixture`).not.toBe("✗");
    }
  });
});

describe("1 — application imports no framework", () => {
  it("catches a framework named in the domain", () => {
    fails(
      run({ "packages/application/src/index.ts": 'import { eq } from "drizzle-orm";\n' }),
      "`application` imports no framework",
      "drizzle-orm",
    );
  });

  it("allows the same name in another package", () => {
    passes(
      run({
        "packages/infrastructure/package.json": PKG("infrastructure"),
        "packages/infrastructure/src/index.ts": 'import { eq } from "drizzle-orm";\n',
      }),
      "`application` imports no framework",
    );
  });
});

describe("2 — application does not log", () => {
  it("catches an observability import", () => {
    fails(
      run({
        "packages/application/src/index.ts":
          'import { Logger } from "@loadbearing/observability";\n',
      }),
      "`application` does not log",
      "@loadbearing/observability",
    );
  });
});

describe("3 — only env.ts reads process.env", () => {
  it("catches a read outside env.ts", () => {
    fails(
      run({ "packages/application/src/index.ts": "export const url = process.env.DB_URL;\n" }),
      "only `env.ts` reads `process.env`",
      "reads process.env",
    );
  });

  it("does not count a comment naming it", () => {
    passes(
      run({ "packages/application/src/index.ts": "// never read process.env here\nexport {};\n" }),
      "only `env.ts` reads `process.env`",
    );
  });

  it("exempts a config at a package root but not a file merely named like one", () => {
    passes(
      run({ "packages/application/vitest.config.ts": "export default { url: process.env.X };\n" }),
      "only `env.ts` reads `process.env`",
    );
    fails(
      run({ "packages/application/src/container.config.ts": "export const x = process.env.X;\n" }),
      "only `env.ts` reads `process.env`",
      "container.config.ts",
    );
  });
});

describe("4 — every @orpc entry is on one version line", () => {
  it("catches two version lines", () => {
    fails(
      run({
        "pnpm-workspace.yaml": [
          "catalog:",
          '  "@orpc/client": ^1.9.3',
          '  "@orpc/server": ^1.8.0',
          "",
        ].join("\n"),
      }),
      "every `@orpc/*` entry is on one version line",
      "2 version lines",
    );
  });

  it("ignores a commented entry", () => {
    passes(
      run({
        "pnpm-workspace.yaml": [
          "catalog:",
          '  "@orpc/client": ^1.9.3',
          '  # "@orpc/server": ^1.8.0',
          "",
        ].join("\n"),
      }),
      "every `@orpc/*` entry is on one version line",
    );
  });
});

describe("5 — comments are //, never a block", () => {
  it("catches a block comment and the JSX form", () => {
    fails(
      run({ "packages/application/src/index.ts": "/* a block */\nexport {};\n" }),
      "comments are `//`, never a block",
      "block comment",
    );
    fails(
      run({ "packages/application/src/index.tsx": "{/* jsx */}\nexport {};\n" }),
      "comments are `//`, never a block",
      "block comment",
    );
  });

  it("does not count a glob inside a string", () => {
    passes(
      run({ "packages/application/src/index.ts": 'export const g = "**/dist/**";\n' }),
      "comments are `//`, never a block",
    );
  });
});

describe("6 — no top-level await in a built barrel", () => {
  it("catches an indented top-level await, not only one at column zero", () => {
    fails(
      run({ "packages/application/dist/index.js": "  await init();\nexport {};\n" }),
      "no top-level await in a built barrel",
      "top-level await",
    );
  });

  it("allows one inside a function", () => {
    passes(
      run({ "packages/application/dist/index.js": "async function f() {\n  await init();\n}\n" }),
      "no top-level await in a built barrel",
    );
  });
});

describe('7 — "use client" only in ui, query, feature', () => {
  it("catches it in an isomorphic package and allows it in ui", () => {
    fails(
      run({ "packages/application/src/index.ts": '"use client";\nexport {};\n' }),
      '`"use client"` only in ui, query, feature',
      "must not declare a client boundary",
    );
    passes(
      run({
        "packages/ui/package.json": PKG("ui"),
        "packages/ui/src/index.ts": '"use client";\nexport {};\n',
      }),
      '`"use client"` only in ui, query, feature',
    );
  });
});

describe("9 — every domain table declares organization_id", () => {
  it("catches a table without one", () => {
    fails(
      run(
        schema(
          'export const tasks = pgTable("tasks", {\n' +
            '  id: uuid("id").primaryKey(),\n' +
            "});\n",
        ),
      ),
      "every domain table declares `organization_id`",
      "tasks",
    );
  });

  it("does not accept a column that merely ends with the name", () => {
    fails(
      run(
        schema(
          'export const tasks = pgTable("tasks", {\n' +
            '  active: uuid("active_organization_id"),\n' +
            "});\n",
        ),
      ),
      "every domain table declares `organization_id`",
      "tasks",
    );
  });

  it("accepts the column itself", () => {
    passes(
      run(
        schema(
          'export const tasks = pgTable("tasks", {\n' +
            '  organizationId: uuid("organization_id").notNull(),\n' +
            "});\n",
        ),
      ),
      "every domain table declares `organization_id`",
    );
  });
});

describe("10 — the audit port is ActivityLogger", () => {
  it("catches the old name", () => {
    fails(
      run({ "packages/application/src/index.ts": "export type AuditTrail = never;\n" }),
      "the audit port is `ActivityLogger`, never `AuditTrail`",
      "AuditTrail",
    );
  });
});

describe("11 — the schema barrel names every schema file", () => {
  it("catches a schema file the barrel omits", () => {
    fails(
      run({
        "packages/infrastructure/src/pg/schema/index.ts": SCHEMA_BARREL,
        "packages/infrastructure/src/pg/schema/task.schema.ts": "export const tasks = 1;\n",
        "packages/infrastructure/src/pg/schema/user.schema.ts": "export const users = 1;\n",
      }),
      "the schema barrel names every `*.schema.ts`",
      "user.schema",
    );
  });
});

describe("12 — the rule files route to every opinions page", () => {
  it("catches an opinions page no rule file cites", () => {
    fails(
      run({ "docs/opinions/files.md": "The argument.\n" }),
      "the rule files route to every opinions page",
      "docs/opinions/files.md",
    );
  });

  it("catches a rule file CLAUDE.md does not import", () => {
    fails(
      run({
        "docs/ai/rules/files.md": "Kebab-case. See docs/opinions/files.md.\n",
        "docs/opinions/files.md": "The argument.\n",
        "docs/ai/index.md":
          "Router. [layering](docs/ai/rules/layering.md) [files](docs/ai/rules/files.md)\n",
      }),
      "the rule files route to every opinions page",
      "does not @-import",
    );
  });

  it("catches a Markdown link to a page that does not exist", () => {
    fails(
      run({ "docs/ai/rules/layering.md": "See docs/opinions/layering.md and [gone](gone.md).\n" }),
      "the rule files route to every opinions page",
      "which does not exist",
    );
  });
});

describe("13 — every folder under docs has an index.md", () => {
  it("catches a folder with a page and no index", () => {
    fails(
      run({ "docs/setup/02-environment.md": "Setup.\n" }),
      "every folder under `docs/` has an `index.md`",
      "docs/setup",
    );
  });

  it("exempts a reference folder", () => {
    passes(
      run({ "docs/reference/palette.md": "Palette.\n" }),
      "every folder under `docs/` has an `index.md`",
    );
  });
});

describe("14 — no comment block over two lines", () => {
  it("catches three consecutive comment lines", () => {
    fails(
      run({ "packages/application/src/index.ts": "// one\n// two\n// three\nexport {};\n" }),
      "no comment block over two lines",
      "index.ts",
    );
  });

  it("allows two, and lets a separator end a run", () => {
    passes(
      run({ "packages/application/src/index.ts": "// one\n// two\nexport {};\n" }),
      "no comment block over two lines",
    );
    passes(
      run({
        "packages/application/src/index.ts": "// one\n// two\n// ── x ──\n// three\nexport {};\n",
      }),
      "no comment block over two lines",
    );
  });
});

describe("15 — every backticked path in the docs exists", () => {
  it("catches a path that names nothing, and ignores one inside a fence", () => {
    fails(
      run({ "docs/index.md": "See `packages/nowhere/src/index.ts`.\n" }),
      "every backticked path in the docs exists",
      "packages/nowhere/src/index.ts",
    );
    passes(
      run({ "docs/index.md": "```\n`packages/nowhere/src/index.ts`\n```\n" }),
      "every backticked path in the docs exists",
    );
  });
});

describe("16 — both pnpm version declarations agree", () => {
  it("catches a disagreement", () => {
    fails(
      run({
        "package.json": JSON.stringify({
          packageManager: "pnpm@10.17.0",
          devEngines: { packageManager: { name: "pnpm", version: "10.16.0" } },
        }),
      }),
      "both pnpm version declarations agree",
      "10.16.0",
    );
  });
});

describe("17 — every unique index on a tenant table leads with organization_id", () => {
  const table = (extras) =>
    schema(
      'export const tasks = pgTable("tasks", {\n' +
        '  id: uuid("id").primaryKey(),\n' +
        '  organizationId: uuid("organization_id").notNull(),\n' +
        '  key: text("key").notNull(),\n' +
        `}, (t) => [${extras}]);\n`,
    );

  it("catches a unique index that leads with anything else", () => {
    fails(
      run(table('uniqueIndex("tasks_key_uq").on(t.key)')),
      "every unique index on a tenant table leads with `organization_id`",
      "tasks_key_uq",
    );
  });

  it("accepts one that leads with the tenant, and ignores a plain index", () => {
    passes(
      run(table('uniqueIndex("tasks_key_uq").on(t.organizationId, t.key)')),
      "every unique index on a tenant table leads with `organization_id`",
    );
    passes(
      run(table('index("tasks_key_idx").on(t.key)')),
      "every unique index on a tenant table leads with `organization_id`",
    );
  });
});

function migration(sql) {
  return { "packages/infrastructure/migrations/0100_probe.sql": sql };
}

describe("20 — every migration is safe on a table that already holds rows", () => {
  it("catches a unique index over a table the file does not create", () => {
    fails(
      run(migration('CREATE UNIQUE INDEX "roles_key_uq" ON "roles" USING btree ("key");\n')),
      "every migration is safe on a table that already holds rows",
      "no de-dup",
    );
  });

  it("catches a NOT NULL column with no default", () => {
    fails(
      run(migration('ALTER TABLE "roles" ADD COLUMN "slug" text NOT NULL;\n')),
      "every migration is safe on a table that already holds rows",
      "NOT NULL with no default",
    );
  });

  it("accepts the de-dup, a table created in the same file, and a default", () => {
    passes(
      run(
        migration(
          'DELETE FROM "roles" a USING "roles" b WHERE a."key" = b."key";\n' +
            'CREATE UNIQUE INDEX "roles_key_uq" ON "roles" USING btree ("key");\n',
        ),
      ),
      "every migration is safe on a table that already holds rows",
    );
    passes(
      run(
        migration(
          'CREATE TABLE "tags" ("id" uuid PRIMARY KEY);\n' +
            'CREATE UNIQUE INDEX "tags_key_uq" ON "tags" USING btree ("key");\n',
        ),
      ),
      "every migration is safe on a table that already holds rows",
    );
    passes(
      run(migration('ALTER TABLE "roles" ADD COLUMN "slug" text DEFAULT \'\' NOT NULL;\n')),
      "every migration is safe on a table that already holds rows",
    );
  });
});

describe("19 — every package with tests typechecks them", () => {
  const withTests = (config) => ({
    "packages/application/tsconfig.json": JSON.stringify(config),
    "packages/application/tests/probe.spec.ts": "export {};\n",
  });

  it("catches a config that includes src only", () => {
    fails(
      run(withTests({ include: ["src/**/*.ts"] })),
      "every package with tests typechecks them",
      "includes no tests/ pattern",
    );
  });

  it("catches a package with tests and no typecheck script", () => {
    fails(
      run({
        "packages/application/package.json": JSON.stringify({ name: "@fixture/application" }),
        "packages/application/tests/probe.spec.ts": "export {};\n",
      }),
      "every package with tests typechecks them",
      "no typecheck script",
    );
  });

  it("accepts a config that includes them, and follows a named -p file", () => {
    passes(
      run(withTests({ include: ["src/**/*.ts", "tests/**/*.ts"] })),
      "every package with tests typechecks them",
    );
    passes(
      run({
        "packages/application/package.json": JSON.stringify({
          name: "@fixture/application",
          scripts: { typecheck: "tsc --noEmit -p tsconfig.test.json" },
        }),
        "packages/application/tsconfig.json": JSON.stringify({ include: ["src/**/*.ts"] }),
        "packages/application/tsconfig.test.json": JSON.stringify({
          include: ["src/**/*.ts", "tests/**/*.ts"],
        }),
        "packages/application/tests/probe.spec.ts": "export {};\n",
      }),
      "every package with tests typechecks them",
    );
  });
});

describe("18 — every foreign key column has an index leading with it", () => {
  const table = (extras) =>
    schema(
      'export const tasks = pgTable("tasks", {\n' +
        '  organizationId: uuid("organization_id").notNull(),\n' +
        '  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }),\n' +
        `}, (t) => [${extras}]);\n`,
    );

  it("catches a foreign key no index leads with", () => {
    fails(
      run(table('index("tasks_org_idx").on(t.organizationId)')),
      "every foreign key column has an index leading with it",
      "owner_id",
    );
  });

  it("is not satisfied by an index that merely mentions it", () => {
    fails(
      run(table('index("tasks_pair_idx").on(t.organizationId, t.ownerId)')),
      "every foreign key column has an index leading with it",
      "owner_id",
    );
  });

  it("accepts an index leading with it", () => {
    passes(
      run(table('index("tasks_owner_idx").on(t.ownerId, t.organizationId)')),
      "every foreign key column has an index leading with it",
    );
  });

  // The composite form, which a reference to a partitioned table has to take. Reading
  // only `.references()` stopped seeing these columns the moment the first one landed.
  const composite = (extras) =>
    schema(
      'export const tasks = pgTable("tasks", {\n' +
        '  organizationId: uuid("organization_id").notNull(),\n' +
        '  goalId: uuid("goal_id").notNull(),\n' +
        `}, (t) => [foreignKey({ columns: [t.goalId, t.organizationId], foreignColumns: [goals.id, goals.organizationId], name: "tasks_goal_fk" }), ${extras}]);\n`,
    );

  it("catches a composite foreign key no index leads with", () => {
    fails(
      run(composite('index("tasks_org_idx").on(t.organizationId)')),
      "every foreign key column has an index leading with it",
      "goal_id",
    );
  });

  it("accepts a composite foreign key whose leading column is indexed", () => {
    passes(
      run(composite('index("tasks_goal_fk_idx").on(t.goalId)')),
      "every foreign key column has an index leading with it",
    );
  });
});

describe("21 — every partitioned table is on the allowlist, with the same keys", () => {
  const ALLOWLIST = "packages/application/src/primitive/partitioned-table.ts";
  const NAME = "every partitioned table is on the allowlist, with the same keys";

  // The two shapes the parser has to read: a name written through a module constant, and
  // one written as a literal. Both appear in the real file.
  const allowlist = (entries) =>
    'const ACTIVITY_LOG = "activity_log";\n' +
    `const ALL = Object.freeze([${entries}] as const);\n`;

  // A table with both levels. The month level under it is declared by the tenant seed at
  // runtime, so the migration shows only the outermost key.
  const TENANT = (name) =>
    `{ name: ${name}, tenantKey: "organization_id", column: "occurred_at", retentionMonths: null },`;

  const MONTH = (name) =>
    `{ name: ${name}, tenantKey: null, column: "occurred_at", retentionMonths: 2 },`;

  const migration = (body) => ({
    "packages/infrastructure/migrations/0000_base.sql": body,
  });

  const CREATE = (table, kind, key, pk) =>
    `CREATE TABLE "${table}" (\n` +
    `\t"id" uuid NOT NULL,\n` +
    `\tCONSTRAINT "${table}_pk" PRIMARY KEY(${pk})\n` +
    `) PARTITION BY ${kind} ("${key}");\n`;

  const TENANT_DDL = (table) =>
    CREATE(table, "LIST", "organization_id", `"id","organization_id","occurred_at"`);

  const MONTH_DDL = (table) => CREATE(table, "RANGE", "occurred_at", `"id","occurred_at"`);

  it("catches a migration partitioning a table the allowlist does not name", () => {
    fails(
      run({
        [ALLOWLIST]: allowlist(TENANT("ACTIVITY_LOG")),
        ...migration(TENANT_DDL("activity_log") + MONTH_DDL("outbox_event")),
      }),
      NAME,
      "which PartitionedTable.ALL does not name",
    );
  });

  it("catches an allowlist entry no migration partitions", () => {
    fails(
      run({
        [ALLOWLIST]: allowlist(TENANT("ACTIVITY_LOG") + MONTH('"outbox_event"')),
        ...migration(TENANT_DDL("activity_log")),
      }),
      NAME,
      "which no migration partitions",
    );
  });

  // The level the migration declares is the outermost one, so a tenant entry written as
  // `RANGE` is a table whose months would be created directly under the parent.
  it("catches a migration that declares the wrong level", () => {
    fails(
      run({
        [ALLOWLIST]: allowlist(TENANT("ACTIVITY_LOG")),
        ...migration(MONTH_DDL("activity_log")),
      }),
      NAME,
      "the allowlist says LIST (organization_id)",
    );
  });

  // Postgres rejects this itself, so it only ever fires on a migration nobody applied —
  // which is the window this assertion exists to close.
  it("catches a primary key that omits a partition key", () => {
    fails(
      run({
        [ALLOWLIST]: allowlist(TENANT("ACTIVITY_LOG")),
        ...migration(CREATE("activity_log", "LIST", "organization_id", '"id","occurred_at"')),
      }),
      NAME,
      "primary key does not carry organization_id",
    );
  });

  it("catches a DEFAULT partition, which hides a missing month", () => {
    fails(
      run({
        [ALLOWLIST]: allowlist(TENANT("ACTIVITY_LOG")),
        ...migration(
          TENANT_DDL("activity_log") +
            'CREATE TABLE "activity_log_default" PARTITION OF "activity_log" DEFAULT;\n',
        ),
      }),
      NAME,
      "DEFAULT partition",
    );
  });

  // The last statement wins: a table dropped and recreated with a different key is
  // described by the migration that created it most recently.
  it("accepts a migration and an allowlist that agree, at either level", () => {
    passes(
      run({
        [ALLOWLIST]: allowlist(TENANT("ACTIVITY_LOG") + MONTH('"outbox_event"')),
        ...migration(TENANT_DDL("activity_log") + MONTH_DDL("outbox_event")),
      }),
      NAME,
    );
  });
});
