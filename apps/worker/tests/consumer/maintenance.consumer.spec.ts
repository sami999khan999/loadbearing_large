import type {
  ArchivedObject,
  PartitionEstimate,
  ProjectionPolicyRecord,
  RetentionPolicyRecord,
  TenantRetentionPolicyRecord,
} from "@loadbearing/application";
import { PartitionedTable } from "@loadbearing/application";
import type { Container } from "@loadbearing/composition";
import {
  FixedClock,
  InMemoryAnalyticsProjector,
  InMemoryOrganizationReader,
  InMemoryOutboxGateway,
  InMemoryPlatformPolicyRepository,
  InMemoryProjectionPolicyRepository,
  InMemoryRetentionPolicyRepository,
  InMemoryStoragePolicyGateway,
  InMemoryTenantRetentionPolicyRepository,
  RecordingMaintenanceGateway,
  RecordingPartitionArchiveGateway,
  TestContainer,
} from "@loadbearing/composition";
import { Identifiers, type OrganizationId } from "@loadbearing/contracts";
import type { Job } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import { MaintenanceConsumer } from "../../src/consumer/maintenance.consumer.js";

const NOW = new Date("2026-08-15T00:00:00Z");

// Two, and in this order: the runway walks tenants, and one tenant cannot tell a loop
// from a single call.
const FIRST = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000001");
const SECOND = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000002");
const TENANTS = [FIRST, SECOND] as const;

// Every month-partitioned table, per tenant where it has a tenant level. Derived rather
// than counted, so the next partitioned table is one allowlist line here too.
interface Run {
  readonly table: string;
  readonly organizationId: OrganizationId | null;
}

const RUNS: readonly Run[] = PartitionedTable.MONTH_PARTITIONED.flatMap((entry) =>
  entry.tenantKey
    ? TENANTS.map((organizationId): Run => ({ table: entry.name, organizationId }))
    : [{ table: entry.name, organizationId: null }],
);

// Every table the calendar drops something from. `messages` is domain data and is never
// dropped, so a prune pass that touched it would be the bug.
const RETAINED = PartitionedTable.MONTH_PARTITIONED.filter(
  (entry) => entry.retentionMonths !== null,
);

const estimate = (period: Date): PartitionEstimate => ({
  name: `partition_${period.getUTCFullYear()}_${period.getUTCMonth() + 1}`,
  period,
  estimatedRows: 10,
  bytes: 1024,
});

// `TestContainer` rather than an object literal of the four members this consumer
// touches: a port added to the container is a compile error there, and was silence here.
const archived = (organizationId: OrganizationId): ArchivedObject => ({
  organizationId,
  key: `cold/activity_log/2024/01/${organizationId}.ndjson.gz`,
  rowCount: 4,
  bytes: 512,
  checksum: "sha-512",
  actionCounts: { "task.created": 4 },
});

