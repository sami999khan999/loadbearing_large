---
title: Data and scale — rollout plan
description: How the data-and-scale decisions land across docs/setup, docs/opinions, and the implemented code. Written before doc 11, because every doc it constrains is still unbuilt.
---

# Data and scale — rollout plan

> The work required to land `docs/opinions/data-and-scale.md` and reconcile every other document to
> it. Not a build step — a one-off reconciliation, executed before
> [11 · Local Infrastructure](setup/11-local-infrastructure.md).

## Context

The kit is built by walking [`docs/setup/`](setup/00-README.md) in order, and is finished through
**doc 10 (`@loadbearing/contracts`)** — plus `observability` and the error slice of `content`, built
ahead of schedule. Six of sixteen packages have real content; `application`, `db`, `infrastructure`,
`auth`, and `composition` are each still `export {};`. `infra/` is an empty directory.

A new architecture document has been written — four data streams, the Postgres-owns-it rule, Loki,
ClickHouse behind a port, `organization_id`, partitioning, and the ordered list of scaling moves. It
is not in the repository, and a good number of the decisions it settles are recorded elsewhere today
as *open questions* or as the *opposite* answer.

**The timing is the whole point.** Everything the document constrains — compose file, schema, ports,
container, repository base class — lives in docs 11–17, which are unbuilt. Landing it now costs a
column and a `WHERE` clause. Landing it after doc 17 is a retrofit across every table, every query,
every permission check, and every test.

---

## A. Five things that need a decision, not an edit

Each is a real conflict. This plan takes a position on each; each is worth overriding deliberately.

### A1. `PgUnitOfWork` does not actually give you transactions

[13](setup/13-db-package.md) line 571 says outright: repositories inside `work()` *"use the pool,
not the transaction handle, **so they are not actually enrolled**… do not pretend this class gives
you atomicity it does not"* — and defers the fix until *"the first genuinely multi-write use-case."*

The in-transaction audit trail **is** that use-case, and it is the new page's highest-value claim: a
task reactivation commits, the audit write is in flight, the process restarts, and there is a state
change with no record of who made it.

**Position: the deferral is spent.** Doc 13 must ship a `UnitOfWork` that really enrolls
repositories. Writing the new page while `PgUnitOfWork` is a no-op documents a guarantee the code
does not provide — the exact failure the page exists to prevent.

### A2. `session` is not append-only, and partitioning it fights Better Auth

The source text groups `session` with `activity_log` and `task_status_history` as *"the three
append-only tables."* It is not one: Better Auth updates it on refresh, deletes it on sign-out, and
looks rows up by id or token — a predicate carrying no partition key, so every lookup scans every
partition. Postgres also requires a partitioned table's primary key to *include* the partition key,
which Better Auth's schema generator will not emit ([16](setup/16-auth-package.md) lines 81–85).

**Position: partition two tables, not three.** Sessions are bounded by expiry; a
`DELETE ... WHERE expires_at < now()` on the existing `CleanupSchedule`
([25](setup/25-worker-app.md) lines 284–297) is the right tool. Record the deviation in the page
itself rather than dropping the third table silently.

### A3. Sessions in the cache Redis become silent sign-outs

[16](setup/16-auth-package.md) lines 178–183 wire Better Auth's `secondaryStorage` through
`CacheStore` — the **cache** Redis. Under the split, that instance gets `allkeys-lru`. An evicted
session is a user signed out at random under memory pressure. Rate-limit counters (lines 171–176)
have the same problem.

**Position: this is what makes the split a correctness fix, not a tidiness one.** Doc 16 must say
which instance secondary storage uses, and why. Postgres stays the session record, the cache is a
true cache, a miss reads through — which is exactly the new page's own rule.

### A4. The re-enqueue sweep cannot see jobs that already aged out

[15](setup/15-infrastructure-package.md) lines 380–381 set `removeOnComplete: { age: 3600 }` and
`removeOnFail: { age: 86400 }`, and call them *"mandatory, not tuning."* A **nightly** sweep that
re-enqueues unprocessed work runs long after the one-hour window has closed.

**Position: the sweep reconciles against Postgres, not against BullMQ's job records.** "Find domain
rows that should have been processed and were not" is the query. Job history is not a durable work
list. State this where the sweep is introduced, or the sweep is theatre.

