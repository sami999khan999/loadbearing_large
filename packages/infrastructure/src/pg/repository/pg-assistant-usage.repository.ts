import {
  type AssistantUsageRecord,
  type AssistantUsageRepository,
  type AssistantUsageTotal,
  and,
  asc,
  type Clock,
  eq,
  gte,
  lte,
  type OrganizationId,
  type Placement,
  type ProjectionBacklogStore,
  type ProjectionCheckpoint,
  sql,
} from "../../import.js";
import { BaseRepository, type DatabaseCluster } from "../primitive/index.js";
import { aiUsage } from "../schema/index.js";
import type { ShardScope, TransactionScope } from "../transaction/index.js";

export class PgAssistantUsageRepository extends BaseRepository implements AssistantUsageRepository {
  protected override readonly placement: Placement = "routed";

  public constructor(
    cluster: DatabaseCluster,
    scope: TransactionScope,
    shards: ShardScope,
    private readonly clock: Clock,
    // Null without a projection to tell, as on the activity logger (`CR.20`).
    private readonly backlog: ProjectionBacklogStore | null = null,
  ) {
    super(cluster, scope, shards);
  }

  public async save(usage: AssistantUsageRecord): Promise<void> {
    await this.db.insert(aiUsage).values(usage);
    await this.backlog?.mark(usage.organizationId, this.clock.now());
  }

  // Bounded below, so the read prunes to the months it covers.
  public async totalSince(
    organizationId: OrganizationId,
    since: Date,
  ): Promise<AssistantUsageTotal> {
    const [row] = await this.db
      .select({
        inputTokens: sql<string>`coalesce(sum(${aiUsage.inputTokens}), 0)`,
        outputTokens: sql<string>`coalesce(sum(${aiUsage.outputTokens}), 0)`,
        answers: sql<string>`count(*)`,
      })
      .from(aiUsage)
      .where(and(eq(aiUsage.organizationId, organizationId), gte(aiUsage.createdAt, since)));
    return {
      inputTokens: Number(row?.inputTokens ?? 0),
      outputTokens: Number(row?.outputTokens ?? 0),
      answers: Number(row?.answers ?? 0),
    };
  }

  public async since(
    organizationId: OrganizationId,
    after: ProjectionCheckpoint,
    limit: number,
    until: Date,
  ): Promise<readonly AssistantUsageRecord[]> {
    // The row constructor plus a bound on the leading column, as the activity walk does:
    // the `OR` form loses the index condition (`CR.29`).
    const resume =
      after.lastOccurredAt && after.lastId
        ? and(
            gte(aiUsage.createdAt, after.lastOccurredAt),
            sql`(${aiUsage.createdAt}, ${aiUsage.id}) > (${after.lastOccurredAt}, ${after.lastId}::uuid)`,
          )
        : undefined;

    // A standby when the job allows one, as the activity walk reads.
    const reader = await this.reader();
    return reader
      .select()
      .from(aiUsage)
      .where(and(eq(aiUsage.organizationId, organizationId), resume, lte(aiUsage.createdAt, until)))
      .orderBy(asc(aiUsage.createdAt), asc(aiUsage.id))
      .limit(limit);
  }
}
