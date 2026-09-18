import { Identifiers } from "@loadbearing/contracts";
import { ConflictError, ForbiddenError, NotFoundError } from "@loadbearing/errors";
import { CapabilitySet, type PermissionKey } from "@loadbearing/permissions";
import { describe, expect, it } from "vitest";
import { DeleteOrganizationUseCase } from "../../src/platform/delete-organization.use-case.js";
import type { PlatformReader } from "../../src/platform/platform.reader.js";
import type { TenantRecord, TenantRepository } from "../../src/platform/tenant.repository.js";
import type {
  ActivityLogger,
  AnalyticsProjector,
  ArchivedPartition,
  CapabilityInvalidator,
  MaintenanceGateway,
  PartitionArchiveGateway,
  PartitionEstimate,
  UnitOfWork,
} from "../../src/port/index.js";
import { Authorizer } from "../../src/primitive/authorizer.js";
import { Principal } from "../../src/primitive/principal.js";

const PLATFORM = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000001");
const TENANT = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000010");
const ACTOR = Identifiers.userId.parse("018f8c00-0000-7000-8000-000000000011");
const NOW = new Date("2026-08-15T00:00:00.000Z");

const TENANT_ROW: TenantRecord = { id: TENANT, slug: "acme", name: "Acme", isPlatform: false };

class FakeTenants implements TenantRepository {
  public readonly deleted: string[] = [];

  public constructor(private readonly row: TenantRecord | null = TENANT_ROW) {}

  public findBy(): Promise<TenantRecord | null> {
    return Promise.resolve(this.row);
  }

  public delete(organizationId: string): Promise<void> {
    this.deleted.push(organizationId);
    return Promise.resolve();
  }
}

class FakeArchive implements Partial<PartitionArchiveGateway> {
  public readonly calls: { table: string; period: string; organizationId?: string }[] = [];

  public archive(table: string, period: Date, organizationId?: string): Promise<ArchivedPartition> {
    this.calls.push({ table, period: period.toISOString().slice(0, 10), organizationId });
    return Promise.resolve({
      table,
      period: period.toISOString().slice(0, 10),
      objects: [
        { organizationId, key: "k", rowCount: 1, bytes: 1, checksum: "c", actionCounts: {} },
      ],
      dropped: [],
    } as unknown as ArchivedPartition);
  }
}

class FakeMaintenance implements Partial<MaintenanceGateway> {
  public readonly cutoffs: { table: string; cutoff: string; organizationId?: string | null }[] = [];
  public readonly drops: string[] = [];

  public constructor(private readonly periods: readonly Date[] = []) {}

  public partitionsBefore(
    table: string,
    cutoff: Date,
    organizationId?: string | null,
  ): Promise<readonly PartitionEstimate[]> {
    this.cutoffs.push({ table, cutoff: cutoff.toISOString(), organizationId });
    return Promise.resolve(
      this.periods.map((period) => ({ name: `${table}_x`, period, estimatedRows: 0, bytes: 0 })),
    );
  }

  public dropTenantPartitions(organizationId: string): Promise<readonly string[]> {
    this.drops.push(organizationId);
    return Promise.resolve(["a", "b", "c"]);
  }
}

class FakeActivity implements ActivityLogger {
  public readonly rows: { organizationId: string; action: string }[] = [];

  public record(actor: Principal, action: string): Promise<void> {
    this.rows.push({ organizationId: actor.organizationId, action });
    return Promise.resolve();
  }
}

class FakeInvalidator implements Partial<CapabilityInvalidator> {
  public readonly flushed: string[] = [];

  public invalidateOrganization(organizationId: string): Promise<void> {
    this.flushed.push(organizationId);
    return Promise.resolve();
  }
}

class FakeProjector implements Partial<AnalyticsProjector> {
  public readonly forgotten: string[] = [];

  public deleteTenant(organizationId: string): Promise<void> {
    this.forgotten.push(organizationId);
    return Promise.resolve();
  }
}

const actor = (...platform: readonly PermissionKey[]): Principal =>
  new Principal(
    PLATFORM,
    ACTOR,
    CapabilitySet.from({
      wildcard: false,
      org: { grants: [], denies: [] },
      goals: {},
      platform: { grants: platform, denies: [] },
    }),
  );

interface Parts {
  readonly tenants: FakeTenants;
  readonly archive: FakeArchive;
  readonly maintenance: FakeMaintenance;
  readonly activity: FakeActivity;
  readonly capabilities: FakeInvalidator;
  readonly projector: FakeProjector | null;
}

