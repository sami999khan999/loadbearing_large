import { ServerOnly } from "./import.js";

ServerOnly.assert("@loadbearing/infrastructure");

// One folder per external system this package speaks to, so `ls src/` answers "what
// does this depend on?". The filenames already led with the technology — the folders
// now agree with them.
export { BullMqQueuePublisher, QueueName } from "./bullmq/index.js";
export { type OpenAiEmbeddingConfig, OpenAiEmbeddingProvider } from "./openai/index.js";
export {
  type ApiKeyRow,
  BaseRepository,
  Database,
  type DatabaseConfig,
  type DrizzleClient,
  PgActivityArchiveGateway,
  PgActivityLogger,
  PgAnalyticsReader,
  PgApiKeyRepository,
  PgCapabilityRepository,
  PgMaintenanceGateway,
  PgMembershipReader,
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
