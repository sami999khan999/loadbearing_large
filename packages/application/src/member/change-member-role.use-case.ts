import { ConflictError, NotFoundError, type RoleId, type UserId } from "../import.js";
import type { ActivityLogger, CapabilityInvalidator, UnitOfWork } from "../port/index.js";
import type { Authorizer, Principal } from "../primitive/index.js";
import type { RoleRepository } from "../rbac/index.js";
import type { MemberRecord, MemberRepository } from "./member.repository.js";
import { MemberRules } from "./member.rules.js";

export interface ChangeMemberRoleInput {
  readonly userId: UserId;
  readonly roleId: RoleId;
}

// Moving someone between roles. The rule that makes it interesting is the one it
// refuses: a tenant with no active owner cannot be recovered from inside the product.
export class ChangeMemberRoleUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly members: MemberRepository,
    private readonly roles: RoleRepository,
    private readonly capabilities: CapabilityInvalidator,
    private readonly activity: ActivityLogger,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  public async execute(actor: Principal, input: ChangeMemberRoleInput): Promise<MemberRecord> {
    this.authorizer.assert(actor, "member.role.change");

    const member = await this.members.findByUser(actor.organizationId, input.userId);
    if (!member) throw new NotFoundError("member", input.userId);

    // Under the actor's tenant, so a role id from another organization is not found
    // rather than assigned across the boundary.
    const role = await this.roles.findById(actor.organizationId, input.roleId);
    if (!role) throw new NotFoundError("role", input.roleId);

    if (member.roleId === role.id) return member;

    // Demoting the last active owner leaves nobody who can promote one back.
    if (MemberRules.isOwner(member) && !MemberRules.isOwnerKey(role.key)) {
      await this.assertNotLastOwner(actor);
    }

    await this.unitOfWork.run(async () => {
      await this.members.changeRole(actor.organizationId, member.userId, role.id);
      await this.activity.record(actor, "member.role.changed", {
        userId: member.userId,
        fromRoleId: member.roleId,
        toRoleId: role.id,
      });
    });

    // The new role decides what this person may do, and the old set is cached for a
    // minute. After the commit, so a concurrent read cannot re-cache what was replaced.
    await this.capabilities.invalidate(actor.organizationId, member.userId);

    return { ...member, roleId: role.id, roleKey: role.key, roleName: role.name };
  }

  private async assertNotLastOwner(actor: Principal): Promise<void> {
    const owners = await this.members.countActiveOwners(actor.organizationId);
    if (owners <= 1) throw new ConflictError("member", "lastOwner");
  }
}
