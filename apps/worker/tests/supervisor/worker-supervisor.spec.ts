import { QueueName } from "@loadbearing/application";
import type { Container } from "@loadbearing/composition";
import {
  InMemoryQueueControlGateway,
  InMemoryWorkerFleetGateway,
  InMemoryWorkerQueueSettingsRepository,
  TestContainer,
} from "@loadbearing/composition";
import type { Worker } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import { type LaneFactory, LaneRegistry, WorkerSupervisor } from "../../src/supervisor/index.js";

// The members of a BullMQ `Worker` the supervisor touches, and nothing else.
class FakeWorker {
  public concurrency: number;
  public paused = false;
  public readonly close = vi.fn(async () => undefined);
  public readonly on = vi.fn();

  public constructor(
    public readonly name: string,
    concurrency: number,
  ) {
    this.concurrency = concurrency;
  }

  public isPaused(): boolean {
    return this.paused;
  }

  public pause(): Promise<void> {
    this.paused = true;
    return Promise.resolve();
  }

  public resume(): void {
    this.paused = false;
  }
}

function lane(
  queue: LaneFactory["queue"],
  concurrency: number,
): LaneFactory & { started: FakeWorker[] } {
  const started: FakeWorker[] = [];
  return {
    queue,
    concurrency,
    variable: `WORKER_${queue.toUpperCase()}_CONCURRENCY`,
    started,
    start: vi.fn(() => {
      const worker = new FakeWorker(queue, concurrency);
      started.push(worker);
      return worker as unknown as Worker;
    }),
  };
}

const ID = { id: "host-1-abcd", host: "host", startedAt: new Date("2026-01-01T00:00:00Z") };

function harness(
  lanes: readonly LaneFactory[],
  options: { processMax?: number; envQueues?: readonly string[] } = {},
) {
  const fleet = new InMemoryWorkerFleetGateway();
  const control = new InMemoryQueueControlGateway();
  const settings = new InMemoryWorkerQueueSettingsRepository();
  // Spread, not passed to `build()`: the three are slice ports, and `TestPorts` holds
  // only the ones in `application/src/port`.
  const container = {
    ...TestContainer.build(),
    workerFleet: fleet,
    queueControl: control,
    workerQueueSettings: settings,
  } as unknown as Container;
  const supervisor = new WorkerSupervisor(
    new LaneRegistry(lanes),
    container,
    ID,
    options.processMax ?? 64,
    options.envQueues,
  );
  return { supervisor, fleet, control, settings };
}

const names = (supervisor: WorkerSupervisor): string[] => supervisor.workers.map((w) => w.name);

describe("WorkerSupervisor at boot", () => {
  it("starts only the lanes WORKER_QUEUES names, and reports itself", async () => {
    const mail = lane(QueueName.MAIL, 4);
    const embedding = lane(QueueName.EMBEDDING, 4);
    const { supervisor, fleet } = harness([embedding, mail], { envQueues: ["mail"] });

    await supervisor.start();

    expect(names(supervisor)).toEqual(["mail"]);
    expect(embedding.start).not.toHaveBeenCalled();
    expect(fleet.processes.get(ID.id)?.lanes).toEqual([
      { queue: "mail", concurrency: 4, active: 0, paused: false },
    ]);
    await supervisor.close();
  });

  it("refuses a process whose lanes add up past the ceiling, and starts none of them", async () => {
    const embedding = lane(QueueName.EMBEDDING, 20);
    const { supervisor } = harness([embedding, lane(QueueName.EVENT, 20)], { processMax: 32 });

    await expect(supervisor.start()).rejects.toThrow(
      /add up to 40, above WORKER_PROCESS_MAX_CONCURRENCY=32.*WORKER_EMBEDDING_CONCURRENCY=20/,
    );
    expect(embedding.start).not.toHaveBeenCalled();
  });

  it("refuses a lane above its queue's limit", async () => {
    const { supervisor } = harness([lane(QueueName.ANALYTICS, 2)]);

    await expect(supervisor.start()).rejects.toThrow(/analytics queue's limit of 1/);
  });

  it("copies a saved queue pause onto the queue", async () => {
    const { supervisor, control, settings } = harness([lane(QueueName.MAIL, 1)]);
    await settings.save({
      queue: "mail",
      paused: true,
      autoscaleEnabled: false,
      concurrencyMin: 1,
      concurrencyMax: 1,
      scaleUpWaiting: 50,
      step: 1,
      scaleDownAfterSeconds: 60,
    });

    await supervisor.start();

    expect(control.paused.has("mail")).toBe(true);
    await supervisor.close();
  });
});

describe("WorkerSupervisor on a signal", () => {
  it("moves to the dashboard's queue list and closes the lane it dropped", async () => {
    const mail = lane(QueueName.MAIL, 2);
    const embedding = lane(QueueName.EMBEDDING, 3);
    const { supervisor, fleet } = harness([embedding, mail], { envQueues: ["mail"] });
    await supervisor.start();

    await fleet.saveOverrides(ID.id, { paused: false, pausedQueues: [], queues: ["embedding"] });
    await fleet.signal(ID.id);
    await supervisor.reconcile();

    expect(names(supervisor)).toEqual(["embedding"]);
    expect(mail.started[0]?.close).toHaveBeenCalledTimes(1);
    expect(fleet.processes.get(ID.id)?.overridden).toBe(true);
    await supervisor.close();
  });

  it("pauses one lane, then the whole process, then resumes", async () => {
    const mail = lane(QueueName.MAIL, 1);
    const event = lane(QueueName.EVENT, 1);
    const { supervisor, fleet } = harness([mail, event]);
    await supervisor.start();

    await fleet.saveOverrides(ID.id, { paused: false, pausedQueues: ["mail"], queues: null });
    await supervisor.reconcile();
    expect([mail.started[0]?.paused, event.started[0]?.paused]).toEqual([true, false]);

    await fleet.saveOverrides(ID.id, { paused: true, pausedQueues: [], queues: null });
    await supervisor.reconcile();
    expect([mail.started[0]?.paused, event.started[0]?.paused]).toEqual([true, true]);

    await fleet.clearOverrides(ID.id);
    await supervisor.reconcile();
    expect([mail.started[0]?.paused, event.started[0]?.paused]).toEqual([false, false]);
    await supervisor.close();
  });

  it("scales a lane up while jobs wait, within the saved maximum", async () => {
    const embedding = lane(QueueName.EMBEDDING, 1);
    const { supervisor, control, settings } = harness([embedding]);
    await settings.save({
      queue: "embedding",
      paused: false,
      autoscaleEnabled: true,
      concurrencyMin: 1,
      concurrencyMax: 2,
      scaleUpWaiting: 10,
      step: 4,
      scaleDownAfterSeconds: 60,
    });
    control.waiting.set("embedding", 500);

    await supervisor.start();

    expect(embedding.started[0]?.concurrency).toBe(2);
    await supervisor.close();
  });

  it("deregisters and closes every lane on close", async () => {
    const mail = lane(QueueName.MAIL, 1);
    const { supervisor, fleet } = harness([mail]);
    await supervisor.start();

    await supervisor.close();

    expect(fleet.processes.has(ID.id)).toBe(false);
    expect(mail.started[0]?.close).toHaveBeenCalledTimes(1);
  });
});
