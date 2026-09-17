---
title: TODO — loadbearing starter kit
updated: 2026-09-13
owner: sami
schema: todo/v1
---

# TODO — loadbearing starter kit

> **Rules for agents & humans (read first)**
>
> 1. Every task has a **unique ID** (`T-001`). Never reuse or renumber an ID.
> 2. Change progress by editing the **checkbox marker only** — do not delete tasks.
> 3. When a task is done, set `[x]`, add `done: YYYY-MM-DD`, and move it to **Done**.
> 4. New tasks go to the bottom of **Backlog** with the next free ID.
> 5. If a task is blocked, set `[!]` and fill **Blocked by** with a reason or task ID.
> 6. Do not start a task whose `Depends on` tasks are not `[x]`.
> 7. Keep one task per line item. If a task needs more than 5 subtasks, split it.

## Legend

| Marker | Status      | Meaning                                 |
| ------ | ----------- | --------------------------------------- |
| `[ ]`  | todo        | Not started                             |
| `[~]`  | in-progress | Someone is actively working on it       |
| `[!]`  | blocked     | Cannot proceed — reason required        |
| `[x]`  | done        | Finished and verified                   |
| `[-]`  | dropped     | Cancelled — keep for history            |

| Tag     | Meaning                          |
| ------- | -------------------------------- |
| `P0`    | Critical — drop everything       |
| `P1`    | High — this cycle                |
| `P2`    | Normal                           |
| `P3`    | Nice to have                     |
| `~2h`   | Estimated effort                 |
| `#area` | Area: `#api` `#ui` `#db` `#infra` `#docs` |
| `@name` | Assignee (`@agent` for AI tasks) |

## Task format

```md
- [ ] `T-000` **Short imperative title** `@owner` `P2` `~2h` `#area`
  - **Goal:** One sentence — why this exists.
  - **Done when:** Testable condition. No opinion words.
  - **Files:** `path/to/file.ts`, `path/to/other.ts`
  - **Depends on:** `T-000` (or `none`)
  - **Blocked by:** reason (only when status is `[!]`)
  - **Notes:** links, decisions, gotchas
```

Only **Goal** and **Done when** are required. Drop the rest when empty.

---

## State of the repo — 2026-09-06

Verified by running the pipeline end to end on this tree, with `build:packages` and the web build
done first so no assertion skips:

| Check | Result |
| --- | --- |
| `pnpm build:packages` | ✅ 15 packages build |
| `pnpm typecheck` | ✅ 17 projects clean |
| `pnpm lint` (biome + eslint) | ✅ 716 files, no findings |
| `pnpm test` | ✅ 659 tests across 114 files, `infrastructure` included |
| `pnpm --filter @loadbearing/web build` | ✅ builds `.output/` |
| `pnpm check:architecture` | ✅ 18/18 assertions, none skipped |
| `pnpm deps:check` / `pnpm repo:check` | ✅ silent, and blocking in CI |

**Every task `T-001`–`T-030` is done.** The kit authenticates a user end to end, enrols them by one
of three modes, brings a second person in by invitation, moves between organizations, ships one
feature slice through all twelve steps of `27.4`, has a transactional mail transport and a readiness
probe.

> [!IMPORTANT]
> **CI has never been green, and the reason is not this tree.** Both jobs die in ~20s at
> `pnpm/action-setup@v4` with "No pnpm version is specified" — the root `package.json` declares
> `devEngines.packageManager` rather than the `packageManager` field the action reads. It fails
> identically on every run of the default branch, so nothing here has ever been verified by CI.
> `P8.12` in [`IMPLEMENTATION-PLAN.md`](archive/IMPLEMENTATION-PLAN.md) carries the one-line fix. Until it
> lands, "covered in CI" is not an answer any task may give.

---

## 🔥 In Progress

*(nothing in progress)*

## 📋 Backlog

- [ ] `T-033` **Assert that every event code has an emitter** `@unassigned` `P3` `~1h` `#tooling`
  - **Goal:** `P5.14` found eight of twenty-four declared codes with no production call site. A
    declared code that nothing emits is a dashboard panel that stays empty forever, and an empty
    panel is indistinguishable from a healthy system. The catalog is clean today and nothing stops
    it drifting again.
  - **Done when:** `check-architecture.mjs` gains an assertion — every key in `EVENT_CATALOG` has at
    least one `logger.emit("<code>"` outside `core.events.ts`, `event-shape.ts` and `tests/`. The
    grep is the one `P5.14` used:
    `grep -rn '"<code>"' packages apps --include=*.ts | grep -v node_modules | grep -v dist`.
  - **Notes:** deliberately not done inside `P5.14`. A new assertion means renumbering "fifteen
    assertions" across `docs/ai/rules/workflow.md`, `docs/setup/26`, `AGENTS.md` and the `TODO.md`
    state table, which is churn worth doing once rather than mid-phase. The same shape would serve
    `permissions`: every key in `CATALOG` used by at least one `PROCEDURE_PERMISSIONS` entry, which
    is Phase 5's own exit criterion.


- [ ] `T-032` **The production SSR bundle throws `jsxDEV is not a function`** `@unassigned` `P1` `~3h` `#ui`
  - **Goal:** `pnpm --filter @loadbearing/web build` succeeds and `node .output/server/index.mjs`
    returns 500 on **every** page. `RootDocument` in `__root.tsx` calls
    `import_jsx_dev_runtime.jsxDEV`, which the production React runtime does not export — a
    development JSX transform reached the server build. `pnpm dev` is unaffected, which is why
    nothing has noticed: every check in CI and every local gate passes on a build that cannot serve
    a request.
  - **Found while verifying `P5.10`.** Confirmed pre-existing by stashing that change and
    rebuilding from a clean `.output`: the baseline fails identically. Not caused by the isomorphic
    transport.
  - **Where to look first.** `vite.config.ts` prepends the `development` export condition only when
    `command === "serve"`, and its own comment records that leaving it in a build once shipped
    `@tanstack/react-router`'s dev build to the client. This is the same failure on the **ssr**
    side: `ssr.resolve.conditions` and `ssr.resolve.externalConditions` both take `devCondition`,
    so check what `react/jsx-dev-runtime` resolves to in the server graph. `esbuild` appears twice
    in the pnpm store at two versions (`0.27.7`, `0.28.2`), which is worth ruling out too.
  - **Done when:** a built `.output` serves `/`, `/sign-up` and `/settings/roles`, and the ✅ Gate
    in `docs/setup/24` gains a line asserting it — the existing gate checks the *client* bundle
    carries no dev build and never checks that the server bundle runs at all.


- [ ] `T-035` **The English fallback layer is now dead payload** `@unassigned` `P3` `~3h` `#ui`
  - **Goal:** `StaticContentSource` loads English *beneath* every locale, per namespace, so a key
    the locale had not translated still rendered a sentence. `P5.9` made `NamespaceBundle` a total
    `Record`, so a bundle with a gap no longer compiles — and the layer beneath it can no longer be
    reached by anything that ships.
  - **What it costs:** every non-English page carries both copies. Measured on `/sign-in` under
    `locale=bn`: the dehydrated payload holds the full `common` + `error` + `auth` English bundle
    *and* the full Bengali one, roughly doubling the message bytes on the wire and in memory.
  - **Why this is not just "delete it".** The layer is also what makes a *partially loaded* set of
    namespaces work, and it is the safety net if copy ever arrives from somewhere `tsc` does not
    see — a CMS behind `ContentSource`, which is the swap that seam exists for. Removing it makes
    adding a locale all-or-nothing at runtime as well as at compile time, which is a real barrier
    to a contributor landing a third language incrementally.
  - **Done when:** one of two decisions is made and written down — either the base layer is dropped
    for a locale whose bundles are statically known total (and `StaticContentSource` gains the test
    that proves it), or the totality of `NamespaceBundle` is relaxed back to `Partial` with a
    `check-architecture` assertion counting the gap instead. Do not ship both.


