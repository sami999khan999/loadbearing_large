-- The derived copy of `ai_usage`, one row per settled answer. Written only by
-- `ClickHouseAssistantUsageProjector`, and rebuildable from Postgres and its cold archive.
--
-- `ReplacingMergeTree` keyed on the usage id, for the same reason `activity_events` is:
-- the projection is at-least-once, so a redelivered batch must collapse, not double.
CREATE TABLE IF NOT EXISTS ai_usage_events
(
  id              UUID,
  organization_id UUID,
  created_at      DateTime64(3),
  user_id         UUID,
  thread_id       UUID,
  message_id      UUID,
  model           LowCardinality(String),
  input_tokens    UInt32,
  output_tokens   UInt32
)
ENGINE = ReplacingMergeTree
PARTITION BY toYYYYMM(created_at)
-- Tenant first, as every per-tenant read narrows by it. The platform report scans a
-- window of months across tenants, which the month partitions bound.
ORDER BY (organization_id, created_at, id)
-- Longer than Postgres' 25 months, as `activity_events` outlives `activity_log`.
TTL toDateTime(created_at) + INTERVAL 60 MONTH;
