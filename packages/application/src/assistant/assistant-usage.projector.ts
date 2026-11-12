import type { OrganizationId } from "../import.js";
import type { ProjectionCheckpoint } from "../port/index.js";
import type { AssistantUsageRecord } from "./assistant-usage.repository.js";

// The only writer of the derived copy of `ai_usage`. Its own port beside
// `AnalyticsProjector`, so the activity projection's retention and policy stay its own.
export abstract class AssistantUsageProjector {
  // Read from the derived store itself, per tenant, as the activity projection does.
  public abstract checkpoint(organizationId: OrganizationId): Promise<ProjectionCheckpoint>;

  // Idempotent: rows are keyed on the usage id, so a redelivered batch overwrites.
  public abstract project(records: readonly AssistantUsageRecord[]): Promise<number>;

  public abstract deleteTenant(organizationId: OrganizationId): Promise<void>;
}
