// Everything this package takes from outside itself. The longest `import.ts` here, and
// that is the package working: wiring names both sides exactly once.

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
  type EmailMessage,
  EmailSender,
  EmbeddingProvider,
  EventBus,
  IndexDocumentUseCase,
  type InvitationMail,
  InvitationMailer,
  InviteMemberUseCase,
  type JobOptions,
  ListInvitationsUseCase,
  ListMembersUseCase,
  ListRolesUseCase,
  type LogEntry,
  type LogQuery,
  LogReader,
  MaintenanceGateway,
  type Principal,
  type ProjectionCheckpoint,
  QueuePublisher,
  type RequestHeaders,
  type ResolvedSession,
  RevokeInvitationUseCase,
  type RiskScore,
  type RoleRecord,
  RoleRepository,
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
  AuthMailer,
  BetterAuthSessionResolver,
  CapabilityCache,
  type InvitationClaimer,
  InvitationClaimingEnroller,
  type MembershipEnroller,
  type MembershipReader,
  NullMembershipEnroller,
  type OrganizationFounder,
  PrincipalBuilder,
} from "@loadbearing/auth";

// ── @loadbearing/content ─────────────────────────────────────────────────────
export {
  type ContentSource,
  Locales,
  SERVER_CATALOG,
  StaticContentSource,
} from "@loadbearing/content";

// ── @loadbearing/contracts ─────────────────────────────────────────────
// Only the branded ids two port signatures name, without which `test-container.ts`
// cannot override them.
export type { GoalId, OrganizationId, UserId } from "@loadbearing/contracts";

// ── @loadbearing/core ────────────────────────────────────────────────────────
export { type Clock, FixedClock, ServerOnly, SystemClock } from "@loadbearing/core";

// ── @loadbearing/infrastructure ──────────────────────────────────────────────
// Every concrete adapter, Postgres included — one block, because one package holds the
// whole outside-world side of the ports below.
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
  RedisCacheStore,
  RedisConnection,
  S3StorageGateway,
  SmtpEmailSender,
  TransactionScope,
} from "@loadbearing/infrastructure";

// ── @loadbearing/observability ───────────────────────────────────────────────
export { JsonLogger, type Logger, type LogLevel, SilentLogger } from "@loadbearing/observability";

// ── @loadbearing/permissions ─────────────────────────────────────────────────
// Only the route table, so the invitation mail's link and the landing page spell the
// same literal.
export { ROUTES } from "@loadbearing/permissions";
