import { Identifiers } from "@loadbearing/contracts";
import { CapabilitySet, type PermissionKey } from "@loadbearing/permissions";
import { describe, expect, it } from "vitest";
import { ListRetentionPoliciesUseCase } from "../../src/platform/list-retention-policies.use-case.js";
import type { PlatformReader } from "../../src/platform/platform.reader.js";
import type {
  ProjectionPolicyRecord,
  ProjectionPolicyRepository,
} from "../../src/platform/projection-policy.repository.js";
import type {
  RetentionPolicyRecord,
  RetentionPolicyRepository,
} from "../../src/platform/retention-policy.repository.js";
import { UpdateRetentionPolicyUseCase } from "../../src/platform/update-retention-policy.use-case.js";
import type {
  ActivityLogger,
  AnalyticsProjector,
  StoragePolicyGateway,
  UnitOfWork,
} from "../../src/port/index.js";
import { Authorizer } from "../../src/primitive/authorizer.js";
import { Principal } from "../../src/primitive/principal.js";

const PLATFORM = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000001");
const ACTOR = Identifiers.userId.parse("018f8c00-0000-7000-8000-000000000011");

// One projected action with a window of its own. That clause is what a save through the
// retention screen used to erase, because it composed from the base months alone.
const PER_ACTION: readonly ProjectionPolicyRecord[] = [
  { action: "role.created", projected: true, ttlMonths: 120 },
];

class FakeProjection implements ProjectionPolicyRepository {
  public constructor(private readonly rows: readonly ProjectionPolicyRecord[] = PER_ACTION) {}

  public all(): Promise<readonly ProjectionPolicyRecord[]> {
    return Promise.resolve(this.rows);
  }

