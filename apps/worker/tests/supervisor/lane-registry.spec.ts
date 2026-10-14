import { QueueName } from "@loadbearing/application";
import type { Worker } from "bullmq";
import { describe, expect, it } from "vitest";
import { type LaneFactory, LaneRegistry } from "../../src/supervisor/index.js";

function lane(queue: LaneFactory["queue"]): LaneFactory {
  return {
    queue,
    concurrency: 1,
    variable: `WORKER_${queue.toUpperCase()}_CONCURRENCY`,
    start: () => ({ name: queue }) as unknown as Worker,
  };
}

// The registry `forContainer` builds without a ClickHouse config: every queue but analytics.
const registry = new LaneRegistry([
  lane(QueueName.EMBEDDING),
  lane(QueueName.MAIL),
  lane(QueueName.EVENT),
  lane(QueueName.NOTIFICATION),
  lane(QueueName.MAINTENANCE),
]);

const queues = (selected: readonly LaneFactory[]): string[] => selected.map((l) => l.queue);

describe("LaneRegistry.select", () => {
  it("selects every lane when WORKER_QUEUES is unset", () => {
    expect(queues(registry.select(undefined))).toEqual([
      "embedding",
      "mail",
      "event",
      "notification",
      "maintenance",
    ]);
  });

  it("keeps registry order whatever order the variable lists", () => {
    expect(queues(registry.select(["maintenance", "embedding"]))).toEqual([
      "embedding",
      "maintenance",
    ]);
  });

  it("refuses a name that is not a queue, listing the valid ones", () => {
    expect(() => registry.select(["mial"])).toThrow(/"mial", which is not a queue.*embedding/);
  });

  it("refuses analytics when the build has no ClickHouse config", () => {
    expect(() => registry.select(["analytics"])).toThrow(/set CLICKHOUSE_URL/);
  });
});
