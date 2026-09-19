import {
  type ActivityLogger,
  and,
  CapabilitySet,
  eq,
  InternalError,
  type OrganizationId,
  type Placement,
  Principal,
  type UserId,
  Uuid,
} from "../../import.js";
import { BaseRepository, type DatabaseCluster } from "../primitive/index.js";
import { memberships, organizations, roles, shardAssignments } from "../schema/index.js";
import { SystemRoleSeed, TenantPartitionSeed } from "../seed/index.js";
import type { ShardScope, TransactionScope } from "../transaction/index.js";

// The role the person who founds a tenant gets. There is no second branch: a founded
// organization has exactly one member.
const FOUNDER_ROLE = "owner";

// The same shape `OrganizationFounder` in `auth` declares, restated because this package
// cannot import it — the same reason `InvitationPreview` is restated.
export interface OrganizationFounder {
  found(userId: UserId, name: string, slug?: string): Promise<OrganizationId>;
}

// One implementation of "create a tenant and own it", called from the personal enroller
// and from the create endpoint. See docs/reference/enrollers.md.
export class PgOrganizationFounder extends BaseRepository {
  // `organizations` and the RBAC it seeds, in one transaction.
  protected override readonly placement: Placement = "catalog";

  private readonly systemRoles = new SystemRoleSeed(this.cluster, this.scope, this.shards);
  private readonly partitions = new TenantPartitionSeed(this.cluster, this.scope, this.shards);

  public constructor(
    cluster: DatabaseCluster,
    scope: TransactionScope,
    shards: ShardScope,
    private readonly activity: ActivityLogger,
  ) {
    super(cluster, scope, shards);
  }

  // `this.db`, not `this.database.client`: inside the enroller's transaction this is a
  // savepoint, standalone it is a transaction of its own.
  public async found(userId: UserId, name: string, slug?: string): Promise<OrganizationId> {
    return this.db.transaction(async (tx) =>
      this.scope.within(tx, "catalog", async () => {
        const organizationId = Uuid.v7() as OrganizationId;

        await this.db.insert(organizations).values({
          id: organizationId,
          // Derived from an id, never from the name: a slug built from user input needs
          // a normalisation pass and a collision strategy, and nothing routes by slug.
          slug: slug ?? `o-${organizationId}`,
          name,
        });

        // **Inside the transaction that creates the tenant**, which is what lets
        // `PgShardResolver` throw on a missing row rather than guess node 0.
        await this.db
          .insert(shardAssignments)
          .values({ shardKey: organizationId, node: 0 })
          .onConflictDoNothing();

        // Before anything writes a tenant-owned row: `activity.record` below writes into
        // one of those partitioned tables inside this same transaction.
        await this.partitions.run(organizationId);

        // Reused, not reimplemented, so an organization created here holds exactly the
        // grants `pnpm db:seed` would have given it.
        await this.systemRoles.run(organizationId);

        const [role] = await this.db
          .select({ id: roles.id })
          .from(roles)
          .where(and(eq(roles.organizationId, organizationId), eq(roles.key, FOUNDER_ROLE)))
          .limit(1);

        // Unreachable unless `SystemRoleSeed` stops defining `owner`. Throwing rolls
        // the whole tenant back, which beats a tenant nobody can administer.
        if (!role) throw new InternalError(new Error("SystemRoleSeed defines no owner role."));

        await this.db
          .insert(memberships)
          .values({ id: Uuid.v7(), organizationId, userId, roleId: role.id });

        // The tenant just created, not the caller's. An empty capability set: the logger
        // reads only the organization and the actor off it.
        await this.activity.record(
          new Principal(organizationId, userId, CapabilitySet.empty()),
          "organization.created",
          { name },
        );

        return organizationId;
      }),
    );
  }
}