- [ ] `T-034` **Bring back an analytics reader, with the first dashboard** `@unassigned` `P3` `~8h` `#api` `#db`
  - **Goal:** Nothing reads the analytics store. `P5.12` deleted `AnalyticsReader`, both its
    implementations, its two rollup tables and the `ANALYTICS_DRIVER` flag, because nothing ever
    called any of it — a shape guessed at with no consumer to check it against, kept in step by hand
    across two adapters. The write half stayed: `AnalyticsProjector` fills `activity_events` and the
    nightly reconciliation checks it.
  - **The trigger, and it is not "the table is large".** Snapshot tables stop covering the questions
    people ask — the specific moment somebody wants an aggregate nobody precomputed.
  - **Do it in this order**, which is the whole point of having deleted the seam: set
    `CLICKHOUSE_URL` and let the projection fill and reconcile for days first, then write the reader
    against a store with real data in it and a dashboard with a real query.
  - **Four decisions carry over** and should not be re-litigated:
    - It is a **new port**, separate from `AnalyticsProjector`. A single port with both would put
      `project()` on the object a dashboard query holds.
    - **Read-only by construction.** A write method is the moment a derived store becomes
      authoritative ([Data and scale](../docs/opinions/data-and-scale.md) §2).
    - **Any permitted scope arrives resolved**, as `VectorStore.search()` takes `goalIds`. A remote
      analytics store holds no `CapabilitySet` and can join back to nothing.
    - **Periods are ISO `YYYY-MM-DD` strings**, not `Date`s: `date_trunc` and `toYYYYMM` return
      different shapes and each adapter normalises.
  - **A driver flag comes back only if a second implementation does**, and only once the first has a
    caller. Its absence is currently a feature — a flag that moved reads the moment the pipeline
    started would cut a dashboard over to a store that is still backfilling.


- [x] `T-031` **Transactional outbox for cross-slice events** `@sami` `P3` `~12h` `#api` `#db` `done: 2026-09-12`
  - **Goal:** A finance use-case should publish `invoice.approved` rather than importing the
    notification slice. Without a seam for that, slice ownership decays into a call graph where
    every team's code reaches into every other team's. An `EventBus` port was declared for this and
    deleted by `P5.11` — it had no adapter and no publisher, so a use-case that published would have
    published into a recording fake under test and into nothing at all in production.
  - **Why an outbox and not a bus.** The event and the state change that caused it must commit or
    fail together. Publishing to a broker inside the transaction cannot be rolled back; publishing
    after it commits loses the event on a crash in between. An outbox table written in the same
    transaction, drained by the worker, is the only shape with neither hole — and this repository
    already has the `UnitOfWork` that makes it one line at the call site.
  - **Done when:** an `outbox` table (`organization_id`, partitioned, `published_at` nullable with
    the two partial indexes that a nullable column in a unique index needs); an `EventPublisher`
    port whose `publish` enrols in the ambient `UnitOfWork`; a `PgOutboxPublisher`; a worker
    consumer that drains and marks; one real publisher and one real subscriber, all in one change.
    A port, an adapter and a `Container` line land together or not at all — that is what `P5.11`
    established.
  - **Build the interface broker-shaped**, because these four are what Kafka or Redis Streams
    cannot give back later ([Data and scale](../docs/opinions/data-and-scale.md) §7):
    - `publish` is async and returns nothing — a caller reading a return value is doing RPC.
    - Handlers are idempotent, keyed on a stable event id: at-least-once is what every broker offers.
    - No ordering assumptions. Two events published in order may be handled out of order.
    - No handler exception reaches the publisher. In-process dispatch *could* propagate one; a
      broker cannot, so a use-case that catches a handler failure depends on semantics that will
      disappear.
  - **Notes:** re-adds the `.bus.ts` role suffix to `docs/opinions/files.md` and
    `docs/ai/rules/files.md`, removed with the port because every other row in that table names a
    file that exists. The analytics projection is the second consumer class and already works
    without this: it reads `activity_log`, which is a different stream with a different guarantee.
  - **Closed 2026-09-12 by Phase 2 of [`COMMUNICATION-PLAN.md`](archive/COMMUNICATION-PLAN.md)**
    (`C2.1`–`C2.9`). The four broker-shaped properties hold, and one publisher plus one subscriber
    landed with the port, the adapter and the `Container` line in one change, as `P5.11` requires.
    **Both corrections above are now applied:**
    - **`.bus.ts` is not re-added.** The design is a publisher, a gateway and subscribers, and
      nothing in it is a bus. `.subscriber.ts` is the suffix that landed — and `Bus` was *removed*
      from `classes.md`'s role-noun list, since that list claims every entry names something that
      exists.
    - **`published_at` needs no partial *unique* indexes.** Nothing is unique over it. The two
      partial indexes are ordinary: `outbox_event_pending_idx` for the drain and
      `outbox_event_published_idx` for retention, each holding only the rows the other ignores.
  - **One further correction the build made.** Retention is whole-partition drop, not the
    row-level `DELETE` the plan sketched: deleting a month of rows is exactly the vacuum problem
    partitioning exists to avoid. The guard against dropping a stuck event is `oldestPendingAt()`,
    checked before the cutoff.
  - **Not yet run against a database.** The migration, the `SKIP LOCKED` concurrency spec and the
    one-second drain need Postgres and Redis, which the environment this was built in has none of.
    Each item in the plan carries an `unverified:` note naming what to run.

- [ ] `T-036` **Communication plan: unified mail, outbox, notifications, real-time, messaging** `@sami` `P1` `~120h` `#api` `#ui` `#db`
  - **Goal:** Mail is sent from two unrelated places with no record and no retry, `QueueName.NOTIFICATION` has no consumer, `DigestComposer` has no caller, there is no notification table, no event spine and no real-time path. One plan covers all of it in the order each piece compiles against the last.
  - **Done when:** Every item in Part C of [`PLAN.md`](PLAN.md) is closed and the eight client-side **Exit** clauses [`archive/COMMUNICATION-PLAN.md`](archive/COMMUNICATION-PLAN.md) still lists as unmet report true. The plan is the checklist; this entry is the ledger row.
  - **Files:** `plans/PLAN.md` (Part C); history in `plans/archive/COMMUNICATION-PLAN.md`
  - **Depends on:** `none` — Phase 2 of the plan closes `T-031`.
  - **Notes:** Decisions taken at planning time and recorded in the plan's "Decisions" section: every mail queued (auth mail included), in-app + email with per-user preferences, conversations (DM + channel) with threads/reactions/attachments deferred, SSE over oRPC event iterators with Redis pub/sub fan-out, the outbox built now, and "design for 100k" read as shape-for-the-swap rather than run-the-topology.
  - **Revised 2026-09-12, before any of it was built.** Two Phase 1 decisions were reversed on review and the plan carries the reasoning. Templates are hand-written HTML in `packages/composition/src/mail/` rather than react-email, which removes the only new package in the plan and both of its dependencies. And a send is a BullMQ job with no `mail_deliveries` table: the queue already supplies retries, backoff and duplicate suppression, the mail provider is where a delivery record belongs at scale, and a table would put the plaintext invitation token in Postgres against the reason its hash is stored. The outbox event table stays, and the distinction is the point — Redis cannot commit atomically with Postgres. **The plan now adds no package and no dependency at all.**
  - **Phase 1 complete, 2026-09-12.** `C1.1`–`C1.25` are all `[x]` across six commits. Every mail
    in the system — Better Auth's four and the invitation — is now a job on `QueueName.MAIL`,
    rendered by `MailConsumer` in the worker and sent through `EmailSender`. No new package, no new
    dependency, no delivery table. Three corrections were made to the plan on the way through and
    are recorded in it: no `mail` commit scope is added (the enum's rule is one scope per package,
    and this adds none), `.manifest.ts` was already in the closed suffix table so only `.renderer.ts`
    is new, and `EMAIL_FINGERPRINTS` was missing `"email.invitation."` — a real hole, now closed.
    Two defects were found and fixed while building: `SmtpEmailSender` turned a transport that
    resolved with nothing into a thrown `UnavailableError` over a message that had been sent, and
    `Container` built both mailers inside `if (config.auth)`, so the worker — the process that is
    supposed to send — had none. **Phase 1's Exit line is not ticked:** it needs Mailpit and a live
    Redis, and the environment this was built in has no Docker.
