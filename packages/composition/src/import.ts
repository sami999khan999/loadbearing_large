// Everything this package takes from outside itself, in one place. No relative
// re-exports live here — that is what keeps it cycle-free.
//
// Longer than any other `import.ts` in the repository, and that is the package
// working: wiring ports to implementations means naming both sides exactly once.

// ── @loadbearing/application ─────────────────────────────────────────────────
export {
  ActivityArchiveGateway,
  ActivityLogger,
  type ActivityRecord,
  ActivityReplayReader,
  AnalyticsProjector,
  AnalyticsReader,
  type ArchivedPartition,
  Authorizer,
  CacheStore,
  type DailyCount,
  type DateRange,
  type DocumentChunk,
  type DomainEvent,
  EmbeddingProvider,
  EventBus,
  IndexDocumentUseCase,
  type JobOptions,
  type LogEntry,
  type LogQuery,
  LogReader,
  MaintenanceGateway,
  type Principal,
  type ProjectionCheckpoint,
  QueuePublisher,
  type RequestHeaders,
  type ResolvedSession,
  type RiskScore,
  type SearchHit,
  SessionResolver,
  StorageGateway,
  type StoredObject,
  type SweepOutcome,
  type TrendPoint,
  UnitOfWork,
  VectorStore,
} from "@loadbearing/application";

// ── @loadbearing/auth ────────────────────────────────────────────────────────
export {
  ApiKeyResolver,
  AuthFactory,
  type AuthInstance,
  BetterAuthSessionResolver,
  CapabilityCache,
  type MembershipReader,
  PrincipalBuilder,
} from "@loadbearing/auth";

// ── @loadbearing/content ─────────────────────────────────────────────────────
export { type ContentSource, SERVER_CATALOG, StaticContentSource } from "@loadbearing/content";

// ── @loadbearing/contracts ─────────────────────────────────────────────
// Only the branded ids two port signatures name. `test-container.ts` cannot override
// `VectorStore.upsert` or `AnalyticsReader.goalRiskScores` without them.
export type { GoalId, OrganizationId, UserId } from "@loadbearing/contracts";

// ── @loadbearing/core ────────────────────────────────────────────────────────
export { type Clock, FixedClock, ServerOnly, SystemClock } from "@loadbearing/core";

// ── @loadbearing/infrastructure ──────────────────────────────────────────────
// Every concrete adapter, Postgres included. One import block, because there is now
// one package holding the whole outside-world side of the ports below.
export {
  BullMqQueuePublisher,
  ClickHouseAnalyticsProjector,
  ClickHouseAnalyticsReader,
  ClickHouseConnection,
  Database,
  LokiLogReader,
  OpenAiEmbeddingProvider,
  PgActivityArchiveGateway,
  PgActivityLogger,
  PgActivityReplayReader,
  PgAnalyticsReader,
  PgApiKeyRepository,
  PgCapabilityRepository,
  PgMaintenanceGateway,
  PgMembershipReader,
  PgUnitOfWork,
  PgVectorStore,
  RedisCacheStore,
  RedisConnection,
  S3StorageGateway,
  TransactionScope,
} from "@loadbearing/infrastructure";

// ── @loadbearing/observability ───────────────────────────────────────────────
export { JsonLogger, type Logger, type LogLevel, SilentLogger } from "@loadbearing/observability";