function harness(
  options: {
    monthsAhead?: number;
    estimates?: readonly PartitionEstimate[];
    objects?: readonly ArchivedObject[];
    hasProjector?: boolean;
    projectedTo?: Date;
    // Empty by default, which is the state that matters: an absent row is the code
    // default, so most of these cases assert the allowlist's own numbers.
    policies?: readonly RetentionPolicyRecord[];
    // An override is what makes the prune pass walk tenants rather than months, so
    // most cases here stage none and assert the table-month path.
    tenantPolicies?: readonly TenantRetentionPolicyRecord[];
    // Empty for every case but the per-action TTL: an absent row is "projected, with
    // the default", so staging nothing asserts the behaviour before the table existed.
    projections?: readonly ProjectionPolicyRecord[];
    // Paused counts as disabled for the gap: a stamp needs a projection that is
    // running, and asking for a checkpoint while paused answers nothing.
    projectionEnabled?: boolean;
    lifecycle?: InMemoryStoragePolicyGateway;
  } = {},
) {
  const maintenance = new RecordingMaintenanceGateway(
    { sessions: 3, verifications: 1, invitations: 2 },
    options.monthsAhead,
    options.estimates,
  );
  const partitionArchive = new RecordingPartitionArchiveGateway(options.objects);
  const projector = new InMemoryAnalyticsProjector();
  const outbox = new InMemoryOutboxGateway();
  const retentionPolicies = new InMemoryRetentionPolicyRepository(options.policies);
  const projectionPolicies = new InMemoryProjectionPolicyRepository(options.projections);
  const platformPolicy = new InMemoryPlatformPolicyRepository({
    projectionEnabled: options.projectionEnabled ?? true,
  });
  const tenantRetentionPolicies = new InMemoryTenantRetentionPolicyRepository(
    options.tenantPolicies,
  );
  const storagePolicy = options.lifecycle ?? new InMemoryStoragePolicyGateway();
  const logger = { emit: vi.fn(), failure: vi.fn() };

  const container = {
    ...TestContainer.build({
      maintenance,
      partitionArchive,
      outbox,
      organizations: new InMemoryOrganizationReader(TENANTS),
    }),
    // The harness fixes its own epoch; this spec asserts against a later month.
    clock: new FixedClock(NOW),
    retentionPolicies,
    projectionPolicies,
    platformPolicy,
    tenantRetentionPolicies,
    storagePolicy,
    // The **instance** with one method shadowed, never a spread: spreading a class
    // instance into a literal copies own properties and drops every method it has.
    projector: Object.assign(projector, {
      checkpoint: () =>
        Promise.resolve({ lastOccurredAt: options.projectedTo ?? null, lastId: null }),
    }),
    hasProjector: options.hasProjector ?? false,
    logger,
  } as unknown as Container;

  return {
    container,
    maintenance,
    partitionArchive,
    outbox,
    retentionPolicies,
    projectionPolicies,
    tenantRetentionPolicies,
    storagePolicy,
    logger,
  };
}

const job = (name: string, data: unknown = {}): Job => ({ name, data }) as Job;

const emitted = (logger: { emit: ReturnType<typeof vi.fn> }, code: string) =>
  logger.emit.mock.calls.filter((call) => call[0] === code).map((call) => call[1]);

function consumerFor(container: Container): MaintenanceConsumer {
  // The Redis connection is only read by `start()`, which this spec never calls.
  return new MaintenanceConsumer(container, undefined as never, 1);
}

