import type { AssistantUsageReader, AssistantUsageRow, OrganizationId } from "../import.js";
import type { ClickHouseConnection } from "./clickhouse.connection.js";

// The read side of `ai_usage_events`, and the one sum across tenants: it lives here
// because no Postgres query may span tenants.
export class ClickHouseAssistantUsageReader implements AssistantUsageReader {
  private static readonly TABLE = "ai_usage_events";

  public constructor(private readonly connection: ClickHouseConnection) {}

  // `FINAL`, so an unmerged redelivery is not counted twice. Largest first, so a cut
  // report keeps the rows that matter.
  public async usageByDay(
    from: string,
    to: string,
    limit: number,
  ): Promise<readonly AssistantUsageRow[]> {
    const rows = await this.connection.query<{
      readonly organization_id: string;
      readonly model: string;
      readonly day: string;
      readonly input_tokens: string | number;
      readonly output_tokens: string | number;
      readonly answers: string | number;
    }>(
      `
      SELECT
        toString(organization_id)                        AS organization_id,
        model,
        formatDateTime(toDate(created_at), '%Y-%m-%d')   AS day,
        sum(input_tokens)                                AS input_tokens,
        sum(output_tokens)                               AS output_tokens,
        count()                                          AS answers
      FROM ${this.connection.qualified(ClickHouseAssistantUsageReader.TABLE)} FINAL
      WHERE created_at >= {from:DateTime64(3)} AND created_at < {to:DateTime64(3)}
      GROUP BY organization_id, model, day
      ORDER BY input_tokens + output_tokens DESC, day DESC
      LIMIT {limit:UInt32}
    `,
      {
        from: new Date(`${from}T00:00:00.000Z`),
        to: new Date(`${to}T00:00:00.000Z`),
        limit,
      },
    );

    // ClickHouse sends a `UInt64` as a string over JSON, so every count is converted here.
    return rows.map((row) => ({
      organizationId: row.organization_id as OrganizationId,
      model: row.model,
      day: row.day,
      inputTokens: Number(row.input_tokens),
      outputTokens: Number(row.output_tokens),
      answers: Number(row.answers),
    }));
  }
}
