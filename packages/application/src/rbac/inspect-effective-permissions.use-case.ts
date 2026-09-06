import type { CapabilitySet, UserId } from "../import.js";
import { NotFoundError } from "../import.js";
import type { MemberRepository } from "../member/index.js";
import type { Authorizer, Principal } from "../primitive/index.js";
import type { CapabilityRepository } from "./capability.repository.js";

export interface InspectEffectivePermissionsInput {
  readonly userId: UserId;
}

// "What can this person actually do here" — resolved from the same repository
// `CapabilityCache` reads, so the answer is the one `Authorizer.assert()` would give.
export class InspectEffectivePermissionsUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly members: MemberRepository,
    private readonly capabilities: CapabilityRepository,
  ) {}

  public async execute(
    actor: Principal,
    input: InspectEffectivePermissionsInput,
  ): Promise<CapabilitySet> {
    this.authorizer.assert(actor, "rbac.effective.inspect");

    // Membership first: without it, a uuid from another tenant would resolve to an
    // empty set and read as "this person has no permissions" rather than "not here".
    const member = await this.members.findByUser(actor.organizationId, input.userId);
    if (!member) throw new NotFoundError("member", input.userId);

    return this.capabilities.resolveFor(actor.organizationId, member.userId);
  }
}
