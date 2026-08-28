import { Container } from "@loadbearing/composition";
import { RedisConnection } from "@loadbearing/infrastructure";
import { Env } from "./env.js";
import { WorkerBootstrap } from "./worker-bootstrap.js";

const config = Env.containerConfig();
const container = new Container(config);

// Its own connection rather than the container's, which keeps `Container.redis`
// private and gives consuming and publishing independent connections. `RedisConnection`
// is what applies `maxRetriesPerRequest: null` — a bare `{ host, port }` gets ioredis
// defaults and the symptom is a worker that stops consuming with no error (15).
const redis = new RedisConnection({
  cacheUrl: config.redis.cacheUrl,
  queueUrl: config.redis.queueUrl,
});

const bootstrap = new WorkerBootstrap(container, redis);

// Registered before `start()`, so a throw during boot lands in the same log stream as
// a throw during work. Node's default handler prints a bare stack to stderr, which no
// collector can key on — the same argument the shutdown `.catch` below already makes.
process.on("unhandledRejection", (reason: unknown) => {
  container.logger.failure(reason, { service: "worker", phase: "unhandledRejection" });
  process.exit(1);
});

process.on("uncaughtException", (error: unknown) => {
  container.logger.failure(error, { service: "worker", phase: "uncaughtException" });
  process.exit(1);
});

// Top-level await works because the package is ESM and the tsconfig targets ES2024
// under NodeNext resolution.
try {
  await bootstrap.start();
} catch (error: unknown) {
  container.logger.failure(error, { service: "worker", phase: "start" });
  process.exit(1);
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    void bootstrap
      .stop(signal)
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        // Logged, never swallowed. A bare `.catch(() => process.exit(1))` turns every
        // shutdown failure into a bare exit code, which is unreadable in a container log.
        container.logger.failure(error, { service: "worker", signal });
        process.exit(1);
      });
  });
}
