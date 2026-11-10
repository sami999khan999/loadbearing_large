import type { OrganizationId } from "../import.js";

// One row of the platform report: tokens for one tenant, one model and one UTC day.
export interface AssistantUsageRow {
  readonly organizationId: OrganizationId;
  readonly model: string;
  readonly day: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly answers: number;
}

// The read side of the derived copy, and the one place usage is summed across tenants.
// Never the projector: a report must not hold the object that writes.
export abstract class AssistantUsageReader {
  // `[from, to)`, both ISO days. At most `limit` rows, largest first.
  public abstract usageByDay(
    from: string,
    to: string,
    limit: number,
  ): Promise<readonly AssistantUsageRow[]>;
}
