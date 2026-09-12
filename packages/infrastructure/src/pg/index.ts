// `schema/`, `migrate/` and `seed/` are deliberately absent: they are reached by path,
// and nothing outside this package may name a table.
export {
  BaseRepository,
  Database,
  type DatabaseConfig,
  type DrizzleClient,
  KeysetCursor,
} from "./primitive/index.js";
export {
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
  PgOutboxGateway,
  PgOutboxPublisher,
  PgPersonalOrganizationEnroller,
  PgRoleRepository,
  PgVectorStore,
} from "./repository/index.js";
export { PgUnitOfWork, TransactionScope } from "./transaction/index.js";
