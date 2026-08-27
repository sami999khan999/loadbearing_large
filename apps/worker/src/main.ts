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

// Top-level await works because the package is ESM and the tsconfig targets ES2024
// under NodeNext resolution.
await bootstrap.start();

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