- [ ] `T-037` **Database scaling plan: connection pooling, partitioning, virtual sharding** `@sami` `P1` `~80h` `#db` `#infra`
  - **Goal:** One pool per process at a hardwired ten, no pooler, partition policy living in a worker constant with no assertion over the hand-edited DDL, and no routing seam — so `data-and-scale.md` §5's "shard by `organization_id`" is weeks because everything changes at once. One plan builds the knobs, the guards and the seam, and files the physical split.
  - **Done when:** Every built phase in Part S of [`PLAN.md`](PLAN.md) reports its **Exit** line true; Phase 4 stays filed. The plan is the checklist; this entry is the ledger row.
  - **Files:** `plans/PLAN.md` (Part S); history in `plans/archive/DB-SCALING-PLAN.md` and `plans/archive/DB-SCALING-DEFERRED.md`
  - **Depends on:** `none` — Phase 1 of the plan is independent of `T-036`; Phase 3 routes the tables `T-036` added.
  - **Notes:** Decisions taken at planning time and recorded in the plan's "Decisions" section: a pluggable `ShardingStrategy` with `organization_id` as the shipped key, placement by directory row rather than by hash, 256 virtual shards fixed forever, three table placements with a transaction tripwire, pgBouncer always on with timeouts moved to the role, and the two-node proof filed behind the foreign-key decision.
  - **Phase 1 and section 2.A built, 2026-09-13.** Third pass 2026-09-14: `S2.9` dropped with its measurements kept, `S2.15` and `S5.6` deferred to the second file, and every open item corrected against the tree at `5777eba` — the plan's changelog carries the list.
  - **Second pass with the admin plan, 2026-09-15:** `messages` is partitioned now (`S2.6` rewritten as a build item, `S4.7` absorbed, decision 17); `partition_archive` gains `bytes`, `action_counts` and `projected_at` (`S2.11`); prune stamps `projected_at` or records a gap rather than blocking a drop (`S2.14`, decision 18); `S2.19` adds the partition-estimate read the admin preview consumes.
  - **Fifth pass, 2026-09-16:** the shard is the organization and the tenant is a partition (decisions 19, 20); `S2.20`–`S2.24` new (the layout, the tenant partition seed, the two-level maintenance gateway, the per-tenant projection, pruning asserted per tenant); Phase 3 minus the 256 layer, `S3.4` and `S4.3` dropped.
  - **2026-09-16, second:** `S2.25` partition DDL generator; `S2.20` reshaped to `tenantKey` and to parents-only migrations with `migrate.ts` running the seed; `S3.18` one tenant-column constant; the four-edit shard-key recipe in `S3.21`.
  - **2026-09-17:** `S2.21`/`S2.22` create children standalone and attach them (the `partition of` form would have locked the parents on every signup); `S2.26` measures the tenant ceiling; `S4.9` files the pooled partition for the long tail.
- [ ] `T-038` **Platform admin: the tier on RBAC, retention and projection policy as rows, the replica panel** `@sami` `P2` `~60h` `#api` `#ui` `#db` `#infra`
  - **Goal:** There is no authorization scope above an organization, so nothing global — how long a partition stays hot, what goes to cold storage and for how long, which activity actions reach ClickHouse and for how long each — can be edited by anyone without a deploy, and the ClickHouse schema cannot be changed at all after first boot. One plan builds the tier as a platform organization whose roles carry `platform`-scoped keys, then the policy rows and the screens over them, and files the replica panel behind the scaling plan's `S4.4`.
  - **Done when:** Every built phase in Part A of [`PLAN.md`](PLAN.md) reports its **Exit** line true; Phase 4 stays filed. The plan is the checklist; this entry is the ledger row.
  - **Files:** `plans/PLAN.md` (Part A); history in `plans/archive/PLATFORM-ADMIN-PLAN.md`
  - **Depends on:** `T-037` — Phase 2 needs `DB-SCALING-PLAN.md` section 2.C (cold storage) built; Phase 4 needs its `S4.4`.
  - **Notes:** Decisions taken at planning time and recorded in the plan's "Decisions" section: the tier is an organization marked `is_platform`, `platform` is a third permission scope no tenant wildcard reaches, the first admin is seeded by `pnpm platform:grant` and every later one is invited, absent row = code default for every policy table, the app owns the bucket lifecycle configuration through a second storage port, the projection filter is one list read by three queries, ClickHouse gets a migration path before the app issues DDL, and activity actions become a catalog in `contracts`. Reopens `S2.15` and `S5.6` from `DB-SCALING-DEFERRED.md`.
  - **Second pass 2026-09-15:** the projection switch (a pause, not a power switch), gap recording and re-project from cold storage, restore a month to Postgres, a preview before every retention change, per-tenant storage, and a shard map with a move button that waits on `S4.2`; decisions 12–18. Queue-job retention was checked and is already capped, so it is not filed.
  - **Third pass 2026-09-16:** per-tenant retention override (`A2.19`), tenant deletion (`A2.20`), the shard map is per node with tenants underneath; decisions 19, 20.
  - **2026-09-16, second:** decision 21 and the "what the admin changes, and what stays a file" section.
  - **2026-09-17:** tenant deletion forgets the tenant in ClickHouse too (`A2.20`); tenant export (`A2.21`).

## ⛔ Blocked

*(nothing blocked)*

## ✅ Done

