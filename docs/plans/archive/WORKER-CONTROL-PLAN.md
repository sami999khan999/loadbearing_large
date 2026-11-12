---
title: Worker control plan — runtime queue assignment, pause and in-process autoscaling from the platform dashboard
updated: 2026-10-10
owner: sami
schema: plan/v1
source: owner request 2026-10-10; one read-only survey (worker boot, platform admin, deployment, platform_policy, observability); two rounds of questions answered by the owner
---

# Worker control: runtime queue assignment, pause and in-process autoscaling

## Context
Today every worker process runs every consumer:
- Five in mini, six in large.
- Concurrency is fixed by `WORKER_*_CONCURRENCY` at boot (`apps/worker/src/bootstrap/worker-bootstrap.ts`).

The user wants platform admins to manage workers from the dashboard:
- See the running worker processes.
- Pause and resume a whole queue, one process, or one queue on one process.
- Change which queues a process serves at runtime, taking effect within about a second.
- Set autoscaling: "add capacity when waiting jobs reach N, never above a maximum".

**Decisions taken with the user:**
- The app never starts or stops processes; that's the host's job. Autoscaling means *capacity inside running processes*: each queue's concurrency moves between a min and a max with load.
- **Large** gets all of it. **Mini** stays simple: same names and seams, so the large version copies back without architectural change.
- Changes apply within about 1 s, through Redis pub/sub, with a 5 s re-check as fallback.

**What exists:**
- BullMQ 5.81 supports runtime `worker.concurrency = n`, `worker.pause()` / `resume()` (one process) and `queue.pause()` / `resume()` (global, stored in Redis).
- The kit uses none of them yet.
- There is no worker id, heartbeat, queue-stats reader or worker dashboard.
- Platform pattern to copy:
  - permissions `platform.<subject>.read|manage` in `packages/permissions/src/catalog/platform.permissions.ts`;
  - use case shape `toggle-replica-reads.use-case.ts` (assert, unit of work, `activity.record`);
  - pages in `apps/web/src/route/(app)/_authenticated/platform/*.tsx` with `RouteGuard.requirePermission` and `<Can>`;
  - contract in `platform.contract.ts`, router in `platform.router.ts`.

## As built (2026-10-10)
Built as planned, with these differences, each forced by a repo rule or by what the code can know:
- **Port names take a role suffix:** `WorkerFleetGateway`, `QueueControlGateway` and
  `WorkerQueueSettingsRepository`, in `application/src/platform/` beside the other platform ports.
  `QueueLimits` moved to `application/src/primitive/`, so the use cases can validate against it.
- **Procedures are flat, like every platform procedure:** `platform.workerFleet`, `pauseQueue`,
  `saveQueueAutoscale`, `pauseWorker`, `setWorkerQueues` and `resetWorker`.
- **Pause and resume are one use case each, with a `paused` flag:** `PauseWorkerQueueUseCase` and
  `PauseWorkerProcessUseCase`.
- **Autoscale off means the env value**, not the saved minimum. Pausing a queue with no saved row
  then changes nothing else about it.
- **No `version` on the heartbeat:** nothing in the worker's environment carries a release.
- **No `updated_by` column and no permission migration.** The activity log records who changed a
  queue, and `PlatformRoleSeed` grants every platform key at seed time.
- **No `worker.queue.unserved` log event:** the page computes it, and the use case that would emit
  it may not log.

## Words used
- **Process:** one running worker app (a container or replica). At boot it gets an id: `hostname-pid-random4`.
- **Lane:** one queue being served inside one process, which is one BullMQ `Worker` with its own concurrency.
- **Queue settings:** cluster-wide, per queue: paused, autoscale min, max, scale-up-at N, step, scale-down delay.
- **Process overrides:** per process, set from the dashboard: paused, and the queue list (replacing `WORKER_QUEUES` until reset).

## Large: the full build

### 1. The worker runs a supervisor (`apps/worker/src/supervisor/`)
- `WorkerSupervisor` replaces the hard-coded consumer list in `WorkerBootstrap.start()`.
  - Each consumer class becomes a **lane factory**: `(queue) => Processor + options`, so one lane can be created, closed and recreated at runtime. Keep the existing consumer handlers.
  - A `LaneRegistry` maps `QueueName` to a factory. Analytics is registered only `if (container.hasProjector)`.
- **Boot:**
  1. Register the process.
  2. Read the queue settings and the process's overrides.
  3. Start lanes for `overrides.queues ?? Env.queues`, where `WORKER_QUEUES` defaults to all.
  4. Subscribe to `worker:control`.
