import { PartitionedTable } from "@loadbearing/application";
import type { Container } from "@loadbearing/composition";
import {
  FixedClock,
  InMemoryOrganizationReader,
  RecordingActivityArchiveGateway,
  RecordingMaintenanceGateway,
  TestContainer,
} from "@loadbearing/composition";
import { Identifiers, type OrganizationId } from "@loadbearing/contracts";
import type { Job } from "bullmq";
import { describe, expect, it } from "vitest";
import { MaintenanceConsumer } from "../../src/consumer/maintenance.consumer.js";

const NOW = new Date("2026-08-15T00:00:00Z");

// Two, and in this order: the runway and the archive both walk tenants, and one tenant
// cannot tell a loop from a single call.
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

// `TestContainer` rather than an object literal of the four members this consumer
// touches: a port added to the container is a compile error there, and was silence here.
function harness(monthsAhead?: number) {
  const maintenance = new RecordingMaintenanceGateway(
    { sessions: 3, verifications: 1, invitations: 2 },
    monthsAhead,
  );
  const activityArchive = new RecordingActivityArchiveGateway();

  const container = {
    ...TestContainer.build({
      maintenance,
      activityArchive,
      organizations: new InMemoryOrganizationReader(TENANTS),
    }),
    // The harness fixes its own epoch; this spec asserts against a later month.
    clock: new FixedClock(NOW),
  } as unknown as Container;

  return { container, maintenance, activityArchive };
}

const job = (name: string): Job => ({ name }) as Job;

function consumerFor(container: Container): MaintenanceConsumer {
  // The Redis connection is only read by `start()`, which this spec never calls.
  return new MaintenanceConsumer(container, undefined as never, 1);
}

describe("MaintenanceConsumer", () => {
  it("throws on a job name it does not know", async () => {
    const { container, maintenance, activityArchive } = harness();

    // A schedule renamed on one side and not the other must be loud: succeeding quietly
    // is indistinguishable from working.
    await expect(consumerFor(container).handle(job("cleanup-daily"))).rejects.toThrow(
      "Unknown maintenance job: cleanup-daily",
    );

    expect(maintenance.swept()).toEqual([]);
    expect(maintenance.partitionsEnsured()).toEqual([]);
    expect(activityArchive.archived()).toEqual([]);
  });

  // `partitions` covers the whole allowlist times every tenant, so its count tracks
  // those two lists rather than a literal.
  it("dispatches each known name to exactly one gateway concern", async () => {
    for (const [name, swept, ensured, archived] of [
      ["cleanup", 1, 0, 0],
      ["partitions", 0, RUNS.length, 0],
      ["archive", 0, 0, TENANTS.length],
    ] as const) {
      const h = harness();
      await consumerFor(h.container).handle(job(name));

      expect(h.maintenance.swept()).toHaveLength(swept);
      expect(h.maintenance.partitionsEnsured()).toHaveLength(ensured);
      expect(h.activityArchive.archived()).toHaveLength(archived);
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

  it("archives the month that has aged out, computed from the clock and not the payload", async () => {
    const { container, activityArchive } = harness();
    await consumerFor(container).handle(job("archive"));

    // From the clock rather than the job, and once per tenant: a month partition belongs
    // to one tenant since `0023`.
    expect(activityArchive.archived()).toEqual(
      TENANTS.map((organizationId) => ({
        organizationId,
        period: new Date(Date.UTC(2025, 6, 1)),
      })),
    );
  });
});
