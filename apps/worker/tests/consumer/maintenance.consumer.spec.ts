import type { Container } from "@loadbearing/composition";
import type { Job } from "bullmq";
import { describe, expect, it } from "vitest";
import { MaintenanceConsumer } from "../../src/consumer/maintenance.consumer.js";

const NOW = new Date("2026-08-15T00:00:00Z");

// A real `Container` opens a pool and three clients in its constructor, so the double
// supplies the four members this consumer touches and the cast says so out loud.
function containerDouble() {
  const calls: string[] = [];
  const swept: Date[] = [];
  const archived: Date[] = [];
  const partitioned: { from: Date; monthsAhead: number }[] = [];

  const container = {
    clock: { now: () => NOW },
    logger: { emit: () => undefined, failure: () => undefined },
    maintenance: {
      sweepExpired: (now: Date) => {
        calls.push("sweepExpired");
        swept.push(now);
        return Promise.resolve({ sessions: 3, verifications: 1 });
      },
      ensureActivityPartitions: (from: Date, monthsAhead: number) => {
        calls.push("ensureActivityPartitions");
        partitioned.push({ from, monthsAhead });
        return Promise.resolve(["activity_log_2026_09"]);
      },
    },
    activityArchive: {
      archive: (period: Date) => {
        calls.push("archive");
        archived.push(period);
        return Promise.resolve({
          period: "2025-07-01",
          key: "archive/2025-07.csv.gz",
          rowCount: 9,
        });
      },
    },
  } as unknown as Container;

  return { container, calls, swept, archived, partitioned };
}

const job = (name: string): Job => ({ name }) as Job;

function consumerFor(container: Container): MaintenanceConsumer {
  // The Redis connection is only read by `start()`, which this spec never calls.
  return new MaintenanceConsumer(container, undefined as never, 1);
}

describe("MaintenanceConsumer", () => {
  it("throws on a job name it does not know", async () => {
    const { container, calls } = containerDouble();

    // A schedule renamed on one side and not the other must be loud: succeeding quietly
    // is indistinguishable from working.
    await expect(consumerFor(container).handle(job("cleanup-daily"))).rejects.toThrow(
      "Unknown maintenance job: cleanup-daily",
    );
    expect(calls).toEqual([]);
  });

  it("dispatches each known name to exactly one gateway call", async () => {
    for (const [name, expected] of [
      ["cleanup", "sweepExpired"],
      ["partitions", "ensureActivityPartitions"],
      ["archive", "archive"],
    ] as const) {
      const { container, calls } = containerDouble();
      await consumerFor(container).handle(job(name));
      expect(calls).toEqual([expected]);
    }
  });

  it("sweeps against the container clock rather than a fresh Date", async () => {
    const { container, swept } = containerDouble();
    await consumerFor(container).handle(job("cleanup"));

    expect(swept).toEqual([NOW]);
  });

  it("keeps several months of partitions ahead of today", async () => {
    const { container, partitioned } = containerDouble();
    await consumerFor(container).handle(job("partitions"));

    // A table with no partition for the current date rejects every insert, so one month
    // of runway makes a missed run an outage at midnight on the first.
    expect(partitioned[0]?.monthsAhead).toBeGreaterThan(1);
    expect(partitioned[0]?.from).toEqual(NOW);
  });

  it("archives the month that has aged out, computed from the clock and not the payload", async () => {
    const { container, archived } = containerDouble();
    await consumerFor(container).handle(job("archive"));

    // From the clock rather than the job, so a redelivered job archives the same month
    // rather than one relative to the retry.
    expect(archived).toEqual([new Date(Date.UTC(2025, 6, 1))]);
  });
});
