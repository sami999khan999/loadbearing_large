# 25 · `apps/worker` — background jobs

> A standalone Node process that shares the container and shares nothing else. No HTTP server, no framework, no shortcuts around the domain.

**Delivers:** A BullMQ worker that consumes queues and runs schedules, using the same use-cases the web app uses.

**Prerequisite:** [24 · `apps/web`](24-web-app.md)

---

## Why a separate process

The web app and the worker have opposite failure profiles. A request handler should die fast and be restarted; a job runner should drain gracefully and retry. They scale on different axes — you might want six web instances and one worker, or the reverse. And an embedding job that pins a CPU core for eight seconds must not sit inside the process serving your latency-sensitive traffic.

Running BullMQ inside the web process also breaks the moment you run two web instances: every repeatable job fires twice.

**The worker is not "the web app without routes".** It is a peer application that consumes the same `packages/`.

---

## Layout

```
apps/worker/
├── package.json
├── tsconfig.json
└── src/
    ├── env.ts                        → Env  (the second and last process.env reader)
    ├── main.ts                       ← entrypoint
    ├── worker-bootstrap.ts           → WorkerBootstrap
    ├── system-principal.ts           → SystemPrincipal
    ├── consumer/
    │   └── embedding.consumer.ts     → EmbeddingConsumer
    └── schedule/
        └── cleanup.schedule.ts       → CleanupSchedule
```

---

## Step 25.1 — Package files

**`apps/worker/package.json`**

```json
{
  "name": "@loadbearing/worker",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/main.js",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  }
}
```
> No bundler. The worker runs on Node directly, so `tsc` emitting plain ESM is the whole build. `tsx watch` gives the same reload loop the web app has.

### Why not Node's native TypeScript support

Node 24 runs `.ts` files directly by stripping types, which looks like it should replace `tsx` here. It cannot, for a specific reason: **type stripping only erases syntax, so it rejects any TypeScript construct that emits runtime code** — enums, namespaces, decorators, and, decisively, **constructor parameter properties**.

```ts
// every class in this repository looks like this
public constructor(private readonly clock: Clock) {}
```

That form is not merely used, it is *mandated* by the `parameter-properties` ESLint rule from [05](05-lint-and-format.md). Native stripping would reject the first file it read. `tsx` transpiles rather than strips, so it handles all of it.

Revisit this only if you ever set `erasableSyntaxOnly: true` and rewrite every constructor to explicit field assignment. That is a large change to remove one dev dependency, and it costs you the rule that keeps constructors declarative.

```bash
pnpm add --filter @loadbearing/worker \
  @loadbearing/composition@workspace:* @loadbearing/application@workspace:* \
  @loadbearing/infrastructure@workspace:* @loadbearing/permissions@workspace:* \
  @loadbearing/core@workspace:* \
  bullmq@catalog: ioredis@catalog: zod@catalog:
pnpm add --filter @loadbearing/worker -D tsx@catalog: typescript@catalog:
```
> No `contracts`, no `api-client`, no `ui`. The worker never speaks HTTP and never renders. It reaches use-cases through the container.
>
> `infrastructure` is here for `RedisConnection` and `QueueName`, and `ioredis` for the `Redis` type on the consumer constructor. Both are server-only, which is fine — the worker is a server process and the [05](05-lint-and-format.md) boundary only applies to React packages and `apps/web`.

**`apps/worker/tsconfig.json`**

```json
{
  "extends": "@loadbearing/tsconfig/node-esm.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src/**/*.ts"]
}
```

**No lint config here either.** The `apps/*/src/env.ts` exemption in the root `biome.json` covers this app's `env.ts` by the same glob that covers the web app's.

---

## Step 25.2 — `Env`

`apps/worker/src/env.ts` is structurally identical to the web app's: a Zod schema parsed at module load, exposing `containerConfig()`.

**It parses a smaller schema.** The worker needs `DATABASE_URL`, `REDIS_URL`, the S3 block, and the embedding block. It does **not** need `AUTH_SECRET`, `AUTH_URL`, or `AUTH_TRUSTED_ORIGINS` — it never issues or validates a session.

**Do not share one `env.ts` between the two apps by extracting it to a package.** The whole point of the `process.env` rule is that each deployable declares exactly what it needs. A shared schema would force the worker to carry an `AUTH_SECRET` it never uses, which is one more secret in one more environment for no reason.