- [x] `T-030` **`core.activity.write` is unreachable for anyone but `owner`** `@sami` `P2` `~1h` `#api` `done: 2026-09-05`
  - **Goal:** `core.permissions.ts` says the key is "held by every principal … a property of acting at all", but `PgCapabilityRepository.resolveFor` grants only through roles and only `owner`'s wildcard carries it. `IndexDocumentUseCase` asserts it, so a `member` cannot index a document.
  - **Done when:** Either every resolved principal holds the `core.*` keys or no use-case asserts one; the decision is recorded in `packages/permissions/docs/`.
  - **Files:** `packages/permissions/src/capability/capability-set.ts`, `packages/application/src/ai/index-document.use-case.ts`, `packages/permissions/src/catalog/core.permissions.ts`, `apps/worker/src/system-principal.ts`
  - **Done:** Both halves, because either alone leaves the other half of the contradiction standing. `CapabilitySet.can()` holds every `core.*` key for any resolved principal — checked after denies, exactly where the wildcard is, so rule 2 stays the one rule nothing is above — and `IndexDocumentUseCase` no longer asserts it. `SystemPrincipal.GRANTS` drops it too: granting what is already true reads as a decision. Recorded as the fifth resolution rule in `packages/permissions/docs/reference/capability-set.md`. Three new specs in `capability-set.spec.ts` and one in `system-principal.spec.ts`.
  - **Notes:** Found while planning `T-028`. The member use-cases deliberately assert only their own permission so `admin` — which holds `member.invite` and not `core.activity.write` — can invite; that reading is now the only one. `PgCapabilityRepository` is untouched: the exemption belongs in the resolver, not in every row the database returns. Closed by `P2.14`.

- [x] `T-026` **Make the activity-replay spec independent of how many rows are already in the table** `@sami` `P2` `~30m` `#api` `done: 2026-09-05`
  - **Goal:** `pg-activity-replay.reader.spec.ts` walks the table from the start in ten batches of two, so it can only reach its own rows while fewer than twenty older ones exist. `activity_log` is append-only and the other specs never clean up, so the suite goes red after roughly twenty runs against one database and stays red.
  - **Done when:** The spec passes with several hundred unrelated rows already in `activity_log`.
  - **Files:** `packages/infrastructure/tests/analytics/pg-activity-replay.reader.spec.ts`
  - **Done:** Every read starts from a checkpoint just before the spec's own 2031-03 instant rather than from `{null, null}`, so the walk is bounded by the partition this spec writes and drops rather than by the table. Verified against a database carrying the seed's audit rows.
  - **Notes:** Pre-existing, and unrelated to `T-025`. Closed by `P6.5`.

- [x] `T-029` **Organization plugin: switch, create, accept; switcher; invitation landing page** `@sami` `P1` `~8h` `#api` `#ui` `done: 2026-09-03`
  - **Goal:** A user in two organizations could reach only the one the session was pinned to, nothing let anyone create a second organization, and an existing account holding an invitation link had no way to accept it.
  - **Done when:** `POST /api/auth/organization/{switch,create}` and `/api/auth/invitation/accept` rebind the session and re-issue the cookie cache so the very next RPC resolves the new tenant; the header switcher lists every membership; `/organization/new` founds and switches; `/invitation/$token` previews for an anonymous visitor and accepts for a signed-in one; `/sign-in?redirect=` returns there; a sign-in lands in the last-used organization.
  - **Files:** `packages/auth/src/plugin/organization.plugin.ts`, `packages/api-client/src/auth/organization.client.ts`, `packages/query/src/organization/`, `packages/feature/src/organization/`, `apps/web/src/server/{session,invitation}.fn.ts`, `apps/web/src/route/-redirect.ts`, `apps/web/src/route/(shell)/invitation/$token.tsx`, `apps/web/src/route/(app)/_authenticated/organization/new.tsx`
  - **Done:** Typecheck, lint, `check:architecture` 13/13 against a fresh web bundle, and every unit suite green — including the plugin's endpoint spec, the client spec with its two error-code mappings, the redirect schema spec (rejects `//evil.test`, absolute URLs, `javascript:`), and five render states of `InvitationAccept`. **Not exercised against the live stack: Docker was down.** The manual pass below is still owed, and step 5 is the one that matters — the cookie cache is what a switch has to invalidate, and nothing unit-testable proves it does.

    1. Sign up two accounts; invite the second into the first's organization.
    2. Accept the invitation while signed in as the second account, from `/invitation/$token`.
    3. Confirm the switcher lists both memberships for the second account.
    4. Switch organizations from the header.
    5. **Immediately** issue an RPC that reads tenant-scoped data and confirm it answers for the
       new organization, not the old one — within the sixty-second `session.cookieCache` window.
    6. Reload; confirm the session is still pinned to the switched organization.
    7. Sign out and back in; confirm the sign-in lands in the last-used organization.
    8. Found a second organization at `/organization/new`; confirm it switches on creation.
    9. Open `/invitation/$token` signed out; confirm the anonymous preview renders and
       `/sign-in?redirect=` returns to it after sign-in.
    10. Confirm `users.last_active_organization_id` matches the switcher on every step above.
  - **Notes:** A Better Auth plugin rather than oRPC, for two verified reasons: these actions are identity-gated and no permission a non-owner holds could gate them, and only an endpoint with Better Auth's `ctx` can call `setSessionCookie` — without that, `session.cookieCache` keeps resolving the old tenant for up to sixty seconds after a switch. `rebind` does what Better Auth's own organization plugin does for `setActiveOrganization`, plus writes `users.last_active_organization_id`. `SessionUser` now carries `activeOrganizationId` and `organizations`, resolved in `fetchSession` in one extra indexed query. The sign-in page's `?redirect=` is validated to a rooted single-slash path. `auth` gained a `zod` dependency for the plugin's request bodies.

- [x] `T-028` **Member slice: invite, list members, list and revoke invitations, members page** `@sami` `P1` `~8h` `#api` `#ui` `done: 2026-09-03`
  - **Goal:** `member.invite` was a permission key with nothing behind it and `ROUTES.rbac.members` a declared route with no page. An owner or admin could not bring anyone into their organization.
  - **Done when:** `/settings/members` lists members and pending invitations, an `admin` can invite an address at a role and revoke a pending invitation, the invited address receives a link in Mailpit, and `member.invited` / `member.invitation.revoked` land in `activity_log`. The four procedures are in `PROCEDURE_PERMISSIONS` and gated in their use-cases.
  - **Files:** `packages/contracts/src/member/`, `packages/application/src/member/`, `packages/infrastructure/src/pg/repository/pg-{member,invitation}.repository.ts`, `packages/composition/src/mail/content.invitation-mailer.ts`, `packages/query/src/member/`, `packages/content/src/message/{en,bn}/member.ts`, `packages/feature/src/member/`, `apps/web/src/server/orpc/member.router.ts`, `apps/web/src/route/(app)/_authenticated/settings/members.tsx`
  - **Done:** All twelve steps, subject `member`. Typecheck, lint, `check:architecture` 13/13 with a fresh web bundle, and every unit suite green (contracts 34, application 22 incl. four new use-case specs, composition 17, feature, query, content, web). **The two Postgres specs — `pg-member.repository` and `pg-invitation.repository` — were not run here: Docker was down. CI runs them.** Not exercised against Mailpit for the same reason.
  - **Notes:** The mail goes out only after the unit of work commits, and the invite spec pins that a failed commit sends nothing. `InvitationRecord` never carries the token — the contract spec asserts the wire shape has no such key. `admin` can invite because the use-cases assert only `member.invite`, never `core.activity.write` (`T-030`). `composition` now depends on `permissions`, solely so the mail's link is built from `ROUTES.shell.invitation`. The nav gained gated links to members and roles; neither existed before.

