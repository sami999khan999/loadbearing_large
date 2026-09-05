import {
  type Clock,
  ConflictError,
  type InvitationId,
  NotFoundError,
  type RoleId,
  Token,
  Uuid,
} from "../import.js";
import type { ActivityLogger, UnitOfWork } from "../port/index.js";
import type { Authorizer, Principal } from "../primitive/index.js";
import type { RoleRepository } from "../rbac/role.repository.js";
import type { InvitationMailer } from "./invitation.mailer.js";
import type { InvitationRecord, InvitationRepository } from "./invitation.repository.js";
import type { MemberRepository } from "./member.repository.js";

export interface InviteMemberInput {
  readonly email: string;
  readonly roleId: RoleId;
}

// Seven days. Long enough to survive a weekend, short enough that a link forwarded
// months later opens nothing.
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// LOAD → AUTHORIZE → WORK → PERSIST, then the mail — after the commit, because an
// invitation message about a row that rolled back is a link to nothing.
export class InviteMemberUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly roles: RoleRepository,
    private readonly members: MemberRepository,
    private readonly invitations: InvitationRepository,
    private readonly mailer: InvitationMailer,
    private readonly activity: ActivityLogger,
    private readonly unitOfWork: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  public async execute(actor: Principal, input: InviteMemberInput): Promise<InvitationRecord> {
    this.authorizer.assert(actor, "member.invite");

    // A role id from another organization parses just as well, so looking it up under
    // the actor's tenant is what stops it.
    const role = await this.roles.findById(actor.organizationId, input.roleId);
    if (!role) throw new NotFoundError("role", input.roleId);

    // Lowercased once, here, so the unique index on `(organization_id, email)` sees one
    // address as one row.
    const email = input.email.trim().toLowerCase();

    if (await this.members.existsByEmail(actor.organizationId, email)) {
      throw new ConflictError("member", "already_member");
    }

    const now = this.clock.now();
    const id = Uuid.v7() as InvitationId;
    const token = Token.random();

    await this.unitOfWork.run(async () => {
      await this.invitations.save({
        id,
        organizationId: actor.organizationId,
        email,
        roleId: input.roleId,
        token,
        invitedBy: actor.userId,
        expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
        createdAt: now,
      });
      await this.activity.record(actor, "member.invited", { email, roleId: input.roleId });
    });

    // Read back rather than assembled: the names the mail carries are the row's joins.
    const saved = await this.invitations.findById(actor.organizationId, id);
    if (!saved) throw new NotFoundError("invitation", id);

    await this.mailer.send({
      to: saved.email,
      organizationName: saved.organizationName,
      inviterName: saved.inviterName,
      token,
    });

    return saved;
  }
}