Adapt `containerConfig()` to return the same shape minus `auth`, and make the `auth` block optional in `ContainerConfig` — the container only constructs `AuthFactory` when it is present.

---

## Step 25.3 — `SystemPrincipal`

Jobs have no user. They still need a principal, because `Authorizer.assert()` is not optional.

**`apps/worker/src/system-principal.ts`**

```ts
import { Principal } from "@loadbearing/application";
import type { UserId } from "@loadbearing/contracts";
import { CapabilitySet, PermissionRegistry, type PermissionKey } from "@loadbearing/permissions";

export class SystemPrincipal {
  private constructor() {}

  /**
   * Narrow, explicit, and reviewed. Never PermissionRegistry.instance.all().
   * Typed as string[] so isKnown() can narrow each entry to a PermissionKey.
   */
  private static readonly GRANTS: readonly string[] = [
    "ai.embedding.write",
    "ai.embedding.read",
    "core.activity.write",
  ];

  public static forOrganisation(organisationId: string): Principal {
    const registry = PermissionRegistry.instance;

    const grants: PermissionKey[] = SystemPrincipal.GRANTS.map((key) => {
      if (!registry.isKnown(key)) {
        throw new Error(`System principal references unknown permission: ${key}`);
      }
      return key;
    });

    return Principal.system(
      organisationId as UserId,
      CapabilitySet.from({
        wildcard: false,
        org: { grants, denies: [] },
        goals: {},
      }),
    );
  }
}
```

> [!IMPORTANT]
> Three things here are easy to get wrong, and all three are compile or boot failures rather than silent bugs:
>
> - **`CapabilitySet.from(dto)`, never `new CapabilitySet(...)`** — the constructor is private ([08](08-permissions-package.md)), and the argument is a `CapabilitySetDto`, not a list of `{ permission, goalId }` pairs.
> - **`PermissionRegistry.instance.isKnown(...)`** — `isKnown` is an instance method on the singleton, not a static.
> - **`GRANTS` is `readonly string[]`, not `as const`.** A literal-union type cannot be narrowed to `PermissionKey` by the type predicate unless the keys already exist in the catalog, so `as const` makes the `.map()` fail to typecheck.
>
> The three keys above are **illustrative** — the starter kit ships only the `rbac` catalog fragment, so as written this throws at boot. Add the real keys to `packages/permissions/src/catalog/` first. That boot-time failure is the rule working: a system principal naming a permission that does not exist should never start.

**A wildcard here would erase every authorization guarantee in the codebase.** The moment `SystemPrincipal` carries `PermissionRegistry.all()`, any bug that lets user input reach a job path becomes a full privilege escalation. Three named permissions, added deliberately, reviewed like any other grant.

**The `isKnown()` check catches typos and deleted permissions at boot** rather than at 3am when a job silently starts failing authorization.

**Every job carries an organisation.** There is no global system principal, because there is no global data — a job that processes rows must know whose rows.

---

## Step 25.4 — A consumer

**`apps/worker/src/consumer/embedding.consumer.ts`**

```ts
import { Worker, type Job } from "bullmq";
import type { Redis } from "ioredis";
import type { Container } from "@loadbearing/composition";
import { QueueName } from "@loadbearing/infrastructure";
import { SystemPrincipal } from "../system-principal.js";

interface EmbeddingJobData {
  readonly organisationId: string;
  readonly documentId: string;
  readonly text: string;
}

export class EmbeddingConsumer {
  public constructor(
    private readonly container: Container,
    private readonly connection: Redis,
  ) {}

  public start(): Worker {
    return new Worker<EmbeddingJobData>(
      QueueName.EMBEDDING,
      async (job: Job<EmbeddingJobData>) => this.handle(job),
      { connection: this.connection, concurrency: 4 },
    );
  }

  private async handle(job: Job<EmbeddingJobData>): Promise<void> {
    const principal = SystemPrincipal.forOrganisation(job.data.organisationId);
    await this.container.ai.indexDocument.execute(principal, {
      documentId: job.data.documentId,
      text: job.data.text,
    });
  }
}
```

**The consumer is a thin adapter, exactly like an oRPC router.** Deserialise the job, build a principal, call a use-case. All the logic lives in `IndexDocumentUseCase`, which is testable without Redis and callable from an HTTP endpoint too.

**`concurrency` is per worker instance, not global.** Four instances at concurrency 4 is sixteen in-flight jobs, and each one may hold a Postgres connection. Keep `concurrency × instances` below your pool size.

