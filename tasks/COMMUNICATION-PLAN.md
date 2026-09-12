---
title: Communication plan — mail, outbox, notifications, real-time, messaging
updated: 2026-09-12
owner: sami
schema: plan/v1
source: tree at 927cdec (main), 2026-09-12
---

# Communication plan

> **How to use this file**
>
> 1. Every item has a unique ID (`C1.3`). Never reuse or renumber one.
> 2. Change progress by editing the checkbox marker only: `[ ]` todo · `[~]` in progress ·
>    `[!]` blocked · `[x]` done · `[-]` dropped. Add `done: YYYY-MM-DD` when closing.
> 3. Phases run in order. A phase may start when the previous phase's **Exit** line is true.
>    Inside a phase, checklists run top to bottom; items inside one are independent unless
>    **Depends on** says otherwise.
> 4. Every item that touches code lists the doc it must update. A code change with the doc
>    untouched is not done. `docs/opinions/` wins over `docs/ai/rules/`; if a rule file is
>    made stale by an item, update both in the same commit (`check-architecture` §12 checks).
> 5. Every slice follows the twelve steps of `docs/ai/skills/add-slice.md`; every table follows
>    `docs/ai/rules/data.md`; every new file role is in the closed suffix table or is added to
>    it in the same commit (`docs/opinions/files.md` + `docs/ai/rules/files.md`).
> 6. `tasks/TODO.md` stays the task ledger: `T-036` points here, and Phase 2 closes `T-031`.
>    New defects found while executing go to the bottom of the relevant phase.
> 7. Commit per layer with the closed `scope-enum` in `commitlint.config.js`. **No scope is
>    added:** that line said Phase 1 adds `mail`, which was true of the draft that had a
>    `packages/mail`. The enum's own rule is "add a package, add its scope here", and this plan
>    adds no package. No author or tool trailers (`docs/ai/rules/workflow.md`).

---

## Context

The kit sends mail from two places with no shared path: Better Auth's hooks call
`ContentAuthMailer` synchronously inside the auth endpoint, and `InviteMemberUseCase` calls
`ContentInvitationMailer` after its commit and swallows the failure. Nothing records whether a
mail was sent, nothing retries, and `QueueName.NOTIFICATION` has no producer and no consumer.
`DigestComposer` in the worker is constructed only by its own spec. There is no notification
table, no notification UI, no event bus (deleted in `P5.11`; the outbox design is backlog item
`T-031`), and no real-time code of any kind — no SSE, no WebSocket, no Redis pub/sub.

The request: a unified email send system, a real-time notification system and a messaging
system, scalable, and built the way this repository builds things (`docs/ai/rules/`,
`docs/ai/skills/add-slice.md`). This file is the plan: six phases, each split into checklists,
in the shape of `IMPLEMENTATION-PLAN.md` (IDs, `[ ]` markers, Goal / Done when / Files / Docs).

### Decisions recorded up front (do not re-litigate)

1. **Every mail is queued**, auth mail included. The Better Auth hooks enqueue and return; the
   worker renders and sends. Consequence stated in the plan: in development the worker must be
   running for a verification link or OTP to arrive, and a stalled worker delays sign-up mail.
   Mitigation: auth mail is published at high priority with five attempts, and BullMQ's own
   exponential backoff carries the retry.
2. **Channels: in-app + email with per-user, per-category preferences** (immediate / daily
   digest / off). Web push is a documented port, not built.
3. **Messaging: conversations** — direct messages and group channels inside an organization,
   messages with edit/delete, read receipts, unread counts, typing indicators. Threads,
   reactions and attachments are listed as follow-up items, not built.
4. **Real-time over SSE using oRPC event iterators** through the existing `/api/rpc` route, with
   Redis pub/sub fan-out across web replicas behind a port. No `ws`, no socket.io.
5. **Build the transactional outbox (T-031) now** as the event spine; notifications are its
   first subscriber.
6. **"Design for 100k DAU"** — read as: every table, key and port is shaped so the moves in
   `docs/opinions/data-and-scale.md` §8 are adapter swaps (month partitions from the first
   migration, keyset pagination everywhere, one Redis subscriber per web replica demuxed
   in-process, channel names that lead with the organization id so sharded pub/sub or Redis
   Streams can replace plain pub/sub, idempotent consumers keyed on a stable event id, unread
   counters cacheable in Redis with Postgres as truth, retention jobs from day one). It does
   **not** mean running Kafka, Redis Cluster or sharded Postgres in the compose stack — the
   repo's own rule (`simplicity.md`, `data.md` "do not build in advance") stands, and the plan
   says so where it matters.
7. **Hand-written HTML and CSS templates, and no new package.** They are plain strings, so the
   one thing a separate package bought — a home for React in a graph whose copy and domain
   packages are React-free — is not needed. They live in `packages/composition/src/mail/`, beside
   the two mailers that already join translated copy to the transport and already build the
   plain-text body by hand. Mail clients need inline CSS and table layouts whatever you author
   in, which is most of what a component library compiles down to.
8. **No mail table. A send is a queue job and nothing else.** The queue carries the work, the
   database carries only what must be transactional, and at scale the mail provider carries the
   delivery record — a dedicated mail log is something apps add for a stated reason (regulated
   retention, an in-app resend history, a provider whose log expires too soon), not a default.
   BullMQ here already supplies retries, exponential backoff and duplicate suppression by job id,
   which is what a `status`/`attempts` table would re-implement. It also keeps the plaintext
   invitation token out of Postgres, which is the whole point of storing only its hash.
   The crash window between a commit and its enqueue is covered by a resend action, not a row.
   **The outbox event table is the deliberate exception** and stays: Redis cannot commit
   atomically with Postgres, so an event published from Redis can fire for a change that rolled
   back, or vanish if the process dies in between. That is the one place the write is
   load-bearing.
9. **Order:** mail → outbox → notifications → real-time → messaging. Each phase is mergeable
   on its own.

### What exists and is reused (verified against the tree at `927cdec`)

- `EmailSender` port + `SmtpEmailSender` (`packages/infrastructure/src/smtp/`), `email.send.failed`
  event, `RecordingEmailSender` fake.
- `AuthMailer` (`packages/auth/src/mail/auth.mailer.ts`) and `InvitationMailer`
  (`packages/application/src/member/invitation.mailer.ts`) — the typed mail seams stay; only
  their implementations change.
- `QueuePublisher` + `BullMqQueuePublisher` (`attempts` 3, exponential backoff, `jobId` dedupe,
  no `:` in ids); `QueueName` with an unused `NOTIFICATION`; the consumer template
  (`apps/worker/src/consumer/embedding.consumer.ts`), the schedule template
  (`apps/worker/src/schedule/cleanup.schedule.ts`), `WorkerBootstrap`, `SystemPrincipal.DECLARED`.
- `UnitOfWork` / `TransactionScope` / `BaseRepository.db` — the ambient transaction the outbox
  publisher and every repository join; `PgActivityLogger` is the worked example of a
  port that writes through `this.db`.
- `activity_log` — the worked example of a month-partitioned table (hand-edited DDL in
  `migrations/0000`, `PartitionsSchedule` + `MaintenanceGateway.ensureActivityPartitions`).
- `users.locale` exists (`auth.schema.ts:32`, Better Auth `additionalFields`), so per-recipient
  locale is a column read, not new state.
- `content` `email` namespace (server-only, `SERVER_CATALOG`, `EMAIL_FINGERPRINTS` CI grep),
  `Translator.with()` for per-recipient composition.
- `CacheStore` (Redis, `app:` prefix) for unread counters; `RedisConnection` for a subscriber
  client; `Container.health()` for new probes.
- Client: `QueryKeys`, `<Subject>Queries`, `<Subject>Mutations` over `useAppMutation`
  (`invalidates`, `optimistic`), `ApiClient` accessors, `RouteGuard`, `ROUTES`/`GATES`,
  `DataTable`/`EmptyState`/`Callout`/`StatusBadge`.
- oRPC `^1.15` on one version line (CI §4) — `eventIterator` in `@orpc/contract`, async-generator
  handlers streamed as SSE by `RPCHandler`, `withEventMeta` for `id`/`retry`, client
  reconnection with `last-event-id`. No new dependency for real-time.

---

## The phases

### Vocabulary fixed up front

| Thing | Name |
|---|---|
| Queues (add to `QueueName`) | `mail`, `event` (the outbox drain and deliveries), `notification` (exists, gains a consumer). Real-time is pub/sub, not a queue |
| Tables | `outbox_event` (append-only, singular), `notifications`, `notification_preferences`, `conversations`, `conversation_members`, `messages` |
| Domain events (past tense, closed catalog: `contracts/src/catalog/*.events.ts` + the `DomainEvents` registry) | `member.invited`, `member.joined`, `member.role.changed`, `conversation.created`, `message.sent`, `message.edited`, `message.deleted`, `conversation.read` |
| Real-time event names (what the browser receives) | `notification.created`, `message.sent`, `message.edited`, `message.deleted`, `conversation.read`, `typing` |
| Permission keys | `core.realtime.subscribe` (held by everyone, like every `core.*`), `notification.inbox.read`, `notification.inbox.update`, `notification.preference.update`, `messaging.conversation.read`, `messaging.conversation.create`, `messaging.conversation.manage`, `messaging.message.send`, `messaging.message.update` |
| Log event codes (new, in `core.events.ts`) | `mail.delivery.queued` (debug), `mail.delivery.sent` (info), `mail.delivery.failed` (error), `mail.delivery.swept` (warn), `outbox.drain.completed` (debug), `outbox.drain.lagged` (warn), `outbox.delivery.failed` (error), `realtime.stream.opened` / `realtime.stream.closed` (debug), `realtime.publish.failed` (warn), `notification.digest.completed` (info) |
| New file roles | `.renderer.ts` (port + adapter), `.subscriber.ts` (an outbox subscriber), and `.rules.ts` recorded retroactively (`role.rules.ts` exists and the table omits it) — each in `docs/opinions/files.md`. New folder name `subscriber/` in `folders.md`. **`.bus.ts` is not re-added**: T-031 predicted a bus and the design has a publisher, a gateway and subscribers, none of which is one; the T-031 note is corrected when it closes |
| `JobOptions` additions | `priority?: number`, `name?: string` — port, `BullMqQueuePublisher`, `RecordingQueuePublisher` |