describe("MaintenanceConsumer", () => {
  it("throws on a job name it does not know", async () => {
    const { container, maintenance, partitionArchive } = harness();

    // A schedule renamed on one side and not the other must be loud: succeeding quietly
    // is indistinguishable from working.
    await expect(consumerFor(container).handle(job("cleanup-daily"))).rejects.toThrow(
      "Unknown maintenance job: cleanup-daily",
    );

    expect(maintenance.swept()).toEqual([]);
    expect(maintenance.partitionsEnsured()).toEqual([]);
    expect(partitionArchive.archived()).toEqual([]);
  });

  // The `archive` job and its schedule are gone: retention archives before it drops, so
  // there is no second pass left to run.
  it("no longer answers to the archive job", async () => {
    const { container } = harness();

    await expect(consumerFor(container).handle(job("archive"))).rejects.toThrow(
      "Unknown maintenance job: archive",
    );
  });

  // `partitions` covers the whole allowlist times every tenant, so its count tracks
  // those two lists rather than a literal.
  it("dispatches each known name to exactly one gateway concern", async () => {
    for (const [name, swept, ensured] of [
      ["cleanup", 1, 0],
      ["partitions", 0, RUNS.length],
    ] as const) {
      const h = harness();
      await consumerFor(h.container).handle(job(name));

      expect(h.maintenance.swept()).toHaveLength(swept);
      expect(h.maintenance.partitionsEnsured()).toHaveLength(ensured);
    }
  });

  it("sweeps against the container clock rather than a fresh Date", async () => {
    const { container, maintenance } = harness();
    await consumerFor(container).handle(job("cleanup"));

    expect(maintenance.swept()).toEqual([NOW]);
  });

  it("keeps several months of partitions ahead of today", async () => {
    const { container, maintenance } = harness();
    await consumerFor(container).handle(job("partitions"));

    // A table with no partition for the current date rejects every insert, so one month
    // of runway makes a missed run an outage at midnight on the first.
    expect(maintenance.partitionsEnsured()[0]?.months).toBeGreaterThan(1);
    expect(maintenance.partitionsEnsured()[0]?.from).toEqual(NOW);
  });

  // The regression guard for a check that could never fire. `ensureMonthlyPartitions`
  // always leaves two months ahead, so reading the runway after it is reading its own work.
  it("reads the runway before ensuring, not after", async () => {
    const { container, maintenance } = harness();
    await consumerFor(container).handle(job("partitions"));

    const checked = maintenance.runwayChecked();
    expect(checked.map(({ table, organizationId }) => ({ table, organizationId }))).toEqual(RUNS);
    expect(checked[0]?.from).toEqual(NOW);
  });

  // The allowlist, not a name in the consumer: this is what makes a table partitioned by
  // a later migration covered by the existing schedule.
  it("ensures partitions for every table on the allowlist", () => {
    expect(PartitionedTable.NAMES).toContain(PartitionedTable.ACTIVITY_LOG);
  });

  // Every month-partitioned table once per tenant, and the one table with no tenant level
  // exactly once — which is the whole reason the outbox stays month-only.
  it("covers each allowlisted table once per tenant per run", async () => {
    const { container, maintenance } = harness();
    await consumerFor(container).handle(job("partitions"));

    expect(
      maintenance.partitionsEnsured().map(({ table, organizationId }) => ({
        table,
        organizationId,
      })),
    ).toEqual(RUNS);
  });

  it("archives nothing when no partition is older than the cutoff", async () => {
    const { container, partitionArchive } = harness();
    await consumerFor(container).handle(job("partitions"));

    expect(partitionArchive.archived()).toEqual([]);
  });

  // Retention stops meaning deletion: a month that ages out leaves through the archive,
  // and the drop is the gateway's last step behind a verified object.
  it("archives every table-month older than the cutoff, once per table-month", async () => {
    const period = new Date(Date.UTC(2024, 0, 1));
    const { container, partitionArchive, logger } = harness({
      estimates: [estimate(period), estimate(period)],
    });

    await consumerFor(container).handle(job("partitions"));

    // One call and one line per table-month, `organizationId: null` meaning every
    // tenant — five thousand tenants must not be five thousand lines.
    expect(partitionArchive.archived()).toEqual(
      RETAINED.map((entry) => ({ table: entry.name, period, organizationId: null })),
    );
    expect(emitted(logger, "maintenance.partition.archived")).toHaveLength(RETAINED.length);
  });

  // A stuck event must never leave by the calendar, and the guard is the outbox's alone:
  // applying it to every table would let one block them all.
  it("leaves the outbox alone while the drain is behind", async () => {
    const period = new Date(Date.UTC(2024, 0, 1));
    const { container, partitionArchive, outbox } = harness({ estimates: [estimate(period)] });

    outbox.enqueue({
      name: "task.created",
      organizationId: FIRST,
      actorId: FIRST as never,
      occurredAt: period,
      payload: {},
    } as never);

    await consumerFor(container).handle(job("partitions"));

    expect(partitionArchive.archived().map(({ table }) => table)).not.toContain(
      PartitionedTable.OUTBOX_EVENT,
    );
  });

  // A month is archived and dropped whether or not the derived store has it. A forgotten
  // switch costs a known hole, never an unbounded table.
  it("records a projection gap when no projector is configured", async () => {
    const period = new Date(Date.UTC(2024, 0, 1));
    const { container, partitionArchive, logger } = harness({
      estimates: [estimate(period)],
      objects: [archived(FIRST)],
    });

    await consumerFor(container).handle(job("partitions"));

    expect(emitted(logger, "analytics.projection.gap")).toEqual([
      { period: "2024-01-01", reason: "disabled" },
    ]);
    expect(partitionArchive.projected()).toEqual([]);
  });

  it("records a gap rather than a stamp when the projection has not reached the month", async () => {
    const period = new Date(Date.UTC(2024, 0, 1));
    const { container, partitionArchive, logger } = harness({
      estimates: [estimate(period)],
      objects: [archived(FIRST)],
      hasProjector: true,
      projectedTo: new Date(Date.UTC(2024, 0, 20)),
    });

    await consumerFor(container).handle(job("partitions"));

    expect(emitted(logger, "analytics.projection.gap")).toEqual([
      { period: "2024-01-01", reason: "behind" },
    ]);
    expect(partitionArchive.projected()).toEqual([]);
  });

  // A paused projection is a gap with a known reason, not a checkpoint to chase: the
  // month is archived and dropped either way, so a forgotten switch costs a known hole.
  it("records the gap as disabled when the projection is paused", async () => {
    const period = new Date(Date.UTC(2024, 0, 1));
    const { container, partitionArchive, logger } = harness({
      estimates: [estimate(period)],
      objects: [archived(FIRST)],
      hasProjector: true,
      projectionEnabled: false,
      // Past the month, so a running projection would stamp: the pause is the only
      // thing between this and a stamp.
      projectedTo: new Date(Date.UTC(2024, 2, 1)),
    });

    await consumerFor(container).handle(job("partitions"));

    expect(emitted(logger, "analytics.projection.gap")).toEqual([
      { period: "2024-01-01", reason: "disabled" },
    ]);
    expect(partitionArchive.projected()).toEqual([]);
  });

  // Stamped only once the checkpoint is past the end of the month: a checkpoint inside
  // it has projected part of the month, and the row claims the whole of it.
  it("stamps the tenant-month once the projection is past it", async () => {
    const period = new Date(Date.UTC(2024, 0, 1));
    const { container, partitionArchive, logger } = harness({
      estimates: [estimate(period)],
      objects: [archived(FIRST)],
      hasProjector: true,
      projectedTo: new Date(Date.UTC(2024, 1, 1)),
    });

    await consumerFor(container).handle(job("partitions"));

    expect(emitted(logger, "analytics.projection.gap")).toEqual([]);
    expect(partitionArchive.projected()).toEqual([
      { table: PartitionedTable.ACTIVITY_LOG, period, organizationId: FIRST },
    ]);
  });
});