  public save(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeRetention implements Partial<RetentionPolicyRepository> {
  public readonly saved: RetentionPolicyRecord[] = [];

  public constructor(private rows: readonly RetentionPolicyRecord[] = []) {}

  public all(): Promise<readonly RetentionPolicyRecord[]> {
    return Promise.resolve(this.rows);
  }

  public save(record: RetentionPolicyRecord): Promise<void> {
    this.saved.push(record);
    this.rows = [
      ...this.rows.filter(
        (row) => !(row.store === record.store && row.tableName === record.tableName),
      ),
      record,
    ];
    return Promise.resolve();
  }
}

class FakeProjector implements Partial<AnalyticsProjector> {
  public readonly applied: string[] = [];

  public constructor(private held = "") {}

  public retention(): Promise<string> {
    return Promise.resolve(this.held);
  }

  public applyRetention(expression: string): Promise<void> {
    this.applied.push(expression);
    this.held = expression;
    return Promise.resolve();
  }
}

const storagePolicy = {
  lifecycle: () => Promise.resolve([]),
  applyLifecycle: () => Promise.resolve(),
  coldTier: () => null,
} as unknown as StoragePolicyGateway;

const activity = { record: () => Promise.resolve() } as unknown as ActivityLogger;
const unitOfWork = { run: (work: () => Promise<unknown>) => work() } as unknown as UnitOfWork;

const platform = {
  organizationId: () => Promise.resolve(PLATFORM),
} as unknown as PlatformReader;

const actor = (...keys: readonly PermissionKey[]): Principal =>
  new Principal(
    PLATFORM,
    ACTOR,
    CapabilitySet.from({
      wildcard: false,
      org: { grants: [], denies: [] },
      goals: {},
      platform: { grants: keys, denies: [] },
    }),
  );

const save = {
  store: "clickhouse" as const,
  tableName: "activity_events",
  hotMonths: 36,
  coldMonths: null,
  coldMode: "archive" as const,
};

// `R.15`. Saving a retention row rewrote the TTL from the base months alone, so every
// per-action clause vanished and the rows they kept expired at the default instead.
describe("UpdateRetentionPolicyUseCase — the ClickHouse TTL", () => {
  const build = (projector: FakeProjector, retention = new FakeRetention()) =>
    new UpdateRetentionPolicyUseCase(
      new Authorizer(),
      retention as unknown as RetentionPolicyRepository,
      storagePolicy,
      platform,
      activity,
      unitOfWork,
      projector as unknown as AnalyticsProjector,
      new FakeProjection(),
      () => {
        throw new Error("the apply step must not drift in this spec");
      },
    );

  it("keeps every per-action clause the save did not touch", async () => {
    const projector = new FakeProjector();

    await build(projector).execute(actor("platform.retention.manage"), save);

    expect(projector.applied).toHaveLength(1);
    expect(projector.applied[0]).toContain("toIntervalMonth(120) WHERE action = 'role.created'");
    // The exclusion is what stops the base clause deleting the rows the longer one keeps.
    expect(projector.applied[0]).toContain("NOT IN ('role.created')");
  });

  // `MODIFY TTL` materialises every existing part, so an unconditional write is a
  // rewrite of a years-deep table for a value that did not change.
  it("writes nothing when the store already holds the expression", async () => {
    const retention = new FakeRetention();
    const settled = new FakeProjector();
    await build(settled, retention).execute(actor("platform.retention.manage"), save);

    const again = new FakeProjector(settled.applied[0] ?? "");
    await build(again, retention).execute(actor("platform.retention.manage"), save);

    expect(again.applied).toEqual([]);
  });
});

// The screen composed `expected` the same wrong way, so it reported drift against a
// store that held exactly what the rows describe.
describe("ListRetentionPoliciesUseCase — what the screen calls expected", () => {
  it("expects the per-action clauses too, so a correct store reads as settled", async () => {
    const projector = new FakeProjector();
    await new UpdateRetentionPolicyUseCase(
      new Authorizer(),
      new FakeRetention() as unknown as RetentionPolicyRepository,
      storagePolicy,
      platform,
      activity,
      unitOfWork,
      projector as unknown as AnalyticsProjector,
      new FakeProjection(),
      () => undefined,
    ).execute(actor("platform.retention.manage"), save);

    const listed = await new ListRetentionPoliciesUseCase(
      new Authorizer(),
      new FakeRetention([{ ...save, store: "clickhouse" }]) as unknown as RetentionPolicyRepository,
      storagePolicy,
      projector as unknown as AnalyticsProjector,
      new FakeProjection(),
    ).execute(actor("platform.retention.read"));

    // Both halves: the clause is in `expected`, and `expected` equals what the store
    // holds. Equality alone passed while both sides were composed the same wrong way.
    expect(listed.clickhouse?.expected).toContain("WHERE action = 'role.created'");
    expect(listed.clickhouse?.expected).toBe(listed.clickhouse?.applied);
  });
});

// `26.4`, reopening D47: message months may be archived, but only as one group, and what a
// person wrote is never dropped or expired.
describe("UpdateRetentionPolicyUseCase — the message group", () => {
  const build = (retention: FakeRetention) =>
    new UpdateRetentionPolicyUseCase(
      new Authorizer(),
      retention as unknown as RetentionPolicyRepository,
      storagePolicy,
      platform,
      activity,
      unitOfWork,
      null,
      new FakeProjection(),
      () => undefined,
    );
  const messages = {
    store: "postgres" as const,
    tableName: "messages",
    hotMonths: 24,
    coldMonths: null,
    coldMode: "archive" as const,
  };

  it("writes messages, its reactions and its files together", async () => {
    const retention = new FakeRetention();
    await build(retention).execute(actor("platform.retention.manage"), messages);

    expect(retention.saved.map((row) => [row.tableName, row.hotMonths])).toEqual([
      ["messages", 24],
      ["message_reactions", 24],
      ["message_attachments", 24],
    ]);
  });

  it("refuses to drop a month, to expire one in cold, or to set a follower alone", async () => {
    const use = build(new FakeRetention());
    const as = actor("platform.retention.manage");

    await expect(use.execute(as, { ...messages, coldMode: "drop" })).rejects.toMatchObject({
      fields: [{ field: "coldMode", rule: "domainData" }],
    });
    await expect(use.execute(as, { ...messages, coldMonths: 12 })).rejects.toMatchObject({
      fields: [{ field: "coldMonths", rule: "domainData" }],
    });
    await expect(
      use.execute(as, { ...messages, tableName: "message_reactions" }),
    ).rejects.toMatchObject({ fields: [{ field: "tableName", rule: "group" }] });
  });
});