---
### Phase 1 — Unified mail pipeline

**Goal.** One path for every mail: a caller publishes a *mail request* (template key + typed
params + recipient + locale) and a job lands on `QueueName.MAIL`; the worker renders it to text
and HTML and sends it through `EmailSender`, with BullMQ's retries, backoff and duplicate
suppression, plus a rate limiter. Better Auth's four mails and the invitation mail move onto it.
`DigestComposer` is deleted.

**Design in one paragraph.** `MailPublisher` (port, `application/src/port/`) is what callers hold;
`QueuedMailPublisher` (`composition/src/mail/`) publishes a BullMQ job and returns. There is no
row and no delivery record — see decision 8. `MailConsumer` in the worker calls `SendMailUseCase`,
which validates `params` against the template manifest, renders through `MailRenderer` (port) →
`ContentMailRenderer` (`composition/src/mail/`, translated copy poured into a hand-written HTML
layout) and sends through `EmailSender`. A throw is BullMQ's retry signal, and that is the whole
error model: no status column, no state machine, no sweep. The `dedupeKey` a caller may pass
becomes the job id, so "enqueue this once" is expressed where BullMQ already enforces it.

#### 1.A Foundations (`application`, `infrastructure`)

- [x] `C1.1` **`QueueName.MAIL`** — add `"mail"` to `packages/application/src/primitive/queue-name.ts`
  and `ALL`. **Docs:** `docs/opinions/vocabulary.md` queue table, `docs/setup/15`.
  `done: 2026-09-12`
- [x] `C1.2` **`JobOptions.priority` and `JobOptions.name`** — `readonly priority?: number`
  and `readonly name?: string` (the BullMQ job name, defaulting to the queue name as today) on
  `packages/application/src/port/queue.publisher.ts`; `BullMqQueuePublisher` passes both through;
  `RecordingQueuePublisher` records them. Spec in `infrastructure/tests/smoke/` publish test.
  `done: 2026-09-12` — **unverified:** the two new smoke cases (job name, priority, and the
  queue-name default) need a live Redis. Run `pnpm infra:up && pnpm smoke`.