- **Reconcile**, on each control message and every 5 s:
  - Start missing lanes; close removed lanes gracefully (`worker.close()` waits for active jobs).
  - Process paused: `worker.pause()` on every lane. Lane paused: pause that lane only.
  - Set `worker.concurrency` from the autoscaler.
  - Write the heartbeat: state, lanes, concurrency, active jobs, version and uptime, with a TTL of 15 s.
- **Autoscaler**, per lane per tick, from `queue.getJobCounts("waiting","prioritized")`:
  - waiting ≥ N, and no change in the last `cooldown` seconds → concurrency += step, up to max;
  - waiting = 0 for `scaleDownAfter` seconds → concurrency −= step, down to min;
  - with autoscale off, concurrency stays at `min`.
  - Hard ceilings the dashboard can't exceed:
    - per-queue limits in code (`QueueLimits`; for example, analytics is at most 1);
    - `WORKER_PROCESS_MAX_CONCURRENCY` across all lanes of one process, which protects the DB pool. The existing `warnIfOversubscribed()` becomes this check.
- **Shutdown:** stop ticking, remove the heartbeat, then the existing `drain()`.
- **Schedules:** register unchanged (repeatables dedupe). A paused queue keeps collecting scheduled jobs.

### 2. State storage
- **Queue settings** live in Postgres. New catalog table `worker_queue_settings` (`queue` PK, `paused`, `autoscale_enabled`, `concurrency_min`, `concurrency_max`, `scale_up_waiting`, `step`, `scale_down_after_seconds`, `updated_at`, `updated_by`).
  - Not tenant-owned, so it isn't partitioned. Placement is `catalog`.
  - A missing row means the env defaults (`WORKER_<Q>_CONCURRENCY` becomes the min, with autoscale off).
- **Registry, overrides and control** live in Redis on the **queue Redis**, which is `noeviction` and already connected in every worker. The cache Redis is `allkeys-lru` and could evict an override.
  - `worker:procs`: a sorted set of process ids by heartbeat time. Stale entries are pruned when read.
  - `worker:proc:{id}`: heartbeat hash, TTL 15 s.
  - `worker:proc:{id}:overrides`: TTL refreshed by the heartbeat, so it dies with the process.
  - `worker:control`: pub/sub channel. The message names the target (`all` or a process id).
- **Global pause:** the DB flag is the source of truth, and the use case also calls BullMQ `queue.pause()`. On boot, the supervisor sets the BullMQ state from the DB flag.

### 3. Application (`packages/application/src/platform/worker/`)
- **Ports:**
  - `WorkerFleet`: `list()`, `setOverrides(id, …)`, `clearOverrides(id)`, `signal(target)`.
  - `QueueControl`: `counts(queues)`, `pause(queue)`, `resume(queue)`.
  - `WorkerQueueSettingsRepository`: `all()`, `save()`.
- **Use cases:**
  - `GetWorkerFleetUseCase`: processes, queues with counts and settings, and an **unserved-queue warning** when no live process serves a queue.
  - `PauseQueueUseCase` / `ResumeQueueUseCase`.
  - `SaveQueueAutoscaleUseCase`: validates min ≤ max ≤ `QueueLimits` and N ≥ 1.
  - `PauseWorkerProcessUseCase` / `ResumeWorkerProcessUseCase`.
  - `SetWorkerProcessQueuesUseCase`: refuses an empty list, and warns when the change leaves a queue unserved.
  - `ResetWorkerProcessUseCase`.
- Every write use case asserts `platform.worker.manage`, records `platform.worker.*` activity, then calls `fleet.signal()`.
- **Permissions:** `platform.worker.read` and `platform.worker.manage` (manage requires read), plus `PLATFORM_ROUTE_PERMISSION.workers`, a nav gate, and the permission seeding migration.

### 4. Infrastructure and composition
- `infrastructure/src/redis/redis-worker-fleet.ts`, `infrastructure/src/bullmq/bullmq-queue-control.ts` (beside `bullmq-queue.publisher.ts`, reusing its `Queue`-per-name cache), and `pg/repository/pg-worker-queue-settings.repository.ts` with a migration.
- In-memory fakes in `packages/composition/src/fake/`.
- `Container.workers.*` exposes the use cases.
- Event catalog entries in `packages/observability/src/catalog`:
  - `worker.lane.started|stopped`
  - `worker.process.paused|resumed`
  - `worker.autoscale.changed`
  - `worker.queue.unserved`