### A5. Spelling — `organisation` vs `organization`

Docs 25 and 29 use British `organisation` / `organisationId` / `forOrganisation`; doc 16 line 526
and the new page use `organization_id`. `packages/observability/docs/reference/correlation.md` line
62 also has `forOrganisation`.

**Position: US spelling everywhere.** The SQL identifier `organization_id` is fixed by the new page,
and a codebase that spells its shard key two ways will resolve it inconsistently per file. Add a
one-line rule to [Vocabulary](opinions/vocabulary.md) so it is never argued again.

---

## B. Two defects in the source text, to fix while transcribing

1. **Broken link.** `../setup/26-infrastructure.md` is cited twice; no such file exists — 26 is
   [hygiene and CI](setup/26-hygiene-and-ci.md). Fix per citation: the Redis and S3 adapters
   reference becomes [15](setup/15-infrastructure-package.md); the "already running" MinIO reference
   becomes [11](setup/11-local-infrastructure.md).
2. **The `session` claim** — see A2.

---

## C. The new page

**Create `docs/opinions/data-and-scale.md`** from the supplied text, with the B fixes, YAML
frontmatter matching its siblings, and `ActivityLogger` throughout.

Wire it into the four registries an opinions page lives in:

| File | Change |
|---|---|
| `docs/opinions/meta.json` | add `"data-and-scale"` after `"vocabulary"`; the `description` already omits `classes` and `vocabulary` — refresh it |
| `docs/opinions/index.md` | new row in the page table, same position |
| `docs/setup/00-README.md` lines 88–101 | new row — **and the already-missing `dependencies.md` row** |
| `docs/setup/29-naming-and-boundaries.md` lines 21–28 | the same table, a third time |

**The framing problem.** `opinions/index.md` lines 17–23 state the test every opinion serves —
*"write the file path, the folder, and the class name without looking anything up"* — then line 22:
*"That is the only justification any rule here needs."* Half the new page produces no path, folder,
or class name. `00-README.md` lines 90–91 scope `opinions/` the same way.

**Add a second justification clause to both:** a rule also belongs here if it decides *where a fact
lives* — the same property, one answer, consulted continually, expensive to get wrong late.

---

## D. Six patterns that repeat across `docs/setup/`

Six changes, each applied everywhere it lands, rather than three hundred individual line edits.

### D1. `organization_id` on every table, `OrganizationId` in every signature

The flagship contradiction is [16](setup/16-auth-package.md) line 526 — *"**If you will ever** run
multiple tenants… add `organization_id`"* — which becomes settled, and Step 16.9's title
(*"Two things worth deciding now"*) loses one of its two.

Specific consequences:

- **13:144** — `uniqueIndex("roles_key_uq").on(t.key)` must become `(organization_id, key)`.
  As written, two tenants cannot both have an `owner` role.
- **13:378–414** — `PgCapabilityRepository.resolveFor(userId)` is three unscoped queries in the
  hottest path in the system; a user in two organizations resolves one merged capability set.
- **13:485–500** — the system-role seed does an unscoped `where(eq(roles.key, ...))` and inserts
  with no org. Seeds need a seed organization to hang off.
- **13:339–351** — `BaseRepository` exposes an unscoped client to every subclass. The tenant clause
  goes here, and there is no seam for it.
- **14:144–147 and 14:173** — **a live cross-tenant read.** `isNull(goalId)` means "org-wide
  chunks"; once tenants exist, org-wide-without-an-org-predicate *is* every tenant's corpus — the
  precise failure line 173 claims to have prevented. Same for the partial index at 14:68–71.
- **08:103** — `PermissionScope = "org" | "goal"`. Today `"org"` means *the installation*; after
  this it means *one tenant*. Redefine the token explicitly.
- **10:96–110** — no `OrganizationId` brand, so every tenant filter would be an unbranded `string`.
  The one identifier where a swapped argument is a cross-tenant leak rather than an empty result.
- Also **13:159–208**, **16:357–378** (`api_keys`), **14:41**, **29:373–375**, **27:106–107**.

### D2. Index every FK; assert query counts

