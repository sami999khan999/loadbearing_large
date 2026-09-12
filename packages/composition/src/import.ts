// Everything this package takes from outside itself. The longest `import.ts` here, and
// that is the package working: wiring names both sides exactly once.

// ── @loadbearing/application ─────────────────────────────────────────────────
export {
  ActivityArchiveGateway,
  ActivityLogger,
  type ActivityRecord,
  ActivityReplayReader,
  AnalyticsProjector,
  type ArchivedPartition,
  Authorizer,
  CacheStore,
  CapabilityInvalidator,
  ChangeMemberRoleUseCase,
  CountUnreadNotificationsUseCase,
  CreateApiKeyUseCase,
  CreateRoleUseCase,
  type DailyCount,
  DeleteRoleUseCase,
  DeliverNotificationUseCase,
  type DocumentChunk,
  DomainEventPublisher,
  type EmailMessage,
  type EmailReceipt,
  EmailSender,
  EmbeddingProvider,
  EventSubscriber,
  GetNotificationPreferencesUseCase,
  GrantPermissionUseCase,
  IndexDocumentUseCase,
  InspectEffectivePermissionsUseCase,
  type InvitationMail,
  InvitationMailer,
  InviteMemberUseCase,
  type JobOptions,
  ListApiKeysUseCase,
  ListDigestOrganizationsUseCase,
  ListInvitationsUseCase,
  ListMembersUseCase,
  ListNotificationsUseCase,
  ListRolesUseCase,
  type LogEntry,
  type LogQuery,
  LogReader,
  MailPublisher,
  MailRenderer,
  type MailRequest,
  MaintenanceGateway,
  MarkAllNotificationsReadUseCase,
  MarkNotificationReadUseCase,
  MemberRealtimeSubscriber,
  NotificationSubscriber,
  OutboxGateway,
  type PartitionedTableName,
  type Principal,
  type ProjectionCheckpoint,
  QueueDocumentIndexUseCase,
  QueueName,
  QueuePublisher,
  type RealtimeChannel,
  RealtimeChannels,
  RealtimePublisher,
  type RenderedMail,
  type RequestHeaders,
  type ResolvedSession,
  RevokeApiKeyUseCase,
  RevokeInvitationUseCase,
  RevokePermissionUseCase,
  type RoleRecord,
  RoleRepository,
  SearchDocumentsUseCase,
  type SearchHit,
  SendMailUseCase,
  SendNotificationDigestUseCase,
  SessionResolver,
  SetMemberActiveUseCase,
  StorageGateway,
  type StoredObject,
  SubscriberRegistry,
  type SweepOutcome,
  UnitOfWork,
  UpdateNotificationPreferenceUseCase,
  UpdateRoleUseCase,
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
  type MailRecipient,
  type MembershipEnroller,
  type MembershipReader,
  NullMembershipEnroller,
  type OrganizationFounder,
  PrincipalBuilder,
} from "@loadbearing/auth";

// ── @loadbearing/content ─────────────────────────────────────────────────────
export {
  type ContentSource,
  type Locale,
  Locales,
  SERVER_CATALOG,
  StaticContentSource,
  type Translator,
} from "@loadbearing/content";

// ── @loadbearing/contracts ─────────────────────────────────────────────
// Only the branded ids two port signatures name, without which `test-container.ts`
// cannot override them.
export type {
  DomainEvent,
  DomainEventInput,
  DomainEventName,
  GoalId,
  MailTemplateKey,
  MailTemplateParams,
  OrganizationId,
  RealtimeMessage,
  UserId,
} from "@loadbearing/contracts";

// ── @loadbearing/core ────────────────────────────────────────────────────────
export { type Clock, FixedClock, ServerOnly, SystemClock, Uuid } from "@loadbearing/core";

// ── @loadbearing/errors ──────────────────────────────────────────────────────
export { NotFoundError } from "@loadbearing/errors";

// ── @loadbearing/infrastructure ──────────────────────────────────────────────
// Every concrete adapter, Postgres included — one block, because one package holds the
// whole outside-world side of the ports below.
export {
  BullMqQueuePublisher,
  ClickHouseAnalyticsProjector,
  ClickHouseConnection,
  Database,
  LokiLogReader,
  OpenAiEmbeddingProvider,
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
  PgNotificationPreferenceRepository,
  PgNotificationRecipientReader,
  PgNotificationRepository,
  PgOrganizationFounder,
  PgOutboxGateway,
  PgOutboxPublisher,
  PgPersonalOrganizationEnroller,
  PgRoleRepository,
  PgUnitOfWork,
  PgVectorStore,
  RedisCacheStore,
  RedisConnection,
  RedisRealtimePublisher,
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
