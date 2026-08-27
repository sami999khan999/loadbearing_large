// Everything the Postgres side of this package publishes. `schema/`, `migrate/` and
// `seed/` are deliberately absent: drizzle-kit and the two runners reach them by path,
// and nothing outside this package may name a table.
export { PgActivityLogger } from "./activity/index.js";
export { PgAnalyticsReader } from "./analytics/index.js";
export { PgActivityArchiveGateway, PgMaintenanceGateway } from "./maintenance/index.js";
export {
  BaseRepository,
  Database,
  type DatabaseConfig,
  type DrizzleClient,
} from "./primitive/index.js";
export {
  type ApiKeyRow,
  PgApiKeyRepository,
  PgCapabilityRepository,
  PgMembershipReader,
} from "./rbac/index.js";
export { PgUnitOfWork, TransactionScope } from "./transaction/index.js";
export { PgVectorStore } from "./vector/index.js";