Postgres does not auto-index foreign keys, and the docs ship several unindexed ones: **13:163–165**
(`memberships.roleId`), **13:178–183** (`goalMembers.goalId`, `.roleId`), **13:198**
(`permissionOverrides.goalId`), **16:87–101** (three hand-authored FKs), **16:357–378**
(`api_keys.issuer_id`).

`13:220–227` ("Three modelling notes") gains a fourth and a fifth. `13:439` already argues *"three
queries, not one"* — precisely the claim a query-count assertion pins, and no such test exists.
`17:275` names integration tests as the home for adapter tests; that is where the budget goes.
`24:694`'s *"zero requests to your own `/api/rpc`"* gate is the sibling pattern to copy.

### D3. Two Redis instances

The densest cluster in the sweep. **11:88** currently reads *"**If you later** separate cache from
queue onto two Redis instances, the cache one can use LRU"* — while **11:175** already says
production runs two. The asymmetry resolves toward two, everywhere:

- **11:36–47** one `redis` service becomes two, with different eviction and persistence; then
  **11:3** ("three containers"), **11:78–81** volumes, **11:142–144** (`exec redis`),
  **11:186–189** the gate
- **15:62–116** — `RedisConfig` and `RedisConnection` are one class over one URL *by design*
  (*"One class owns that distinction"*). Two URLs, two pools, two closes. Also **15:459, 481, 486**
- **17:36–39** — `queueUrl?` already exists, **optional and unused**; make both required. Then
  **17:123–125, 152, 160, 162, 198–202, 216**
- **02:93–94** one `REDIS_URL`, under line 119's promise that *"every variable that will ever be
  read"* is present — the sentence that forces the change now
- **24:113, 162, 220** · **25:113, 325–326, 352–354, 366** · **26:128–137** (CI runs one Redis, so
  the split would be untested) · **28:48–52, 416–435** · **29:202**
- **11:170** — *"Nothing in the application code changes"* is false once a second URL exists

### D4. The `AnalyticsReader` port — the tenth port

Nine today. Every canonical list gains the tenth, and several state the count in prose:

- **12:38–48** (the tree), **12:424–433** (barrel), **12:473–489** (root barrel)
- **28:345–355** — the canonical list — and its prose twin **29:176**
- **17:83–92, 102–109, 132–140**; 17:166–168 "the two swap points" becomes three; `TestContainer`
  at **17:257–272** and **28:471** needs a fake
- `packages/observability/docs/index.md:63` and `tooling/tsconfig/docs/reference/base.md:79-81` both
  enumerate *nine ports* by name
- **12:436** and **28:367** state the rule (*"repository ports live in the slice"*) that
  `AnalyticsReader` is the justified exception to. Write down why: one cross-cutting read seam over
  many subjects, not one per subject.
- **27:50**'s `grep -rn "PgVectorStore"` two-places seam check is the template for
  `PgAnalyticsReader`; **27:53**'s *"three that rot quietly"* becomes four.

`packages/content/docs/reference/content-source.md:29-45` is the strongest existing statement of why
a seam with one implementation earns its place — cite it rather than re-arguing. Its corollary at
lines 42–45 applies directly: **every method async from day one**, or the ClickHouse swap is a
breaking change at every call site.

### D5. Partitioning, and the tool that cannot express it

**Verified by experiment: drizzle-orm 0.44.7 has no declarative partitioning support.** The only
occurrence of `partition` in `pg-core` is a window-function comment. `drizzle-kit generate` cannot
emit `PARTITION BY RANGE`.

So the mechanics have to be written down, and doc 13 has the hooks:

- The Drizzle schema declares plain tables; the generated `0000_init.sql` is **hand-edited** to add
  `PARTITION BY RANGE (occurred_at)`. **13:324** already says *"Read the SQL before applying it"*
  and **13:546** already establishes hand-written SQL alongside generated DDL. Extend both.
- **A partitioned table's primary key must include the partition key.** `activity_log`'s PK becomes
  `(id, occurred_at)`. This falsifies **07:266** — *"Every primary key in the schema is a UUID"* —
  and qualifies the UUIDv7 argument at **07:226–248**. UUIDv7 and a time-range partition key are
  co-monotonic, which is a supporting fact worth adding on both sides.
