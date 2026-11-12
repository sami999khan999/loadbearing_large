import type { OrganizationId } from "../import.js";

// Which tenants wrote rows the projection has not walked yet (`CR.20`), so a run visits
// those and not every tenant. A lost mark costs one sweep's delay, never a row.
export abstract class ProjectionBacklogStore {
  // Never throws: a write must not fail because the mark did. Keeps the latest `at`.
  public abstract mark(organizationId: OrganizationId, at: Date): Promise<void>;

  // Oldest mark first, at most `limit`. Throws when the store cannot be asked.
  public abstract pending(limit: number): Promise<readonly OrganizationId[]>;

  // Removes the mark only if it is no later than `through`: a write after it stays marked.
  public abstract clear(organizationId: OrganizationId, through: Date): Promise<void>;
}
