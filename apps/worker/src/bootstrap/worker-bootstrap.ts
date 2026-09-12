import {
  AnalyticsConsumer,
  EmbeddingConsumer,
  MailConsumer,
  MaintenanceConsumer,
} from "../consumer/index.js";
import { Env } from "../env.js";
import type { Container, RedisConnection, Worker } from "../import.js";
import {
  ArchiveSchedule,
  CleanupSchedule,
  PartitionsSchedule,
  ProjectionSchedule,
  ReconcileSchedule,
} from "../schedule/index.js";

export class WorkerBootstrap {
  private readonly workers: Worker[] = [];
  private draining: Promise<void> | null = null;

  public constructor(
    private readonly container: Container,
    private readonly redis: RedisConnection,
  ) {}

  public async start(): Promise<void> {
    this.workers.push(
      new EmbeddingConsumer(
        this.container,
        this.redis.queueClient(),
        Env.embeddingConcurrency,
      ).start(),
    );

    // Unconditional, and the reason is in `.env.example`: every mail in this system is a
    // job, so a stopped worker is a sign-up whose verification link never arrives.
    this.workers.push(
      new MailConsumer(
        this.container,
        this.redis.queueClient(),
        Env.mailConcurrency,
        Env.mailRatePerMinute,
      ).start(),
    );

    // Before the schedules register, so an entry that fires the instant it lands has
    // somewhere to run. See docs/reference/schedules.md.
    this.workers.push(
      new MaintenanceConsumer(
        this.container,
        this.redis.queueClient(),
        Env.maintenanceConcurrency,
      ).start(),
    );

    // The branch is the point: without a ClickHouse config no consumer starts and no
    // schedule registers. See docs/reference/consumers.md.
    if (this.container.hasProjector) {
      this.workers.push(
        new AnalyticsConsumer(
          this.container,
          this.redis.queueClient(),
          Env.analyticsConcurrency,
        ).start(),
      );
    }

    await new PartitionsSchedule(this.container, this.redis.queueClient()).register();
    await new CleanupSchedule(this.container, this.redis.queueClient()).register();
    await new ArchiveSchedule(this.container, this.redis.queueClient()).register();

    if (this.container.hasProjector) {
      await new ProjectionSchedule(this.container, this.redis.queueClient()).register();
      await new ReconcileSchedule(this.container, this.redis.queueClient()).register();
    }

    this.container.logger.emit("process.started", {
      service: "worker",
      // The only difference on the wire between a worker running the analytics pipeline
      // and one built without a store to project into.
      consumers: this.workers.length,
    });
  }

  // Idempotent, and a second signal *joins* the drain already running. Returning early
  // resolves at once, and `main.ts` exits on that — mid-close. See docs/reference/shutdown.md.
  public stop(signal: string): Promise<void> {
    this.draining ??= this.drain(signal);
    return this.draining;
  }

  private async drain(signal: string): Promise<void> {
    this.container.logger.emit("process.stopping", { service: "worker", signal });
    const startedAt = this.container.clock.now();

    // Handled before the race, never after: once the timeout has won, a rejection arriving
    // late has nowhere to land but `unhandledRejection`, which exits 1 over a clean drain.
    const closed = Promise.all(this.workers.map((w) => w.close())).then(
      () => undefined,
      (error: unknown) => {
        this.container.logger.failure(error, { service: "worker", phase: "close" });
      },
    );

    // `close()` drains; the race is the backstop, because a job that never returns must
    // not hold the process past the platform's SIGKILL timer.
    await Promise.race([closed, WorkerBootstrap.after(Env.shutdownTimeoutMs)]);

    await this.redis.close();

    this.container.logger.emit("process.stopped", {
      service: "worker",
      durationMs: this.container.clock.now().getTime() - startedAt.getTime(),
    });

    // Last, because everything closing above it may have had something to say.
    await this.container.dispose();
  }

  private static after(ms: number): Promise<void> {
    return new Promise((resolve) => {
      // Unreferenced, so a pending timer cannot keep the loop alive once every worker
      // has drained.
      setTimeout(resolve, ms).unref();
    });
  }
}