// `19.11`: the daily converger. Neither store is written by the save alone — a bucket
// call after the commit can fail, and a rule deleted in a console is drift.
describe("MaintenanceConsumer — the retention job", () => {
  const cold = (tableName: string, coldMonths: number | null): RetentionPolicyRecord => ({
    store: "postgres",
    tableName,
    hotMonths: 12,
    coldMonths,
    coldMode: "archive",
  });

  it("writes the bucket's configuration when it does not match the rows", async () => {
    const { container, storagePolicy, logger } = harness({
      policies: [cold("activity_log", 24)],
    });

    await consumerFor(container).handle(job("retention"));

    expect(await storagePolicy.lifecycle()).toEqual([
      { prefix: "cold/activity_log/", expireAfterDays: 731 },
      // Not composed from a row: an export is a copy of a tenant's data in a bucket,
      // and seven days is how long that is a download rather than a liability.
      { prefix: "export/", expireAfterDays: 7 },
    ]);
    // Drift first, then the repair: a lone `applied` cannot tell "the reconcile is
    // doing its job" from "somebody edited the bucket by hand last night".
    expect(emitted(logger, "retention.lifecycle.drifted")).toHaveLength(1);
    expect(emitted(logger, "retention.lifecycle.applied")).toEqual([{ rules: 2 }]);
  });

  // The one that matters most: `PutBucketLifecycleConfiguration` replaces everything,
  // so a job that wrote on every run would rewrite the bucket daily for no reason.
  it("writes nothing on the second run", async () => {
    const { container, storagePolicy, logger } = harness({
      policies: [cold("activity_log", 24)],
    });

    await consumerFor(container).handle(job("retention"));
    await consumerFor(container).handle(job("retention"));

    expect(storagePolicy.applied()).toHaveLength(1);
    expect(emitted(logger, "retention.lifecycle.applied")).toHaveLength(1);
  });

  // An empty table is the state every deployment starts in, and `export/` is the one
  // rule it still writes — once, then the comparison holds and nothing is rewritten.
  it("writes only the export rule with no rows, and nothing on the second run", async () => {
    const { container, storagePolicy, logger } = harness();

    await consumerFor(container).handle(job("retention"));
    await consumerFor(container).handle(job("retention"));

    expect(storagePolicy.applied()).toEqual([[{ prefix: "export/", expireAfterDays: 7 }]]);
    expect(emitted(logger, "retention.lifecycle.applied")).toEqual([{ rules: 1 }]);
  });

  // The rows only. The bucket's own rule deleted the object; a row still pointing at one
  // is a `NotFoundError` on a read that should have been an empty list.
  it("forgets an archive row past its hot plus cold window", async () => {
    const { container, partitionArchive } = harness({ policies: [cold("activity_log", 24)] });

    await consumerFor(container).handle(job("retention"));

    // 2026-08 less thirty-six months.
    expect(partitionArchive.forgets()).toEqual([
      { table: "activity_log", period: new Date(Date.UTC(2023, 7, 1)) },
    ]);
  });

  // One line per export, not one per object. The counts are what an operator reads,
  // and nine lines a run saying the same thing is nine lines nobody reads.
  it("exports a tenant and logs the totals once", async () => {
    const { container, partitionArchive, logger } = harness();
    partitionArchive.stageExport([
      {
        table: "activity_log",
        key: "export/a/activity_log.ndjson.gz",
        rowCount: 10,
        bytes: 100,
        checksum: "x",
      },
      {
        table: "api_keys",
        key: "export/a/api_keys.ndjson.gz",
        rowCount: 2,
        bytes: 20,
        checksum: "y",
      },
    ]);

    await consumerFor(container).handle(
      job("tenant-export", { organizationId: FIRST, day: "2026-08-15" }),
    );

    expect(partitionArchive.tenantExports()).toEqual([
      { organizationId: FIRST, day: "2026-08-15" },
    ]);
    expect(emitted(logger, "cold.tenant.exported")).toEqual([
      { organizationId: FIRST, objects: 2, rows: 12, bytes: 120 },
    ]);
  });

  // `20.4`: the nightly job composes from **both** tables. Three callers composing the
  // same string by hand is three places for it to drift.
  it("composes the ClickHouse TTL from the projection rows as well", async () => {
    const { container, logger } = harness({
      hasProjector: true,
      projections: [{ action: "role.created", projected: true, ttlMonths: 120 }],
    });

    await consumerFor(container).handle(job("retention"));

    expect(emitted(logger, "analytics.retention.applied")).toEqual([
      {
        expression:
          "toDateTime(occurred_at) + toIntervalMonth(120) WHERE action = 'role.created', " +
          "toDateTime(occurred_at) + toIntervalMonth(60) WHERE action NOT IN ('role.created')",
      },
    ]);
  });

  // An excluded action gets no clause: nothing writes it, so a window over it is a
  // rule on rows that do not arrive.
  it("gives an excluded action no TTL clause", async () => {
    const { container, logger } = harness({
      hasProjector: true,
      projections: [{ action: "ai.document.searched", projected: false, ttlMonths: 3 }],
    });

    await consumerFor(container).handle(job("retention"));

    expect(emitted(logger, "analytics.retention.applied")).toEqual([]);
  });

  // Thirty days, and the line says why they went: a sweep for a deleted tenant reads
  // differently from the bucket expiring a month on its own.
  it("sweeps a deleted tenant's objects thirty days after they were archived", async () => {
    const { container, partitionArchive, logger } = harness();
    partitionArchive.stageDeleted({ organizations: 2, objects: 7 });

    await consumerFor(container).handle(job("retention"));

    expect(partitionArchive.deletedSwept()).toEqual([new Date("2026-07-16T00:00:00Z")]);
    expect(emitted(logger, "cold.objects.swept")).toEqual([
      { reason: "tenant_deleted", organizations: 2, objects: 7 },
    ]);
  });

  // No line on the common run. A nightly job emitting "swept nothing" every night is a
  // line nobody reads, which is how the one that matters gets missed.
  it("says nothing when no deleted tenant has objects left", async () => {
    const { container, logger } = harness();

    await consumerFor(container).handle(job("retention"));

    expect(emitted(logger, "cold.objects.swept")).toEqual([]);
  });

  it("forgets nothing for a table whose objects never expire", async () => {
    const { container, partitionArchive } = harness({ policies: [cold("activity_log", null)] });

    await consumerFor(container).handle(job("retention"));

    expect(partitionArchive.forgets()).toEqual([]);
  });

  // `MODIFY TTL` materialises on every existing part, which on a years-deep table is a
  // rewrite. Compared before it is written, and the comparison is what this pins.
  it("leaves the ClickHouse TTL alone when it already matches", async () => {
    const { container, logger } = harness({ hasProjector: true });

    await consumerFor(container).handle(job("retention"));

    expect(emitted(logger, "analytics.retention.applied")).toEqual([]);
  });

  it("applies the ClickHouse TTL when a row changes it", async () => {
    const { container, logger } = harness({
      hasProjector: true,
      policies: [
        {
          store: "clickhouse",
          tableName: "activity_events",
          hotMonths: 36,
          coldMonths: null,
          coldMode: "archive",
        },
      ],
    });

    await consumerFor(container).handle(job("retention"));

    expect(emitted(logger, "analytics.retention.applied")).toEqual([
      { expression: "toDateTime(occurred_at) + toIntervalMonth(36)" },
    ]);
  });
});

