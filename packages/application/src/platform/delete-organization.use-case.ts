import { ConflictError, NotFoundError, type OrganizationId } from "../import.js";
import type {
  ActivityLogger,
  AnalyticsProjector,
  CapabilityInvalidator,
  MaintenanceGateway,
  PartitionArchiveGateway,
  UnitOfWork,
} from "../port/index.js";
import type { Authorizer } from "../primitive/index.js";
import { PartitionedTable, Principal } from "../primitive/index.js";
import type { PlatformReader } from "./platform.reader.js";
import type { TenantRepository } from "./tenant.repository.js";
import type { TenantRetentionPolicyRepository } from "./tenant-retention-policy.repository.js";

export interface DeleteOrganizationInput {
  readonly organizationId: OrganizationId;
  // Typed by the operator and compared here, not only in the browser: a confirmation
  // the server does not check is a confirmation the API does not have.
  readonly slug: string;
}

export interface DeletedOrganization {
  readonly archived: number;
  readonly partitions: number;
}

export class DeleteOrganizationUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly tenants: TenantRepository,
    private readonly archive: PartitionArchiveGateway,
    private readonly maintenance: MaintenanceGateway,
    private readonly capabilities: CapabilityInvalidator,
    private readonly platform: PlatformReader,
    private readonly activity: ActivityLogger,
    private readonly unitOfWork: UnitOfWork,
    private readonly clock: { now(): Date },
    // Absent on a deployment running no analytics store. Skipped rather than failed:
    // there is no derived copy to forget.
    private readonly projector: AnalyticsProjector | null,
    // The overrides. No foreign key on that table — the schema says so, and says
    // the delete path sweeps it — and `deleteFor` had no caller anywhere.
    private readonly tenantRetention: TenantRetentionPolicyRepository,
  ) {}

  public async execute(
    actor: Principal,
    input: DeleteOrganizationInput,
  ): Promise<DeletedOrganization> {
    this.authorizer.assert(actor, "platform.tenant.manage");

    const tenant = await this.tenants.findBy(input.organizationId);
    if (!tenant) throw new NotFoundError("organization", input.organizationId);

    // The tier holds the platform roles every admin's capability comes from, this one
    // included. Deleting it locks the deployment out of its own platform screens.
    if (tenant.isPlatform) throw new ConflictError("organization", "platform");
    if (tenant.slug !== input.slug) throw new ConflictError("organization", "slug");

    const archived = await this.archiveEverything(input.organizationId);

    // Outside the transaction, and before it: dropping a partition is a catalog edit,
    // and a transaction holding seven of them blocks every other DDL in the system.
    const partitions = await this.maintenance.dropTenantPartitions(input.organizationId);

    const auditor = new Principal(
      await this.platform.organizationId(),
      actor.userId,
      actor.capabilities,
      actor.kind,
    );

    // Before the row goes. The sweep reads this and nothing else, so a delete that
    // skipped it would leave the objects in the bucket with nothing to end their window.
    await this.archive.markTenantDeleted(input.organizationId, this.clock.now());

    await this.unitOfWork.run(async () => {
      await this.tenantRetention.deleteFor(input.organizationId);
      await this.tenants.delete(input.organizationId);

      // Rebased onto the tier, which is the only reason this row survives the delete
      // at all: under the tenant it would be a partition that no longer exists.
      await this.activity.record(auditor, "tenant.deleted", {
        organizationId: input.organizationId,
        slug: tenant.slug,
        name: tenant.name,
        archivedObjects: archived,
        partitions: partitions.length,
      });
    });

    // After the commit. A cache flushed before it would be refilled from rows the
    // transaction had not removed yet, which is the stale entry it was meant to stop.
    await this.capabilities.invalidateOrganization(input.organizationId);
    await this.projector?.deleteTenant(input.organizationId);

    return { archived, partitions: partitions.length };
  }

  // Every month that exists, not every month past a retention cutoff: the partitions
  // are about to be dropped, so an unarchived one is rows nothing can hand back.
  private async archiveEverything(organizationId: OrganizationId): Promise<number> {
    const now = this.clock.now();
    const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    let objects = 0;

    for (const table of PartitionedTable.MONTH_PARTITIONED) {
      if (table.tenantKey === null) continue;

      for (const period of await this.periodsBefore(table.name, cutoff, organizationId)) {
        const result = await this.archive.archive(table.name, period, organizationId);
        objects += result.objects.length;
      }
    }

    return objects;
  }

  private async periodsBefore(
    table: (typeof PartitionedTable.MONTH_PARTITIONED)[number]["name"],
    cutoff: Date,
    organizationId: OrganizationId,
  ): Promise<readonly Date[]> {
    const estimates = await this.maintenance.partitionsBefore(table, cutoff, organizationId);
    const periods = new Map<number, Date>();

    for (const estimate of estimates) periods.set(estimate.period.getTime(), estimate.period);

    return [...periods.values()].sort((left, right) => left.getTime() - right.getTime());
  }
}
