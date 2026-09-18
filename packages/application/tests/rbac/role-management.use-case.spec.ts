import { Identifiers, type OrganizationId, type RoleId } from "@loadbearing/contracts";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@loadbearing/errors";
import { CapabilitySet, type PermissionKey } from "@loadbearing/permissions";
import { beforeEach, describe, expect, it } from "vitest";
import type { ActivityLogger, CapabilityInvalidator, UnitOfWork } from "../../src/port/index.js";
import { Authorizer } from "../../src/primitive/authorizer.js";
import { Principal } from "../../src/primitive/principal.js";
import { CreateRoleUseCase } from "../../src/rbac/create-role.use-case.js";
import { DeleteRoleUseCase } from "../../src/rbac/delete-role.use-case.js";
import { GrantPermissionUseCase } from "../../src/rbac/grant-permission.use-case.js";
import { RevokePermissionUseCase } from "../../src/rbac/revoke-permission.use-case.js";
import type { RolePage, RoleRecord, RoleRepository } from "../../src/rbac/role.repository.js";
import { UpdateRoleUseCase } from "../../src/rbac/update-role.use-case.js";

const ORG = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000010");
const ACTOR = Identifiers.userId.parse("018f8c00-0000-7000-8000-000000000011");
const EDITABLE = Identifiers.roleId.parse("018f8c00-0000-7000-8000-0000000000d1");
const SEEDED = Identifiers.roleId.parse("018f8c00-0000-7000-8000-0000000000d2");

function actorHolding(...grants: readonly PermissionKey[]): Principal {
  return new Principal(
    ORG,
    ACTOR,
    CapabilitySet.from({ wildcard: false, org: { grants, denies: [] }, goals: {} }),
  );
}

function role(overrides: Partial<RoleRecord> = {}): RoleRecord {
  return {
    id: EDITABLE,
    key: "reviewer",
    name: "Reviewer",
    description: null,
    scope: "org",
    isSystem: false,
    permissions: [],
    ...overrides,
  };
}

// Answers for one tenant only, which is what the "another tenant's id" cases pin.
class RecordingRoles implements RoleRepository {
  public readonly saved: RoleRecord[] = [];
  public readonly deleted: RoleId[] = [];

  public constructor(
    private readonly rows: readonly RoleRecord[] = [],
    private readonly assignments = 0,
  ) {}

  public list(): Promise<RolePage> {
    throw new Error("not under test");
  }

  public findById(organizationId: OrganizationId, roleId: RoleId): Promise<RoleRecord | null> {
    if (organizationId !== ORG) return Promise.resolve(null);
    return Promise.resolve(this.rows.find((row) => row.id === roleId) ?? null);
  }

  public findByKey(organizationId: OrganizationId, key: string): Promise<RoleRecord | null> {
    if (organizationId !== ORG) return Promise.resolve(null);
    return Promise.resolve(this.rows.find((row) => row.key === key) ?? null);
  }

  public save(_org: OrganizationId, row: RoleRecord): Promise<void> {
    this.saved.push(row);
    return Promise.resolve();
  }

  public delete(_org: OrganizationId, roleId: RoleId): Promise<void> {
    this.deleted.push(roleId);
    return Promise.resolve();
  }

  public countAssignments(): Promise<number> {
    return Promise.resolve(this.assignments);
  }
}

class RecordingActivityLogger implements ActivityLogger {
  public readonly records: { action: string; payload: Record<string, unknown> }[] = [];

  public record(
    _actor: Principal,
    action: string,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    this.records.push({ action, payload: { ...payload } });
    return Promise.resolve();
  }
}

class DirectUnitOfWork implements UnitOfWork {
  public run<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }
}

class RecordingCapabilities implements CapabilityInvalidator {
  public readonly flushed: string[] = [];

  public invalidate(): Promise<void> {
    throw new Error("a role write flushes the tenant, never one member");
  }

  public invalidateOrganization(organizationId: OrganizationId): Promise<void> {
    this.flushed.push(organizationId);
    return Promise.resolve();
  }

  // The adapter decides when this fires — it is the only thing that knows which tenant
  // is the tier — so a use-case calling it directly is the bug this throw names.
  public invalidatePlatform(): Promise<void> {
    throw new Error("the cache flushes the platform axis, never a use-case");
  }
}

let roles: RecordingRoles;
let activity: RecordingActivityLogger;
let capabilities: RecordingCapabilities;

