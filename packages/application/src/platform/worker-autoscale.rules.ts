import type { WorkerQueueSettingsRecord } from "./worker-queue-settings.repository.js";

// The least time between two changes to one lane. Without it a burst scales up every
// tick, faster than the new capacity can show in the waiting count.
const COOLDOWN_MS = 10_000;

export interface AutoscaleReading {
  readonly current: number;
  // The process's `WORKER_<Q>_CONCURRENCY`: what an unscaled lane runs at.
  readonly start: number;
  readonly settings: WorkerQueueSettingsRecord | null;
  // `QueueLimits` for the queue, and what the process ceiling leaves after its other lanes.
  readonly limit: number;
  readonly headroom: number;
  readonly waiting: number;
  readonly nowMs: number;
  readonly lastChangeMs: number;
  // When the queue was last seen empty and has stayed so; null while it has work.
  readonly idleSinceMs: number | null;
}

// What a queue with no saved row starts from when someone first opens its autoscale form.
const DEFAULTS = Object.freeze({
  concurrencyMin: 1,
  scaleUpWaiting: 50,
  step: 1,
  scaleDownAfterSeconds: 60,
});

export class WorkerAutoscaleRules {
  private constructor() {}

  public static readonly DEFAULTS = DEFAULTS;
  public static readonly MIN_SCALE_DOWN_SECONDS = 10;

  // The concurrency one lane should run at next. Pure, so the supervisor's tick and its
  // tests agree on every boundary.
  public static next(reading: AutoscaleReading): number {
    const { current, settings, limit } = reading;
    const room = current + Math.max(0, reading.headroom);

    if (!settings?.autoscaleEnabled) return Math.max(1, Math.min(reading.start, limit, room));

    const floor = Math.max(1, Math.min(settings.concurrencyMin, limit));
    const ceiling = Math.max(floor, Math.min(settings.concurrencyMax, limit));

    if (current < floor) return Math.min(floor, Math.max(current, room));
    if (current > ceiling) return ceiling;

    const sinceChange = reading.nowMs - reading.lastChangeMs;

    if (reading.waiting >= settings.scaleUpWaiting && sinceChange >= COOLDOWN_MS) {
      return Math.max(current, Math.min(current + settings.step, ceiling, room));
    }

    const idleFor = reading.idleSinceMs === null ? 0 : reading.nowMs - reading.idleSinceMs;
    const quietMs = settings.scaleDownAfterSeconds * 1_000;
    if (reading.waiting === 0 && idleFor >= quietMs && sinceChange >= quietMs) {
      return Math.max(floor, current - settings.step);
    }

    return current;
  }
}
