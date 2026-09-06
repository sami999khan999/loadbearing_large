import { z } from "../import.js";
import { Identifiers, Pagination } from "../primitive/index.js";

export class RoleContract {
  private constructor() {}

  // Mirrors `roles.scope`: an org-scoped role's grants apply tenant-wide, a
  // goal-scoped one only inside the goals a membership names.
  public static readonly scope = z.enum(["org", "goal"]);

  public static readonly entity = z.object({
    id: Identifiers.roleId,
    key: z.string().min(1),
    name: z.string().min(1),
    description: z.string().nullable(),
    scope: RoleContract.scope,
    // Seeded by `SystemRoleSeed` and re-seeded on every deploy. Surfaced because a UI
    // that lets someone edit `owner` is a UI that lets someone lock themselves out.
    isSystem: z.boolean(),
    // Raw strings, filtered by `PermissionRegistry.isKnown()` at the point of use
    // rather than here: a renamed permission must not make this endpoint throw.
    permissions: z.array(z.string()).readonly(),
  });

  public static readonly listQuery = Pagination.query;

  // The wire shape of `CapabilitySetDto`, declared here rather than imported: a
  // contract is the boundary's own statement of the shape.
  public static readonly scopedSet = z.object({
    grants: z.array(z.string()).readonly(),
    denies: z.array(z.string()).readonly(),
  });

  public static readonly capabilities = z.object({
    wildcard: z.boolean(),
    org: RoleContract.scopedSet,
    // Keyed by goal id. A record rather than an array, because that is what
    // `CapabilitySet` indexes and a list would be re-keyed on every read.
    goals: z.record(z.string(), RoleContract.scopedSet),
  });

  public static readonly inspect = z.object({ userId: Identifiers.userId });
}

export type RoleDto = z.infer<typeof RoleContract.entity>;
export type CapabilitiesDto = z.infer<typeof RoleContract.capabilities>;
export type InspectEffectiveInput = z.infer<typeof RoleContract.inspect>;
