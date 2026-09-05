import {
  CapabilitySet,
  type OrganizationId,
  type PermissionKey,
  PermissionRegistry,
  Principal,
  type UserId,
} from "./import.js";

export class SystemPrincipal {
  private constructor() {}

  // A fixed, reserved uuid rather than the organization's own: an actor column holding a
  // tenant id reads as a user.
  public static readonly USER_ID = "00000000-0000-7000-8000-000000000001";

  // Narrow, explicit and reviewed — never `PermissionRegistry.instance.all()`, and no
  // `core.*`: every resolved principal holds those. `string[]` so `isKnown()` narrows.
  private static readonly GRANTS: readonly string[] = ["ai.embedding.write", "ai.embedding.read"];

  // Every job carries an organization: there is no global data, so a job that processes
  // rows must know whose rows.
  public static forOrganization(organizationId: string): Principal {
    const registry = PermissionRegistry.instance;

    // At boot rather than at 3am, when the symptom is a job that silently started
    // failing authorization after a permission was renamed.
    const grants: PermissionKey[] = SystemPrincipal.GRANTS.map((key) => {
      if (!registry.isKnown(key)) {
        throw new Error(`System principal references unknown permission: ${key}`);
      }
      return key;
    });

    return Principal.system(
      organizationId as OrganizationId,
      SystemPrincipal.USER_ID as UserId,
      CapabilitySet.from({
        wildcard: false,
        org: { grants, denies: [] },
        goals: {},
      }),
    );
  }
}
