# 24 · `apps/worker` — background jobs

> A standalone Node process that shares the container and shares nothing else. No HTTP server, no framework, no shortcuts around the domain.

**Delivers:** A BullMQ worker that consumes queues and runs schedules, using the same use-cases the web app uses.

**Prerequisite:** [23 · `apps/web`](23-web-app.md)

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
├── eslint.config.js
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

## Step 24.1 — Package files

**`apps/worker/package.json`**

```json
{
  "name": "@ratchet/worker",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/main.js",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "lint": "eslint ."
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
pnpm add --filter @ratchet/worker \
  @ratchet/composition@workspace:* @ratchet/application@workspace:* \
  @ratchet/permissions@workspace:* @ratchet/core@workspace:* \
  bullmq@catalog: zod@catalog:
pnpm add --filter @ratchet/worker -D tsx typescript@catalog:
```
> No `contracts`, no `api-client`, no `ui`. The worker never speaks HTTP and never renders. It reaches use-cases through the container.

**`apps/worker/tsconfig.json`**

```json
{
  "extends": "@ratchet/tsconfig/node-esm.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src/**/*.ts"]
}
```

**`apps/worker/eslint.config.js`** extends `base` (not `react`) and exempts `src/env.ts` from the `process.env` rule, exactly as the web app does.

---

## Step 24.2 — `Env`

`apps/worker/src/env.ts` is structurally identical to the web app's: a Zod schema parsed at module load, exposing `containerConfig()`.

**It parses a smaller schema.** The worker needs `DATABASE_URL`, `REDIS_URL`, the S3 block, and the embedding block. It does **not** need `AUTH_SECRET`, `AUTH_URL`, or `AUTH_TRUSTED_ORIGINS` — it never issues or validates a session.

**Do not share one `env.ts` between the two apps by extracting it to a package.** The whole point of the `process.env` rule is that each deployable declares exactly what it needs. A shared schema would force the worker to carry an `AUTH_SECRET` it never uses, which is one more secret in one more environment for no reason.

Adapt `containerConfig()` to return the same shape minus `auth`, and make the `auth` block optional in `ContainerConfig` — the container only constructs `AuthFactory` when it is present.

---

## Step 24.3 — `SystemPrincipal`

Jobs have no user. They still need a principal, because `Authorizer.assert()` is not optional.

**`apps/worker/src/system-principal.ts`**

```ts
import { Principal } from "@ratchet/application";
import { CapabilitySet, PermissionRegistry } from "@ratchet/permissions";

export class SystemPrincipal {
  private constructor() {}

  /** Narrow, explicit, and reviewed. Never PermissionRegistry.all(). */
  private static readonly GRANTS = [
    "ai.embedding.write",
    "ai.embedding.read",
    "core.activity.write",
  ] as const;

  public static forOrganisation(organisationId: string): Principal {
    const grants = SystemPrincipal.GRANTS.map((key) => {
      if (!PermissionRegistry.isKnown(key)) {
        throw new Error(`System principal references unknown permission: ${key}`);
      }
      return { permission: key, goalId: null };
    });

    return Principal.system(organisationId, new CapabilitySet(grants));
  }
}
```

**A wildcard here would erase every authorization guarantee in the codebase.** The moment `SystemPrincipal` carries `PermissionRegistry.all()`, any bug that lets user input reach a job path becomes a full privilege escalation. Three named permissions, added deliberately, reviewed like any other grant.

**The `isKnown()` check catches typos and deleted permissions at boot** rather than at 3am when a job silently starts failing authorization.

**Every job carries an organisation.** There is no global system principal, because there is no global data — a job that processes rows must know whose rows.

---

## Step 24.4 — A consumer

**`apps/worker/src/consumer/embedding.consumer.ts`**

```ts
import { Worker, type Job } from "bullmq";
import type { Container } from "@ratchet/composition";
import { QueueName } from "@ratchet/infrastructure";
import { SystemPrincipal } from "../system-principal.js";

interface EmbeddingJobData {
  readonly organisationId: string;
  readonly documentId: string;
  readonly text: string;
}

export class EmbeddingConsumer {
  public constructor(
    private readonly container: Container,
    private readonly connection: { host: string; port: number },
  ) {}

  public start(): Worker {
    return new Worker<EmbeddingJobData>(
      QueueName.Embedding,
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

## Step 24.5 — Schedules

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

## Step 24.6 — Bootstrap and entrypoint

**`apps/worker/src/worker-bootstrap.ts`**

```ts
export class WorkerBootstrap {
  private readonly workers: Worker[] = [];

  public constructor(private readonly container: Container, private readonly redis: { host: string; port: number }) {}

  public async start(): Promise<void> {
    this.workers.push(new EmbeddingConsumer(this.container, this.redis).start());
    await new CleanupSchedule(this.container, this.redis).register();
    console.log(`worker started: ${this.workers.length} consumer(s)`);
  }

  public async stop(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()));
    await this.container.dispose();
  }
}
```

**`apps/worker/src/main.ts`**

```ts
import { Container } from "@ratchet/composition";
import { Env } from "./env.js";
import { WorkerBootstrap } from "./worker-bootstrap.js";

const container = new Container(Env.containerConfig());
const bootstrap = new WorkerBootstrap(container, Env.redisConnection());

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

## Step 24.7 — Run it

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

[← `apps/web`](23-web-app.md) · [Hygiene and CI →](25-hygiene-and-ci.md)