const build = (overrides: Partial<Parts> = {}) => {
  const parts: Parts = {
    tenants: new FakeTenants(),
    archive: new FakeArchive(),
    maintenance: new FakeMaintenance(),
    activity: new FakeActivity(),
    capabilities: new FakeInvalidator(),
    projector: new FakeProjector(),
    ...overrides,
  };

  const unitOfWork = { run: (work: () => Promise<unknown>) => work() } as unknown as UnitOfWork;
  const platform = {
    organizationId: () => Promise.resolve(PLATFORM),
    organization: () => Promise.resolve({ id: PLATFORM, slug: "platform", name: "Platform" }),
  } as unknown as PlatformReader;

  return {
    parts,
    useCase: new DeleteOrganizationUseCase(
      new Authorizer(),
      parts.tenants,
      parts.archive as unknown as PartitionArchiveGateway,
      parts.maintenance as unknown as MaintenanceGateway,
      parts.capabilities as unknown as CapabilityInvalidator,
      platform,
      parts.activity,
      unitOfWork,
      { now: () => NOW },
      parts.projector as unknown as AnalyticsProjector | null,
    ),
  };
};

const input = { organizationId: TENANT, slug: "acme" };

describe("DeleteOrganizationUseCase", () => {
  it("refuses an actor without the platform key", async () => {
    await expect(build().useCase.execute(actor(), input)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("is NOT_FOUND for a tenant that is already gone", async () => {
    const { useCase } = build({ tenants: new FakeTenants(null) });
    await expect(useCase.execute(actor("platform.tenant.manage"), input)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  // The tier holds the platform roles every admin's capability comes from, this one
  // included: deleting it locks the deployment out of its own platform screens.
  it("refuses the platform organization", async () => {
    const tenants = new FakeTenants({ ...TENANT_ROW, isPlatform: true });
    await expect(
      build({ tenants }).useCase.execute(actor("platform.tenant.manage"), input),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses a slug that does not match", async () => {
    await expect(
      build().useCase.execute(actor("platform.tenant.manage"), {
        organizationId: TENANT,
        slug: "acme-inc",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  // The cutoff is the first of *next* month, not now: the partitions are about to be
  // dropped, so a month left unarchived is rows nothing can hand back.
  it("archives every month that exists, including the current one", async () => {
    const maintenance = new FakeMaintenance([new Date(Date.UTC(2026, 7, 1))]);
    const { parts, useCase } = build({ maintenance });

    const result = await useCase.execute(actor("platform.tenant.manage"), input);

    expect(maintenance.cutoffs.every((call) => call.cutoff === "2026-09-01T00:00:00.000Z")).toBe(
      true,
    );
    expect(maintenance.cutoffs.map((call) => call.table)).toEqual([
      "activity_log",
      "notifications",
      "messages",
    ]);
    expect(parts.archive.calls.every((call) => call.organizationId === TENANT)).toBe(true);
    expect(result.archived).toBe(3);
  });

  // The order is the behaviour: archive, then drop, then delete the row. A drop before
  // the archive is the month gone with nothing to hand back.
  it("drops the partitions before deleting the row", async () => {
    const { parts, useCase } = build();
    const result = await useCase.execute(actor("platform.tenant.manage"), input);

    expect(parts.maintenance.drops).toEqual([TENANT]);
    expect(parts.tenants.deleted).toEqual([TENANT]);
    expect(result.partitions).toBe(3);
  });

  // Rebased onto the tier, which is the only reason the row survives the delete: under
  // the tenant it would be a partition that no longer exists.
  it("records the audit row under the platform organization", async () => {
    const { parts, useCase } = build();
    await useCase.execute(actor("platform.tenant.manage"), input);

    expect(parts.activity.rows).toEqual([{ organizationId: PLATFORM, action: "tenant.deleted" }]);
  });

  it("flushes the capability cache and forgets the tenant in the derived store", async () => {
    const { parts, useCase } = build();
    await useCase.execute(actor("platform.tenant.manage"), input);

    expect(parts.capabilities.flushed).toEqual([TENANT]);
    expect(parts.projector?.forgotten).toEqual([TENANT]);
  });

  // Skipped rather than failed: with no analytics store there is no derived copy to
  // forget, and a deployment running without one must still be able to delete a tenant.
  it("completes with no analytics store configured", async () => {
    const { useCase } = build({ projector: null });
    await expect(useCase.execute(actor("platform.tenant.manage"), input)).resolves.toEqual({
      archived: 0,
      partitions: 3,
    });
  });
});
