import type {
  AssistantUsageProjector,
  AssistantUsageRecord,
  OrganizationId,
  ProjectionCheckpoint,
} from "../import.js";
import type { ClickHouseConnection } from "./clickhouse.connection.js";

// The only writer to `ai_usage_events`, which keeps it derived from `ai_usage`. The same
// shape as the activity projector; see docs/reference/clickhouse.md.
export class ClickHouseAssistantUsageProjector implements AssistantUsageProjector {
  private static readonly TABLE = "ai_usage_events";

  public constructor(private readonly connection: ClickHouseConnection) {}

  // Read from the destination, per tenant. An empty table answers 1970 rather than null.
  public async checkpoint(organizationId: OrganizationId): Promise<ProjectionCheckpoint> {
    const rows = await this.connection.query<{
      readonly last_created_at: string | null;
      readonly last_id: string | null;
    }>(
      `
      SELECT
        toString(max(created_at))       AS last_created_at,
        argMax(id, (created_at, id))    AS last_id
      FROM ${this.connection.qualified(ClickHouseAssistantUsageProjector.TABLE)}
      WHERE organization_id = {organizationId:UUID}
    `,
      { organizationId },
    );

    const row = rows[0];
    if (!row?.last_created_at || row.last_created_at.startsWith("1970-01-01")) {
      return { lastOccurredAt: null, lastId: null };
    }

    return {
      lastOccurredAt: new Date(`${row.last_created_at.replace(" ", "T")}Z`),
      lastId: row.last_id,
    };
  }

  public async project(records: readonly AssistantUsageRecord[]): Promise<number> {
    if (records.length === 0) return 0;

    await this.connection.insert(
      ClickHouseAssistantUsageProjector.TABLE,
      records.map((record) => ({
        id: record.id,
        organization_id: record.organizationId,
        created_at: record.createdAt.toISOString().replace("T", " ").replace("Z", ""),
        user_id: record.userId,
        thread_id: record.threadId,
        message_id: record.messageId,
        model: record.model,
        input_tokens: record.inputTokens,
        output_tokens: record.outputTokens,
      })),
    );

    return records.length;
  }

  public async deleteTenant(organizationId: OrganizationId): Promise<void> {
    const table = this.connection.qualified(ClickHouseAssistantUsageProjector.TABLE);
    await this.connection.command(
      `DELETE FROM ${table} WHERE organization_id = {organizationId:UUID}`,
      { organizationId },
    );
  }
}