- [x] `C1.3` **`EmailSender.send` returns a receipt** — `Promise<EmailReceipt>` with
  `{ messageId: string | null }` (nodemailer's `info.messageId`). Update `SmtpEmailSender`,
  `RecordingEmailSender`, both specs. The receipt is logged rather than stored, and it is what a
  provider webhook would later correlate against. **Docs:** `application/docs/reference/ports.md`.
  `done: 2026-09-12` — the spec caught a real defect on the way in: reading the id off a
  transport that resolved with nothing threw `UnavailableError` over a message that had been
  sent. Every hop to `messageId` is optional, and a unit case pins it.
- [x] `C1.4` **Generalise partition maintenance** — `MaintenanceGateway.ensureActivityPartitions`
  becomes `ensureMonthlyPartitions(table: PartitionedTable, from, months)` and gains
  `dropMonthlyPartitionsBefore(table, cutoff)`; `PartitionedTable` is a frozen allowlist
  (`activity_log`, then `outbox_event` in Phase 2, `notifications` in Phase 3, `messages` in
  Phase 5) so a table name never reaches SQL as a string. `PgMaintenanceGateway`,
  `PartitionsSchedule`, `MaintenanceConsumer.partitions()` loop the allowlist; `activity_log`
  keeps archive-then-drop. Spec: `pg-maintenance.gateway.spec.ts`. **Docs:**
  `infrastructure/docs/reference/`, `apps/worker/docs/reference/schedules.md`,
  `docs/opinions/data-and-scale.md` §4.
  **Depends on:** nothing, but it earns its place only from Phase 2 onward — land it here because
  Phase 2's migration is the first caller and splitting it across two phases reads worse.
  `done: 2026-09-12` — `PartitionedTable` landed in `application/src/primitive/` beside
  `QueueName` rather than in the port file: it is a closed vocabulary of strings, which is the
  stated reason `QueueName` lives there. The port takes the `PartitionedTableName` union.
  **unverified:** the two `dropMonthlyPartitionsBefore` cases and the renamed ensure cases need
  Postgres. Run `pnpm infra:up && pnpm db:migrate && pnpm --filter @loadbearing/infrastructure test`.

#### 1.B Template catalog and ports (`contracts`, `application`)

- [x] `C1.6` **Template manifest in `contracts`** — `packages/contracts/src/mail/{index,mail-template.manifest}.ts`
  → `MailTemplates`: a closed record `key → ZodObject` (the params) for `auth.verify`,
  `auth.reset`, `auth.change`, `auth.otp`, `member.invitation`, `notification.single` (Phase 3),
  `notification.digest` (Phase 3). Exports `MailTemplateKey` and `MailTemplateParams<K>`.
  In `contracts` rather than `content` because `application` has no `zod` and no `content`
  dependency today, and `contracts` has both properties the worker needs — zod to validate the
  params a job carries, and a home `application` already imports from.
  `application/src/import.ts` gains a **type-only** `Locale` from `@loadbearing/content` (a new,
  permitted edge — content is to its left; record it in `application/package.json` and
  `application/docs/index.md` "Depends on"). **Docs:** `contracts/docs/index.md`.
  `done: 2026-09-12` — **five keys, not seven.** `notification.single` and `notification.digest`
  are Phase 3's: the renderer switches on the key with a `never` default, so declaring a key
  before its template and copy exist does not compile. That is the mechanism working, not a gap.
- [x] `C1.7` **`MailPublisher` port** — `application/src/port/mail.publisher.ts`:
  `MailRequest<K> { template: K; to; locale: Locale; params: MailTemplateParams<K>; organizationId: OrganizationId | null; userId: UserId | null; priority?: "high" | "normal"; dedupeKey?: string }`,
  `abstract publish<K>(mail: MailRequest<K>): Promise<void>`. Returns nothing: there is no row to
  identify, and a caller reading an id would be reaching for a record that does not exist.
  **Docs:** `application/docs/reference/ports.md` (port count: sixteen → seventeen, then eighteen
  with `C1.8`; `test-container.spec` counts the directory, so the harness fails until both fakes
  exist).
  `done: 2026-09-12` — the two fakes and the `TestPorts` entries landed **here** rather than at
  `C1.18`, because the harness spec counts `src/port/` and goes red the moment a port file
  appears. `C1.18` keeps the `Container` wiring. The real port count is seventeen, and the
  harness has eighteen entries with `content`.
- [x] `C1.8` **`MailRenderer` port** — `application/src/port/mail.renderer.ts`:
  `RenderedMail { subject; text; html }`, `abstract render<K>(template, locale, params): Promise<RenderedMail>`.
  New suffix `.renderer.ts` recorded in `docs/opinions/files.md` and `docs/ai/rules/files.md`.
  `done: 2026-09-12` — `.rules.ts` was recorded in the same pass, and both role nouns joined
  `docs/opinions/classes.md`, which is the second edit that page asks for.
- [x] `C1.9` **`mail` slice in `application`** — `application/src/mail/{index,send-mail.use-case}.ts`.
  `SendMailUseCase.execute(principal, request)`: validate `params` against
  `MailTemplates[template]`, render, send, return. No repository, no status, no idempotency of its
  own — the job id carries that. Principal is `SystemPrincipal.platform()` (new: the nil
  organization), because platform work asserts no permission, as `MaintenanceGateway` already
  does. Spec: an unknown template and a params mismatch both throw before the transport is
  touched. **Docs:** `application/docs/index.md` tree.
  `done: 2026-09-12` — `execute(principal, input)` is kept, and the principal authorizes
  nothing: mail belongs to no tenant, so the guard is the structural one the three gateways
  already rely on. Written at the line and argued in `ports.md`.

#### 1.C Templates and the renderer (`composition`)

- [x] `C1.10` **Mail layout** — `composition/src/mail/mail-layout.ts` → `MailLayout`: builds an
  HTML document and the matching plain text from a heading, paragraphs and one action link, given
  already-translated strings. A table-based shell with inline CSS, because mail clients resolve
  neither `<style>` reliably nor CSS custom properties at all — which makes this the one place in
  the repository allowed to write a literal colour. State that at the line and add the exemption
  to `docs/ai/rules/color.md` and `docs/opinions/` in the same commit, or the rule and the tree
  disagree. Spec: the text part carries the same URL as the HTML part, and no tag survives into it.
  `done: 2026-09-12` — the exemption is recorded in `docs/ai/rules/color.md` **and**
  `packages/ui/docs/reference/palette.md`, since that tree wins when the two disagree. The text
  part is composed rather than derived from the HTML: stripping tags is how an `&amp;` reaches a
  plain-text body and the link stops working, so both parts are built from the same content and
  only one of them escapes.
- [x] `C1.11` **`ContentMailRenderer`** — `composition/src/mail/content-mail.renderer.ts`
  `extends MailRenderer`, ctor `(content: ContentSource)`. Resolves
  `content.translator(locale, ["email"])`, picks the template through an exhaustive `switch` with
  a `never` default, composes through `MailLayout`, and takes the subject from the `email`
  namespace. One function per template key, each a handful of lines. Specs: every key renders both
  parts and carries its action URL; a key the manifest does not know is a compile error.
  `done: 2026-09-12` — the key is widened to the union before the `switch`: TypeScript narrows a
  union and not a type parameter, so switching on the generic directly leaves the `never` default
  unreachable-typed and the exhaustiveness check silently useless. The spec's params are a total
  mapped record, so a key added to the manifest fails to compile there rather than being skipped
  by a loop that reads the manifest at runtime.

#### 1.D Wiring (`composition`, `auth`)

- [x] `C1.15` **`QueuedMailPublisher`** — `composition/src/mail/queued-mail.publisher.ts`
  `extends MailPublisher`, ctor `(queue: QueuePublisher)`. `publish` is one call:
  `queue.publish(QueueName.MAIL, request, { name: "send", jobId: dedupeKey, priority, attempts: high ? 5 : 3 })`.
  It does not catch: with no row behind it there is nothing for a swallowed enqueue to be
  secondary to, and a caller that cannot queue mail should learn that. Spec pins the job options
  per priority.
- [x] `C1.16` **Auth mail moves onto the pipeline** — `AuthMailer` methods take
  `MailRecipient { email; userId: UserId | null; locale: Locale }` instead of a bare address;
  `AuthFactory` builds it from Better Auth's `user` (`locale` is already an additional field).
  `ContentAuthMailer` → `QueuedAuthMailer` (`composition/src/mail/queued-auth.mailer.ts`), one
  `publish` per method at `priority: "high"`, `organizationId: null`. Specs updated.
  **Docs:** `auth/docs/reference/auth-factory.md`, `composition/docs/index.md`.
  `done: 2026-09-12` — `auth` gains a real `@loadbearing/content` dependency for `Locales`, not
  just the type: `AuthFactory.recipient` normalises Better Auth's loosely-typed `locale`
  additional field, and an unrecognised value would otherwise ask `ContentSource` for a catalog
  that does not exist. No `dedupeKey` on any auth mail — each send carries a fresh single-use
  token, so suppressing the second would mail a link the server has already replaced.
- [x] `C1.17` **Invitation mail moves onto the pipeline** — `ContentInvitationMailer` →
  `QueuedInvitationMailer` publishing `member.invitation` with `url` built from `auth.baseUrl` +
  `ROUTES.shell.invitation` + token, `organizationId` set. `InviteMemberUseCase` keeps the send
  **after** the commit and keeps its `try`/`catch`: the token cannot ride a durable row, so the
  enqueue is the one thing that cannot be made atomic with the invitation. The operator action for
  the crash window is to invite again, which replaces the row — say so at the line, and file the
  resend button as `C6.9`. **Docs:** `application/docs/index.md`,
  `auth/docs/reference/enrolment.md`.
  `done: 2026-09-12` — `InvitationMail` gained `organizationId`. It is the one message that
  belongs to a tenant, and `MailRequest.organizationId` existing while the only tenant-owned mail
  passed null would have made the field meaningless.
- [x] `C1.18` **Container** — `public readonly mailPublisher: MailPublisher` (Phase 3's subscriber
  uses it), `mailRenderer` private, `public readonly mail: { send: SendMailUseCase }` built in
  **every** process — the worker needs it and it needs no auth config, which is what
  `ContentAuthMailer` being inside the `config.auth` branch got wrong. `ContainerConfig.email`
  gains `baseUrl` (env `APP_BASE_URL`, required in both `env.ts`; web's `AUTH_URL` stays Better
  Auth's own). `TestPorts` gains `mailPublisher` (`RecordingMailPublisher`, exports
  `PublishedMail`) and `mailRenderer` (`StubMailRenderer`). `test-container.spec` key-set pin
  updated. **Docs:** `composition/docs/reference/{container,test-container}.md`, both
  `docs/reference/env.md`, `.env.example`, CI `env:` block.
  `done: 2026-09-12` — `TestPorts` landed at `C1.7`/`C1.8`; this commit is the `Container`
  wiring, `ContainerConfig.email.baseUrl`, `APP_BASE_URL` in both `env.ts`, both vitest env
  blocks, `.env.example` and CI.

#### 1.E Worker

- [ ] `C1.19` **`MailConsumer`** — `apps/worker/src/consumer/mail.consumer.ts` on `QueueName.MAIL`,
  `switch (job.name)`: `send` → `container.mail.send.execute(SystemPrincipal.platform(), job.data)`;
  `default` throws. Worker options
  `{ concurrency: Env.mailConcurrency, limiter: { max: Env.mailRatePerMinute, duration: 60_000 } }`
  — a provider's rate limit is a worker option, never a use-case concern. The `failed` handler
  emits `mail.delivery.failed` once `job.attemptsMade >= job.opts.attempts`, which is the only
  place a permanently undelivered message is reported. Env `WORKER_MAIL_CONCURRENCY` (4),
  `WORKER_MAIL_RATE_PER_MINUTE` (600). Spec via `TestContainer` as
  `maintenance.consumer.spec.ts` does. **Docs:** `apps/worker/docs/reference/consumers.md` (the
  `NOTIFICATION` "no consumer" sentence changes), `env.md`.
- [ ] `C1.22` **Delete `DigestComposer`** — `apps/worker/src/notification/` and its spec; the
  worker's `import.ts` drops `ContentSource`/`Locale`. **Docs:** `docs/setup/25`, `28`,
  `apps/worker/docs/index.md`, `docs/opinions/files.md` example row for `.composer.ts` (keep the
  suffix, point the example at a file that exists or remove the row).

#### 1.F Observability, CI, docs

- [ ] `C1.23` **Event codes** — `mail.delivery.queued` (debug, from the publisher),
  `mail.delivery.sent` (info, with the receipt's message id), `mail.delivery.failed` (error, final
  attempt only) in `observability/src/catalog/core.events.ts`; `email.send.failed` stays as the
  transport's own line. Emitted from the consumer and the publisher, never from `application`.
  Together these are the delivery record until a provider supplies a better one.
- [ ] `C1.24` **CI greps** — `EMAIL_FINGERPRINTS` gains `"email.notification."` and keeps
  `"email.digest."`. No `SERVER_FINGERPRINTS` change is needed now that no mail dependency
  exists to leak. `pnpm check:architecture` 20/20 with no skip.
- [ ] `C1.25` **Docs** — `docs/setup/24`/`25` mail sections rewritten; a new
  `packages/composition/docs/reference/mail-pipeline.md` carrying the argument (queued auth mail,
  why there is no table, why the invitation send stays after the commit, where the delivery record
  actually lives); `README.md` feature list; `docs/ai/rules/workflow.md` Mailpit sentence gains
  "with the worker running".

**Ids `C1.5`, `C1.12`, `C1.13`, `C1.14`, `C1.20` and `C1.21` are retired**, not reused: they were
the `mail_deliveries` table, the react-email package's templates, its preview tooling, its
repository, the sweep schedule and the mail retention job. Decisions 7 and 8 say why. An id is
never renumbered here, so the gap is the record.

**Exit.** A sign-up in the local stack shows the verification mail in Mailpit **only while the
worker runs**; stopping SMTP leaves the job retrying with backoff and emits `mail.delivery.failed`
on the final attempt, with no orphaned row to reconcile; an invitation sent twice with the same
`dedupeKey` produces one message. `pnpm check:architecture` 20/20, `typecheck`, `lint`, `test`,
`smoke` green.

---
### Phase 2 — Transactional outbox (closes `T-031`)

**Goal.** A use-case publishes a past-tense domain event inside its unit of work and knows
nothing about who listens. The worker drains the outbox into BullMQ, one job per
(subscriber, event), and every subscriber is idempotent on the event id. Broker-shaped by
construction (`docs/opinions/data-and-scale.md` §7): `publish` returns nothing, no ordering,
no handler exception reaches the publisher.

**Design in one paragraph.** `DomainEventPublisher.publish(actor, { name, payload })` is the
port (not `EventPublisher`: `@orpc/server` exports a helper of that name, and
`apps/web/src/server/import.ts` re-exports from both). `PgOutboxPublisher extends BaseRepository`
writes `outbox_event` through `this.db`, so the row commits with the state change exactly as
`PgActivityLogger` does. Every second the worker's `outbox-drain` repeatable job calls
`OutboxGateway.drain(limit, relay)` — a platform gateway with no principal, like
`MaintenanceGateway`: in one transaction it selects up to 100 rows
`WHERE published_at IS NULL ORDER BY occurred_at, id FOR UPDATE SKIP LOCKED` (two worker
replicas share the drain with no coordinator), hands them to `relay`, and marks them published
only if `relay` resolved. `relay` is the consumer's closure: for each event and each subscriber
whose `events` list names it, one BullMQ job on `QueueName.EVENT` named `deliver` with
`jobId = <subscriber>_<eventId>`. A crash between publish and mark re-publishes the same job
ids and BullMQ drops the duplicates (`removeOnComplete.age` 24 h on this queue); anything
older is caught by the subscribers' own idempotency, which is a stated requirement, not a
hope — the `processed_event` inbox table is deliberately deferred, and the trigger for adding
it is written in `ports.md`: the first subscriber whose effect is not idempotent by
construction. `OutboxConsumer.handle("deliver")` validates the job's event against the
catalog, resolves the subscriber from `container.subscribers` and calls `handle(event)`; a
throw is that job's retry and no other subscriber's. The catalog and payload schemas are
`contracts/src/catalog/<subject>.events.ts` fragments with a `DomainEvents` registry, the same
shape as `PROCEDURE_PERMISSIONS` / `ProcedurePermissions`, so the name union is a compile-time
check in every layer and the browser can parse the same shapes on the stream.

#### 2.A Catalog (`contracts`)

- [ ] `C2.1` **Domain event catalog** — fragments `contracts/src/catalog/member.events.ts`
  (`memberEvents = { "member.invited": z.object({ invitationId, email, roleId }), "member.joined": …, "member.role.changed": … } as const satisfies Record<string, ZodType>`),
  later `messaging.events.ts`; merged in `catalog/index.ts` as `DOMAIN_EVENTS` (not
  `EVENT_CATALOG` — that name is observability's). Registry `contracts/src/registry/domain-events.ts`
  → `DomainEvents` (private ctor): `names()`, `schema(name)`, `isKnown(name)`, and `envelope`
  — a `z.discriminatedUnion("name", …)` built once at module load and frozen. Types
  `DomainEventName`, `DomainEventPayload<N>`, `DomainEvent<N> { id; organizationId; name; actorId; occurredAt; payload }`,
  `DomainEventInput<N>`. `application/src/import.ts` re-exports the **types** only.
  `.events.ts` keeps its meaning — a catalog fragment — in a second package, exactly as
  `.permissions.ts` already does; say so in `docs/opinions/files.md`. A spec asserts every name
  is past tense against the vocabulary table. **Docs:** `contracts/docs/index.md`,
  `docs/opinions/vocabulary.md` (the activity/event row now points at the catalog),
  `docs/opinions/folders.md` (`catalog/` "used by" gains it).

#### 2.B Schema (`infrastructure`)

- [ ] `C2.2` **`outbox_event`** — `pg/schema/outbox.schema.ts`: `id uuid`, `occurred_at`
  (PK `(id, occurred_at)`, `PARTITION BY RANGE (occurred_at)`, hand-edited DDL),
  `organization_id` (FK cascade), `actor_id` (no FK), `name text`, `payload jsonb`,
  `published_at timestamptz` nullable. Indexes: `outbox_event_pending_idx (occurred_at, id) WHERE published_at IS NULL`
  — the drain's keyset, cross-tenant by design with the comment;
  `outbox_event_published_idx (published_at) WHERE published_at IS NOT NULL` — the sweep's;
  `outbox_event_org_idx (organization_id, occurred_at)` (§18). Partial non-unique indexes
  are already parsed by §17/§18 (`permission_overrides` uses them). Retention: `sweepExpired`
  deletes rows `published_at < now() - 7 days`; a partition older than two months is dropped
  only when it holds no pending row — a stuck event is never dropped by the calendar.
  T-031's "two partial indexes a nullable unique column needs" does not apply (nothing is
  unique over `published_at`); correct the wording when the task closes.
  **Docs:** `data-and-scale.md` §9, `docs/ai/rules/data.md` stream table (a "Domain events"
  row: `DomainEventPublisher` — Postgres outbox, partitioned — in-transaction, at-least-once),
  `docs/setup/13`.

#### 2.C Ports and domain (`application`)

- [ ] `C2.3` **`DomainEventPublisher` port** — `application/src/port/domain-event.publisher.ts`:
  `abstract publish<N extends DomainEventName>(actor: Principal, event: DomainEventInput<N>): Promise<void>`.
  Returns nothing (a caller reading a return value is doing RPC); a caller outside
  `unitOfWork.run` is publishing about a row that may not commit — say so on the line. Fake
  `RecordingDomainEventPublisher` (`published()`), `TestPorts.events`.
  **Docs:** `application/docs/reference/ports.md`, `data-and-scale.md` §7 (the paragraph that
  says the port does not exist is rewritten).
- [ ] `C2.4` **`OutboxGateway` port** — `application/src/port/outbox.gateway.ts`:
  `abstract drain(limit: number, relay: (events: readonly DomainEvent[]) => Promise<void>): Promise<number>`
  and `abstract oldestPendingAt(): Promise<Date | null>` (the lag probe). No principal on any
  method — platform work, reachable from the worker only, the `MaintenanceGateway` precedent.
  Fake `InMemoryOutboxGateway` (`enqueue(event)`, honours the relay contract), `TestPorts.outbox`.
- [ ] `C2.5` **`EventSubscriber` seam** — `application/src/subscriber/{index,event.subscriber,subscriber-registry}.ts`:
  `abstract class EventSubscriber { abstract readonly name: string; abstract readonly events: readonly DomainEventName[]; abstract handle(event: DomainEvent): Promise<void> }`
  (idempotent on `event.id`; may throw; never logs — §2); `SubscriberRegistry` (built once by
  `Container` from a frozen list): `subscriptions(): ReadonlyMap<DomainEventName, readonly string[]>`
  for the drain, `get(name)` for delivery; a duplicate name or an event the catalog does not
  know throws at construction. Subscribers live **in `application`**, in the slice they serve
  (`notification/notification.subscriber.ts`, `messaging/messaging-realtime.subscriber.ts`),
  and receive the event, not an actor — a subscriber that needs a principal builds
  `Principal.system(event.organizationId)`. They run only in the worker, because the registry
  is consulted only by `OutboxConsumer`: a subscriber invoked in the web tier would be the
  in-process dispatch §7 forbids depending on. New folder name `subscriber/` and suffix
  `.subscriber.ts` recorded in `docs/opinions/{folders,files}.md`; `Subscriber` joins the
  role-noun list in `classes.md`. **Not** `bus/` and not `.bus.ts`: nothing here is a bus.
- [ ] `C2.6` **First publishers and the proving subscriber** — `InviteMemberUseCase` →
  `member.invited`; `ChangeMemberRoleUseCase` → `member.role.changed`; `PgInvitationClaimer.claim`
  (already takes `ActivityLogger`) → `member.joined`. Each inside the existing `unitOfWork.run`
  beside the activity row: audit is the human fact, the outbox is the integration fact with a
  schema and a `published_at`, and they commit together. The invitation token never rides the
  event (that is what `token_hash` exists to prevent); the mail stays a direct `MailPublisher`
  call in the use-case. The first subscriber is `MemberRealtimeSubscriber`
  (`application/src/member/member-realtime.subscriber.ts`, `events = ["member.invited", "member.joined", "member.role.changed"]`):
  publishes a compact frame on the inviter's / member's user channel through `RealtimePublisher`
  so other tabs invalidate `QueryKeys.member.all()` — it proves commit → drain → queue →
  subscriber → Redis → SSE with no new table, and it is the shape every later subscriber copies.
  It needs Phase 4's `RealtimePublisher` port and Redis adapter: land `C4.1`–`C4.3` inside this
  phase (the port, the primitive, the publisher adapter and its fake); the stream itself stays
  in Phase 4. Specs: `RecordingDomainEventPublisher` sees one event per use-case; a failing
  `save` publishes nothing.

#### 2.D Adapters, worker, composition

- [ ] `C2.7` **`PgOutboxPublisher`, `PgOutboxGateway`** — `pg/repository/pg-outbox.publisher.ts`
  (`constructor(database, scope, clock)`, insert through `this.db`), `pg-outbox.gateway.ts`
  (`constructor(database, scope, unitOfWork)`: `SELECT … FOR UPDATE SKIP LOCKED` then
  `UPDATE … SET published_at = now() WHERE published_at IS NULL AND (id, occurred_at) IN (…)`
  inside one `unitOfWork.run`; a throw in `relay` rolls back and the rows are re-claimed next
  tick). Integration spec: two concurrent `drain` calls never hand out the same row; fixed
  query count of two per batch.
- [ ] `C2.8` **`OutboxConsumer` + `OutboxDrainSchedule`** — `apps/worker/src/consumer/outbox.consumer.ts`
  on `QueueName.EVENT`, `switch (job.name)`: `drain` → loop
  `container.outbox.drain(100, relay)` until a short batch or `MAX_BATCHES_PER_RUN = 20`,
  where `relay` publishes through `container.queue` one `deliver` job per (subscriber, event)
  from `container.subscribers.subscriptions()`, `{ name: "deliver", jobId: <subscriber>_<eventId>, attempts: 5 }`
  — `JobOptions` gains `name?: string` (port, adapter, `RecordingQueuePublisher`) so a job
  published through the port can be switched on; then emit `outbox.drain.completed { events, jobs }`
  and `outbox.drain.lagged` when `oldestPendingAt()` is over sixty seconds old. `deliver` →
  `DomainEvents.envelope.parse(job.data.event)`, `container.subscribers.get(job.data.subscriber).handle(event)`;
  `failed` handler emits `outbox.delivery.failed { subscriber, event }` beside `queue.job.failed`.
  `schedule/outbox-drain.schedule.ts`: `jobId outbox-drain`, `repeat: { every: 1_000 }`,
  `priority: 1` (a backlog of deliveries must not starve the drain), `removeOnComplete: 10`.
  `EVENT` queue publish defaults: `removeOnComplete.age 86_400`. Env `WORKER_EVENT_CONCURRENCY`
  (8). LISTEN/NOTIFY is the later latency optimisation, with the trigger written down: a
  measured commit-to-push budget under 500 ms. **Docs:** `consumers.md`, `schedules.md`,
  new `apps/worker/docs/reference/subscribers.md` (the contract: idempotent on `event.id`,
  no ordering, never throw for a duplicate, never log — surface through the job).
- [ ] `C2.9` **Container** — `public readonly eventPublisher: DomainEventPublisher`,
  `public readonly outbox: OutboxGateway`, `public readonly subscribers: SubscriberRegistry`
  (built from the frozen list of subscriber instances, each given its ports), `realtime:
  RealtimePublisher` (from `C4.3`); `QueueName.EVENT` added; `inviteMember` and
  `changeMemberRole` get `this.eventPublisher`. `docs/opinions/files.md` example row for
  `.events.ts` widened; `docs/setup/28` tree fixed (it still lists `bullmq/queue-name.ts`).

**Exit.** Inviting a member with the worker **stopped** leaves one pending `outbox_event` row
that rolls back with the invitation on failure; starting the worker publishes it within a
second and the inviter's second tab refetches the member list without a reload; running the
drain twice over the same rows yields the same job ids and one `handle` call; `T-031` closed in
`TODO.md` with the `.bus.ts` and partial-index sentences corrected; `check:architecture` 20/20.

---

---

### Phase 3 — Notifications: inbox, email, preferences, digest

**Goal.** A domain event becomes zero or more `notifications` rows (one per recipient), each
delivered to the bell immediately over real-time (Phase 4 — until then the list refetches on
focus), and to email either at once or in a daily digest, according to the recipient's
preference for that category. Every write is idempotent on `(event_id, user_id, kind)`.

**Design in one paragraph.** `NotificationSubscriber` (Phase 2's `EventSubscriber` shape) is
the first outbox subscriber: it looks the event up in `NotificationPolicy` (a closed table
`event name → { kind, category, recipients: RecipientRule }`), resolves recipients through
`NotificationRecipientReader` (a slice port: organization members, conversation members, a
named user — each a tenant-scoped query with a fixed count), reads their preferences in one
query, and calls `DeliverNotificationUseCase` which writes the rows in one insert, publishes
`notification.single` mail requests for the `immediate` recipients through `MailPublisher`,
bumps the unread counter cache, and (Phase 4) publishes `notification.created` on each
recipient's user channel. The digest is a daily schedule that fans out one job per organization
(`jobId digest_<org>_<date>` — idempotent), each paging its `digest` recipients by keyset and
publishing one `notification.digest` mail per user with unread rows since the last digest,
grouped as `data-and-scale.md` §6 asks: recipients first, copy per recipient.

#### 3.0 Foundation

- [ ] `C3.0` **Keyset primitive** — nothing in `contracts/src/primitive/` paginates by cursor
  today (`pagination.ts` / `envelope.ts` are offset-only). Add `keyset.ts` → `Keyset.query`
  (`{ limit ≤ 100 default 50, cursor?: string ≤ 256 }`) and `Keyset.page(item)`
  (`{ items: readonly[], nextCursor: string | null }`, no `total` — a count per page over a
  partitioned table is the cost keyset exists to avoid); `infrastructure/src/pg/primitive/keyset-cursor.ts`
  → `KeysetCursor.encode({ at, id })` / `decode` (base64url of `<iso>|<uuid>`, malformed →
  `ValidationError`). Query shape: `WHERE … AND (created_at, id) < (?, ?) ORDER BY created_at DESC, id DESC LIMIT n + 1`.
  Notifications, conversations and messages all page this way. **Docs:**
  `contracts/docs/reference/keyset.md`, `docs/opinions/vocabulary.md` query-key table.

#### 3.A Permissions, routes, gate (`permissions`)

- [ ] `C3.1` **Keys** — `permissions/src/catalog/notification.permissions.ts`:
  `notification.inbox.read`, `notification.inbox.update`, `notification.preference.update`
  (module `notification`, scope `org`), registered in `ModuleRegistry`. Routes
  `notification.routes.ts`: `inbox: "/notifications"`, `preferences: "/settings/notifications"`.
  Gate `notification.gate.ts` on `notification.inbox.read`. Permission migration grants all three
  to `owner`, `admin`, `member` (never `guest`) via `SystemRoleSeed` + a migration.
  **Docs:** `permissions/docs/index.md`, `docs/opinions/vocabulary.md`.

#### 3.B Contracts

- [ ] `C3.2` **`contracts/src/notification/`** — `notification.contract.ts` (`entity`:
  `{ id, kind, category, params, link, readAt, createdAt }`; `listQuery` is **keyset**:
  `{ limit ≤ 50, before?: { createdAt, id }, unreadOnly? }`; `preference` + `preferenceUpdate`),
  `notification.entity.ts`, `notification.procedures.ts`: `list`, `unreadCount`, `markRead`
  (`{ id, createdAt }`), `markAllRead`, `preferences`, `updatePreference`. `catalog/notification.permissions.ts`
  maps `notification.list/unreadCount → notification.inbox.read`, `markRead/markAllRead → notification.inbox.update`,
  `preferences → notification.inbox.read`, `updatePreference → notification.preference.update`.
  `NotificationId` in `identifiers.ts`. `NotificationKind` and `NotificationCategory` are closed
  zod enums declared here (the client renders copy from `kind`, so the union is a wire shape).
  **Docs:** `contracts/docs/index.md`.

#### 3.C Schema (`infrastructure`)

- [ ] `C3.3` **`notifications`** — month-partitioned on `created_at`, PK `(id, created_at)`,
  `organization_id` (FK cascade), `user_id` (FK cascade — an inbox dies with the account),
  `event_id uuid` (the outbox event; no FK, the event row is retention-dropped first), `kind`,
  `category`, `params jsonb`, `link text`, `read_at` nullable. Indexes:
  `notifications_inbox_idx (organization_id, user_id, created_at desc, id desc)` — the keyset;
  `notifications_unread_idx (organization_id, user_id) WHERE read_at IS NULL` — the count;
  `notifications_dedupe_uq (organization_id, user_id, event_id, kind)` unique, tenant-leading
  (§17); `notifications_user_fk_idx (user_id)` (§18). Retention twelve months (`C1.4` allowlist).
- [ ] `C3.4` **`notification_preferences`** — `organization_id`, `user_id`, `category`,
  `channel` (`in_app | email`), `mode` (`immediate | digest | off`), `updated_at`; unique
  `(organization_id, user_id, category, channel)`; FK indexes. Absent row = the category's
  default from `NotificationPolicy`. Not partitioned (bounded by users × categories).
  Migration reviewed; §20 safe. **Docs:** `data-and-scale.md` §9, `docs/setup/13`.

#### 3.D Domain (`application/src/notification/`)

- [ ] `C3.5` **Ports** — `notification.repository.ts` (`list(organizationId, userId, query)`,
  `countUnread`, `saveMany(records)` with `ON CONFLICT DO NOTHING` on the dedupe index,
  `markRead(organizationId, userId, id, createdAt, at)`, `markAllRead`,
  `listUnreadSince(organizationId, userId, since, limit)` for the digest),
  `notification-preference.repository.ts` (`findFor(organizationId, userIds, category)` — one
  query for many users, `save`), `notification-recipient.reader.ts` (`organizationMembers`,
  `conversationMembers`, `user` — every method takes the tenant, returns `{ userId, email, locale, name }`
  pages by keyset).
- [ ] `C3.6` **`NotificationPolicy`** — `notification.policy.ts` (suffix exists): a frozen map
  `DomainEventName → { kind, category, recipients, defaultMode: { in_app, email }, link: (payload) => AppRoute }`.
  First rows: `member.invited` → none (the invitee has no account), `member.joined` → org
  admins, `member.role.changed` → the member, `message.sent` (Phase 5) → conversation members
  minus author. A policy row for an event no publisher emits is a spec failure (`T-033`'s
  argument, applied here).
- [ ] `C3.7` **Use-cases** — `list-notifications`, `count-unread-notifications`,
  `mark-notification-read` (one or all), `get-notification-preferences`,
  `update-notification-preference`, `deliver-notification` (system principal per organization;
  input is the outbox event; does policy → recipients → preferences → `saveMany` → mail
  publish for `immediate` → counter invalidate → realtime publish), `send-notification-digest`
  (input `{ organizationId, day }`; pages recipients; one `notification.digest` mail each).
  `execute(principal, input)` on every one; `authorizer.assert` on the four user-facing ones.
  Unread count: `CacheStore` read-through at key `notification:unread:<org>:<user>`, TTL 60 s,
  deleted by every write for that user — Postgres is the truth, the cache is the 100k answer.
  Specs with hand-rolled doubles; the deliver spec pins idempotency (same event twice → one row).

#### 3.E Adapters, composition, worker

- [ ] `C3.8` **`PgNotificationRepository`, `PgNotificationPreferenceRepository`, `PgNotificationRecipientReader`**
  — every method tenant-scoped; integration specs with fixed query counts (`saveMany` is one
  statement for N recipients; `findFor` is one statement for N users). `saveMany` inserts in
  chunks of 1 000 (write amplification is the §6 risk — say so at the line).
- [ ] `C3.9` **`NotificationSubscriber`** — `application/src/notification/notification.subscriber.ts`
  (shape per `C2.5`): `events` = every name `NotificationPolicy` has a row for; `handle(event)`
  → `deliver.execute(Principal.system(event.organizationId), event)`. Joins the frozen list in
  `Container.subscribers`. `SystemPrincipal.DECLARED` gains nothing (the system principal
  asserts no inbox permission).
- [ ] `C3.10` **Digest** — `DigestSchedule` (`digest-daily`, `0 7 * * *` UTC — a per-tenant
  hour is a later column) on `QueueName.NOTIFICATION` job `digest-fanout`; `NotificationConsumer`
  handles `digest-fanout` (lists organizations with at least one `digest` preference, publishes
  `digest` jobs with `jobId digest_<org>_<yyyy-mm-dd>`) and `digest` (calls
  `sendNotificationDigest`). Env `WORKER_NOTIFICATION_CONCURRENCY` (2). **Docs:**
  `consumers.md`, `schedules.md`, `env.md`; `data-and-scale.md` §6 "Digest fan-out" now names
  the file that does it.
- [ ] `C3.11` **Container** — `public readonly notification: { list; countUnread; markRead; preferences; updatePreference; deliver; sendDigest }`
  in every process. Fakes: none new (repositories are slice ports, faked in specs).

#### 3.F Client (`api-client`, `query`, `content`, `feature`, `web`)

- [ ] `C3.12` **Query layer** — `ApiClient.notification` accessor; `QueryKeys.notification = { all, list(params), unreadCount(), preferences() }`;
  `NotificationQueries.list` as `infiniteQueryOptions` (keyset cursor = last row's
  `{ createdAt, id }`), `unreadCount` (`staleTime` 30 s, `refetchOnWindowFocus: true` — the one
  query that opts back in, until Phase 4 streams it), `preferences`; `NotificationMutations.useMarkRead`
  (optimistic on the list page and the count), `useMarkAllRead`, `useUpdatePreference`.
  **Docs:** `query/docs/reference/mutations.md`.
- [ ] `C3.13` **Copy** — `content/src/message/{en,bn}/notification.ts` registered as a
  `ClientNamespace`: one `notification.kind.<kind>.title` / `.body` pair per `NotificationKind`
  (interpolated from `params`), inbox labels, preference labels; `email` namespace gains
  `email.notification.*` and reuses `email.digest.*`. A `NotificationKind` with no copy is a
  compile error (`NamespaceBundle` is total). `EMAIL_FINGERPRINTS` gains `"email.notification."`.
- [ ] `C3.14` **Components** — `feature/src/notification/`: `notification-bell.button.tsx`
  (`NotificationBell`: icon + unread `StatusBadge`, `href` to `ROUTES.notification.inbox`),
  `notification.list.tsx` (`NotificationList`: pending → `DataTable.Skeleton`, error →
  `Callout`, empty → `EmptyState`, rows with `useMessages("notification")` copy, mark-read on
  click, "load more" keyset), `notification-preference.form.tsx` (`NotificationPreferenceForm`:
  a category × channel grid of `mode` selects). Icon `bell` added to `asset`'s sprite.
  **UI:** no popover primitive — the bell links to the inbox page; a `Popover` in `ui` is a
  follow-up (`C6.x`). Specs for the three states of the list and the optimistic mark-read.
- [ ] `C3.15` **Transport + routes** — `apps/web/src/server/orpc/notification.router.ts`
  (three lines per procedure), mounted in `app.router.ts`;
  `route/(app)/_authenticated/notifications.tsx` (`requirePermission("notification.inbox.read")`,
  `staticData.messages = ["notification"]`, loader prefetches page 1 and the count),
  `route/(app)/_authenticated/settings/notifications.tsx`; the bell mounted in the
  `_authenticated` layout header beside `OrganizationSwitcher`; nav gate entry. `routes.spec.ts`
  covers both literals.

#### 3.G Docs and verify

- [ ] `C3.16` **Docs** — `packages/application/docs/reference/notification-policy.md` (the
  event → recipients table, the dedupe key, why the count is cached), `apps/worker/docs/reference/subscribers.md`
  (Phase 2 creates it; this adds the first row), `docs/setup/27` gains the slice as the second
  worked example, `docs/opinions/data-and-scale.md` §6 both notification paragraphs point at the
  code that answers them.

**Exit.** Changing a member's role writes one `notifications` row for that member with no
duplicate on a replayed event, the bell count moves on refocus, the row is marked read
optimistically and stays read after refetch, an `immediate` email preference produces a
`mail.delivery.sent` line and a Mailpit message, a `digest` preference produces nothing until the
`digest-daily` run (`pnpm --filter @loadbearing/worker` + a manual `fire`), and `check:architecture`
is 20/20.

---

### Phase 4 — Real-time delivery: SSE over oRPC, Redis fan-out

**Goal.** A signed-in tab holds one server-sent stream and receives its own notifications,
messages and typing signals within milliseconds, across any number of web replicas, with no
new dependency. Reconnects are safe: the client refetches what it subscribes to rather than
trusting a replay that pub/sub cannot give.

**Design in one paragraph.** Two ports: `RealtimePublisher.publish(channel, message)` and
`RealtimeSubscriber.subscribe(channels, signal): AsyncIterable<RealtimeMessage>`. Two channel
shapes, both tenant-leading so sharded pub/sub (`SPUBLISH`, Redis 7), Redis Streams or a
broker partitioner can key on the prefix: `org:<organizationId>:user:<userId>` — one per
signed-in user, authorised by construction (you only ever receive your own), carrying
notifications and compact "something changed" frames — and `org:<organizationId>:conversation:<id>`
— opened only for the conversation on screen (Phase 5), carrying full message frames and
typing, which must never fan out per user. `RedisRealtimePublisher` publishes on the cache
client; `RedisRealtimeSubscriber` holds **one** dedicated subscriber connection per process
(`RedisConnection` gains a `"subscriber"` role, created on first use so the worker never opens
it), ref-counts `SUBSCRIBE`/`UNSUBSCRIBE` per channel and hands each stream a bounded queue
(256 messages; overflow drops the oldest and pushes a `resync` marker, so a slow tab costs a
refetch rather than memory); it enforces the per-user cap and a maximum stream age from
`ContainerConfig.realtime`. The contract is `realtime.stream` with
`output(eventIterator(RealtimeContract.message))`; the router handler is an async generator
that subscribes to the principal's user channel, first yields a `resync` frame when
`lastEventId` is set (pub/sub cannot replay, so a resume is a resync — the honest contract),
then yields each message with `withEventMeta({ id, retry })` until the request `signal`
aborts. `RPCHandler`'s own keep-alive (`eventIteratorKeepAliveEnabled`, 15 s) is the heartbeat;
it already streams event iterators as SSE through the existing `/api/rpc` Start route;
`RPCLink` with `ClientRetryPlugin` reconnects and resends `Last-Event-ID`. On the client,
`RealtimeProvider` (in `query`, mounted in the `_authenticated` layout) opens the user stream
once per tab and routes each frame through a declarative table to a cache edit or an
invalidation; on `resync` it invalidates every key the table names.

#### 4.A Ports, primitives, adapters (landed with Phase 2 — `C2.6` needs them)

- [ ] `C4.1` **`RealtimeChannel`** — `application/src/primitive/realtime-channel.ts`: private
  ctor, `user(organizationId, userId)`, `conversation(organizationId, conversationId)`
  returning a branded string. Server-only by residence; the browser never sees a channel.
  Spec: every channel starts with `org:<id>:`.
- [ ] `C4.2` **Ports + wire shape** — `application/src/port/realtime.publisher.ts`
  (`publish(channel, message)`) and `realtime.subscriber.ts` (`subscribe(channels, signal): AsyncIterable<RealtimeMessage>`;
  ends when `signal` aborts or the max age elapses; throws `RateLimitedError` past the cap;
  never buffers history). `RealtimeMessage` is the **wire** shape and lives in
  `contracts/src/realtime/realtime.contract.ts`: `z.discriminatedUnion("kind", [event { id, name: RealtimeEventName, at, payload }, resync { id }, typing { id, conversationId, userId, at }])`
  — no `organizationId` on the wire (it is the session's tenant by construction).
  Fakes `RecordingRealtimePublisher`, `InMemoryRealtimeSubscriber` sharing an
  `InMemoryRealtimeHub` so a spec can publish and read; `TestPorts` gains `realtime` and
  `realtimeSubscriber`. **Docs:** `ports.md`, `test-container.md`.
- [ ] `C4.3` **Redis adapters** — `infrastructure/src/redis/redis-realtime.publisher.ts`
  (cache client, `PUBLISH` of the JSON envelope, `id = Uuid.v7()`), `redis-realtime.subscriber.ts`
  (`constructor(redis /* subscriber role */, config: { maxStreamsPerUser; maxAgeMs; queueSize })`,
  the demux, ref counting and bounded sinks above); `RedisConnection` gains the `"subscriber"`
  role on `cacheUrl` (pub/sub is fire-and-forget; the queue instance's durability buys nothing),
  `healthy("subscriber")` via `PING` (permitted in subscriber mode — confirm on the installed
  ioredis), closed by `close()`. Smoke spec: publish on one client, receive on the subscriber;
  the last iterator closing releases the channel; a 300-message burst into a 256 queue yields
  one `resync`; a ninth stream for one user is refused. **Docs:** new
  `infrastructure/docs/reference/realtime.md`.
- [ ] `C4.4` **Container + config + health** — `realtime: RealtimePublisher`,
  `realtimeSubscriber: RealtimeSubscriber` (public — the router needs it), built in every
  process; `ContainerConfig.realtime: { maxStreamsPerUser; streamMaxAgeSeconds }` from env
  `REALTIME_MAX_STREAMS_PER_USER` (8) and `REALTIME_STREAM_MAX_AGE_SECONDS` (1800) in both
  `env.ts` (the worker passes defaults it never uses); `REALTIME_MAX_STREAMS_PER_USER` added to
  `ENV_FINGERPRINTS`. `HealthReport.realtime: boolean | null` — `null` in a process that opened
  no subscriber connection, the subscriber `PING` otherwise; `healthy` treats `false` as
  degraded and `null` as absent, the `analytics` rule. **Docs:** `container.md`, `health.md`,
  both `env.md`, `.env.example`, CI `env:`.

#### 4.B Contract, transport, permission

- [ ] `C4.5` **Verify the oRPC surface first** — `node_modules` was absent in the planning
  checkout, so before any code: confirm on the installed `^1.15` line `eventIterator`
  (`@orpc/contract`), `withEventMeta` and the `lastEventId` / `signal` handler context
  (`@orpc/server`), `RPCHandler` options `eventIteratorKeepAliveEnabled` /
  `eventIteratorKeepAliveInterval`, and `ClientRetryPlugin` from `@orpc/client/plugins`. If any
  needs a newer line, bump **all four** `@orpc/*` catalog entries together (§4).
- [ ] `C4.6` **Contract + router** — `contracts/src/realtime/{index,realtime.contract,realtime.procedures}.ts`:
  `stream` = `oc.route({ method: "GET", path: "/realtime/stream" }).output(eventIterator(RealtimeContract.message))`,
  mounted as `realtime` in `procedure/index.ts`. `catalog/realtime.permissions.ts`:
  `realtime.stream → core.realtime.subscribe`; `core.permissions.ts` gains that key (held by
  every resolved principal, as `CapabilitySet` already treats `core.*`, so no grant migration).
  `apps/web/src/server/orpc/realtime.router.ts`: `authed.realtime.stream.handler(async function* ({ context, signal, lastEventId }) { … })`
  subscribing to `RealtimeChannel.user(principal.organizationId, principal.userId)`;
  `principalMiddleware` runs before it like every procedure. `handler.ts` gains the keep-alive
  options. `apps/web/src/server/import.ts` must never re-export oRPC's `EventPublisher` — a
  comment on the line. Emits `realtime.stream.opened` / `closed { durationMs }`; note in
  `enforcement-surfaces.md` that `http.request.completed` fires at stream *start* for this
  procedure (a per-frame line would be the volume mistake the catalog warns about). **Docs:**
  `apps/web/docs/reference/server-functions.md` "streams" section, `docs/setup/24`, the
  HTTP/1.1 six-connections-per-origin caveat.
- [ ] `C4.7` **Prove the pipe end to end before building on it** — a spec in
  `apps/web/tests/server/` calling `handleRpc` with `GET /api/rpc/realtime/stream` and
  asserting a `text/event-stream` body carrying a pushed frame and a keep-alive comment; and by
  hand under `pnpm dev` and against the built `.output` that both stream (Nitro's node preset
  does; the point is the Vite dev middleware and `Cors.apply`, which must only set headers). If
  either buffers, the fallback is a dedicated `route/api/realtime.ts` Start route calling the
  same handler.

#### 4.C Client

- [ ] `C4.8` **Query layer** — `ApiClient.realtime` accessor; `RPCLink` gains
  `plugins: [new ClientRetryPlugin()]` with retry opted in per call from the hook, so ordinary
  calls keep their `retry: false` semantics. `packages/query/src/realtime/{index,realtime.context.tsx,realtime-route.ts,use-realtime-event.ts}`:
  `RealtimeProvider` (opens `client.realtime.stream()` only when `window` exists; `for await`;
  exposes `{ connected }`), `RealtimeRoutes` — a frozen `Record<RealtimeEventName, (queryClient, frame) => void>`
  (a missing entry is a compile error), `useRealtimeEvent(name, handler)` for components that
  want the raw frame (typing). `resync` invalidates every key the table names. Specs with
  `InMemoryRealtimeSubscriber` through a fake client. **Docs:** `query/docs/reference/realtime.md`
  (new: invalidate-on-resync and why there is no replay), `query/docs/index.md`.
- [ ] `C4.9` **Wire the notifications** — `DeliverNotificationUseCase` publishes
  `notification.created` on each recipient's user channel after `saveMany` (best effort, after
  the commit — a failed publish is a `realtime.publish.failed` line, never a failed delivery);
  the route prepends to the list cache and bumps the count; `unreadCount` drops
  `refetchOnWindowFocus`. `MemberRealtimeSubscriber`'s frames (`C2.6`) map to
  `QueryKeys.member.all()`. Mount `RealtimeProvider` in `route/(app)/_authenticated.tsx`, not
  `__root.tsx` (it needs a session).

**Exit.** Two browsers signed in as two members of one organization: changing the second's
role in the first shows the bell count change in the second within a second with no refetch
on focus; killing the web process and restarting it reconnects the stream, a `resync` frame
arrives, and the count is right after the refetch; `redis-cli client list` shows one subscriber
connection per web process, not one per tab; `/api/health` reports `realtime: true` on web and
`null` on the worker.

---

### Phase 5 — Messaging: conversations and messages

**Goal.** Direct messages and group channels inside an organization: create, list, read with
keyset pagination, send with optimistic rendering, edit and delete your own, read receipts and
per-conversation unread counts, typing indicators — all live through Phase 4, with `message.sent`
also on the outbox so the notification policy can turn an unread DM into a bell item and a
digest line.

**Design in one paragraph.** One slice, subject folder `messaging`, two contracts
(`conversation`, `message`). `messages` is month-partitioned on `created_at` with the keyset
index `(organization_id, conversation_id, created_at desc, id desc)`; a soft delete keeps the
row and blanks the body. A direct conversation is unique per pair through a `direct_key`
column (`<lowerId>_<higherId>`, partial unique index leading with the tenant), so
`conversation.create` for a DM is idempotent and returns the existing one.
`conversation_members.unread_count` is maintained by one `UPDATE … WHERE conversation_id = ? AND user_id <> ?`
per send and reset by `markRead` — one statement per message regardless of member count, the
write-amplification trade named at the line. Real-time fan-out happens in the web tier right
after the commit: `SendMessageUseCase` reads the member ids (one query) and publishes
`message.sent` to each member's user channel through `RealtimePublisher`; the outbox event of
the same name goes to durable consumers. Typing is a procedure that publishes and stores nothing,
rate-limited to one signal per two seconds per conversation in the use-case.

#### 5.A Permissions, routes, gate

- [ ] `C5.1` — `messaging.permissions.ts`: `messaging.conversation.read`, `.create`, `.manage`,
  `messaging.message.send`, `.update`; routes `messaging.routes.ts`: `inbox: "/messages"`,
  `conversation: "/messages/$conversationId"` (the builder form `AppRoute` reserved for);
  gate on `messaging.conversation.read`. Migration grants `read/create/send/update` to
  `owner/admin/member`, `manage` to `owner/admin`. Membership of a conversation is checked in
  every use-case in addition — a permission is never sufficient on its own.

#### 5.B Contracts

- [ ] `C5.2` — `contracts/src/messaging/{index,conversation.contract,conversation.entity,conversation.procedures,message.contract,message.entity,message.procedures}.ts`;
  ids `ConversationId`, `MessageId`. Procedures: `conversation.list` (keyset on
  `lastMessageAt, id`), `create ({ kind, title?, memberIds })`, `get`, `addMember`,
  `removeMember`, `leave`, `rename`, `markRead ({ conversationId, messageId, createdAt })`;
  `message.list ({ conversationId, limit ≤ 50, before? })`, `send ({ conversationId, body ≤ 4 000, clientId })`
  (`clientId` is the optimistic key and the dedupe key: a retried send is one row),
  `edit`, `delete`, `typing`. Permission map in `catalog/messaging.permissions.ts`.
  DTOs never carry another tenant's ids; `MessageDto.deleted` is a boolean, the body is empty.

#### 5.C Schema

- [ ] `C5.3` **`conversations`, `conversation_members`** — `pg/schema/messaging.schema.ts`.
  `conversations`: `organization_id` (cascade), `id`, `kind` (`direct | channel`), `title`
  nullable, `direct_key` nullable, `created_by`, `created_at`, `last_message_at`,
  `last_message_id` nullable; unique `(organization_id, direct_key) WHERE direct_key IS NOT NULL`;
  index `(organization_id, last_message_at desc, id desc)`. `conversation_members`:
  `organization_id` (cascade), `conversation_id` (NO ACTION — siblings), `user_id` (cascade —
  a membership dies with the account), `role` (`owner | member`), `joined_at`, `last_read_at`,
  `last_read_message_id`, `muted_at` (no `unread_count` — see `C5.5`); unique
  `(organization_id, conversation_id, user_id)`; index `(organization_id, user_id, last_read_at)`;
  FK indexes on `conversation_id`, `user_id` (§18).
- [ ] `C5.4` **`messages`** — partitioned monthly on `created_at`, PK `(id, created_at)`,
  `organization_id` (cascade), `conversation_id` (NO ACTION; FK from a partitioned table is
  supported), `author_id` (no FK), `client_id uuid`, `body text`, `edited_at`, `deleted_at`;
  unique `(organization_id, conversation_id, client_id)` (the send dedupe — tenant-leading);
  keyset index `(organization_id, conversation_id, created_at desc, id desc)`;
  `messages_conversation_fk_idx (conversation_id)`. **Never dropped** by retention — messages
  are domain data; the partitions exist for pruning and for the archive follow-up (`C6.4`).
  Migration reviewed; §17/§18/§20. **Docs:** `data-and-scale.md` §9 gains three rows.

#### 5.D Domain (`application/src/messaging/`)

- [ ] `C5.5` **Ports** — `conversation.repository.ts` (`listByMember(organizationId, userId, page)`,
  `findById`, `findByDirectKey`, `save` (insert `ON CONFLICT DO NOTHING` on the partial unique
  index), `isMember`, `memberIds(organizationId, conversationId)`, `saveMember`, `deleteMember`,
  `markRead(organizationId, conversationId, userId, messageId, at)` — `SET last_read_at = GREATEST(last_read_at, ?)`,
  idempotent —, `touch(organizationId, conversationId, lastMessage)`), `message.repository.ts`
  (`list` keyset, `findById(organizationId, conversationId, id, createdAt)`, `save` (upsert on
  `(id, created_at)` covers edit), `delete` (soft), `unreadCounts(organizationId, userId, conversationIds)`).
  **Unread is computed, not counted**: one `LATERAL (SELECT count(*) … WHERE created_at > coalesce(last_read_at, '-infinity') AND author_id <> ? LIMIT 100)`
  per row of the conversation page, capped so a stale channel costs at most a hundred index
  entries and renders "99+"; `last_read_at` is the only state, `markRead` is idempotent, and
  there is no fan-out write per message. The 100k move is `unreadCounts` → a Redis `HINCRBY`
  adapter behind the same method with `last_read_at` still the record. (This replaces the
  `unread_count` column in `C5.3`: drop it from the schema item.) Every method takes the
  tenant first.
- [ ] `C5.6` **Use-cases** — `list-conversations`, `create-conversation` (direct:
  `MessagingRules.directKey(a, b)` sorted; conversation + both members in one `unitOfWork.run`,
  `ON CONFLICT DO NOTHING`, then `findByDirectKey` — race-safe; publishes `conversation.created`),
  `get-conversation` (asserts membership — also what the conversation stream calls first),
  `add-conversation-member`, `remove-conversation-member`, `leave-conversation` (the last
  owner cannot leave a channel — the `lastOwner` rule from `P5.3` reused), `rename-conversation`,
  `mark-conversation-read` (publishes `conversation.read` on the reader's user channel so other
  tabs clear the badge), `list-messages`, `send-message` (assert `messaging.message.send` +
  membership; dedupe on `clientId`; in one `unitOfWork.run`: `messages.save`, `conversations.touch`,
  `eventPublisher.publish("message.sent")` — **no** `activity.record`: chat volume is not
  audit, the outbox row is the event; then, after the commit, the **fast path**: publish the
  full frame on the conversation channel through `RealtimePublisher`, best effort),
  `edit-message` / `delete-message` (author only within `MessagingRules.EDIT_WINDOW_MS`, or
  `messaging.conversation.manage`; inputs carry `createdAt` as the partition hint — a wrong
  value is `NOT_FOUND`, never another row), `signal-typing` (asserts membership, publishes a
  `typing` frame on the conversation channel, no unit of work, no outbox, rate-limited to one
  per two seconds per conversation in the use-case). `MessagingRules` (`.rules.ts`, the
  `RoleRules` shape — **flag** that `.rules.ts` is missing from the `files.md` table and add it)
  holds `directKey`, the body limit, the edit window and the typing rate. Specs with
  hand-rolled doubles; the send spec pins one `save`, one `touch`, one event.
- [ ] `C5.7` **`MessagingRealtimeSubscriber`** — `application/src/messaging/messaging-realtime.subscriber.ts`,
  `events` = the seven outboxed messaging events; the **durable path**: for each, the full
  frame on the conversation channel (a duplicate of the fast path — the client dedupes by
  message id, so a lost fast-path frame costs nothing) and, for `message.sent` /
  `conversation.created` / `conversation.member.added`, a compact frame on each member's user
  channel via `memberIds` (unread badge, list reorder). N publishes per message for N members
  is the amplification named at the line; the swap when big channels hurt is "conversation
  channel only, and the user stream carries a summary from a Redis counter".

#### 5.E Adapters, composition, worker

- [ ] `C5.8` — `PgConversationRepository`, `PgMessageRepository`; `KeysetCursor` codec
  (`C3.0`); integration specs with fixed query counts: `listByMember` is two statements for a
  page regardless of size (rows + one lateral), `list` messages one, `unreadCounts` one;
  partition-bounded cleanup as `pg-activity-replay.reader.spec.ts` does (`T-026`).
  `Container.messaging = { … }`; the subscriber joins the frozen list in `C2.9`.
- [ ] `C5.9` **Notification policy rows** — `message.sent` in a **direct** conversation →
  kind `message.received`, recipients: members minus author, in-app `immediate`, email
  `digest` by default; suppressed while the recipient already has an unread `message.received`
  for that conversation (`NotificationRepository.existsUnread(organizationId, userId, kind, conversationId)`
  — one indexed query). Channels get no bell item by default (the §6 write-amplification
  case); a mention feature is the follow-up that changes that.

#### 5.F Client

- [ ] `C5.10` **Conversation stream** — `conversation.stream ({ conversationId })` in the
  messaging procedures, `output(eventIterator(RealtimeContract.message))`, permission
  `messaging.conversation.read`; the handler calls `getConversation` (membership) then
  `yield*`s `realtimeSubscriber.subscribe([RealtimeChannel.conversation(…)], signal)`. Opened
  by `useConversationStream(conversationId)` only while that conversation is on screen; it
  patches `QueryKeys.message.list(conversationId)` pages on `message.sent/edited/deleted`
  (replacing the optimistic row by `clientId`, deduping by message id) and holds
  `typing: Map<userId, expiresAt>`. Two streams per tab at most: the user stream and the open
  conversation.
- [ ] `C5.11` **Query layer** — `ApiClient.conversation`, `.message`, `.typing`;
  `QueryKeys.conversation = { all, list(params), get(id) }`, `QueryKeys.message = { all, list(conversationId) }`
  (the cursor lives in the page data, never in the key); `MessagingQueries.conversations`,
  `.conversation(id)`, `.messages(conversationId)` (`infiniteQueryOptions`, `getNextPageParam: last => last.nextCursor`);
  `MessagingMutations.useSend` (optimistic prepend keyed by a client-generated `clientId`,
  `invalidates: [QueryKeys.conversation.all()]`), `useEdit`, `useDelete`, `useMarkRead`
  (optimistic `unreadCount: 0` on the list), `useCreateConversation`, `useAddMember`,
  `useLeave`, `useStartTyping` (no invalidation, throttled by the composer). `RealtimeRoutes`
  entries for the user-stream frames (`conversation.*` → `QueryKeys.conversation.all()`).
- [ ] `C5.12` **Copy + UI + feature** — `content` namespace `messaging` (en, bn) registered
  in `NamespaceShape`, `ClientNamespace`, `CLIENT_NAMESPACES`, both catalogs; `ui` gains
  `Textarea` (the one primitive missing; the same `Field` association as `Input`);
  `feature/src/messaging/` following the stated `<subject>.<role>.tsx` rule (the `member/`
  slice's hyphenated names are the precedent **not** to copy): `conversation.list.tsx`
  (`ConversationList`, unread badges, `onNavigate(id)`), `conversation-create.form.tsx`,
  `conversation-member.list.tsx`, `message.list.tsx` (`MessageList`: infinite upward, newest at
  the bottom, deleted rows as a placeholder, `useConversationStream`), `message-composer.form.tsx`
  (Enter sends, Shift+Enter newline, throttled `useStartTyping`), `typing.notice.tsx`. Icon
  `chat` in `asset`. Specs for the list states and the optimistic send/rollback.
- [ ] `C5.13` **Transport + routes** — `orpc/messaging.router.ts` (`conversation`, `message`,
  `typing` groups; paths stay `<subject>.<action>`), mounted; routes
  `(app)/_authenticated/messages/{index,$conversationId}.tsx` behind
  `requirePermission("messaging.conversation.read")`, `staticData.messages = ["messaging"]`,
  loaders prefetch; nav gate; the unread total in the nav badge is the sum over the first page
  of `conversation.list`, capped. `routes.spec.ts` covers both literals.

#### 5.G Docs

- [ ] `C5.14` — `packages/application/docs/reference/messaging.md` (direct-key uniqueness,
  computed unread and its cap, fast path vs durable path and client dedupe, why typing rides
  the conversation channel), `packages/contracts/docs/reference/keyset.md` beside
  `envelope.md`, `docs/setup/27` third worked example, `data-and-scale.md` §6 gains a
  "Message fan-out" paragraph pointing at the code, `activity-archive.md` names messages as the
  next candidate for the detach-and-ship pipeline (`C6.4`).

**Exit.** Two members DM each other across two browsers: the message appears optimistically,
is confirmed by the stream, edits and deletes propagate, typing shows and clears, unread
counts move in the list and clear on open, a retried send with the same `clientId` produces one
row, and a third member of the organization gets `FORBIDDEN` on `message.list` for that
conversation. `check:architecture` 20/20, all suites green including the Postgres integration
specs and the smoke suite.

---

### Phase 6 — Follow-ups (filed, not built)

- [ ] `C6.1` **Threads, reactions, attachments** — `messages.parent_id` (NO ACTION, indexed),
  `message_reactions`, uploads through the existing `StorageGateway.presignUpload` with a
  `message_attachments` table; each its own slice increment.
- [ ] `C6.2` **`Popover` in `ui`** so the bell opens an inline list rather than a page.
- [ ] `C6.3` **Web push** — a `PushPublisher` port beside `MailPublisher`; lands with its first
  adapter and `Container` line or not at all (`P5.11`'s rule).
- [ ] `C6.4` **Message archive** — partitions older than N months streamed to S3 the way
  `PgActivityArchiveGateway` does, behind a per-tenant retention setting.
- [ ] `C6.5` **Redis Streams behind `RealtimeSubscriber`** — `XADD`/`XREAD` from
  `last-event-id`, which turns "invalidate on reconnect" into a real replay. Same port.
- [ ] `C6.6` **Global stream cap and presence** — `INCR` with TTL per user in the cache Redis;
  `presence` derived from open streams.
- [ ] `C6.7` **Per-tenant digest hour**, mention notifications for channels, notification
  grouping ("3 new messages from A").
- [ ] `C6.8` **Load test** the three §6 paths at 10× (digest fan-out, notification write
  amplification, message fan-out) against the compose stack before any of this is called
  production-ready.
- [ ] `C6.9` **Resend actions** — "resend invitation" and "resend verification". These are what
  cover the window between a commit and its enqueue, which decision 8 takes instead of a table.
  Small, and worth having before the first support question rather than after.
- [ ] `C6.10` **A delivery log, if the question actually arrives.** The trigger is stated so it
  is not built on a feeling: somebody needs to answer "was this sent" and neither
  `mail.delivery.sent` in Loki nor the provider's own log can answer it — most likely because
  retention is shorter than the question. Build it then, as an append-only table written by the
  consumer, never as state the send path depends on.
- [ ] `C6.11` **Move from SMTP to a provider API** (SES, Postmark, Resend). This is what buys
  bounce and complaint webhooks, suppression lists and a searchable sent log — the delivery record
  this plan deliberately does not keep. It is one adapter behind the existing `EmailSender` port,
  which is exactly the swap that port exists for; `docs/ai/rules/dependencies.md` would move the
  entry from Tier 0 (a protocol) to Tier 2 (an SDK behind a port).

---

## Verification — the whole plan

```bash
pnpm build:packages && pnpm --filter @loadbearing/web build && pnpm --filter @loadbearing/worker build
pnpm check:architecture      # 20/20, no "○ skipped"
pnpm typecheck && pnpm lint && pnpm test
pnpm infra:up && pnpm db:migrate && pnpm db:seed
pnpm --filter @loadbearing/infrastructure test && pnpm smoke
pnpm dev                      # web + worker; Mailpit on :8025
```

Then by hand, per phase exit line, and per `docs/ai/skills/add-slice.md` "Verify" for each
slice: removing a permission hides the nav item **and** returns `FORBIDDEN`; the
`Pg<Subject>Repository` grep hits exactly `infrastructure` and `composition`; no repository
method queries without `organization_id`; every looping method has a query-count spec.

---

## Changelog

| Date | Who | Change |
|---|---|---|
| 2026-09-12 | @sami | Created from a read of the tree at `927cdec`: six phases covering the mail pipeline, the outbox (`T-031`), notifications, real-time delivery, messaging, and the follow-ups |