### 5. Transport and dashboard
- `platform.contract.ts` and `platform.router.ts` get a `workers` group: `fleet`, `pauseQueue`, `resumeQueue`, `saveAutoscale`, `pauseProcess`, `resumeProcess`, `setProcessQueues`, `resetProcess`.
- **Page** `apps/web/src/route/(app)/_authenticated/platform/workers.tsx`, with panels in `packages/feature/src/platform/worker/`:
  - **Queues table:**
    - columns: waiting, active, delayed, failed, paused toggle, serving processes, total concurrency, unserved warning;
    - an **Autoscale** dialog with enabled, min, max, "add capacity when waiting ≥ N", step and scale-down delay.
  - **Processes table:**
    - columns: id, host, uptime, version, state, last heartbeat;
    - per lane: current concurrency and active jobs;
    - actions: pause or resume the process, pause or resume one lane, edit queues (checkboxes), reset to env.
  - It refreshes every 3 s (`refetchInterval`).
  - Manage controls are wrapped in `<Can permission="platform.worker.manage">`.
- Copy in `packages/content` (en and bn).

### 6. Env and docs
- **Env:** `WORKER_QUEUES` (comma list, default all; unknown names fail at boot) and `WORKER_PROCESS_MAX_CONCURRENCY` (default 64).
  - Update `.env.example`, `apps/worker/src/env.ts` and `apps/worker/docs/reference/env.md`.
  - The existing concurrency vars become "starting concurrency / default min".
- **Docs:**
  - `apps/worker/docs/reference/supervisor.md`: lanes, reconcile, autoscaler, ceilings.
  - `docs/infra/deployment.md`: running specialised worker services, for example a `WORKER_QUEUES=assistant` service with N replicas on any host.
  - The existing "stop the worker consuming" Redis-migration step becomes "pause all queues from the dashboard".

## Mini: simple, but scales the same way — lite's own plan is `docs/plans/WORKER-SCALING-PLAN.md` there
- **Built now:**
  - `WORKER_QUEUES` env, so any host can run specialised worker services and replicas.
  - The `WorkerSupervisor` and lane-factory structure with **static** lanes: start the assigned lanes at boot, drain on shutdown. No control loop, registry or autoscaler.
  - `QueueLimits` and `WORKER_PROCESS_MAX_CONCURRENCY` as a boot-time check.
  - `pnpm queue:pause <queue>` / `queue:resume <queue>` / `queue:status`: a CLI beside `queue-replay.ts`, using BullMQ's global pause and `getJobCounts`.
- **Same names as large** (ports `WorkerFleet`, `QueueControl`, table `worker_queue_settings`, permissions `platform.worker.*`), so the copy-back is additive.
  - `docs/scale/worker-control.md` lists the large commit range and the files to copy for the dashboard, runtime control and autoscaling, the way `docs/scale/*.md` handles other copy-backs.
- `docs/plans/AI-CHAT-PLAN.md` step 5 points at `WORKER_QUEUES` from this plan instead of defining it.

## Order and process
1. Write both plan files and register them: large `plans/` with `BACKLOG.md` linking it; mini `docs/plans/` with `index.md` and `meta.json`. **No code until the user says so.**
2. When asked to build: large first on `dev`, then the mini subset. Conventional commits, no attribution lines. Subagents only on Sonnet or Haiku.

## Verification (for the build, later)
- **Unit:**
  - the autoscaler rules (up at N, cooldown, down after idle, min, max and hard ceilings);
  - reconcile (lane added, removed, paused);
  - use-case validation (empty queue list, max over limit, unserved warning).
- **Integration (Redis):**
  - two supervisors on one queue Redis: a control message changes a lane within 1 s;
  - a killed process disappears from `list()` after its TTL;
  - global pause stops both, and resume restarts both;
  - jobs still finish during lane close.
- **Repo checks:** `pnpm build:packages && pnpm typecheck && pnpm lint && pnpm test`, `check:architecture`, `check:contrast`, and the worker boot smoke with `WORKER_QUEUES=mail`.
- **Browser** (large, Chrome):
  - run two worker processes with different `WORKER_QUEUES`;
  - check the dashboard lists both;
  - pause mail globally, send an invite, and check the email waits in Mailpit until resume;
  - move a queue between processes;
  - set autoscale on embedding to min 1, max 8, N 20, enqueue 200 index jobs, and watch concurrency rise and fall;
  - check that a user without `platform.worker.read` gets a 403 on the page.
- **Mini:**
  - the CLI pause, resume and status against the dev stack;
  - two workers with split `WORKER_QUEUES`, with jobs from each queue processed only by its worker.
