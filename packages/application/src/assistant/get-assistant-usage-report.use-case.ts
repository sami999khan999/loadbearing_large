import type { Clock } from "../import.js";
import type { OrganizationReader } from "../port/index.js";
import type { Authorizer, Principal } from "../primitive/index.js";
import type { AssistantUsageReader, AssistantUsageRow } from "./assistant-usage.reader.js";

export interface GetAssistantUsageReportInput {
  readonly days: 7 | 30 | 90;
}

export interface AssistantUsageReportRow extends AssistantUsageRow {
  readonly organizationName: string | null;
}

export interface AssistantUsageReport {
  // False without the analytics store: the panel says so rather than reading as zero.
  readonly configured: boolean;
  readonly from: string;
  readonly to: string;
  readonly rows: readonly AssistantUsageReportRow[];
  // True when `ROW_LIMIT` cut the report, so the panel can say it is the largest rows.
  readonly truncated: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1_000;

// The platform's view of assistant spend: tokens by tenant, model and day, read from
// the analytics store because a sum across tenants is never a Postgres query.
export class GetAssistantUsageReportUseCase {
  private static readonly ROW_LIMIT = 500;

  public constructor(
    private readonly authorizer: Authorizer,
    private readonly reader: AssistantUsageReader | null,
    private readonly organizations: OrganizationReader,
    private readonly clock: Clock,
  ) {}

  public async execute(
    actor: Principal,
    input: GetAssistantUsageReportInput,
  ): Promise<AssistantUsageReport> {
    this.authorizer.assert(actor, "platform.analytics.read");

    const now = this.clock.now();
    const tomorrow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    const from = new Date(tomorrow - input.days * DAY_MS).toISOString().slice(0, 10);
    const to = new Date(tomorrow).toISOString().slice(0, 10);

    if (!this.reader) return { configured: false, from, to, rows: [], truncated: false };

    const limit = GetAssistantUsageReportUseCase.ROW_LIMIT;
    const rows = await this.reader.usageByDay(from, to, limit + 1);
    const kept = rows.slice(0, limit);
    // One catalog read for every tenant on the page, never one per row.
    const ids = [...new Set(kept.map((row) => row.organizationId))];
    const names = await this.organizations.namesOf(ids);

    return {
      configured: true,
      from,
      to,
      truncated: rows.length > limit,
      rows: kept.map((row) => ({
        ...row,
        organizationName: names.get(row.organizationId) ?? null,
      })),
    };
  }
}
