import type { MemberRecord } from "./member.repository.js";

// The two questions the lifecycle use-cases both ask, in one place: written twice they
// would eventually disagree about what "owner" means.
export class MemberRules {
  private constructor() {}

  // The seeded wildcard role. `SystemRoleSeed` creates it per tenant, so the key is
  // the stable handle rather than any particular row's id.
  public static readonly OWNER_KEY = "owner";

  public static isOwnerKey(key: string): boolean {
    return key === MemberRules.OWNER_KEY;
  }

  public static isOwner(member: MemberRecord): boolean {
    return MemberRules.isOwnerKey(member.roleKey);
  }
}
