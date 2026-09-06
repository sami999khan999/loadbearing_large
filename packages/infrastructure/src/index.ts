import { ServerOnly } from "./import.js";

ServerOnly.assert("@loadbearing/infrastructure");

// One folder per external system, so `ls src/` answers "what does this depend on?". A
// folder says the seam is implemented, not that the container is started.
export { BullMqQueuePublisher, QueueName } from "./bullmq/index.js";
export {
  ClickHouseAnalyticsProjector,
  type ClickHouseConfig,
  ClickHouseConnection,
} from "./clickhouse/index.js";
export { type LokiConfig, LokiLogReader } from "./loki/index.js";
export { type OpenAiEmbeddingConfig, OpenAiEmbeddingProvider } from "./openai/index.js";
export {
  type ApiKeyRow,
  BaseRepository,
  Database,
  type DatabaseConfig,
  type DrizzleClient,
  PgActivityArchiveGateway,
  PgActivityLogger,
  PgActivityReplayReader,
  PgApiKeyRepository,
  PgBootstrapMembershipEnroller,
  PgCapabilityRepository,
  PgInvitationClaimer,
  PgInvitationRepository,
  PgMaintenanceGateway,
  PgMemberRepository,
  PgMembershipReader,
  PgOrganizationFounder,
  PgPersonalOrganizationEnroller,
  PgRoleRepository,
  PgUnitOfWork,
  PgVectorStore,
  TransactionScope,
} from "./pg/index.js";
export {
  RedisCacheStore,
  type RedisConfig,
  RedisConnection,
  type RedisRole,
} from "./redis/index.js";
export { type S3Config, S3StorageGateway, StorageKey } from "./s3/index.js";
export { type SmtpConfig, SmtpEmailSender } from "./smtp/index.js";
