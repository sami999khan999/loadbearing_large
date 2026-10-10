import { describe, expect, it } from "vitest";
import {
  type AutoscaleReading,
  WorkerAutoscaleRules,
} from "../../src/platform/worker-autoscale.rules.js";
import type { WorkerQueueSettingsRecord } from "../../src/platform/worker-queue-settings.repository.js";

const ON: WorkerQueueSettingsRecord = {
  queue: "embedding",
  paused: false,
  autoscaleEnabled: true,
  concurrencyMin: 2,
  concurrencyMax: 8,
  scaleUpWaiting: 20,
  step: 2,
  scaleDownAfterSeconds: 60,
};

const reading = (over: Partial<AutoscaleReading>): AutoscaleReading => ({
  current: 4,
  start: 4,
  settings: ON,
  limit: 32,
  headroom: 100,
  waiting: 0,
  nowMs: 1_000_000,
  lastChangeMs: 0,
  idleSinceMs: null,
  ...over,
});

describe("WorkerAutoscaleRules.next", () => {
  it("runs the environment's value when autoscaling is off or unset", () => {
    expect(WorkerAutoscaleRules.next(reading({ settings: null, current: 9, start: 3 }))).toBe(3);
    expect(
      WorkerAutoscaleRules.next(reading({ settings: { ...ON, autoscaleEnabled: false } })),
    ).toBe(4);
  });

  it("adds a step when jobs reach the threshold", () => {
    expect(WorkerAutoscaleRules.next(reading({ waiting: 20 }))).toBe(6);
  });

  it("never goes above the maximum, the queue limit, or the process headroom", () => {
    expect(WorkerAutoscaleRules.next(reading({ current: 7, waiting: 500 }))).toBe(8);
    expect(WorkerAutoscaleRules.next(reading({ waiting: 500, limit: 5 }))).toBe(5);
    expect(WorkerAutoscaleRules.next(reading({ waiting: 500, headroom: 1 }))).toBe(5);
  });

  it("waits out the cooldown before a second step up", () => {
    const now = 1_000_000;
    expect(WorkerAutoscaleRules.next(reading({ waiting: 500, lastChangeMs: now - 5_000 }))).toBe(4);
    expect(WorkerAutoscaleRules.next(reading({ waiting: 500, lastChangeMs: now - 10_000 }))).toBe(
      6,
    );
  });

  it("steps down only after the queue has been empty for the scale-down delay", () => {
    const now = 1_000_000;
    expect(WorkerAutoscaleRules.next(reading({ idleSinceMs: now - 30_000 }))).toBe(4);
    expect(WorkerAutoscaleRules.next(reading({ idleSinceMs: now - 60_000 }))).toBe(2);
    expect(WorkerAutoscaleRules.next(reading({ current: 2, idleSinceMs: now - 600_000 }))).toBe(2);
  });

  it("pulls a lane outside the saved range back inside it", () => {
    expect(WorkerAutoscaleRules.next(reading({ current: 1 }))).toBe(2);
    expect(WorkerAutoscaleRules.next(reading({ current: 12 }))).toBe(8);
  });
});
