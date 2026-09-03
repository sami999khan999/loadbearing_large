// Every concrete Postgres adapter, one file each, flat. They sit together rather
// than in a folder per subject because they are all the same kind of thing — a class
// extending `BaseRepository`, reading `schema/`, running inside `TransactionScope` —
// and a folder holding one file is a path, not a subject
// ([Simplicity](../../../../../docs/opinions/simplicity.md)).
//
// The subject that *does* earn a folder is the external system, one level up: `pg/`
// beside `clickhouse/`, `loki/`, `redis/`. Naming a subject twice is what made
// `pg/analytics/` and a future `clickhouse/` read as two implementations of two
// different things rather than two implementations of one port.
export { PgActivityLogger } from "./pg-activity.logger.js";
export { PgActivityArchiveGateway } from "./pg-activity-archive.gateway.js";
export { PgActivityReplayReader } from "./pg-activity-replay.reader.js";
export { PgAnalyticsReader } from "./pg-analytics.reader.js";
export { type ApiKeyRow, PgApiKeyRepository } from "./pg-api-key.repository.js";
export { PgBootstrapMembershipEnroller } from "./pg-bootstrap-membership.enroller.js";
export { PgCapabilityRepository } from "./pg-capability.repository.js";
export { PgInvitationClaimer } from "./pg-invitation.claimer.js";
export { PgMaintenanceGateway } from "./pg-maintenance.gateway.js";
export { PgMembershipReader } from "./pg-membership.reader.js";
export { PgOrganizationFounder } from "./pg-organization.founder.js";
export { PgPersonalOrganizationEnroller } from "./pg-personal-organization.enroller.js";
export { PgRoleRepository } from "./pg-role.repository.js";
export { PgVectorStore } from "./pg-vector.store.js";
