import { ServerOnly } from "./import.js";

ServerOnly.assert("@loadbearing/infrastructure");

// One folder per external system, so `ls src/` answers "what does this depend on?". A
// folder says the seam is implemented, not that the container is started.
export { BullMqQueuePublisher } from "./bullmq/index.js";
export {
  ClickHouseAnalyticsProjector,
  type ClickHouseConfig,
  ClickHouseConnection,
} from "./clickhouse/index.js";
export { type LokiConfig, LokiLogReader } from "./loki/index.js";
export { type OpenAiEmbeddingConfig, OpenAiEmbeddingProvider } from "./openai/index.js";
export {
  BaseRepository,
  Database,
  type DatabaseConfig,
  type DatabaseStats,
  type DrizzleClient,
  KeysetCursor,
  PgActivityArchiveGateway,
  PgActivityLogger,
  PgActivityReplayReader,
  PgApiKeyRepository,
  PgBootstrapMembershipEnroller,
  PgCapabilityRepository,
  PgConversationRepository,
  PgInvitationClaimer,
  PgInvitationRepository,
  PgMaintenanceGateway,
  PgMemberRepository,
  PgMembershipReader,
  PgMessageRepository,
  PgNotificationPreferenceRepository,
  PgNotificationRecipientReader,
  PgNotificationRepository,
  PgOrganizationFounder,
  PgOutboxGateway,
  PgOutboxPublisher,
  PgPersonalOrganizationEnroller,
  PgRoleRepository,
  PgUnitOfWork,
  type PgUnitOfWorkConfig,
  PgVectorStore,
  TransactionScope,
} from "./pg/index.js";
export {
  RedisCacheStore,
  type RedisConfig,
  RedisConnection,
  type RedisRealtimeConfig,
  RedisRealtimePublisher,
  RedisRealtimeSubscriber,
  type RedisRole,
} from "./redis/index.js";
export { type S3Config, S3StorageGateway, StorageKey } from "./s3/index.js";
export { type SmtpConfig, SmtpEmailSender } from "./smtp/index.js";
