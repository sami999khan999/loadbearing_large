import { PartitionedTable } from "@loadbearing/application";
import type { Container } from "@loadbearing/composition";
import {
  FixedClock,
  RecordingActivityArchiveGateway,
  RecordingMaintenanceGateway,
  TestContainer,
} from "@loadbearing/composition";
import type { Job } from "bullmq";
import { describe, expect, it } from "vitest";
import { MaintenanceConsumer } from "../../src/consumer/maintenance.consumer.js";

const NOW = new Date("2026-08-15T00:00:00Z");

// `TestContainer` rather than an object literal of the four members this consumer
// touches: a port added to the container is a compile error there, and was silence here.
function harness() {
  const maintenance = new RecordingMaintenanceGateway({
    sessions: 3,
    verifications: 1,
    invitations: 2,
  });
  const activityArchive = new RecordingActivityArchiveGateway();

  const container = {
    ...TestContainer.build({ maintenance, activityArchive }),
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

  // `partitions` covers the whole allowlist, so its count tracks that list rather than a
  // literal — a table added to it should not fail this spec.
  it("dispatches each known name to exactly one gateway concern", async () => {
    const tables = PartitionedTable.ALL.length;

    for (const [name, swept, ensured, archived] of [
      ["cleanup", 1, 0, 0],
      ["partitions", 0, tables, 0],
      ["archive", 0, 0, 1],
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

  // The allowlist, not a name in the consumer: this is what makes a table partitioned by
  // a later migration covered by the existing schedule.
  it("ensures partitions for every table on the allowlist", () => {
    expect(PartitionedTable.ALL).toContain(PartitionedTable.ACTIVITY_LOG);
  });

  it("covers each allowlisted table once per run", async () => {
    const { container, maintenance } = harness();
    await consumerFor(container).handle(job("partitions"));

    expect(maintenance.partitionsEnsured().map((run) => run.table)).toEqual([
      ...PartitionedTable.ALL,
    ]);
  });

  it("archives the month that has aged out, computed from the clock and not the payload", async () => {
    const { container, activityArchive } = harness();
    await consumerFor(container).handle(job("archive"));

    // From the clock rather than the job, so a redelivered job archives the same month
    // rather than one relative to the retry.
    expect(activityArchive.archived()).toEqual([new Date(Date.UTC(2025, 6, 1))]);
  });
});