- Every unique index on a partitioned table must include the partition key too.
- **13:313–333** (Step 13.6, "First migration") creates none of this, and is the step the new page
  names. **28:377–380** shows `session` arriving in `0001_auth.sql`, not the first migration.
- Decide partition maintenance now: `pg_cron` (an extension decision for **11:102–108**) or a
  repeatable job on `MAINTENANCE`. Plus retention, for which **13:270–277** and **03:183–188** have
  no script.

### D6. Loki, and the label-cardinality rule

Nothing in the repository mentions a log platform. **28:248–251** and **29:141** already state the
diagnostics-versus-audit split correctly, and need only "→ Loki, 30-day retention" appended.

The one genuine contradiction: **`packages/observability/docs/index.md:96`** — *"every aggregator
indexes top-level keys."* Loki does not; it indexes labels only, and parses the body at query time
with a `json` stage. Flat fields stay right, for parsing ergonomics — the stated *reason* is wrong
for the chosen platform.

**The most consequential unstated coupling in the sweep:** `event_code` is a Loki label, so
`EVENT_CATALOG` *is* that label's cardinality budget — fourteen codes today.
`observability/docs/reference/catalog.md:84-93` says every slice adds a fragment, i.e. every slice
spends the budget, and nothing says so.

Also: `correlation.md:39-40` describes `traceId` as *"an unbounded field on a per-request basis"* —
that **is** unbounded label cardinality, named without the word. Carry it through to "never a
label." **09:66** and `packages/errors/docs/index.md:54` both say *"logs get fields… what you filter
on at 3am"*, which reads as an indexing claim and invites exactly the wrong move.

New env vars land in **02:115–117** and **24:130–131**: `APP` and `ENV` are literally two of the
four legal labels, and neither exists.

---

## E. Per-doc quick reference

No change: **22** (`ui`) — the "what holds unchanged" claim, holding. Near-none: **04**, **18**,
**19**, **20**, **23**.

| Doc | The edits that matter |
|---|---|
| 00 | stack line; phase rows 11–15; the sixteen-packages paragraph (line 106, "the Redis … side"); Opinions table (+2 rows); "six things" gains the ownership rule; departures list gains `AnalyticsReader` |
| 01–03 | container inventory; `.env.example` (two Redis URLs, `APP`/`ENV`, Loki bucket); `infra:reset` now destroys pending jobs — the thing D3 exists to prevent; no partition or retention script |
| 05 | the `noConsole` exemption list — `json.logger.ts` is now the sole writer into the Loki path (line 129) |
| 06 | lines 459–461 read as one Redis; lines 425–427 stop at "diagnostic stream" |
| 07 | line 266 "every PK is a UUID" (D5); line 69's clock rule is now a correctness question for `occurred_at` |
| 08 | line 103 `PermissionScope`; lines 313–317 `CapabilitySetDto` has no org and is now cookie-signed; lines 166–170, 467, 482–486 — the TTL chain grows from one tier to three |
| 09 | line 66 fields-versus-labels; line 138 `ErrorContext` is the carrier for the four banned-as-label ids |
| 10 | `OrganizationId` brand (96–110), barrel (516–529), gate (571–576); lines 191–215 — the canonical entity and list query carry no tenant |
| 11 | D3 throughout; line 86's VACUUM claim is answered by partitioning; extensions (102–108); the production table (168–180) has no log-platform or analytics row |
| 12 | the tenth port; `ActivityLogger.record()` (229–235) has no `occurredAt`, no tenant, no `UnitOfWork` coupling; `EventBus` (415–419) broker semantics unwritten; `DomainEvent` has no id for idempotency |
| 13 | the heaviest doc — D1, D2, D5 and A1 all land here |
| 14 | D1 (the cross-tenant read); lines 249–268 — the Qdrant migration is a re-embed, not a backfill-and-verify-counts, once the store is declared derived |
| 15 | D3; line 380 versus the sweep (A4); no analytics queue |
| 16 | line 526, the flagship flip; A2; A3; line 199's "under five minutes" versus the 60-second ceiling; line 240 is the path to load-test |
| 17 | D3, D4; lines 36–39 `queueUrl?` already half-there |
| 24 | lines 113, 162 one Redis; **line 176 `cookieCacheMaxAgeSeconds: 300`** contradicts the 60-second window; line 220 "one Redis connection" |
| 25 | D3; lines 271–272 — per-recipient digest computation is exactly what the fan-out rule bans; lines 284–297 `CleanupSchedule` is the home for the sweep and for retention; British spelling |
| 26 | **"eight assertions" → ten** (177, 179, 191); CI runs one Redis (128–137); no integration-test or load-test step |
| 27 | the "eleven-step" and "twelve places" counts; **lines 106–107** — step 6 must mandate the tenant column, FK indexes, and a partitioning decision for any append-only table. Highest-value edit in the doc. |
| 28 | the canonical trees: 345–355 ports, 377–380 migrations, 416–435 Redis, 48–52 compose |
| 29 | line 176 prose port list; line 202 shared Redis; lines 373–375 — the traced schema has no tenant and never mentions `task_status_history`; line 412 one-tier cache diagram |
| 30 | desktop is bearer-token, so **the signed-capability-cookie fast path has no desktop equivalent** (line 34); long-lived token versus 60-second revocation is unresolved, and 16:536 already flags it |

