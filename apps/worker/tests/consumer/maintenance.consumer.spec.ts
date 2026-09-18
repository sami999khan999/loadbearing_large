import type { ArchivedObject, PartitionEstimate } from "@loadbearing/application";
import { PartitionedTable } from "@loadbearing/application";
import type { Container } from "@loadbearing/composition";
import {
  FixedClock,
  InMemoryAnalyticsProjector,
  InMemoryOrganizationReader,
  InMemoryOutboxGateway,
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
    // The consumer reads `container.projector` and `container.hasProjector`; the harness
    // names the port after the abstract class. Mapping them here keeps both honest.
    projector: {
      ...projector,
      checkpoint: () =>
        Promise.resolve({ lastOccurredAt: options.projectedTo ?? null, lastId: null }),
    },
    hasProjector: options.hasProjector ?? false,
    logger,
  } as unknown as Container;

  return { container, maintenance, partitionArchive, outbox, logger };
}

const job = (name: string): Job => ({ name }) as Job;

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

    // Two tenants held that month and the estimate lists both, but a table-month is one
    // call and one line — five thousand tenants must not be five thousand lines.
    expect(partitionArchive.archived()).toEqual(
      RETAINED.map((entry) => ({ table: entry.name, period })),
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
