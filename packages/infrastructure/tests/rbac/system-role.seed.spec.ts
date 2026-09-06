import { Identifiers } from "@loadbearing/contracts";
import { Uuid } from "@loadbearing/core";
import { PermissionRegistry } from "@loadbearing/permissions";
import { and, eq, type Logger } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../../src/pg/primitive/index.js";
import { organizations, rolePermissions, roles } from "../../src/pg/schema/index.js";
import { SystemRoleSeed } from "../../src/pg/seed/index.js";
import { TransactionScope } from "../../src/pg/transaction/index.js";
import { openDatabase } from "../support/database.js";

class CountingLogger implements Logger {
  public count = 0;
  public logQuery(): void {
    this.count += 1;
  }
}

const counter = new CountingLogger();
let database: Database;
let seed: SystemRoleSeed;
let organizationId: ReturnType<typeof Identifiers.organizationId.parse>;

beforeAll(async () => {
  database = openDatabase(counter);
  seed = new SystemRoleSeed(database, new TransactionScope());

  // Its own tenant, never the seeded one: this spec counts statements, and a tenant
  // another spec is also seeding would make the count depend on the run order.
  organizationId = Identifiers.organizationId.parse(Uuid.v7());
  await database.client
    .insert(organizations)
    .values({ id: organizationId, name: "Seed Spec", slug: `seed-spec-${organizationId}` });
});

afterAll(async () => {
  await database.client.delete(organizations).where(eq(organizations.id, organizationId));
  await database.close();
});

beforeEach(() => {
  counter.count = 0;
});

const roleRows = () =>
  database.client
    .select({ id: roles.id, key: roles.key })
    .from(roles)
    .where(eq(roles.organizationId, organizationId));

describe("SystemRoleSeed.run", () => {
  it("seeds the four roles in three statements, not one per role", async () => {
    await seed.run(organizationId);

    // The regression: a SELECT then an INSERT per role, then a grants INSERT per role —
    // twelve round trips on a path every organization creation runs.
    expect(counter.count).toBe(3);

    const rows = await roleRows();
    expect(rows.map((row) => row.key).sort()).toEqual(["admin", "guest", "member", "owner"]);
  });

  it("is idempotent, and costs the same three statements the second time", async () => {
    const before = await roleRows();
    counter.count = 0;

    await seed.run(organizationId);

    expect(counter.count).toBe(3);

    // Same ids: a re-seed must not replace the rows memberships point at.
    const after = await roleRows();
    expect(after.map((row) => row.id).sort()).toEqual(before.map((row) => row.id).sort());
  });

  it("grants the owner every permission the registry defines", async () => {
    const [owner] = await database.client
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.organizationId, organizationId), eq(roles.key, "owner")));

    const granted = await database.client
      .select({ permission: rolePermissions.permission })
      .from(rolePermissions)
      .where(
        and(
          eq(rolePermissions.organizationId, organizationId),
          eq(rolePermissions.roleId, owner?.id ?? ""),
        ),
      );

    expect(granted.map((row) => row.permission).sort()).toEqual(
      [...PermissionRegistry.instance.all()].sort(),
    );
  });

  it("grants the guest nothing at all", async () => {
    const [guest] = await database.client
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.organizationId, organizationId), eq(roles.key, "guest")));

    const granted = await database.client
      .select({ permission: rolePermissions.permission })
      .from(rolePermissions)
      .where(
        and(
          eq(rolePermissions.organizationId, organizationId),
          eq(rolePermissions.roleId, guest?.id ?? ""),
        ),
      );

    expect(granted).toHaveLength(0);
  });
});