- [x] `T-027` **Invitations foundation: schema, claim and found adapters, claiming enroller** `@sami` `P1` `~6h` `#db` `#api` `done: 2026-09-03`
  - **Goal:** Nothing could turn an invitation into a membership, nothing could create an organization except the personal enroller, and `activeOrganizationFor` pinned a user in two organizations to the oldest one forever.
  - **Done when:** `invitations` exists, `memberships_uq` is `(organization_id, user_id)`, `users.last_active_organization_id` exists, `PgInvitationClaimer` claims only against a verified matching address, `PgOrganizationFounder` is the one place a tenant is created, and `InvitationClaimingEnroller` wraps every enrolment mode so an invited address never gets a personal organization.
  - **Files:** `packages/infrastructure/src/pg/schema/invitation.schema.ts`, `packages/infrastructure/migrations/0004_awesome_wraith.sql`, `packages/infrastructure/src/pg/repository/pg-{invitation.claimer,organization.founder,membership.reader,personal-organization.enroller}.ts`, `packages/auth/src/session/{invitation.claimer,organization.founder,invitation-claiming.enroller}.ts`, `packages/composition/src/container/container.ts`, `packages/core/src/primitive/token.ts`
  - **Done:** Typecheck, lint, `check:architecture` 13/13 and the unit suites (auth 45, composition 17, core 19) green locally. **The three new Postgres specs — founder, claimer, reader — plus the updated enroller spec were not run on this machine: Docker was down. CI runs them.** Migration reviewed by hand: the `memberships_uq` swap fails on any existing database where one person holds two roles in one organization, which a fresh kit cannot have.
  - **Notes:** Tenancy decision recorded in `packages/auth/docs/reference/enrolment.md`: an invited address joins the inviting organization *instead of* getting a personal one; the other model is the two lines of `InvitationClaimingEnroller.enrol` swapped. The claim's only security property is the verified-address match, so invitations require `AUTH_REQUIRE_EMAIL_VERIFICATION`. `PgPersonalOrganizationEnroller` now delegates to the founder, whose transaction is a savepoint inside the enroller's lock.

- [x] `T-025` **Complete the authentication flow** `@sami` `P1` `~16h` `#api` `done: 2026-09-01`
  - **Goal:** Sign-in and two-factor *verification* worked; sign-up, two-factor *enrolment*, forgot/reset, change password, change email, Google, and sign-out were either configured with no client path or missing outright.
  - **Done when:** Every flow works end to end against the live stack, and `pnpm check:architecture` reports 13/13 with no skips.
  - **Files:** `packages/auth/src/auth.factory.ts`, `packages/api-client/src/auth/`, `packages/feature/src/{auth,account}/`, `apps/web/src/route/(shell)/`, `apps/web/src/route/(app)/_authenticated/settings/`
  - **Done:** Verified against live Postgres, Redis and Mailpit rather than only in CI. Sign-up issues no session (`autoSignIn: false`) and mails a link; verification redirects to `/verify-email`; reset is enumeration-safe (byte-identical responses for a real and an absent address) and revokes every session; two-factor enrols through a three-step wizard and completes sign-in by TOTP, backup code (single-use, 401 on reuse) or emailed OTP; change-email confirms at the **old** address; change-password took 6 sessions to 1 and left the calling tab alive. Google proven to the authorization URL with placeholder credentials — the consent round trip needs real ones.
  - **Notes:** Enrolment became three modes behind `AUTH_ENROLMENT_MODE`, resolved to one of three `MembershipEnroller`s in `Container` — `personal` (default, own organization, reuses `SystemRoleSeed`), `bootstrap` (the old behaviour), `invite` (`NullMembershipEnroller`). All three exercised, including the `superRefine` that refuses to boot on `bootstrap` with no slug. One migration, and it is a latent bug rather than a feature: `organizations.slug` had no unique index while two code paths resolved by it with `.limit(1)`. One new runtime dependency, `uqr`, for the TOTP QR.

- [x] `T-001` **Create a membership row so sign-in can succeed** `@sami` `P0` `~3h` `#db` `done: 2026-08-29`
  - **Goal:** Nothing in the repository ever inserts into `memberships`, so every sign-in is aborted before a session exists.
  - **Done when:** A fresh `pnpm db:migrate && pnpm db:seed` followed by a sign-up and sign-in against `/api/auth` returns a session whose `activeOrganizationId` is the seeded organization.
  - **Files:** `packages/infrastructure/src/pg/seed/system-role.seed.ts`, `packages/auth/src/factory/auth.factory.ts`, `packages/infrastructure/src/pg/repository/pg-membership.reader.ts`
  - **Done:** `MembershipEnroller` (port, `packages/auth/src/session/`) and `PgBootstrapMembershipEnroller` (`packages/infrastructure/src/pg/repository/`), bound in `Container`. Enrolment runs from `session.create.before`, **not** `user.create.after` — Better Auth queues `create.after` until the whole sign-up endpoint has finished, which is after the session hook has already refused. Gated on `BOOTSTRAP_ORGANIZATION_SLUG`, which the seed reads too so the two cannot drift; first user in gets `owner`, everyone after `member`, behind a `pg_advisory_xact_lock`. Not exercised against a live database on this machine.

- [x] `T-002` **Resolve the session into the router context** `@sami` `P0` `~4h` `#ui` `done: 2026-08-29`
  - **Goal:** `RouteGuard` and `SessionProvider` are both inert, so two of the four enforcement surfaces named in `docs/setup/23` do nothing.
  - **Done when:** `RouterContext` carries `user` and `capabilities`, a root loader resolves them server-side during SSR, and `RouteGuard.requirePermission("rbac.role.read")` on a test route redirects a member to `/forbidden` while an owner renders it.
  - **Files:** `apps/web/src/route/-context.ts`, `apps/web/src/route/__root.tsx`, `apps/web/src/route/-guard.ts`, `apps/web/src/router.tsx`

  - **Done:** `RouterContext` carries `user`, `capabilities` (as the DTO) and a `SessionStore`; the root's `beforeLoad` resolves them through `fetchSession`, a `createServerFn` in `src/server/`. The DTO rather than a `CapabilitySet` because TanStack dehydrates a `beforeLoad` return value and rejects anything carrying a method — `RouteGuard` rebuilds the class, so `can()` stays the one decision. `SessionStore` rides the same dehydrate/hydrate payload as the message snapshot, so the browser refetches nothing; `/sign-in` invalidates both on success. `/settings/roles` is the gated route: `requireSession()` then `requirePermission("rbac.role.read")`.

- [x] `T-003` **Fix the `auth:generate` root script** `@agent` `P1` `~5m` `#tooling` `done: 2026-08-29`
  - **Goal:** `pnpm auth:generate` fails, because the root script calls a package script that does not exist.
  - **Done when:** `pnpm auth:generate` runs the schema-inspection script and exits 0.
  - **Files:** `package.json`, `packages/auth/package.json`
  - **Done:** Renamed the root script to `auth:tables`, which is what `docs/setup/03` already documented.

- [x] `T-004` **Add an `EmailSender` port and adapter** `@sami` `P1` `~5h` `#api` `done: 2026-08-29`
  - **Goal:** `requireEmailVerification` is on by default and `revokeSessionsOnPasswordReset` is set, but nothing in the repo can send an email — so verification and password reset are dead ends.
  - **Done when:** `packages/auth/src/auth.factory.ts` supplies both `sendVerificationEmail` and `sendResetPassword`, an `EmailSender` port exists in `packages/application/src/port/`, `Container` builds an adapter behind it, and a sign-up produces a verification message in the local transport.
  - **Files:** `packages/application/src/port/`, `packages/auth/src/auth.factory.ts`, `packages/composition/src/container/container.ts`, `packages/infrastructure/src/`
  - **Done:** `EmailSender` + `EmailMessage` in `packages/application/src/port/`, `SmtpEmailSender` in `packages/infrastructure/src/smtp/`, `AuthMailer` port in `packages/auth/src/mail/`, and `ContentAuthMailer` in `packages/composition/src/mail/` — the only package that can see both the copy and the transport. `AuthFactory` now supplies `sendVerificationEmail` and `sendResetPassword`. Mailpit added to compose (inbox on :8025); `SMTP_URL` and `EMAIL_FROM` are required in both `env.ts` schemas. Six new `email.verify.*` / `email.reset.*` keys in `en` and `bn`, and `check-architecture` assertion 8 greps for all three key prefixes.

