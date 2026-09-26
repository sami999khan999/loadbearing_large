---
title: State — what a session changed on a developer machine, and how to undo it
updated: 2026-09-25
owner: sami
source: split out of plans/BACKLOG.md on 2026-09-25
---

# State

**Not a ledger, and not history.** This is what sessions left on the developer machines on purpose:
accounts, tenants, archived months, `.env` edits and compose profiles. Each row says where it is
and why it was left, so a later walk can reuse it and a clean-up knows what to undo. Add a table
when a session leaves something behind; delete a row when it is undone.

**Two machines, so read the dates.** The tables up to 2026-09-22 are the first machine's. The
2026-09-25 table is a second checkout, synced from the remote with an older database, and none of
the earlier rows exist there.

**Start with `archive/OPEN.md` section D**, the first table of what changed on the first machine:
`.env.backup-2026-09-20`, three compose profiles up, 25 000 `<n>@fan-out.test` users left on
purpose, and four organizations with no directory row. It is frozen with that file, and the tables
below extend it.

**Added to that table on 2026-09-20, by the `S.1` walk and by `S.2`:**

| What | Where | Why it is there |
|---|---|---|
| `CLICKHOUSE_URL` uncommented | root `.env` | `S.2` step two cannot start without it. **Leave it** until the reader is written; `ANALYTICS_DRIVER` is still `postgres`, which is the documented adoption order |
| `analytics` profile up | compose | the same |
| `ada@walk.test`, `grace@walk.test` | `users`, `memberships` in `loadbearing` | the two walk accounts. Ada was promoted to `owner` **by hand in SQL**, because `AUTH_ENROLMENT_MODE=bootstrap` enrols a sign-up as `member` and the walk needs `member.invite` |
| `hopper@walk.test`, `lovelace@walk.test` | `invitations` | never accepted, on purpose. The first is `23.5`'s pending row; the second was one auditable action, to watch the projection carry a row it had not seen |
| `01a0bd49-5cef-…` placed on node 0 | `shard_assignments` | a leftover integration tenant with no assignment, which was aborting every analytics run. See `23.21` |
| one direct conversation, two messages | `conversations`, `messages` | `23.10`'s proof that a retried optimistic send is one row |
| `redis-cache` flushed | cache Redis | after the SQL promotion, so the capability cache did not serve the old role. Rebuildable by design |

**Added on 2026-09-21 by the section 5 walk.** Left in place deliberately: the next walk needs a
platform admin, two tenants and an archived month, and manufacturing them again is the expensive
part. What was debris was removed — the two `*_2026_06_restore` scratch tables are dropped and
`retention_policy` is empty again, so an absent row is the code default exactly as before.

| What | Where | Why it is there |
|---|---|---|
| `alice@example.test` is `platform_admin` | `memberships` in `loadbearing` | `pnpm platform:grant`. It **moved** her from `owner`, which is what the script does; `ada@walk.test` is still `loadbearing`'s owner |
| **Walk Co** (`o-01a0c2c3-…`) | `organizations` | alice founded it for Phase 18's *customer tenant active* half. bob is a member of it |
| **Bob Co** (`o-01a0c2cf-…`) | `organizations` | bob founded it for Phase 18's *tenant owner is redirected* half and for Phase 21's archived section, which needs `notification.archive.read` |
| three archived months | `partition_archive`, `cold/notifications/2026/0{6,7}/` | two for `loadbearing`, one for Bob Co. **The rows exist only in S3** — the partitions were archived and dropped. Deleting the objects makes `/notifications` and `/platform/storage` empty again |
| one tenant export | `export/01a0c2c3-…/2026-09-21/` | five objects, from `/platform/storage`'s button. The bucket lifecycle deletes them after seven days |
| two invitation mails to `bob@example.test` | Mailpit | `26.9`: the second is the resend, and the pair is the proof |
| `bob@example.test` in `Walk Co` | `memberships` | `T-029` step 2. His `loadbearing` membership is untouched |

**Added on 2026-09-22, running the smoke suites.**

| What | Where | Why it is there |
|---|---|---|
| `LOKI_URL` uncommented | root `.env` | `observability.smoke.spec.ts` gates on it and skips silently without it, so the suite reported nothing about the log read-back path while Loki was up and answering. **Leave it**: it builds a `LogReader` and changes nothing about writing — `JsonLogger` goes to stdout and Alloy tails it either way |

**Added on 2026-09-25, on a second machine.** This checkout had been synced from the remote with
a `.env` and a database from before the 2026-09-20 renumbering, so the stack started on the old
ports and the schema was behind. What was changed to run it:

| What | Where | Why it is there |
|---|---|---|
| every port renumbered, the `*_PORT` block appended | root `.env` | it still dialled `5432`; the old file is `.env.backup-2026-09-25` beside it |
| `POSTGRES_REPLICA_PORT`, `DATABASE_REPLICA_URL` | root `.env` | `24.3`. **Leave it**: with the switch off, nothing reads through it but the status panel |
| `pnpm db:migrate`, `pnpm db:seed` | both nodes | the schema was behind; the seed gave `platform_admin` `platform.replica.manage` |
| `replica` profile up, `pgreplicadata` volume | compose | `24.3`'s standby. The primary was recreated once to take `hba_file` |
| four leftover integration tenants placed on node 0 | `shard_assignments` | `other-…`, `drop-…` and two `pruning-…`, from 2026-09-19. Each aborted every projection run. `23.21` is decided now, skip, so a new one is logged and passed over |
| `replica-e2e@example.test`, `platform_admin` | `users`, `memberships` in `loadbearing` | the throwaway admin `25.2` was flipped with; verified by SQL, not by mail |
| `S3_COLD_STORAGE_CLASS=COLD`, `S3_COLD_TRANSITION_DAYS=30` | root `.env` | `25.3`. Harmless with `retention_policy` empty: the only rule is `export/`, which never transitions |
| `cold-tier` profile up, `miniocolddata` volume, tier `COLD` on `minio` | compose | `25.3`'s tier |
| `analytics-e2e@example.test`, owner of its personal organization `01a0d7aa-…` | `users`, `organizations`, `memberships` | `23.14`'s end-to-end owner. Its ClickHouse seed rows were deleted afterwards |
| migration `0039` | both nodes | `analytics.activity.read` backfilled to 74 `owner` and 74 `admin` roles |
| four `platform.replica.*` audit rows, switch back **off** | `activity_log`, `platform_policy` | the end-to-end check: on, off, on, off |

Not left behind, and worth saying so: `platform_policy.projection_enabled` is `t` again, the two
scratch tables are gone, `retention_policy` holds no rows, and the `.env` copy taken before the
`LOKI_URL` edit was removed once the diff was confirmed to be that one line.
