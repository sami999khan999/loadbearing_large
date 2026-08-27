import type { Container } from "@loadbearing/composition";
import type { RedisConnection } from "@loadbearing/infrastructure";
import type { Worker } from "bullmq";
import { AnalyticsConsumer } from "./consumer/analytics.consumer.js";
import { EmbeddingConsumer } from "./consumer/embedding.consumer.js";
import { MaintenanceConsumer } from "./consumer/maintenance.consumer.js";
import { Env } from "./env.js";
import { ArchiveSchedule } from "./schedule/archive.schedule.js";
import { CleanupSchedule } from "./schedule/cleanup.schedule.js";
import { PartitionsSchedule } from "./schedule/partitions.schedule.js";
import { ProjectionSchedule } from "./schedule/projection.schedule.js";
import { ReconcileSchedule } from "./schedule/reconcile.schedule.js";

export class WorkerBootstrap {
  private readonly workers: Worker[] = [];
  private stopping = false;

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

    // Started before the schedules register, so a repeatable entry that fires the
    // instant it lands has somewhere to run. Registering a schedule onto a queue with
    // no consumer is what left `cleanup-daily` silently accumulating.
    this.workers.push(
      new MaintenanceConsumer(
        this.container,
        this.redis.queueClient(),
        Env.maintenanceConcurrency,
      ).start(),
    );

    // The derived-store pipeline, and the whole branch is the point. A container built
    // without a ClickHouse config holds no `AnalyticsProjector`, so no consumer starts
    // and no schedule registers — the analytics queue stays empty rather than filling
    // with jobs that would each project into nothing.
    //
    // Same failure the maintenance consumer was written for, in the harder direction:
    // a schedule with no consumer accumulates silently, and a consumer with no store
    // succeeds silently, which is the one that survives a code review.
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
      // The projection consumer is counted here when it started and absent when it
      // did not, which is the only difference on the wire between a worker running
      // the analytics pipeline and one built without a store to project into.
      consumers: this.workers.length,
    });
  }

  // Idempotent: a SIGINT arriving during a SIGTERM drain must not close everything
  // twice, which surfaces as an unhandled rejection from an already-closed client.
  public async stop(signal: string): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;

    this.container.logger.emit("process.stopping", { service: "worker", signal });
    const startedAt = this.container.clock.now();

    // `close()` waits for in-flight jobs to finish. The race is the backstop: a job
    // that never returns must not hold the process past the platform's SIGKILL timer.
    await Promise.race([
      Promise.all(this.workers.map((w) => w.close())),
      WorkerBootstrap.after(Env.shutdownTimeoutMs),
    ]);

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
      // Unreferenced, so a pending timer cannot be the thing keeping the loop alive
      // once every worker has already drained.
      setTimeout(resolve, ms).unref();
    });
  }
}