// `19.10`: an absent row is the code default, and a row replaces it.
describe("MaintenanceConsumer — prune reads the row", () => {
  const period = new Date(Date.UTC(2024, 0, 1));

  it("uses the allowlist when no row exists", async () => {
    const { container, partitionArchive } = harness({ estimates: [estimate(period)] });

    await consumerFor(container).handle(job("partitions"));

    // `activity_log` at thirteen months and `notifications` at twelve, from the
    // allowlist alone. `messages` is never retired and contributes nothing.
    expect(partitionArchive.archived().map(({ table }) => table)).toEqual(
      RETAINED.map((entry) => entry.name),
    );
  });

  // The whole point of the row: a table the allowlist never retires becomes one that
  // does, with no deploy.
  it("retires a table the allowlist leaves alone when a row says so", async () => {
    const { container, partitionArchive } = harness({
      estimates: [estimate(period)],
      policies: [
        {
          store: "postgres",
          tableName: "messages",
          hotMonths: 6,
          coldMonths: null,
          coldMode: "archive",
        },
      ],
    });

    await consumerFor(container).handle(job("partitions"));

    expect(partitionArchive.archived().map(({ table }) => table)).toContain("messages");
  });

  // `drop` destroys the month rather than archiving it — a table of transport rows
  // deciding it is not worth the bytes. Nothing reaches cold storage.
  it("drops rather than archives under cold_mode drop", async () => {
    const { container, partitionArchive, maintenance } = harness({
      estimates: [estimate(period)],
      policies: [
        {
          store: "postgres",
          tableName: "notifications",
          hotMonths: 12,
          coldMonths: null,
          coldMode: "drop",
        },
      ],
    });

    await consumerFor(container).handle(job("partitions"));

    expect(partitionArchive.archived().map(({ table }) => table)).not.toContain("notifications");
    expect(maintenance.partitionsDropped().map(({ table }) => table)).toContain("notifications");
  });
});

