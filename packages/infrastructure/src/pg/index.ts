// Everything the Postgres side of this package publishes. `schema/`, `migrate/` and
// `seed/` are deliberately absent: drizzle-kit and the two runners reach them by path,
// and nothing outside this package may name a table.
export {
  BaseRepository,
  Database,
  type DatabaseConfig,
  type DrizzleClient,
} from "./primitive/index.js";
export {
  type ApiKeyRow,
  PgActivityArchiveGateway,
  PgActivityLogger,
  PgActivityReplayReader,
  PgAnalyticsReader,
  PgApiKeyRepository,
  PgCapabilityRepository,
  PgMaintenanceGateway,
  PgMembershipEnroller,
  PgMembershipReader,
  PgRoleRepository,
  PgVectorStore,
} from "./repository/index.js";
export { PgUnitOfWork, TransactionScope } from "./transaction/index.js";