**Let the handler throw.** BullMQ's retry and backoff are driven by rejection. Catching and logging turns a retryable failure into permanent silent data loss.

---

## Step 25.5 — Schedules

**`apps/worker/src/schedule/cleanup.schedule.ts`** registers a BullMQ repeatable job:

```ts
await queue.add(
  "cleanup",
  {},
  {
    repeat: { pattern: "0 3 * * *" },
    jobId: "cleanup-daily",
    removeOnComplete: 10,
    removeOnFail: 100,
  },
);
```

**The fixed `jobId` makes registration idempotent.** Booting the worker three times registers one schedule, not three. Without it, every deploy adds another copy and your nightly job runs eleven times by Friday.

### The two schedule rules

**1. Idempotent by construction.** A repeatable job will run twice — during a deploy overlap, after a Redis failover, whenever a worker is killed mid-job and BullMQ re-delivers. Design the *use-case* so a second run is a no-op: `UPDATE ... WHERE status = 'pending'` rather than `UPDATE ... SET count = count + 1`.

**2. Record before you send.** Anything with an external side effect — an email, a webhook, a payment — writes its "sent" row in the same transaction that decides to send, and checks that row first. Sending and then recording means a crash between the two sends it again on retry.

**Never run cron in the web process.** Two web instances means every schedule fires twice, and nothing in the code will tell you.

---

## Step 25.6 — Bootstrap and entrypoint

**`apps/worker/src/worker-bootstrap.ts`**

```ts
export class WorkerBootstrap {
  private readonly workers: Worker[] = [];

  public constructor(
    private readonly container: Container,
    private readonly redis: RedisConnection,
  ) {}

  public async start(): Promise<void> {
    this.workers.push(new EmbeddingConsumer(this.container, this.redis.queueClient()).start());
    await new CleanupSchedule(this.container, this.redis.queueClient()).register();
    console.log(`worker started: ${this.workers.length} consumer(s)`);
  }

  public async stop(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()));
    await this.redis.close();
    await this.container.dispose();
  }
}
```

> [!IMPORTANT]
> **Use `RedisConnection` from [15](15-infrastructure-package.md), not a bare `{ host, port }`.** BullMQ accepts either, but `queueClient()` is what applies `maxRetriesPerRequest: null` and omits the cache key prefix — the two settings BullMQ requires. A plain `{ host, port }` gets ioredis defaults, and the symptom is workers that stop consuming after a few minutes with no error.
>
> The worker builds **its own** `RedisConnection` rather than reaching into the container's, which keeps `Container.redis` private and gives consuming and publishing independent connections. Close it in `stop()`, before disposing the container.

**`apps/worker/src/main.ts`**

```ts
import { Container } from "@loadbearing/composition";
import { RedisConnection } from "@loadbearing/infrastructure";
import { Env } from "./env.js";
import { WorkerBootstrap } from "./worker-bootstrap.js";

const config = Env.containerConfig();
const container = new Container(config);
const bootstrap = new WorkerBootstrap(container, new RedisConnection({ url: config.redis.url }));

await bootstrap.start();

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    void bootstrap.stop().then(() => process.exit(0));
  });
}
```

**Graceful shutdown is not optional for a worker.** `worker.close()` waits for in-flight jobs to finish before disconnecting. Killing the process mid-job leaves it stalled until BullMQ's lock expires — up to 30 seconds of a job that looks running and is not.

**Top-level `await` works** because the package is ESM and the tsconfig targets ES2024 under `NodeNext` resolution.

---

## Step 25.7 — Run it

```bash
pnpm dev:worker
```

Then, from `psql` or a scratch script, enqueue a job and watch the log. A round trip that ends with a row in `document_embeddings` proves the whole chain: env → container → queue → consumer → use-case → port → adapter → Postgres.

---

## ✅ Gate

- `pnpm dev:worker` boots and logs its consumer count.
- Enqueuing an embedding job produces a row in `document_embeddings`.
- `SIGTERM` drains in-flight jobs before exiting.
- Restarting the worker three times leaves exactly **one** repeatable `cleanup-daily` entry (`redis-cli --scan --pattern 'bull:*repeat*'`).
- `apps/worker/src/env.ts` is the only file in the app reading `process.env`.

Do not proceed until this passes.

---

[← `apps/web`](24-web-app.md) · [Hygiene and CI →](26-hygiene-and-ci.md)
