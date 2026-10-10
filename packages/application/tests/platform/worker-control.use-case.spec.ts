import { Identifiers } from "@loadbearing/contracts";
import { ForbiddenError, NotFoundError, ValidationError } from "@loadbearing/errors";
import { CapabilitySet, type PermissionKey } from "@loadbearing/permissions";
import { describe, expect, it } from "vitest";
import { GetWorkerFleetUseCase } from "../../src/platform/get-worker-fleet.use-case.js";
import { PauseWorkerProcessUseCase } from "../../src/platform/pause-worker-process.use-case.js";
import { PauseWorkerQueueUseCase } from "../../src/platform/pause-worker-queue.use-case.js";
import type { PlatformReader } from "../../src/platform/platform.reader.js";
import type { QueueControlGateway, QueueCounts } from "../../src/platform/queue-control.gateway.js";
import { ResetWorkerProcessUseCase } from "../../src/platform/reset-worker-process.use-case.js";
import { SaveQueueAutoscaleUseCase } from "../../src/platform/save-queue-autoscale.use-case.js";
import { SetWorkerProcessQueuesUseCase } from "../../src/platform/set-worker-process-queues.use-case.js";
import type {
  WorkerFleetGateway,
  WorkerProcessOverrides,
  WorkerProcessReport,
} from "../../src/platform/worker-fleet.gateway.js";
import type {
  WorkerQueueSettingsRecord,
  WorkerQueueSettingsRepository,
} from "../../src/platform/worker-queue-settings.repository.js";
import type { ActivityLogger, UnitOfWork } from "../../src/port/index.js";
import { Authorizer } from "../../src/primitive/authorizer.js";
import { Principal } from "../../src/primitive/principal.js";

// One spec for the worker-control slice: six use cases over the same three ports, and
// the harness is most of each file. `toggle-replica-reads` is the shape they copy.

const PLATFORM = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000001");
const TENANT = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000010");
const ACTOR = Identifiers.userId.parse("018f8c00-0000-7000-8000-000000000011");
const SERVED = ["embedding", "mail", "event", "notification", "maintenance"] as const;

const NONE: WorkerProcessOverrides = { paused: false, pausedQueues: [], queues: null };

const proc = (id: string, queues: readonly string[]): WorkerProcessReport => ({
  id,
  host: "host",
  startedAt: new Date(0),
  heartbeatAt: new Date(0),
  paused: false,
  overridden: false,
  lanes: queues.map((queue) => ({ queue, concurrency: 2, active: 0, paused: false })),
});

function harness(processes: readonly WorkerProcessReport[] = [proc("w1", ["mail"])]) {
  const overrides = new Map<string, WorkerProcessOverrides>();
  const signals: string[] = [];
  const fleet = {
    list: () => Promise.resolve(processes),
    overrides: (id: string) => Promise.resolve(overrides.get(id) ?? NONE),
    saveOverrides: (id: string, value: WorkerProcessOverrides) => {
      overrides.set(id, value);
      return Promise.resolve();
    },
    clearOverrides: (id: string) => {
      overrides.delete(id);
      return Promise.resolve();
    },
    signal: (target: string) => {
      signals.push(target);
      return Promise.resolve();
    },
  } as unknown as WorkerFleetGateway;

  const paused = new Set<string>();
  const control = {
    counts: (queues: readonly string[]) =>
      Promise.resolve(
        queues.map(
          (queue): QueueCounts => ({
            queue,
            waiting: 3,
            active: 0,
            delayed: 0,
            failed: 0,
            paused: paused.has(queue),
          }),
        ),
      ),
    pause: (queue: string) => {
      paused.add(queue);
      return Promise.resolve();
    },
    resume: (queue: string) => {
      paused.delete(queue);
      return Promise.resolve();
    },
  } as QueueControlGateway;

  const rows = new Map<string, WorkerQueueSettingsRecord>();
  const settings = {
    all: () => Promise.resolve([...rows.values()]),
    save: (row: WorkerQueueSettingsRecord) => {
      rows.set(row.queue, row);
      return Promise.resolve();
    },
  } as WorkerQueueSettingsRepository;

  const recorded: { organizationId: string; action: string }[] = [];
  const activity: ActivityLogger = {
    record: (actor, action) => {
      recorded.push({ organizationId: actor.organizationId, action });
      return Promise.resolve();
    },
  };
  const unitOfWork = { run: <T>(work: () => Promise<T>) => work() } as UnitOfWork;
  const platform = { organizationId: () => Promise.resolve(PLATFORM) } as PlatformReader;
  const authorizer = new Authorizer();

  return {
    overrides,
    signals,
    paused,
    rows,
    recorded,
    fleetView: new GetWorkerFleetUseCase(authorizer, fleet, control, settings, SERVED),
    pauseQueue: new PauseWorkerQueueUseCase(
      authorizer,
      settings,
      control,
      fleet,
      platform,
      activity,
      unitOfWork,
    ),
    autoscale: new SaveQueueAutoscaleUseCase(
      authorizer,
      settings,
      fleet,
      platform,
      activity,
      unitOfWork,
    ),
    pauseProcess: new PauseWorkerProcessUseCase(authorizer, fleet, platform, activity, unitOfWork),
    setQueues: new SetWorkerProcessQueuesUseCase(
      authorizer,
      fleet,
      platform,
      activity,
      unitOfWork,
      SERVED,
    ),
    reset: new ResetWorkerProcessUseCase(authorizer, fleet, platform, activity, unitOfWork),
  };
}

