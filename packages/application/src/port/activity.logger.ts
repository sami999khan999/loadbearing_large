import type { Principal } from "../primitive/index.js";

// The audit trail. `action` is a dotted past-tense string mirroring the permission
// vocabulary — `task.reactivated`, `rbac.role.granted`.
export abstract class ActivityLogger {
  // No `occurredAt` and no tenant: a caller that could pass its own timestamp is a
  // caller that can backdate an audit row.
  public abstract record(
    actor: Principal,
    action: string,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<void>;
}
