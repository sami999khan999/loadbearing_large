import {
  ConflictError,
  type PermissionKey,
  PermissionRegistry,
  ValidationError,
} from "../import.js";
import type { RoleRecord } from "./role.repository.js";

// Frozen at module load rather than a `static readonly`, which freezes the binding and
// not the array.
const RESERVED_KEYS: ReadonlySet<string> = Object.freeze(
  new Set(["owner", "admin", "member", "guest"]),
);

// The rules every role write shares. Written once, because a create that allows what an
// update refuses is a hole reachable by creating and then editing.
export class RoleRules {
  private constructor() {}

  // `SystemRoleSeed` resolves its rows by `(organization_id, key)` and grants them its
  // own permission list. A user-created `owner` would collect the wildcard on re-seed.
  public static isReservedKey(key: string): boolean {
    return RESERVED_KEYS.has(key);
  }

  public static reservedKeys(): readonly string[] {
    return [...RESERVED_KEYS];
  }

  // Seeded rows are rewritten on every deploy, so an edit survives until the next one
  // and then vanishes with no trace and no error.
  public static assertEditable(role: RoleRecord): void {
    if (role.isSystem) throw new ConflictError("role", "system");
  }

  public static assertKnownPermission(permission: string): PermissionKey {
    if (!PermissionRegistry.instance.isKnown(permission)) {
      throw new ValidationError([{ field: "permission", rule: "unknown" }]);
    }
    return permission;
  }
}