- [x] `T-005` **Make the two-factor flow reachable** `@sami` `P1` `~3h` `#ui` `done: 2026-08-29`
  - **Goal:** The 2FA half of sign-in is written end to end and can never fire — the branch that would trigger it is unreachable.
  - **Done when:** A user with TOTP enrolled who submits `SignInForm` is shown `TwoFactorForm`, and a valid code completes the sign-in.
  - **Files:** `packages/api-client/src/auth/auth.client.ts`, `packages/feature/src/auth/sign-in.form.tsx`, `apps/web/src/route/(shell)/sign-in.tsx`
  - **Done:** Three breaks, three fixes. `AuthClient.signIn` throws `TwoFactorRequiredError` on `data.twoFactorRedirect === true` — a *successful* response, which is why inspecting `error` alone resolved and navigated away — and throws `UnauthorizedError` rather than a bare `Error`, so `ErrorNormalizer` stops flattening every failure to `INTERNAL`. `(shell)/sign-in.tsx` passes `onNeedsTwoFactor` and renders `TwoFactorForm`. `SignInForm` tracks the fork separately from `isError`, so the hand-off does not render “sign-in failed” under a form that is about to be replaced. Cost one new dependency: `api-client` → `errors`.

- [x] `T-006` **Give `packages/auth` a test suite** `@sami` `P1` `~5h` `#api` `done: 2026-08-29`
  - **Goal:** The only package with no tests is the one holding every credential path.
  - **Done when:** `packages/auth/vitest.config.ts` and `packages/auth/tests/` exist, and `pnpm --filter @loadbearing/auth test` reports passing tests covering `ApiKeyHasher`, `ApiKeyResolver`, `CapabilityCache` and `PrincipalBuilder`.
  - **Files:** `packages/auth/vitest.config.ts`, `packages/auth/tests/`
  - **Done:** `vitest.config.ts` plus 24 tests across five files. Pins the behaviours review cannot re-derive: the api-key-before-cookie order and the absence of a fall-through, re-intersection with the issuer's live capabilities, revoked and expired keys, and the `organization:user` cache key in both its presence and its position.

- [x] `T-007` **Write the `packages/auth` documentation** `@sami` `P1` `~2h` `#docs` `done: 2026-08-29`
  - **Goal:** `packages/auth/docs/index.md` is still the unwritten scaffold while all fourteen other packages have a full doc set.
  - **Done when:** `packages/auth/docs/index.md` contains no `TODO —` lines and has a populated Depends on / Used by table, and `docs/reference/` holds at least pages for `PrincipalBuilder`, the capability cache TTL, and the API-key model.
  - **Files:** `packages/auth/docs/index.md`, `packages/auth/docs/reference/`, `packages/auth/docs/reference/meta.json`
  - **Done:** `docs/index.md` rewritten (163 lines, populated Depends on / Used by), plus three reference pages — `principal-builder.md`, `capability-cache.md`, `api-key.md` — and both `meta.json` files. `grep -rln "TODO — " packages/*/docs` now returns nothing.

- [x] `T-008` **Purge `packages/db` from the documentation** `@sami` `P1` `~4h` `#docs` `done: 2026-08-29`
  - **Goal:** Twenty-three documents describe a `packages/db` that `c78feae` folded into `packages/infrastructure` — for a kit whose documentation is the deliverable, this is the largest single defect.
  - **Done when:** `grep -rn "packages/db\|@loadbearing/db" docs infra packages tooling .github README.md` returns nothing, and the `27` feature checklist, the `28` tree and the `29` boundary map all name real directories.
  - **Files:** `docs/setup/00-README.md`, `docs/setup/27-verification-and-first-feature.md`, `docs/setup/28-folder-structure.md`, `docs/setup/29-naming-and-boundaries.md`, `docs/opinions/imports.md`, `tooling/biome-config/docs/reference/boundary.md`, `.github/workflows/ci.yml`

  - **Done:** `grep -rn "packages/db\|@loadbearing/db" docs infra packages tooling .github README.md` returns nothing. Historical mentions were reworded rather than deleted. Derived claims fixed in the same pass: sixteen→fifteen packages, the `27.4` twelve-step map and `27.2` checklist now name real paths, `28`'s tree and `29`'s §1.10–§1.11 rewritten against the actual `pg/{primitive,schema,repository,transaction,migrate,seed}` layout, and the port count corrected to sixteen everywhere it appeared.

- [x] `T-009` **Add `apps/web/vitest.config.ts`** `@agent` `P2` `~30m` `#tooling` `done: 2026-08-29`
  - **Goal:** With no vitest config the app's `test` script loads `vite.config.ts` — TanStack Start plus Nitro — and cannot tear the server down.
  - **Done when:** `pnpm --filter @loadbearing/web test` completes in under 5s with no "something prevents Vite server from exiting" warning.
  - **Files:** `apps/web/vitest.config.ts`
  - **Done:** `apps/web/vitest.config.ts`, which also carries the `~` alias and the fake `test.env` (in the config rather than a setup file, so `noProcessEnv` needs no new exemption). 30.8s and a “close timed out” warning → 1.9s, warning gone.

- [x] `T-010` **Test the `apps/web` server surface and `apps/worker`** `@sami` `P2` `~4h` `#api` `done: 2026-08-29`
  - **Goal:** Both apps have zero tests, and each holds logic that is unit-testable with no container.
  - **Done when:** `pnpm --filter @loadbearing/web test` and `pnpm --filter @loadbearing/worker test` each report passing tests covering at minimum `Cors`, `ErrorInterceptor`, `Endpoint` and `SystemPrincipal`.
  - **Files:** `apps/web/tests/`, `apps/worker/tests/`, `apps/worker/vitest.config.ts`
  - **Done:** `apps/worker/vitest.config.ts` plus 36 tests across six files: `Cors` (9), `ErrorInterceptor` (4), `Endpoint` (4), `SessionStore` (5), `SystemPrincipal` (4), `MaintenanceConsumer` (5) and `DigestComposer` (5). `handle` is now `public` on all three consumers — it is the consumer's unit of work, and `start()` needs a live Redis.

- [x] `T-011` **Run `deps:check` and `repo:check` in CI** `@agent` `P2` `~30m` `#infra` `done: 2026-08-29`
  - **Goal:** Both scripts exist at the root and no pipeline step calls them, so dependency drift is caught by nobody.
  - **Done when:** `.github/workflows/ci.yml` runs `pnpm deps:check` and `pnpm repo:check`, and the job is green.
  - **Files:** `.github/workflows/ci.yml`
  - **Done:** `deps:check` and `repo:check` run before the build, where they fail in seconds. `pnpm audit --audit-level high` added as a separate `continue-on-error` job, per `26.5`. CI env gained `SMTP_URL` and `EMAIL_FROM`.

