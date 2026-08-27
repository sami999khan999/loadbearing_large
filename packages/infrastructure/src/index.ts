import { ServerOnly } from "./import.js";

ServerOnly.assert("@loadbearing/infrastructure");

// One folder per external system this package speaks to, so `ls src/` answers "what
// does this depend on?". The filenames already led with the technology — the folders
// now agree with them.
//
// Two of them hold a store the default deployment does not run. `clickhouse/` and
// `loki/` are adapters for services behind an opt-in profile, and `Container` builds
// neither unless its configuration block is present. A folder here is a statement
// that the seam is implemented, not that the container is started.
export { BullMqQueuePublisher, QueueName } from "./bullmq/index.js";
export {
  ClickHouseAnalyticsProjector,
  ClickHouseAnalyticsReader,
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
