-- Derived, and rebuildable by replaying the activity log. Nothing here is a
-- source of truth, which is what keeps the swap a performance decision.
--
-- The name is database-qualified on purpose: ClickHouse's entrypoint runs the
-- scripts in this directory against `default`, not against CLICKHOUSE_DB, so an
-- unqualified CREATE succeeds in the wrong place and the table looks missing.
CREATE TABLE IF NOT EXISTS ratchet.activity_events
(
  organization_id UUID,
  occurred_at     DateTime64(3),
  actor_id        String,
  action          LowCardinality(String),
  subject_id      Nullable(UUID),
  payload         String
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (organization_id, action, occurred_at)
TTL toDateTime(occurred_at) + INTERVAL 5 YEAR;
