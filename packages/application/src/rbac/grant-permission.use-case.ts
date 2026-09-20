import { ForbiddenError, NotFoundError, type RoleId } from "../import.js";
import type { ActivityLogger, CapabilityInvalidator, UnitOfWork } from "../port/index.js";
import type { Authorizer, Principal } from "../primitive/index.js";
import type { RoleRecord, RoleRepository } from "./role.repository.js";
import { RoleRules } from "./role.rules.js";

export interface GrantPermissionInput {
  readonly roleId: RoleId;
  readonly permission: string;
}

// Adding one permission to one role, and refusing to add one the actor does not hold:
// without that, `rbac.permission.grant` is the only key anyone ever needs.
export class GrantPermissionUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly roles: RoleRepository,
    private readonly capabilities: CapabilityInvalidator,
    private readonly activity: ActivityLogger,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  public async execute(actor: Principal, input: GrantPermissionInput): Promise<RoleRecord> {
    this.authorizer.assert(actor, "rbac.permission.grant");

    // Narrowed to a `PermissionKey` here, which is what lets `actor.can` be asked about
    // it below — an unrecognised string is a validation failure, not a denial.
    const permission = RoleRules.assertKnownPermission(input.permission);

    // No escalation: an owner holds the wildcard and passes for everything, so this
    // only ever refuses someone handing out more than they were given.
    if (!actor.can(permission)) throw new ForbiddenError(permission);

    const role = await this.roles.findById(actor.organizationId, input.roleId);
    if (!role) throw new NotFoundError("role", input.roleId);
    RoleRules.assertEditable(role);

    if (role.permissions.includes(permission)) return role;

    // One row, not the whole set. `save` reconciles against the list read above, so two
    // concurrent grants each wrote the set the other had not seen and one was lost.
    const updated = await this.unitOfWork.run(async () => {
      await this.roles.savePermission(actor.organizationId, role.id, permission);
      await this.activity.record(actor, "role.permission.granted", {
        roleId: role.id,
        permission,
      });

      // Re-read inside the transaction, so the answer includes a grant that landed
      // between this caller's read and its write rather than silently dropping it.
      return this.roles.findById(actor.organizationId, role.id);
    });

    // After the commit, never inside it: a flush while the old row is still the
    // committed one lets a concurrent read put the stale set straight back.
    await this.capabilities.invalidateOrganization(actor.organizationId);

    // The row cannot be gone: the transaction above wrote to it. Falling back keeps the
    // return type honest without a throw for a case the database rules out.
    return updated ?? role;
  }
}