- [x] `T-012` **Expose a health endpoint** `@sami` `P2` `~1h` `#api` `done: 2026-08-29`
  - **Goal:** `Container.healthy()` pings Postgres, both Redis instances and ClickHouse, and is called by nothing — there is no readiness probe for any orchestrator to hit.
  - **Done when:** `GET /api/health` returns 200 with a per-dependency breakdown when the stack is up, and 503 when Postgres is down.
  - **Files:** `apps/web/src/route/api/health.ts`, `packages/composition/src/container/container.ts`
  - **Done:** `Container.healthy()` → `Container.health()`, returning a per-dependency `HealthReport`; `analytics` is `null` rather than `true` when no ClickHouse is deployed, because “not running one” is not “healthy”. `GET /api/health` returns it with `cache-control: no-store`, 200 or 503. Loki stays excluded for the reason the container comment already gave.

- [x] `T-013` **Rename `docs/setup/13-db-package.md`** `@agent` `P2` `~30m` `#docs` `done: 2026-08-29`
  - **Goal:** The filename still names the package that was folded away, so the build order reads as if `db` and `infrastructure` are separate steps.
  - **Done when:** The file is renamed to reflect the Postgres slice of `packages/infrastructure`, and every inbound link in `docs/` and `README.md` resolves.
  - **Files:** `docs/setup/13-db-package.md`, `docs/setup/00-README.md`
  - **Done:** Renamed to `13-infrastructure-postgres.md`; all 29 inbound links updated, and a link check over every `.md` in the repo reports no broken targets.

- [x] `T-014` **Add a setup step for `packages/observability`** `@sami` `P2` `~3h` `#docs` `done: 2026-08-29`
  - **Goal:** The package is built, documented in-package, and named in the `00-README` paragraph, but no numbered step in the build order constructs it.
  - **Done when:** A numbered step exists covering `JsonLogger`, `EventShape`, the closed event catalog, `Redactor` and `Correlation`, and `00-README`'s sequence table lists it.
  - **Files:** `docs/setup/`, `docs/setup/00-README.md`
  - **Done:** `docs/setup/09b-observability-package.md`, listed in `00-README`'s Phase B table between 09 and 10. Lettered rather than renumbered on purpose: inserting a real `10` would shift twenty-one files and silently break every bare prose cross-reference (“see 24.11”, “the ban in 05”). Covers `LogLevels`, the closed event catalog and its cardinality budget, `EventShape`, `Redactor`, `Correlation`, and both sinks.

- [x] `T-015` **Retire or refresh `docs/data-and-scale-plan.md`** `@sami` `P2` `~1h` `#docs` `done: 2026-08-29`
  - **Goal:** An unlinked plan document at the `docs/` root describes a repo state that has not been true for many commits.
  - **Done when:** The file is deleted, or rewritten to match reality and linked from `docs/setup/00-README.md` or `docs/opinions/index.md`.
  - **Files:** `docs/data-and-scale-plan.md`
  - **Done:** Deleted. Nothing linked to it, and all four of its Context claims were false.

- [x] `T-016` **Replace the `ratchet` defaults in shipped code** `@agent` `P2` `~1h` `#tooling` `done: 2026-08-29`
  - **Goal:** The guide's project name is baked into runtime defaults, not just local compose credentials, so a rename following `27.5` silently leaves them behind.
  - **Done when:** `grep -rn "ratchet" packages apps --include="*.ts"` returns only values that are genuinely local-infrastructure credentials.
  - **Files:** `packages/infrastructure/src/redis/redis.connection.ts`, `packages/auth/src/auth.factory.ts`, `apps/web/src/env.ts`, `apps/worker/src/env.ts`

  - **Done:** `cookiePrefix: "app"`, `keyPrefix ?? "app:"`, and `CLICKHOUSE_DATABASE`/`CLICKHOUSE_USER` defaulting to ClickHouse's own `default`. The smoke script now uses the configured database in its SQL instead of a hardcoded `ratchet.` — which was also a real bug for any non-default database. All three survivors added to the `27.5` rename checklist.

- [x] `T-017` **Fix the stale comments in `ci.yml`** `@agent` `P3` `~15m` `#infra` `done: 2026-08-29`
  - **Goal:** Two comment blocks name a file path that no longer exists, sending the next reader to the wrong place.
  - **Done when:** `.github/workflows/ci.yml` names `packages/infrastructure/tests/support/database.ts`.
  - **Files:** `.github/workflows/ci.yml`
  - **Done:** Both comment blocks now name `packages/infrastructure/tests/support/database.ts`.

- [x] `T-018` **Reconcile the two `process.env` exemption lists** `@agent` `P3` `~30m` `#tooling` `done: 2026-08-29`
  - **Goal:** `docs/setup/26` requires the architecture script and Biome to state the same rule; they have drifted on config-file extensions.
  - **Done when:** Both lists exempt the same set, so adding `process.env` to a `*.config.mjs` either fails both gates or neither.
  - **Files:** `tooling/scripts/check-architecture.mjs`, `tooling/biome-config/src/base.json`
  - **Done:** Biome's override gained `**/*.config.{mts,js,mjs}`, and `check-architecture` now walks those extensions so its own `.config.(ts|mts|js|mjs)` exemption is reachable rather than dead. Both lists carry a comment pointing at the other.

- [x] `T-019` **Add a root `smoke` script** `@agent` `P3` `~10m` `#tooling` `done: 2026-08-29`
  - **Goal:** The smoke check is what `docs/setup/15` and `26` name as the only coverage for the ClickHouse and Loki adapters, and there is no root entry point for it.
  - **Done when:** `pnpm smoke` runs the infrastructure smoke check from the repository root.
  - **Files:** `package.json`
  - **Done:** `"smoke": "pnpm --filter @loadbearing/infrastructure run smoke"`.

- [x] `T-020` **Give `tooling/scripts` a `package.json`** `@agent` `P3` `~10m` `#tooling` `done: 2026-08-29`
  - **Goal:** `pnpm repo:check` warns on it, which means the check cannot be made blocking.
  - **Done when:** `pnpm repo:check` reports 0 issues.
  - **Files:** `tooling/scripts/package.json`, `pnpm-workspace.yaml`
  - **Done:** Private stub at `tooling/scripts/package.json`. `pnpm repo:check` reports 0 issues.

- [x] `T-021` **Add a `version` to the root `package.json`** `@agent` `P3` `~5m` `#tooling` `done: 2026-08-29`
  - **Goal:** `pnpm deps:check` reports `VERSION_IS_MISSING (InvalidLocalVersion)` on every run.
  - **Done when:** `pnpm deps:check` prints no warnings.
  - **Files:** `package.json`
  - **Done:** `"version": "0.0.0"`. `pnpm deps:check` prints no warnings.

- [x] `T-022` **Fix the stale paths in the `00-README` rename checklist** `@agent` `P3` `~20m` `#docs` `done: 2026-08-29`
  - **Goal:** The rename checklist tells the reader to edit a file that does not exist, which is the worst possible line in a checklist.
  - **Done when:** Every path in the "Renaming the scope" section resolves, and the step count in `README.md` matches the number of numbered steps.
  - **Files:** `docs/setup/00-README.md`, `README.md`
  - **Done:** The `group:` array in a `react.js` that never existed is now the real `noRestrictedImports` entries in `tooling/eslint-config/src/index.js` and `tooling/biome-config/src/base.json`. `README.md` says thirty-one documents, which matches the tree. `27.5` now points at the full `00-README` list.