// `19.19`: `override ?? retention_policy row ?? allowlist`, per tenant. The pass walks
// tenants only when an override exists, which keeps the common case one call.
describe("MaintenanceConsumer — a per-tenant retention override", () => {
  const period = new Date(Date.UTC(2024, 0, 1));

  const override = (
    organizationId: OrganizationId,
    hotMonths: number,
  ): TenantRetentionPolicyRecord => ({
    organizationId,
    tableName: "activity_log",
    hotMonths,
    coldMonths: null,
  });

  it("archives per tenant once an override exists", async () => {
    const { container, partitionArchive } = harness({
      estimates: [estimate(period)],
      tenantPolicies: [override(FIRST, 3)],
    });

    await consumerFor(container).handle(job("partitions"));

    // Both tenants, named: the override made the pass walk them, and `SECOND` takes the
    // table default rather than being skipped.
    const activityLog = partitionArchive.archived().filter(({ table }) => table === "activity_log");

    expect(activityLog.map(({ organizationId }) => organizationId)).toEqual([FIRST, SECOND]);
  });

  // The table the override does not name keeps the cheap path. Otherwise one override
  // anywhere would turn every table's pass into a tenant walk.
  it("leaves the other tables on the table-month path", async () => {
    const { container, partitionArchive } = harness({
      estimates: [estimate(period)],
      tenantPolicies: [override(FIRST, 3)],
    });

    await consumerFor(container).handle(job("partitions"));

    const notifications = partitionArchive
      .archived()
      .filter(({ table }) => table === "notifications");

    expect(notifications.map(({ organizationId }) => organizationId)).toEqual([null]);
  });

  // Why `update-tenant-retention` refuses one: `prune` returns before it reads an
  // override on a table whose default is null, so the setting would do nothing.
  it("does not retire a table whose default is never, even with a row", async () => {
    const { container, partitionArchive } = harness({
      estimates: [estimate(period)],
      tenantPolicies: [{ ...override(FIRST, 3), tableName: "messages" }],
    });

    await consumerFor(container).handle(job("partitions"));

    expect(partitionArchive.archived().map(({ table }) => table)).not.toContain("messages");
  });
});
