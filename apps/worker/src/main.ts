import { WorkerBootstrap } from "./bootstrap/index.js";
import { Env } from "./env.js";
import { Container, RedisConnection } from "./import.js";

const config = Env.containerConfig();
const container = new Container(config);

// Its own connection, which keeps `Container.redis` private. It must be a
// `RedisConnection` — see docs/reference/shutdown.md.
const redis = new RedisConnection({
  cacheUrl: config.redis.cacheUrl,
  queueUrl: config.redis.queueUrl,
});

const bootstrap = new WorkerBootstrap(container, redis);

// Before `start()`, so a throw during boot lands in the same log stream as one during
// work. Node's default handler prints a stack no collector can key on.
process.on("unhandledRejection", (reason: unknown) => {
  container.logger.failure(reason, { service: "worker", phase: "unhandledRejection" });
  process.exit(1);
});

process.on("uncaughtException", (error: unknown) => {
  container.logger.failure(error, { service: "worker", phase: "uncaughtException" });
  process.exit(1);
});

// Started but not yet awaited, so the handlers below exist while boot is still running.
// A signal arriving in that window drains instead of killing a half-built worker.
const started = bootstrap.start();

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    void started
      // Boot first: there is nothing to drain until the consumers are registered, and
      // `close()` on a worker that was never started is not the same as a drain.
      .then(() => bootstrap.stop(signal))
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        // Logged, never swallowed: a bare `.catch(() => process.exit(1))` turns every
        // shutdown failure into an exit code.
        container.logger.failure(error, { service: "worker", signal });
        process.exit(1);
      });
  });
}

// Top-level await works because the package is ESM under NodeNext resolution.
try {
  await started;
} catch (error: unknown) {
  container.logger.failure(error, { service: "worker", phase: "start" });
  process.exit(1);
}
