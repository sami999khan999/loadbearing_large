import { ValidationError } from "../import.js";
import type {
  ActivityLogger,
  AnalyticsProjector,
  StoragePolicyGateway,
  UnitOfWork,
} from "../port/index.js";
import type { Authorizer } from "../primitive/index.js";
import { PartitionedTable, Principal } from "../primitive/index.js";
import type { PlatformReader } from "./platform.reader.js";
import type { ProjectionPolicyRepository } from "./projection-policy.repository.js";
import { RetentionRules } from "./retention.rules.js";
import type {
  ColdMode,
  RetentionPolicyRepository,
  RetentionStore,
} from "./retention-policy.repository.js";

// The one name a `clickhouse` row may take. Not a `PartitionedTableName`: the analytics
// store holds one table and it is not partitioned by this system.
export const ANALYTICS_TABLE = "activity_events";

export interface UpdateRetentionPolicyInput {
  readonly store: RetentionStore;
  readonly tableName: string;
  readonly hotMonths: number;
  readonly coldMonths: number | null;
  readonly coldMode: ColdMode;
}

export class UpdateRetentionPolicyUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly policies: RetentionPolicyRepository,
    private readonly storagePolicy: StoragePolicyGateway,
    private readonly platform: PlatformReader,
    private readonly activity: ActivityLogger,
    private readonly unitOfWork: UnitOfWork,
    private readonly projector: AnalyticsProjector | null,
    // The per-action clauses. Composed from the base months alone, a save here erased
    // every one of them and the rows they were keeping expired at the default.
    private readonly projectionPolicies: ProjectionPolicyRepository,
    // Post-commit failures are logged rather than rethrown: the row is the truth and the
    // daily job closes the gap, so a bucket that was unreachable must not fail the save.
    private readonly onDrift: (error: unknown) => void,
  ) {}

  public async execute(actor: Principal, input: UpdateRetentionPolicyInput): Promise<void> {
    this.authorizer.assert(actor, "platform.retention.manage");

    UpdateRetentionPolicyUseCase.assertKnownTable(input);
    UpdateRetentionPolicyUseCase.assertMonths(input);
    UpdateRetentionPolicyUseCase.assertDomainData(input);

    // Rebased onto the tier: a platform admin's active tenant is whichever they switched
    // to, and an audit row under it would say a customer changed a global setting.
    const auditor = new Principal(
      await this.platform.organizationId(),
      actor.userId,
      actor.capabilities,
      actor.kind,
    );

    // A message month moves with its reactions and files, so one save writes the group.
    const tables =
      input.store === "postgres" && PartitionedTable.isDomainData(input.tableName)
        ? PartitionedTable.MESSAGE_GROUP
        : [input.tableName];

    await this.unitOfWork.run(async () => {
      for (const tableName of tables) await this.policies.save({ ...input, tableName });
      await this.activity.record(auditor, "platform.policy.changed", {
        store: input.store,
        tableName: input.tableName,
        hotMonths: input.hotMonths,
        coldMonths: input.coldMonths,
        coldMode: input.coldMode,
      });
    });

    // After the commit, never inside it: both calls reach a network, and holding a
    // transaction open across one is how a lock outlives the request that took it.
    await this.apply(input);
  }

  private async apply(input: UpdateRetentionPolicyInput): Promise<void> {
    try {
      const rows = await this.policies.all();
      await this.storagePolicy.applyLifecycle(
        RetentionRules.lifecycleFor(rows, this.storagePolicy.coldTier()),
      );

      if (input.store !== "clickhouse" || !this.projector) return;

      // Both tables, through the one composer the screen and the nightly job use. The
      // base clause alone dropped every per-action window this save did not touch.
      const expression = RetentionRules.clickhouseTtlFrom(
        rows,
        await this.projectionPolicies.all(),
      );

      // Compared before it is written, for the reason the daily job compares: `MODIFY
      // TTL` materialises every existing part, which on a years-deep table is a rewrite.
      if ((await this.projector.retention()) === expression) return;

      await this.projector.applyRetention(expression);
    } catch (error: unknown) {
      this.onDrift(error);
    }
  }

  // Never a free string, which is decision D37: Postgres accepts no bind parameter in
  // DDL, so the closed union is the injection boundary and this is where it is enforced.
  private static assertKnownTable(input: UpdateRetentionPolicyInput): void {
    const known =
      input.store === "clickhouse"
        ? input.tableName === ANALYTICS_TABLE
        : (PartitionedTable.NAMES as readonly string[]).includes(input.tableName);

    if (!known) throw new ValidationError([{ field: "tableName", rule: "unknown" }]);
  }

  // `26.4`: what a person wrote is archived and restorable, never dropped or expired, and
  // the group is set through `messages` alone so its three tables cannot drift apart.
  private static assertDomainData(input: UpdateRetentionPolicyInput): void {
    if (input.store !== "postgres" || !PartitionedTable.isDomainData(input.tableName)) return;
    if (input.tableName !== PartitionedTable.MESSAGES) {
      throw new ValidationError([{ field: "tableName", rule: "group" }]);
    }
    if (input.coldMode !== "archive") {
      throw new ValidationError([{ field: "coldMode", rule: "domainData" }]);
    }
    if (input.coldMonths !== null) {
      throw new ValidationError([{ field: "coldMonths", rule: "domainData" }]);
    }
  }

  // The same two bounds the check constraints hold. Here for the message; there for the
  // row somebody writes by hand.
  private static assertMonths(input: UpdateRetentionPolicyInput): void {
    if (!Number.isInteger(input.hotMonths) || input.hotMonths < 1) {
      throw new ValidationError([{ field: "hotMonths", rule: "min" }]);
    }

    if (input.coldMonths === null) return;
    if (!Number.isInteger(input.coldMonths) || input.coldMonths < 0) {
      throw new ValidationError([{ field: "coldMonths", rule: "min" }]);
    }
  }
}