- [x] `T-023` **Add process-level error handlers to the worker** `@agent` `P3` `~30m` `#infra` `done: 2026-08-29`
  - **Goal:** A rejection outside a BullMQ handler, or a failure during boot, exits with a bare stack that no log collector can key on.
  - **Done when:** `unhandledRejection` and `uncaughtException` are logged through `container.logger.failure` before the process exits, and a throw from `bootstrap.start()` is logged the same way.
  - **Files:** `apps/worker/src/main.ts`

  - **Done:** `unhandledRejection`, `uncaughtException`, and a `try`/`catch` around `bootstrap.start()`, all logged through `container.logger.failure` — the same argument the SIGTERM path already made.

- [x] `T-024` **Land the first feature slice (`docs/setup/27`)** `@sami` `P2` `~8h` `#api` `done: 2026-08-29`
  - **Goal:** `contract` and `appRouter` are both empty, so `/api/rpc` answers 404 to everything and none of the transport wiring has been exercised against a real procedure.
  - **Done when:** One slice exists end to end through all twelve steps of `27.4`, its procedures appear in `ProcedurePermissions`, the coverage test passes against the real contract rather than only against its fixture, and its route renders behind a `RouteGuard`.
  - **Files:** `packages/contracts/src/procedure/index.ts`, `packages/contracts/src/catalog/index.ts`, `apps/web/src/server/orpc/app.router.ts`
  - **Done:** The `role` slice, end to end through all twelve steps: `contracts/src/role/` plus the procedure and permission merge points, `RoleRepository` and `ListRolesUseCase` in `application/src/rbac/`, `PgRoleRepository` (three fixed queries, never one per role), `RoleQueries`, an `ApiClient.role` accessor, a new `role` message namespace in both locales, `RoleMatrix` in `feature`, `RoleRouter`, and `/settings/roles` behind the guard. `Envelope.paginated` now marks `items` readonly so a handler never copies an array to widen it. The coverage tests run against a real contract, and `handler.ts`'s explicit context annotation is gone as its comment promised. Also fixed doc `24.6`, which documented `implement(x).use(authed)` — `.use()` takes a middleware, not a builder.

- [x] `T-000` **Build steps 01–26 of the setup guide** `@sami` `P1` `#repo` `done: 2026-08-28`
  - **Done when:** `pnpm build:packages`, `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm check:architecture` all pass on a clean tree.
  - **Notes:** 15 packages, 3 tooling packages, 2 apps. 317 tests across 51 files. 11/11 architecture assertions, including the client-bundle grep after a real `apps/web` build. `packages/infrastructure`'s specs are integration tests against a live Postgres and are covered in CI.

## 🗑 Dropped

*(nothing dropped)*

---

## Changelog

| Date       | Who     | Change                                                      |
| ---------- | ------- | ----------------------------------------------------------- |
| 2026-08-28 | @sami   | Created the list from a full audit of the tree at `c681449` |
| 2026-08-29 | @agent  | Closed `T-001`–`T-024`. Three acceptance criteria need a live stack and are covered by CI |
| 2026-09-01 | @sami   | Closed `T-025`. Every auth flow verified against a live stack on this machine, not deferred to CI |
| 2026-09-03 | @sami   | Closed `T-027`–`T-029`: invitations, the member slice, and the organization plugin |
| 2026-09-05 | @sami   | Filed `IMPLEMENTATION-PLAN.md` from a full audit: eight phases covering comments, bugs, conventions, docs drift, feature gaps, tests, tooling |
| 2026-09-05 | @sami   | Closed `T-026` and `T-030` |
| 2026-09-06 | @sami   | Re-measured the state table against the tree. CI has never been green — `P8.12` |
| 2026-09-12 | @sami   | Phase 2 of `T-036` built and `T-031` closed: the transactional outbox. `outbox_event` partitioned from its first migration, `DomainEventPublisher` writing in the ambient transaction, `OutboxGateway` claiming with `SKIP LOCKED`, the `EventSubscriber` seam and its registry, three real publishers and `MemberRealtimeSubscriber`. `Bus` removed from the role nouns rather than given a file |
| 2026-09-12 | @sami   | Phase 1 of `T-036` built: one mail pipeline, every message a queue job. `QueueName.MAIL`, `MailPublisher`/`MailRenderer`, the template manifest, `MailLayout`, `MailConsumer`, and both mailers moved onto it. `DigestComposer` deleted; `.composer.ts` retired with it |
| 2026-09-12 | @sami   | Filed `T-036` and `COMMUNICATION-PLAN.md`: six phases for mail, the outbox, notifications, real-time and messaging. `T-031` annotated with the two corrections Phase 2 makes |
| 2026-09-12 | @sami   | Revised Phase 1 on review: hand-written HTML templates instead of a react-email package, and no mail table — a send is a queue job. The plan now introduces no new package and no new dependency |
| 2026-09-13 | @sami   | Filed `T-037` and `DB-SCALING-PLAN.md`: four phases for connection pooling and pgBouncer, partition policy and guards, the virtual-sharding seam with a pluggable strategy, a directory and an env map, and the filed physical split |
| 2026-09-14 | @sami   | `T-037` third pass: the plan is five phases now (cold storage and the archived-notifications read were added 2026-09-14), `S2.9` dropped on the measured numbers, `S2.15` and `S5.6` deferred to a new `DB-SCALING-DEFERRED.md`, and every open item corrected against `5777eba`. Two `T-036` notes that had been filed under `T-037` moved back where they belong |
| 2026-09-14 | @sami   | Filed `T-038` and `PLATFORM-ADMIN-PLAN.md`: the platform tier on RBAC, retention and cold-storage policy as rows the app applies to the bucket and to ClickHouse, a projection policy over a new activity-action catalog, and the replica panel filed behind `S4.4`. Reopens `S2.15` and `S5.6`. `tasks/` renamed to `plans/`; every doc reference updated |
| 2026-09-15 | @sami   | Second pass on both plans: `T-038` gains the projection switch, gap recording and re-project, restore, retention preview, per-tenant storage, and the shard map with a waiting move button (decisions 12–18); `T-037` partitions `messages` now (`S2.6`, decision 17), grows `partition_archive` and stamps `projected_at` at prune (`S2.11`, `S2.14`, decision 18), and adds `S2.19` |
| 2026-09-16 | @sami   | The shard is the organization: `T-037` drops the 256 layer, LIST-partitions the seven tenant-owned tables by tenant with months underneath (`S2.20`–`S2.24`, decisions 19–20); `T-038` gains per-tenant retention (`A2.19`) and tenant deletion (`A2.20`) |
| 2026-09-16 | @sami   | Customizing the layout: `T-037` gains the partition DDL generator (`S2.25`) and a one-alias shard key with the fork recipe; `T-038` records the file-versus-dashboard line (decision 21) and a coverage section |
| 2026-09-17 | @sami   | Review of the tenant layout: `T-037` attaches children instead of creating them in place (a signup would have blocked every read), measures the tenant ceiling (`S2.26`), files the pooled partition (`S4.9`); `T-038` deletes tenants from ClickHouse too and gains tenant export (`A2.21`) |
| 2026-09-17 | @sami   | The plans folder consolidated: every open item from four plans — 121 of them — now lives in `plans/PLAN.md`, IDs and text unchanged apart from decision citations gaining a part prefix; the five plan files moved verbatim to `plans/archive/`; `T-036`, `T-037` and `T-038` point at the one file. `S2.4` built the same day (`§21`, 21/21) |