const actor = (platform: readonly PermissionKey[]) =>
  new Principal(
    TENANT,
    ACTOR,
    CapabilitySet.from({
      wildcard: false,
      org: { grants: [], denies: [] },
      goals: {},
      platform: { grants: platform, denies: [] },
    }),
  );

const reader = actor(["platform.worker.read"]);
const manager = actor(["platform.worker.read", "platform.worker.manage"]);

const AUTOSCALE = {
  queue: "embedding",
  autoscaleEnabled: true,
  concurrencyMin: 1,
  concurrencyMax: 8,
  scaleUpWaiting: 20,
  step: 1,
  scaleDownAfterSeconds: 60,
};

describe("GetWorkerFleetUseCase", () => {
  it("flags every queue no live process serves", async () => {
    const { fleetView } = harness([proc("w1", ["mail", "event"])]);

    const view = await fleetView.execute(reader);

    expect(view.queues.filter((queue) => queue.unserved).map((queue) => queue.queue)).toEqual([
      "embedding",
      "notification",
      "maintenance",
    ]);
    expect(view.queues.find((queue) => queue.queue === "mail")).toMatchObject({
      servedBy: 1,
      concurrency: 2,
      limit: 32,
    });
  });

  it("is refused without platform.worker.read", async () => {
    await expect(harness().fleetView.execute(actor([]))).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("PauseWorkerQueueUseCase", () => {
  it("records the pause, pauses the queue everywhere, and audits on the platform tenant", async () => {
    const { pauseQueue, paused, rows, recorded, signals } = harness();

    await pauseQueue.execute(manager, { queue: "mail", paused: true });

    expect(paused.has("mail")).toBe(true);
    expect(rows.get("mail")?.paused).toBe(true);
    expect(recorded).toEqual([{ organizationId: PLATFORM, action: "platform.queue.paused" }]);
    expect(signals).toEqual(["all"]);
  });

  it("keeps the saved autoscale settings when it resumes", async () => {
    const { pauseQueue, autoscale, rows } = harness();
    await autoscale.execute(manager, AUTOSCALE);

    await pauseQueue.execute(manager, { queue: "embedding", paused: true });
    await pauseQueue.execute(manager, { queue: "embedding", paused: false });

    expect(rows.get("embedding")).toMatchObject({ paused: false, concurrencyMax: 8 });
  });

  it("refuses a name that is not a queue, and a reader", async () => {
    const { pauseQueue } = harness();
    await expect(
      pauseQueue.execute(manager, { queue: "nope", paused: true }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      pauseQueue.execute(reader, { queue: "mail", paused: true }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("SaveQueueAutoscaleUseCase", () => {
  it("refuses a maximum above the queue's limit and a minimum above the maximum", async () => {
    const { autoscale } = harness();

    await expect(
      autoscale.execute(manager, { ...AUTOSCALE, queue: "analytics", concurrencyMax: 2 }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      autoscale.execute(manager, { ...AUTOSCALE, concurrencyMin: 9 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("PauseWorkerProcessUseCase", () => {
  it("pauses one lane on one process and signals only that process", async () => {
    const { pauseProcess, overrides, signals } = harness();

    await pauseProcess.execute(manager, { processId: "w1", paused: true, queue: "mail" });

    expect(overrides.get("w1")).toEqual({ paused: false, pausedQueues: ["mail"], queues: null });
    expect(signals).toEqual(["w1"]);
  });

  it("refuses a process that is not live", async () => {
    await expect(
      harness().pauseProcess.execute(manager, { processId: "gone", paused: true }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("SetWorkerProcessQueuesUseCase", () => {
  it("replaces the queue list and reports what the change leaves unserved", async () => {
    const { setQueues, overrides } = harness([proc("w1", ["mail"]), proc("w2", ["event"])]);

    const result = await setQueues.execute(manager, { processId: "w1", queues: ["embedding"] });

    expect(overrides.get("w1")?.queues).toEqual(["embedding"]);
    expect(result.unserved).toEqual(["mail", "notification", "maintenance"]);
  });

  it("refuses an empty list", async () => {
    await expect(
      harness().setQueues.execute(manager, { processId: "w1", queues: [] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("ResetWorkerProcessUseCase", () => {
  it("clears the process's overrides", async () => {
    const { pauseProcess, reset, overrides, recorded } = harness();
    await pauseProcess.execute(manager, { processId: "w1", paused: true });

    await reset.execute(manager, { processId: "w1" });

    expect(overrides.has("w1")).toBe(false);
    expect(recorded.at(-1)?.action).toBe("platform.worker.reset");
  });
});