---

## F. `docs/opinions/` neighbours

### `vocabulary.md` — the largest edit

- **Contradiction, line 69** — *"Table | `snake_case`, **plural**"*, yet `activity_log` and
  `task_status_history` are singular. State the exception for append-only and log tables.
- Add a **log label** row to the four-vocabulary table (12–19), so `app / env / level / event_code`
  has a home and the four forbidden promotions are stated.
- The Database table (67–77) gains: partition parent and child naming, `organization_id` as
  mandatory, and snapshot or analytics tables — so `goal_risk_daily` reads as derived at a glance.
- Extend lines 36–41 — already reasoning about sinks and retention — to name Loki, thirty days, and
  the four-way taxonomy.
- Lines 86–88: `REDIS_URL` is prefixed by *technology*, not subsystem. The split forces the question.
- Add the spelling rule (A5).

### `files.md` and `classes.md` — a pre-existing hole the new port exposes

`classes.md:26-29` closes the suffix list to eight and says anything else *"probably wants
splitting."* `Reader` is absent — **and so are `Logger`, `Provider`, `Publisher`, `Resolver`, `Bus`,
and `UnitOfWork`**, all already-shipped port names. `files.md:18-38` is missing `.reader`,
`.logger`, `.provider`, `.publisher`, `.resolver`, and `.bus` for the same reason.

**Fix the whole hole.** Both tables should describe the ports that already exist. This is the
cheapest correctness win in the sweep.

`classes.md:33-44` presents a **closed** method vocabulary with no row for an aggregate read;
`goalRiskScores()` fits nothing on it.

### `folders.md`

Lines 130–132 are the argument someone would cite to push `AnalyticsReader` into a slice; write the
distinguishing rule. Line 76 makes `db/src/analytics/` a table edit rather than a free move;
`db/src/vector/` (130–131) is the precedent.

### `dependencies.md`

The three tiers are defined over npm packages, so Loki and Alloy — in no `package.json` — fall
through question 1 into Tier 1 build tooling, which is wrong. **Add a platform-dependency tier:**
something the deployment provides and no code imports. This is also what keeps `observability` from
ever naming Loki. Line 39 should list `@clickhouse/client`. Lines 42–44 and 70–71 already require a
port before any node-only dependency — cite them, do not re-argue.

---

## G. `packages/observability/` — the only stale island

**`AuditTrail` survives in exactly three lines**, all here, while eleven files across `docs/setup/`
and `tooling/tsconfig/docs/` already say `ActivityLogger`:

- `docs/index.md:12` · `docs/index.md:59` · `docs/reference/logger.md:35`

`logger.md:35` and `29:141` are near-verbatim the same sentence with different port names.

Also in this package: `index.md:9,12-18` "two streams" is now four · `:17` `Retention: days` becomes
thirty days, and the audit column's `forever` is now a partition and detach lifecycle · `:14`, `:3`,
`meta.json:3` and `logger.md:18` all stop the sink chain at stdout · `:63` nine ports becomes ten ·
`:96` the Loki contradiction (D6) · `:100-105` annotate the sample line and show the LogQL lookup ·
`logger.md:98-109` note that none of the four must-stay-in-body identifiers is redacted, which is
correct and worth stating now they are named.

