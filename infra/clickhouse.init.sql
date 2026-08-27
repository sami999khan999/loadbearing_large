-- Derived, and rebuildable by replaying the activity log. Nothing here is a
-- source of truth, which is what keeps the swap a performance decision.
--
-- The name is database-qualified on purpose: ClickHouse's entrypoint runs the
-- scripts in this directory against `default`, not against CLICKHOUSE_DB, so an
-- unqualified CREATE succeeds in the wrong place and the table looks missing.

-- ── the projected audit trail ────────────────────────────────────────────────
--
-- One row per `activity_log` row, written only by `ClickHouseAnalyticsProjector`
-- and by nothing else. That restriction is the first of the two guards: the moment
-- a use-case writes here directly, or a hand-run backfill invents a row, the store
-- stops being rebuildable and has quietly become a source of truth.
--
-- `ReplacingMergeTree`, not `MergeTree`. BullMQ redelivers, so the projection has
-- to be idempotent, and the sorting key ends in `id` so a redelivered batch
-- collapses onto the rows it already wrote rather than doubling them.
CREATE TABLE IF NOT EXISTS ratchet.activity_events
(
  -- The `activity_log` primary key, carried across. It is what makes the insert
  -- idempotent and what the projection checkpoint reads back.
  id              UUID,
  organization_id UUID,
  occurred_at     DateTime64(3),
  actor_id        UUID,
  action          LowCardinality(String),
  -- Lifted out of the payload by the replay reader. A column rather than a JSON
  -- extraction because queries order and group on it, and JSON extraction inside
  -- an ORDER BY is what makes a column store slow.
  subject_id      Nullable(UUID),
  -- The rest of the bag, as text. Typing it would make every new payload field a
  -- schema migration on a table holding years of rows, for data nothing groups by.
  payload         String
)
ENGINE = ReplacingMergeTree
PARTITION BY toYYYYMM(occurred_at)
-- Tenant first, because every analytics query narrows by it — the same reasoning
-- that puts `organization_id` at the front of the Postgres indexes. `id` last, so
-- the whole tuple is the dedup key.
ORDER BY (organization_id, occurred_at, id)
-- Longer than the Postgres retention window on purpose. Postgres keeps thirteen
-- months and archives the rest to S3; this is where the multi-year questions are
-- answered from, which is the entire reason for its existence.
TTL toDateTime(occurred_at) + INTERVAL 5 YEAR;

-- ── the rollups `AnalyticsReader` answers from ───────────────────────────────
--
-- Deliberately the same two tables, the same columns and the same grain as the
-- Postgres schema in `packages/infrastructure/src/pg/schema/analytics.schema.ts`.
-- `PgAnalyticsReader` and `ClickHouseAnalyticsReader` implement one port over one
-- pair of questions, and a driver flip has to change where the answer comes from
-- rather than what it is.
--
-- Both are written by the rollup job, which is move #2 in
-- `docs/opinions/data-and-scale.md` and does not exist yet — in either store. The
-- tables are here so adopting ClickHouse is not also a schema exercise.

CREATE TABLE IF NOT EXISTS ratchet.goal_risk_daily
(
  organization_id UUID,
  goal_id         UUID,
  period          Date,
  -- 0 (no risk) to 1 (certain). A ratio, not a percentage — display decides format.
  score           Float32,
  -- What the score was computed from. Without these, changing the risk formula
  -- makes every historical row silently incomparable to every new one.
  tasks_total     UInt32,
  tasks_overdue   UInt32,
  tasks_blocked   UInt32,
  computed_at     DateTime
)
-- Keyed on the recomputation time, so re-running a day replaces it.
ENGINE = ReplacingMergeTree(computed_at)
PARTITION BY toYYYYMM(period)
-- Goal first, not tenant. `AnalyticsReader.goalRiskScores(goalIds)` carries no
-- organization — the permitted scope arrives already resolved — so the tenant
-- column is unavailable as a leading key. The Postgres side solves the same
-- problem with `goal_risk_daily_goal_idx`.
ORDER BY (goal_id, period, organization_id);

CREATE TABLE IF NOT EXISTS ratchet.user_reliability_daily
(
  organization_id    UUID,
  user_id            UUID,
  goal_id            UUID,
  period             Date,
  -- Components, and here they are load-bearing: ratios cannot be averaged across
  -- goals, only recomputed from sums. Storing the ratio would make the only
  -- correct query impossible to write.
  commitments_met    UInt32,
  commitments_total  UInt32,
  computed_at        DateTime
)
ENGINE = ReplacingMergeTree(computed_at)
PARTITION BY toYYYYMM(period)
ORDER BY (user_id, goal_id, period, organization_id);
