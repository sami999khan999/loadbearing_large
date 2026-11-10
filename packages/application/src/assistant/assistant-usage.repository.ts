import type { OrganizationId, UserId } from "../import.js";
import type { ProjectionCheckpoint } from "../port/index.js";

export interface AssistantUsageRecord {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly userId: UserId;
  readonly threadId: string;
  readonly messageId: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly createdAt: Date;
}

export interface AssistantUsageTotal {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly answers: number;
}

// The meter, append-only: one row per settled answer, in `ai_usage`.
export abstract class AssistantUsageRepository {
  public abstract save(usage: AssistantUsageRecord): Promise<void>;

  // One tenant's tokens since `since`, for the org admin's own usage view.
  public abstract totalSince(
    organizationId: OrganizationId,
    since: Date,
  ): Promise<AssistantUsageTotal>;

  // The projection's walk: keyset on `(createdAt, id)` within one tenant, oldest first,
  // and never past `until`, the settle horizon the activity walk uses for the same reason.
  public abstract since(
    organizationId: OrganizationId,
    after: ProjectionCheckpoint,
    limit: number,
    until: Date,
  ): Promise<readonly AssistantUsageRecord[]>;
}