**New event codes.** Nothing in the current fourteen covers the analytics consumer (start, complete,
lag, failure), the reconciliation job (drift detected, drift repaired), or the sweep (found,
re-enqueued). `queue.job.stalled` is BullMQ's own stall detection, not a sweep.

---

## H. Code changes

Small, because only six packages have content.

- **`packages/contracts/src/primitive/identifiers.ts`** — add `organizationId` and
  `OrganizationId`. `docs/reference/identifiers.md:77-82` states the admission test and it passes
  unambiguously. Mirror into `docs/reference/identifiers.md:10-21`, `docs/index.md:33`, and the
  barrel; extend `tests/primitive/identifiers.spec.ts` in the existing style.
- **`packages/observability/src/catalog/core.events.ts`** — the new event codes from G.
- **`packages/observability/docs/`** — the `AuditTrail` to `ActivityLogger` rename, and the Loki
  edits.
- **`packages/permissions`** — no code change yet, but `PermissionScope`'s meaning (D1) must be
  settled before doc 16 is walked.

---

## I. Enforcement

`opinions/index.md:78-80` — everything the new page decides falls to the
`| Everything else | Review |` row, and the file itself says *"the last row is the one to shrink."*
**26:177, 179 and 191** say "eight assertions" three times; make it ten, and update the sample
output at 183–188.

Two new greps in `tooling/scripts/check-architecture.mjs`, both expressible with the existing
`walk` / `specifiers` / `assert` helpers:

- **§9** — every `pgTable` in `db/src/` declares `organization_id`, with an explicit exemption list
  for Better Auth's tables, so each exemption is a visible decision.
- **§10** — no `AuditTrail` identifier anywhere. Cheap, and it pins the rename permanently.

Per **26:193** — *"a grep nobody has seen fail is a grep nobody should believe"* — write the failing
case for both.

Server-only ban lists to update if a ClickHouse client ever lands:
`tooling/biome-config/src/base.json:91`, `check-architecture.mjs:85,242` (`SERVER_FINGERPRINTS`),
`tooling/biome-config/docs/reference/boundary.md:31`, **05:155–164**, **26:195–202**.

---

## J. Pre-existing defects to fix in passing

Unrelated to the new page, but cheap while the files are open:

- **28:74–75** — *"the three CI greps"*; doc 26 says eight
- **28:779** — *"the three `ServerOnly.assert()` markers"*, then lists four
- **00:88–101** — the Opinions table is missing `dependencies.md`
- `packages/observability/docs/index.md:63` — "nine ports" (correct today, wrong after D4)
- Root `package.json` declares `db:generate`, `db:migrate`, `db:seed` and `db:studio` passthroughs;
  `packages/db/package.json` defines none of them, so all four fail today

---

## Verification

1. `pnpm --filter @loadbearing/contracts test` · `pnpm typecheck` · `pnpm lint` — covers
   `OrganizationId` and the new event codes.
2. `pnpm check:architecture` stays green; then **prove §9 and §10 by breaking them** — add a
   `pgTable` without `organization_id`, add an `AuditTrail` identifier, watch each fail, revert.
3. **Link check across `docs/` and `packages/*/docs/`.** This change adds and rewrites many
   cross-references, and the source text already shipped one broken link. No such script exists; a
   throwaway Node pass resolving every relative `.md` target is enough.
4. `rg -i "audittrail"` returns nothing. `rg "organisation"` returns nothing (A5).
5. **Count check.** Several docs state counts in prose that this change moves: nine ports (to ten),
   eight assertions (to ten), eleven checklist steps, twelve places, three containers. Grep the
   spelled-out numbers rather than trusting the edit list.
6. `docs/opinions/index.md` and `meta.json` are edited separately and must stay in the same order —
   read them against each other at the end.

**Not verifiable here, and worth saying plainly:** nothing in this change can be executed against a
running system, because `infra/` is empty and `packages/db` is a stub. The first real proof is doc
11's gate (two Redis containers healthy) and doc 13's (partitions exist, `organization_id` present,
foreign keys indexed). Both gates should be strengthened as part of this work, so the proof arrives
when the code does.