function reset(rows: readonly RoleRecord[] = [], assignments = 0): void {
  roles = new RecordingRoles(rows, assignments);
  activity = new RecordingActivityLogger();
  capabilities = new RecordingCapabilities();
}

const create = () =>
  new CreateRoleUseCase(new Authorizer(), roles, activity, new DirectUnitOfWork());
const update = () =>
  new UpdateRoleUseCase(new Authorizer(), roles, activity, new DirectUnitOfWork());
const remove = () =>
  new DeleteRoleUseCase(new Authorizer(), roles, activity, new DirectUnitOfWork());
const grant = () =>
  new GrantPermissionUseCase(
    new Authorizer(),
    roles,
    capabilities,
    activity,
    new DirectUnitOfWork(),
  );
const revoke = () =>
  new RevokePermissionUseCase(
    new Authorizer(),
    roles,
    capabilities,
    activity,
    new DirectUnitOfWork(),
  );

const NEW_ROLE = { key: "reviewer", name: "Reviewer", description: null, scope: "org" } as const;

beforeEach(() => reset());

describe("CreateRoleUseCase", () => {
  it("refuses a principal without rbac.role.manage", async () => {
    await expect(create().execute(actorHolding("rbac.role.read"), NEW_ROLE)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("creates a role with no permissions, because granting is a separate key", async () => {
    const result = await create().execute(actorHolding("rbac.role.manage"), NEW_ROLE);

    expect(result.permissions).toEqual([]);
    expect(result.isSystem).toBe(false);
    expect(roles.saved).toHaveLength(1);
    expect(activity.records.map((r) => r.action)).toEqual(["role.created"]);
  });

  // `SystemRoleSeed` resolves its rows by key and grants `owner` every permission in the
  // catalog. A user-created `owner` would collect the wildcard on the next deploy.
  it("refuses a key the seed will claim, even before the seed has run", async () => {
    await expect(
      create().execute(actorHolding("rbac.role.manage"), { ...NEW_ROLE, key: "owner" }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(roles.saved).toEqual([]);
  });

  it("refuses a key the tenant already uses rather than letting the index raise", async () => {
    reset([role()]);

    await expect(
      create().execute(actorHolding("rbac.role.manage"), NEW_ROLE),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("UpdateRoleUseCase", () => {
  it("renames a role and leaves its grants alone", async () => {
    reset([role({ permissions: ["member.read"] })]);

    const result = await update().execute(actorHolding("rbac.role.manage"), {
      roleId: EDITABLE,
      name: "Auditor",
      description: "Reads, never writes",
    });

    expect(result.name).toBe("Auditor");
    expect(result.permissions).toEqual(["member.read"]);
    expect(activity.records.map((r) => r.action)).toEqual(["role.updated"]);
  });

  it("does not find a role in another tenant", async () => {
    reset([role()]);
    const foreign = new Principal(
      Identifiers.organizationId.parse("018f8c00-0000-7000-8000-0000000000ff"),
      ACTOR,
      CapabilitySet.from({
        wildcard: false,
        org: { grants: ["rbac.role.manage"], denies: [] },
        goals: {},
      }),
    );

    await expect(
      update().execute(foreign, { roleId: EDITABLE, name: "Auditor", description: null }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  // The seed rewrites these on every deploy, so an accepted edit disappears at the next
  // one with no error and no trace.
  it("refuses to edit a seeded role", async () => {
    reset([role({ id: SEEDED, key: "admin", isSystem: true })]);

    await expect(
      update().execute(actorHolding("rbac.role.manage"), {
        roleId: SEEDED,
        name: "Administrators",
        description: null,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(roles.saved).toEqual([]);
  });
});

describe("DeleteRoleUseCase", () => {
  it("deletes a role nobody holds", async () => {
    reset([role()]);

    await remove().execute(actorHolding("rbac.role.manage"), { roleId: EDITABLE });

    expect(roles.deleted).toEqual([EDITABLE]);
    expect(activity.records.map((r) => r.action)).toEqual(["role.deleted"]);
  });

  // `memberships.role_id` and `goal_members.role_id` are `on delete no action`, so the
  // alternative to this check is a driver error the UI cannot render.
  it("refuses to delete a role somebody still holds", async () => {
    reset([role()], 1);

    await expect(
      remove().execute(actorHolding("rbac.role.manage"), { roleId: EDITABLE }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(roles.deleted).toEqual([]);
  });

  it("refuses to delete a seeded role", async () => {
    reset([role({ id: SEEDED, key: "admin", isSystem: true })]);

    await expect(
      remove().execute(actorHolding("rbac.role.manage"), { roleId: SEEDED }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("GrantPermissionUseCase", () => {
  it("adds the permission and flushes the tenant's cached capability sets", async () => {
    reset([role()]);

    const result = await grant().execute(actorHolding("rbac.permission.grant", "member.read"), {
      roleId: EDITABLE,
      permission: "member.read",
    });

    expect(result.permissions).toEqual(["member.read"]);
    expect(capabilities.flushed).toEqual([ORG]);
    expect(activity.records.map((r) => r.action)).toEqual(["role.permission.granted"]);
  });

  // Without this, `rbac.permission.grant` is the only key anyone ever needs: hold it and
  // you can write every other one into a role you hold.
  it("refuses to hand out a permission the actor does not hold", async () => {
    reset([role()]);

    await expect(
      grant().execute(actorHolding("rbac.permission.grant"), {
        roleId: EDITABLE,
        permission: "member.deactivate",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(roles.saved).toEqual([]);
  });

  // An owner's wildcard answers `can()` for everything, so the rule above never gets in
  // the way of the one role that is supposed to be able to hand out anything.
  it("lets a wildcard principal grant a permission it never names", async () => {
    reset([role()]);
    const owner = new Principal(
      ORG,
      ACTOR,
      CapabilitySet.from({ wildcard: true, org: { grants: [], denies: [] }, goals: {} }),
    );

    const result = await grant().execute(owner, {
      roleId: EDITABLE,
      permission: "member.deactivate",
    });

    expect(result.permissions).toEqual(["member.deactivate"]);
  });

  it("refuses a permission the catalog does not know", async () => {
    reset([role()]);

    await expect(
      grant().execute(actorHolding("rbac.permission.grant"), {
        roleId: EDITABLE,
        permission: "member.raed",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses to grant into a seeded role", async () => {
    reset([role({ id: SEEDED, key: "admin", isSystem: true })]);

    await expect(
      grant().execute(actorHolding("rbac.permission.grant", "member.read"), {
        roleId: SEEDED,
        permission: "member.read",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  // A no-op write would still flush every session in the tenant, which is a re-resolve
  // per member for a checkbox that was already ticked.
  it("writes and flushes nothing when the role already holds it", async () => {
    reset([role({ permissions: ["member.read"] })]);

    await grant().execute(actorHolding("rbac.permission.grant", "member.read"), {
      roleId: EDITABLE,
      permission: "member.read",
    });

    expect(roles.saved).toEqual([]);
    expect(capabilities.flushed).toEqual([]);
  });
});

describe("RevokePermissionUseCase", () => {
  it("removes the permission and flushes the tenant's cached capability sets", async () => {
    reset([role({ permissions: ["member.read", "rbac.role.read"] })]);

    const result = await revoke().execute(actorHolding("rbac.permission.revoke"), {
      roleId: EDITABLE,
      permission: "member.read",
    });

    expect(result.permissions).toEqual(["rbac.role.read"]);
    expect(capabilities.flushed).toEqual([ORG]);
    expect(activity.records.map((r) => r.action)).toEqual(["role.permission.revoked"]);
  });

  // Deliberately unlike a grant: a row left behind by a renamed permission is exactly
  // the one somebody needs to be able to remove.
  it("revokes a permission the catalog no longer knows", async () => {
    reset([role({ permissions: ["member.raed"] })]);

    const result = await revoke().execute(actorHolding("rbac.permission.revoke"), {
      roleId: EDITABLE,
      permission: "member.raed",
    });

    expect(result.permissions).toEqual([]);
    expect(capabilities.flushed).toEqual([ORG]);
  });

  it("refuses to revoke from a seeded role", async () => {
    reset([role({ id: SEEDED, key: "admin", isSystem: true, permissions: ["member.read"] })]);

    await expect(
      revoke().execute(actorHolding("rbac.permission.revoke"), {
        roleId: SEEDED,
        permission: "member.read",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("writes and flushes nothing when the role does not hold it", async () => {
    reset([role()]);

    await revoke().execute(actorHolding("rbac.permission.revoke"), {
      roleId: EDITABLE,
      permission: "member.read",
    });

    expect(roles.saved).toEqual([]);
    expect(capabilities.flushed).toEqual([]);
  });
});
