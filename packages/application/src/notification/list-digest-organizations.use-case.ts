import type { OrganizationId } from "../import.js";
import type { Principal } from "../primitive/index.js";
import type { NotificationPreferenceRepository } from "./notification-preference.repository.js";

// Cross-tenant, and reachable only from the worker's digest fan-out. It asserts no
// permission, for the reason `SendMailUseCase` gives in docs/reference/ports.md.
export class ListDigestOrganizationsUseCase {
  public constructor(private readonly preferences: NotificationPreferenceRepository) {}

  public execute(actor: Principal): Promise<readonly OrganizationId[]> {
    void actor;
    return this.preferences.organizationsWithDigest();
  }
}
