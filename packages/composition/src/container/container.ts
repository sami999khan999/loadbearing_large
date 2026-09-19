import {
  type ActivityLogger,
  type ActivityReplayReader,
  AddConversationMemberUseCase,
  type AnalyticsProjector,
  ApiKeyResolver,
  AuthFactory,
  type AuthInstance,
  Authorizer,
  BetterAuthSessionResolver,
  BullMqQueuePublisher,
  type CacheStore,
  CapabilityCache,
  ChangeMemberRoleUseCase,
  ClickHouseAnalyticsProjector,
  ClickHouseConnection,
  type Clock,
  type ColdArchiveReader,
  type ContentSource,
  ConversationAccess,
  CountUnreadNotificationsUseCase,
  CreateApiKeyUseCase,
  CreateConversationUseCase,
  CreateRoleUseCase,
  Database,
  type DatabaseStats,
  DeleteMessageUseCase,
  DeleteOrganizationUseCase,
  DeleteRoleUseCase,
  DeliverNotificationUseCase,
  type DomainEventPublisher,
  EditMessageUseCase,
  type EmailSender,
  type EmbeddingProvider,
  ExportOrganizationUseCase,
  GetConversationUseCase,
  GetNotificationPreferencesUseCase,
  GetPlatformPolicyUseCase,
  GrantPermissionUseCase,
  IndexDocumentUseCase,
  InspectEffectivePermissionsUseCase,
  InspectPlatformStatusUseCase,
  type InvitationClaimer,
  InvitationClaimingEnroller,
  InviteMemberUseCase,
  JsonLogger,
  LeaveConversationUseCase,
  ListApiKeysUseCase,
  ListConversationsUseCase,
  ListDigestOrganizationsUseCase,
  ListInvitationsUseCase,
  ListMembersUseCase,
  ListMessagesUseCase,
  ListNotificationsUseCase,
  ListProjectionGapsUseCase,
  ListProjectionPoliciesUseCase,
  ListRetentionPoliciesUseCase,
  ListRolesUseCase,
  ListTenantExportsUseCase,
  ListTenantStorageUseCase,
  type Logger,
  type LogReader,
  LokiLogReader,
  type MailPublisher,
  type MailRenderer,
  type MaintenanceGateway,
  MarkAllNotificationsReadUseCase,
  MarkConversationReadUseCase,
  MarkNotificationReadUseCase,
  MemberRealtimeSubscriber,
  type MembershipEnroller,
  type MembershipReader,
  MessagingRealtimeSubscriber,
  NotificationSubscriber,
  NullMembershipEnroller,
  OpenAiEmbeddingProvider,
  type OrganizationFounder,
  type OrganizationReader,
  type OutboxGateway,
  type PartitionArchiveGateway,
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
  PgOrganizationReader,
  PgOutboxGateway,
  PgOutboxPublisher,
  PgPartitionArchiveGateway,
  PgPersonalOrganizationEnroller,
  PgPlatformPolicyRepository,
  PgPlatformReader,
  PgProjectionPolicyRepository,
  PgRetentionPolicyRepository,
  PgRoleRepository,
  PgTenantRepository,
  PgTenantRetentionPolicyRepository,
  PgTenantStorageReader,
  PgUnitOfWork,
  PgVectorStore,
  type PlatformPolicyRepository,
  type PlatformReader,
  PreviewRetentionChangeUseCase,
  PrincipalBuilder,
  type ProjectionPolicyRepository,
  QueueDocumentIndexUseCase,
  type QueuePublisher,
  type RealtimePublisher,
  type RealtimeSubscriber,
  RedisCacheStore,
  RedisConnection,
  RedisRealtimePublisher,
  RedisRealtimeSubscriber,
  RemoveConversationMemberUseCase,
  RenameConversationUseCase,
  ReprojectPartitionUseCase,
  RestorePartitionUseCase,
  type RetentionPolicyRepository,
  RevokeApiKeyUseCase,
  RevokeInvitationUseCase,
  RevokePermissionUseCase,
  S3ColdArchiveReader,
  S3StorageGateway,
  S3StoragePolicyGateway,
  SERVER_CATALOG,
  SearchDocumentsUseCase,
  SendMailUseCase,
  SendMessageUseCase,
  SendNotificationDigestUseCase,
  type SessionResolver,
  SetMemberActiveUseCase,
  SignalTypingUseCase,
  SmtpEmailSender,
  StaticContentSource,
  type StorageGateway,
  type StoragePolicyGateway,
  SubscriberRegistry,
  SystemClock,
  type TenantRetentionPolicyRepository,
  ToggleProjectionUseCase,
  TransactionScope,
  type UnitOfWork,
  UpdateNotificationPreferenceUseCase,
  UpdateProjectionPolicyUseCase,
  UpdateRetentionPolicyUseCase,
  UpdateRoleUseCase,
  UpdateTenantRetentionUseCase,
  type VectorStore,
} from "../import.js";
import {
  ContentMailRenderer,
  QueuedAuthMailer,
  QueuedInvitationMailer,
  QueuedMailPublisher,
} from "../mail/index.js";
import type { ContainerConfig } from "./container.config.js";
import { ContainerHealthReader } from "./container-health.reader.js";

// The API-key slice's use-cases. Grouped like the member ones, and absent for the same
// reason: the worker authenticates nothing and issues nothing.
interface ApiKeyUseCases {
  readonly listApiKeys: ListApiKeysUseCase;
  readonly createApiKey: CreateApiKeyUseCase;
  readonly revokeApiKey: RevokeApiKeyUseCase;
}

// The member slice's use-cases. Named so the getter can say what is absent rather than
// handing out `undefined`.
export interface MemberUseCases {
  readonly listMembers: ListMembersUseCase;
  readonly listInvitations: ListInvitationsUseCase;
  readonly inviteMember: InviteMemberUseCase;
  readonly revokeInvitation: RevokeInvitationUseCase;
  readonly changeMemberRole: ChangeMemberRoleUseCase;
  // One use-case behind two procedures: the direction is an argument, because the
  // column is one value and two classes would let them disagree about "active".
  readonly setMemberActive: SetMemberActiveUseCase;
}

// One field per dependency the deployment cannot serve requests without, plus the
// roll-up the probe's status code comes from.
export interface HealthReport {
  readonly healthy: boolean;
  readonly database: boolean;
  readonly cache: boolean;
  readonly queue: boolean;
  // `null` when this deployment runs no ClickHouse — absent, rather than passing.
  readonly analytics: boolean | null;
  // `null` in a process that has opened no subscriber connection, which is every worker.
  // Not a failure, and not something to open a connection in order to report on.
  readonly realtime: boolean | null;
  // This process's own pool, and only that: a client waiting inside pgBouncer reads as
  // `waiting: 0` here. See docs/infra/reference/pgbouncer.md.
  readonly pool: DatabaseStats;
}

// The only class in the repository that knows both an abstract port and the concrete
// class behind it. That is the entire job, and it is why a swap is one line here.
export class Container {
  // Not configurable: the number that matters is how far behind a reader may fall before
  // a refetch is cheaper than the memory, and it is the same on every deployment.
  private static readonly REALTIME_QUEUE_SIZE = 256;

  // Two consecutive ticks before the first line, so a burst that drains is load rather
  // than an incident — and the pair has to fit inside the connect timeout, see below.
  private static readonly POOL_PROBE_TICKS = 2;
  // A quarter of the connect timeout, so `TICKS` of them is half of it. A fixed window
  // longer than that timeout could never fire — the caller is rejected before tick two.
  private static readonly POOL_PROBE_DIVISOR = 4;
  private static readonly POOL_PROBE_MIN_MS = 250;

  // Thirty minutes. A month of `activity_log` streamed to S3 is the only work in this
  // system that legitimately runs this long, and it holds one connection to do it.
  private static readonly DIRECT_STATEMENT_TIMEOUT_MS = 1_800_000;

  // ── infrastructure, private ───────────────────────────────
  private readonly database: Database;
  // The same server with no pooler in front, and a pool of one: it exists for DDL the
  // archive runs on a schedule, not for request traffic.
  private readonly directDatabase: Database;
  private readonly poolProbe: ReturnType<typeof setInterval>;
  private readonly poolProbeMs: number;
  // Consecutive ticks with somebody waiting. Reset the moment the queue clears, so the
  // `forMs` on the line is the length of *this* episode.
  private poolWaitingTicks = 0;
  private readonly redis: RedisConnection;
  private readonly queuePublisher: BullMqQueuePublisher;
  // Held concretely for the same reason as the two above: `dispose()` needs `close()`,
  // and `EmailSender` is a port that says nothing about a transport's lifetime.
  private readonly emailSender: SmtpEmailSender;
  private readonly transactions: TransactionScope;
  // Held so `health()` can ping it and `dispose()` can close it, without handing the
  // connection out.
  private readonly clickhouse: ClickHouseConnection | undefined;

  // ── shared primitives ─────────────────────────────────────
  public readonly clock: Clock;
  public readonly authorizer: Authorizer;
  public readonly logger: Logger;

  // ── ports, exposed as their abstract types ────────────────
  public readonly cache: CacheStore;
  public readonly storage: StorageGateway;
  public readonly queue: QueuePublisher;
  public readonly vectors: VectorStore;
  public readonly embeddings: EmbeddingProvider;
  public readonly activity: ActivityLogger;
  public readonly unitOfWork: UnitOfWork;
  public readonly content: ContentSource;
  // Built unconditionally: a missing analytics store means a feature is not deployed, a
  // missing mail transport means every sign-up is a dead end.
  public readonly email: EmailSender;
  // Public because Phase 3's notification subscriber holds one. The renderer stays
  // private: only `mail.send` below has any business calling it.
  public readonly mailPublisher: MailPublisher;
  private readonly mailRenderer: MailRenderer;
  // Public because every use-case that publishes takes one, and because the worker's
  // consumer holds the gateway and the registry directly.
  public readonly eventPublisher: DomainEventPublisher;
  public readonly outbox: OutboxGateway;
  public readonly realtime: RealtimePublisher;
  // Public because the web router holds it directly: a stream is the one thing a
  // procedure reads from a port rather than from a use-case.
  public readonly realtimeSubscriber: RealtimeSubscriber;
  public readonly subscribers: SubscriberRegistry;
  // No principal, because it owns no tenant's rows. Reachable only from the worker's
  // schedules, never from a request path.
  public readonly maintenance: MaintenanceGateway;
  // The one read in this system that is cross-tenant by definition: every per-tenant
  // loop the worker runs starts from it.
  public readonly organizations: OrganizationReader;
  public readonly partitionArchive: PartitionArchiveGateway;
  // Always built: replaying the audit trail is useful with or without a derived store
  // behind it, and a reconciliation against nothing is simply a count.
  public readonly activityReplay: ActivityReplayReader;

  // ── the derived stores, absent unless configured ─────────
  // Optional fields rather than no-op implementations: a null projector is
  // indistinguishable from a working pipeline until a quarterly report comes out wrong.
  private readonly analyticsProjector: AnalyticsProjector | undefined;
  private readonly logReader: LogReader | undefined;

  // ── auth, absent in a process that never authenticates ────
  private readonly authInstance: AuthInstance | undefined;
  private readonly sessionResolver: SessionResolver | undefined;
  private readonly principalBuilder: PrincipalBuilder | undefined;
  public readonly capabilities: CapabilityCache;
  // Which organization is the tier. Read by the capability cache on every RBAC
  // write, and by every platform use-case that records an audit row.
  public readonly platform: PlatformReader;

  // ── membership, built in every process ────────────────────
  // The worker reads none, and building them there costs nothing: none opens a
  // connection until called.
  public readonly memberships: MembershipReader;
  public readonly invitationClaimer: InvitationClaimer;
  public readonly organizationFounder: OrganizationFounder;

  // ── use-cases, one field each, constructed eagerly ────────
  // Grouped by slice so a consumer reads `container.ai.indexDocument`. See
  // docs/reference/container.md.
  public readonly ai: {
    readonly indexDocument: IndexDocumentUseCase;
    readonly queueIndex: QueueDocumentIndexUseCase;
    readonly searchDocuments: SearchDocumentsUseCase;
  };
  // Outside the `auth` block on purpose. The worker is the process that sends mail and it
  // has no auth config — which is exactly what building the old mailer in there got wrong.
  public readonly mail: { readonly send: SendMailUseCase };
  // In every process: the worker delivers and digests, the web tier reads. Neither
  // half needs an auth config, which is why this sits outside that branch too.
  public readonly notification: {
    readonly list: ListNotificationsUseCase;
    readonly countUnread: CountUnreadNotificationsUseCase;
    readonly markRead: MarkNotificationReadUseCase;
    readonly markAllRead: MarkAllNotificationsReadUseCase;
    readonly preferences: GetNotificationPreferencesUseCase;
    readonly updatePreference: UpdateNotificationPreferenceUseCase;
    readonly deliver: DeliverNotificationUseCase;
    readonly sendDigest: SendNotificationDigestUseCase;
    readonly digestOrganizations: ListDigestOrganizationsUseCase;
  };
  public readonly messaging: {
    readonly listConversations: ListConversationsUseCase;
    readonly getConversation: GetConversationUseCase;
    readonly createConversation: CreateConversationUseCase;
    readonly addMember: AddConversationMemberUseCase;
    readonly removeMember: RemoveConversationMemberUseCase;
    readonly leave: LeaveConversationUseCase;
    readonly rename: RenameConversationUseCase;
    readonly markRead: MarkConversationReadUseCase;
    readonly listMessages: ListMessagesUseCase;
    readonly send: SendMessageUseCase;
    readonly edit: EditMessageUseCase;
    readonly remove: DeleteMessageUseCase;
    readonly typing: SignalTypingUseCase;
  };
  // Inside `auth`'s block below, because a key is issued *by* someone: without an auth
  // config there is no principal to be the issuer.
  private readonly apiKeyUseCases: ApiKeyUseCases | undefined;
  // Named `platformAdmin` rather than `platform`, which is the reader beside it: one is
  // "which organization is the tier" and the other is what an admin may do to it.
  public readonly platformAdmin: {
    readonly deleteOrganization: DeleteOrganizationUseCase;
    readonly exportOrganization: ExportOrganizationUseCase;
    readonly listExports: ListTenantExportsUseCase;
    readonly inspectStatus: InspectPlatformStatusUseCase;
    readonly getPolicy: GetPlatformPolicyUseCase;
    readonly listGaps: ListProjectionGapsUseCase;
    readonly listProjection: ListProjectionPoliciesUseCase;
    readonly listRetention: ListRetentionPoliciesUseCase;
    readonly listStorage: ListTenantStorageUseCase;
    readonly previewRetention: PreviewRetentionChangeUseCase;
    readonly restorePartition: RestorePartitionUseCase;
    readonly updateTenantRetention: UpdateTenantRetentionUseCase;
    readonly reprojectPartition: ReprojectPartitionUseCase;
    readonly toggleProjection: ToggleProjectionUseCase;
    readonly updateProjection: UpdateProjectionPolicyUseCase;
    readonly updateRetention: UpdateRetentionPolicyUseCase;
  };
  // Bucket-shaped policy, beside the object-shaped `storage`. The retention screen and
  // the worker's daily reconcile are its only two readers.
  public readonly storagePolicy: StoragePolicyGateway;
  // Cold storage read back. Whole-object and verified, which is what makes a restore
  // and a re-projection read the same bytes the archive wrote.
  public readonly coldArchive: ColdArchiveReader;
  // Read once per analytics run and once per retention run. Usually empty: an absent
  // row is "projected, with the default TTL".
  public readonly projectionPolicies: ProjectionPolicyRepository;
  // One row, read at the top of every analytics job. An absent row is the defaults,
  // so a deployment that never opens the screen behaves as it always did.
  public readonly platformPolicy: PlatformPolicyRepository;
  // Read by the prune pass once per run, and by the screen. An absent row is the code
  // default, so this is never the only source of a number.
  public readonly retentionPolicies: RetentionPolicyRepository;
  // Read once per table by the prune pass, and usually empty: an override is what
  // makes that pass walk tenants rather than months.
  public readonly tenantRetentionPolicies: TenantRetentionPolicyRepository;
  public readonly rbac: {
    readonly listRoles: ListRolesUseCase;
    readonly inspectEffective: InspectEffectivePermissionsUseCase;
    readonly createRole: CreateRoleUseCase;
    readonly updateRole: UpdateRoleUseCase;
    readonly deleteRole: DeleteRoleUseCase;
    readonly grantPermission: GrantPermissionUseCase;
    readonly revokePermission: RevokePermissionUseCase;
  };
  // Only with an auth config: the invitation mail needs `auth.baseUrl` for its link,
  // and the process without one is the worker, which never invites.
  private readonly memberUseCases: MemberUseCases | undefined;

  public constructor(config: ContainerConfig) {
    // First, and now genuinely first: the pool below hands it a listener, and a pool
    // error arriving with nowhere to go is an `uncaughtException` that ends the process.
    this.logger = new JsonLogger({
      level: config.logging.level,
      pretty: config.logging.pretty,
      bound: { app: config.logging.app, env: config.logging.env },
    });

    this.database = new Database({
      url: config.database.url,
      maxConnections: config.database.poolMax,
      statementTimeoutMs: config.database.statementTimeoutMs,
      idleTimeoutMs: config.database.poolIdleTimeoutMs,
      connectionTimeoutMs: config.database.poolConnectTimeoutMs,
      // The log label, so `pg_stat_activity` names the process holding a connection.
      applicationName: config.logging.app,
      onError: (error) => this.logger.emit("database.pool.error", { message: error.message }),
    });

    // One connection, and a budget the role floor does not cap: this handle exists for a
    // detach-and-stream that runs monthly and legitimately takes minutes.
    this.directDatabase = new Database({
      url: config.database.directUrl ?? config.database.url,
      maxConnections: 1,
      statementTimeoutMs: Container.DIRECT_STATEMENT_TIMEOUT_MS,
      applicationName: `${config.logging.app}-direct`,
      onError: (error) => this.logger.emit("database.pool.error", { message: error.message }),
    });

    // Unreferenced, so a script that builds a container and finishes is not held open by
    // a timer nobody is reading.
    this.poolProbeMs = Container.probeIntervalFor(config.database.poolConnectTimeoutMs);
    this.poolProbe = setInterval(() => this.probePool(), this.poolProbeMs);
    this.poolProbe.unref();
    this.redis = new RedisConnection({
      cacheUrl: config.redis.cacheUrl,
      queueUrl: config.redis.queueUrl,
    });
    this.transactions = new TransactionScope();

    this.clock = new SystemClock();
    this.authorizer = new Authorizer();

    this.cache = new RedisCacheStore(this.redis.client(), this.logger);
    this.storage = new S3StorageGateway(config.storage);
    this.storagePolicy = new S3StoragePolicyGateway(config.storage);
    this.coldArchive = new S3ColdArchiveReader(this.storage);
    this.queuePublisher = new BullMqQueuePublisher(this.redis.queueClient());
    this.queue = this.queuePublisher;
    this.unitOfWork = new PgUnitOfWork(this.database, this.transactions, {
      statementTimeoutMs: config.database.statementTimeoutMs,
    });
    this.maintenance = new PgMaintenanceGateway(this.database, this.transactions, this.unitOfWork);
    this.organizations = new PgOrganizationReader(this.database, this.transactions);

    // ── the swap points ──
    // Each reads a `driver` rather than naming a class: the alternative is named in a
    // switch a compiler checks, not in a document.
    this.vectors = Container.buildVectorStore(config, this.database, this.transactions);
    this.embeddings = new OpenAiEmbeddingProvider(config.embedding, this.logger);

    // Opt-in and stopped by default. Building the connection only when configured is
    // what keeps the seam honest rather than aspirational.
    this.clickhouse = config.analytics.clickhouse
      ? new ClickHouseConnection(config.analytics.clickhouse, this.logger)
      : undefined;

    // The projector follows the connection and nothing else. There is no read driver to
    // flip: the store is written and reconciled, and no feature reads it yet.
    this.analyticsProjector = this.clickhouse
      ? new ClickHouseAnalyticsProjector(this.clickhouse)
      : undefined;

    // Its absence changes nothing about what is written: `JsonLogger` goes to stdout
    // either way.
    this.logReader = config.logs ? new LokiLogReader(config.logs, this.logger) : undefined;

    // The only catalog carrying the `email` namespace the worker's digests read. A
    // client bundle cannot reach it.
    this.content = new StaticContentSource(SERVER_CATALOG);
    this.emailSender = new SmtpEmailSender(config.email, this.logger);
    this.email = this.emailSender;
    this.mailPublisher = new QueuedMailPublisher(this.queue, this.logger);
    this.mailRenderer = new ContentMailRenderer(this.content);
    this.mail = { send: new SendMailUseCase(this.mailRenderer, this.email) };

    const capabilityRepository = new PgCapabilityRepository(this.database, this.transactions);
    this.platform = new PgPlatformReader(this.database, this.transactions);
    this.capabilities = new CapabilityCache(capabilityRepository, this.cache, this.platform);

    // Shares the transaction scope, which is what makes the audit row commit with the
    // state change rather than beside it.
    this.activity = new PgActivityLogger(this.database, this.transactions, this.clock);
    this.eventPublisher = new PgOutboxPublisher(this.database, this.transactions, this.clock);
    this.outbox = new PgOutboxGateway(this.database, this.transactions, this.unitOfWork);
    this.realtime = new RedisRealtimePublisher(this.redis.client(), this.logger);
    // The role is resolved on the first `subscribe`, not here, so the worker never holds
    // one — which is what makes `health().realtime` honestly `null`.
    this.realtimeSubscriber = new RedisRealtimeSubscriber(() => this.redis.subscriberClient(), {
      maxStreamsPerUser: config.realtime.maxStreamsPerUser,
      maxAgeMs: config.realtime.streamMaxAgeSeconds * 1_000,
      queueSize: Container.REALTIME_QUEUE_SIZE,
    });

    const notifications = new PgNotificationRepository(this.database, this.transactions);
    const notificationPreferences = new PgNotificationPreferenceRepository(
      this.database,
      this.transactions,
    );
    const notificationRecipients = new PgNotificationRecipientReader(
      this.database,
      this.transactions,
    );

    this.notification = {
      list: new ListNotificationsUseCase(this.authorizer, notifications),
      countUnread: new CountUnreadNotificationsUseCase(this.authorizer, notifications, this.cache),
      markRead: new MarkNotificationReadUseCase(
        this.authorizer,
        notifications,
        this.cache,
        this.clock,
      ),
      markAllRead: new MarkAllNotificationsReadUseCase(
        this.authorizer,
        notifications,
        this.cache,
        this.clock,
      ),
      preferences: new GetNotificationPreferencesUseCase(this.authorizer, notificationPreferences),
      updatePreference: new UpdateNotificationPreferenceUseCase(
        this.authorizer,
        notificationPreferences,
      ),
      deliver: new DeliverNotificationUseCase(
        notifications,
        notificationPreferences,
        notificationRecipients,
        this.mailPublisher,
        this.realtime,
        this.cache,
      ),
      sendDigest: new SendNotificationDigestUseCase(
        notifications,
        notificationPreferences,
        notificationRecipients,
        this.mailPublisher,
      ),
      digestOrganizations: new ListDigestOrganizationsUseCase(notificationPreferences),
    };

    const conversations = new PgConversationRepository(this.database, this.transactions);
    const messages = new PgMessageRepository(this.database, this.transactions);
    // One instance, shared: the membership check is the same question every messaging
    // use-case asks, and a second copy is a second place for it to drift.
    const conversationAccess = new ConversationAccess(conversations);

    this.messaging = {
      listConversations: new ListConversationsUseCase(this.authorizer, conversations, messages),
      getConversation: new GetConversationUseCase(this.authorizer, conversationAccess, messages),
      createConversation: new CreateConversationUseCase(
        this.authorizer,
        conversations,
        this.eventPublisher,
        this.unitOfWork,
      ),
      addMember: new AddConversationMemberUseCase(
        this.authorizer,
        conversationAccess,
        conversations,
        this.eventPublisher,
      ),
      removeMember: new RemoveConversationMemberUseCase(
        this.authorizer,
        conversationAccess,
        conversations,
        this.eventPublisher,
      ),
      leave: new LeaveConversationUseCase(
        this.authorizer,
        conversationAccess,
        conversations,
        this.eventPublisher,
      ),
      rename: new RenameConversationUseCase(
        this.authorizer,
        conversationAccess,
        conversations,
        this.eventPublisher,
      ),
      markRead: new MarkConversationReadUseCase(
        this.authorizer,
        conversationAccess,
        conversations,
        this.realtime,
      ),
      listMessages: new ListMessagesUseCase(this.authorizer, conversationAccess, messages),
      send: new SendMessageUseCase(
        this.authorizer,
        conversationAccess,
        conversations,
        messages,
        this.eventPublisher,
        this.realtime,
        this.unitOfWork,
        this.cache,
        this.clock,
      ),
      edit: new EditMessageUseCase(
        this.authorizer,
        conversationAccess,
        messages,
        this.eventPublisher,
        this.clock,
      ),
      remove: new DeleteMessageUseCase(
        this.authorizer,
        conversationAccess,
        messages,
        this.eventPublisher,
        this.clock,
      ),
      typing: new SignalTypingUseCase(
        this.authorizer,
        conversationAccess,
        this.realtime,
        this.cache,
      ),
    };

    // A frozen list, and the registry rejects a duplicate name or an unknown event at
    // construction — so a wiring mistake is a startup crash rather than a lost event.
    this.subscribers = new SubscriberRegistry([
      new MemberRealtimeSubscriber(this.realtime),
      new NotificationSubscriber(this.notification.deliver),
      new MessagingRealtimeSubscriber(this.realtime, conversations),
    ]);

    // Where `infrastructure`'s adapters bind to the ports `auth` declares. The binding
    // is structural, so these lines are where a signature drift is caught.
    this.memberships = new PgMembershipReader(this.database, this.transactions);
    this.organizationFounder = new PgOrganizationFounder(
      this.database,
      this.transactions,
      this.activity,
    );
    this.invitationClaimer = new PgInvitationClaimer(
      this.database,
      this.transactions,
      this.activity,
      this.eventPublisher,
    );

    // One instance each: they hold no state beyond the pool and the scope, so a second
    // copy would be a second name.
    const roles = new PgRoleRepository(this.database, this.transactions);
    const members = new PgMemberRepository(this.database, this.transactions);
    const invitations = new PgInvitationRepository(this.database, this.transactions);

    // Skipped when `config.auth` is absent: `apps/worker` builds a `SystemPrincipal`
    // from a named grant list and never resolves a credential.
    if (config.auth) {
      // The only thing that writes the first `memberships` row, and the only line that
      // knows which mode is bound. See docs/reference/container.md.
      const membershipEnroller: MembershipEnroller = Container.enroller(
        config.auth.enrolmentMode,
        config.auth.bootstrapOrganizationSlug,
        this.database,
        this.transactions,
        this.organizationFounder,
        this.invitationClaimer,
      );

      this.authInstance = AuthFactory.create(
        config.auth,
        this.database,
        this.cache,
        this.memberships,
        membershipEnroller,
        // Copy and transport joined here and nowhere else: `auth` owes no words and
        // `content` owes no transport.
        new QueuedAuthMailer(this.mailPublisher),
        this.invitationClaimer,
        this.organizationFounder,
      );
      this.sessionResolver = new BetterAuthSessionResolver(this.authInstance);

      const apiKeyRepository = new PgApiKeyRepository(this.database, this.transactions);
      const apiKeyResolver = new ApiKeyResolver(apiKeyRepository, this.capabilities);

      this.apiKeyUseCases = {
        listApiKeys: new ListApiKeysUseCase(this.authorizer, apiKeyRepository),
        createApiKey: new CreateApiKeyUseCase(
          this.authorizer,
          apiKeyRepository,
          this.activity,
          this.unitOfWork,
          this.clock,
        ),
        revokeApiKey: new RevokeApiKeyUseCase(
          this.authorizer,
          apiKeyRepository,
          this.activity,
          this.unitOfWork,
          this.clock,
        ),
      };
      this.principalBuilder = new PrincipalBuilder(
        this.sessionResolver,
        apiKeyResolver,
        this.capabilities,
        this.memberships,
      );

      // Inside the auth block because the mail's link is `auth.baseUrl`. The use-cases
      // hand a token to a port and know nothing about it.
      this.memberUseCases = {
        listMembers: new ListMembersUseCase(this.authorizer, members),
        listInvitations: new ListInvitationsUseCase(this.authorizer, invitations),
        inviteMember: new InviteMemberUseCase(
          this.authorizer,
          roles,
          members,
          invitations,
          new QueuedInvitationMailer(this.mailPublisher, config.email.baseUrl),
          this.activity,
          this.eventPublisher,
          this.unitOfWork,
          this.clock,
        ),
        revokeInvitation: new RevokeInvitationUseCase(
          this.authorizer,
          invitations,
          this.activity,
          this.unitOfWork,
        ),
        changeMemberRole: new ChangeMemberRoleUseCase(
          this.authorizer,
          members,
          roles,
          this.capabilities,
          this.activity,
          this.eventPublisher,
          this.unitOfWork,
        ),
        setMemberActive: new SetMemberActiveUseCase(
          this.authorizer,
          members,
          this.activity,
          this.unitOfWork,
          this.clock,
        ),
      };
    }

    // The *direct* pool, not the shared one: a month-sized detach and stream needs a
    // budget the 30 s role floor will not give it. See docs/infra/reference/pgbouncer.md.
    this.partitionArchive = new PgPartitionArchiveGateway(
      this.directDatabase,
      this.transactions,
      this.storage,
    );

    this.activityReplay = new PgActivityReplayReader(this.database, this.transactions);

    // `this` is fully assigned by here, and `report()` is only ever called on a
    // request — the reader holds the container, it does not read it during the build.
    this.projectionPolicies = new PgProjectionPolicyRepository(this.database, this.transactions);
    this.platformPolicy = new PgPlatformPolicyRepository(this.database, this.transactions);
    this.retentionPolicies = new PgRetentionPolicyRepository(this.database, this.transactions);
    this.tenantRetentionPolicies = new PgTenantRetentionPolicyRepository(
      this.database,
      this.transactions,
    );

    this.platformAdmin = {
      // The projector is optional here for the reason it is on `listRetention`: with no
      // analytics store there is no derived copy of the tenant to forget.
      deleteOrganization: new DeleteOrganizationUseCase(
        this.authorizer,
        new PgTenantRepository(this.database, this.transactions),
        this.partitionArchive,
        this.maintenance,
        this.capabilities,
        this.platform,
        this.activity,
        this.unitOfWork,
        this.clock,
        this.analyticsProjector ?? null,
      ),
      exportOrganization: new ExportOrganizationUseCase(
        this.authorizer,
        new PgTenantRepository(this.database, this.transactions),
        this.queuePublisher,
        this.platform,
        this.activity,
        this.clock,
      ),
      listExports: new ListTenantExportsUseCase(this.authorizer, this.storage),
      inspectStatus: new InspectPlatformStatusUseCase(
        this.authorizer,
        this.platform,
        new ContainerHealthReader(this),
      ),
      getPolicy: new GetPlatformPolicyUseCase(
        this.authorizer,
        this.platformPolicy,
        new ContainerHealthReader(this),
      ),
      listGaps: new ListProjectionGapsUseCase(this.authorizer, this.partitionArchive),
      listProjection: new ListProjectionPoliciesUseCase(
        this.authorizer,
        this.projectionPolicies,
        this.retentionPolicies,
        this.analyticsProjector ?? null,
      ),
      reprojectPartition: new ReprojectPartitionUseCase(
        this.authorizer,
        this.partitionArchive,
        this.queuePublisher,
        new ContainerHealthReader(this),
        this.platform,
        this.activity,
      ),
      toggleProjection: new ToggleProjectionUseCase(
        this.authorizer,
        this.platformPolicy,
        new ContainerHealthReader(this),
        this.platform,
        this.activity,
        this.unitOfWork,
      ),
      updateProjection: new UpdateProjectionPolicyUseCase(
        this.authorizer,
        this.projectionPolicies,
        this.retentionPolicies,
        this.platform,
        this.activity,
        this.unitOfWork,
        this.analyticsProjector ?? null,
        (error: unknown) => this.logger.failure(error, { at: "projection.apply" }),
      ),
      listRetention: new ListRetentionPoliciesUseCase(
        this.authorizer,
        this.retentionPolicies,
        this.storagePolicy,
        this.analyticsProjector ?? null,
      ),
      // Local rather than a field: nothing outside this use-case reads it, and a
      // public port is a thing the worker has to be told not to use.
      listStorage: new ListTenantStorageUseCase(
        this.authorizer,
        new PgTenantStorageReader(this.database, this.transactions),
      ),
      previewRetention: new PreviewRetentionChangeUseCase(
        this.authorizer,
        this.maintenance,
        this.clock,
      ),
      restorePartition: new RestorePartitionUseCase(
        this.authorizer,
        this.partitionArchive,
        this.queuePublisher,
        this.platform,
        this.activity,
      ),
      updateTenantRetention: new UpdateTenantRetentionUseCase(
        this.authorizer,
        this.tenantRetentionPolicies,
        this.platform,
        this.activity,
        this.unitOfWork,
      ),
      updateRetention: new UpdateRetentionPolicyUseCase(
        this.authorizer,
        this.retentionPolicies,
        this.storagePolicy,
        this.platform,
        this.activity,
        this.unitOfWork,
        this.analyticsProjector ?? null,
        // Logged, never rethrown: the row is the truth and the daily job closes the
        // gap, so a bucket that was unreachable must not fail a save that committed.
        (error: unknown) => this.logger.failure(error, { at: "retention.apply" }),
      ),
    };

    this.rbac = {
      listRoles: new ListRolesUseCase(this.authorizer, roles),
      // The same repository `CapabilityCache` reads, deliberately un-cached: an
      // inspector showing a stale answer is worse than one that costs a query.
      inspectEffective: new InspectEffectivePermissionsUseCase(
        this.authorizer,
        members,
        capabilityRepository,
      ),
      createRole: new CreateRoleUseCase(this.authorizer, roles, this.activity, this.unitOfWork),
      updateRole: new UpdateRoleUseCase(this.authorizer, roles, this.activity, this.unitOfWork),
      deleteRole: new DeleteRoleUseCase(this.authorizer, roles, this.activity, this.unitOfWork),
      // `CapabilityCache` bound to the `CapabilityInvalidator` port: the domain states
      // that a grant must flush, and this line is the only one that knows what to.
      grantPermission: new GrantPermissionUseCase(
        this.authorizer,
        roles,
        this.capabilities,
        this.activity,
        this.unitOfWork,
      ),
      revokePermission: new RevokePermissionUseCase(
        this.authorizer,
        roles,
        this.capabilities,
        this.activity,
        this.unitOfWork,
      ),
    };

    this.ai = {
      // Run by the worker's consumer, off the queue the two below feed.
      indexDocument: new IndexDocumentUseCase(
        this.authorizer,
        this.embeddings,
        this.vectors,
        this.activity,
        this.unitOfWork,
      ),
      queueIndex: new QueueDocumentIndexUseCase(this.authorizer, this.queuePublisher),
      searchDocuments: new SearchDocumentsUseCase(
        this.authorizer,
        this.embeddings,
        this.vectors,
        this.activity,
      ),
    };
  }

  // Three modes, each wrapped so an invited address joins the organization that invited
  // it before the mode is consulted. See docs/reference/container.md.
  private static enroller(
    mode: "personal" | "bootstrap" | "invite",
    bootstrapOrganizationSlug: string | undefined,
    database: Database,
    transactions: TransactionScope,
    // The port, not `PgOrganizationFounder`: the personal enroller declares the same
    // shape structurally, which is what lets this stay the one place a class is named.
    founder: OrganizationFounder,
    claimer: InvitationClaimer,
  ): MembershipEnroller {
    const inner = ((): MembershipEnroller => {
      switch (mode) {
        case "personal":
          return new PgPersonalOrganizationEnroller(database, transactions, founder);
        case "bootstrap":
          return new PgBootstrapMembershipEnroller(
            database,
            transactions,
            bootstrapOrganizationSlug,
          );
        case "invite":
          return new NullMembershipEnroller();
      }
    })();

    return new InvitationClaimingEnroller(claimer, inner);
  }

  // Getters rather than optional fields, so a process that skipped auth fails loudly at
  // the call site rather than silently.
  public get auth(): AuthInstance {
    if (!this.authInstance) throw new Error("This container was built without an auth config.");
    return this.authInstance;
  }

  public get apiKey(): ApiKeyUseCases {
    if (!this.apiKeyUseCases) {
      throw new Error("This container was built without an auth config.");
    }
    return this.apiKeyUseCases;
  }

  public get member(): MemberUseCases {
    if (!this.memberUseCases) {
      throw new Error("This container was built without an auth config.");
    }
    return this.memberUseCases;
  }

  public get sessions(): SessionResolver {
    if (!this.sessionResolver) {
      throw new Error("This container was built without an auth config.");
    }
    return this.sessionResolver;
  }

  public get principals(): PrincipalBuilder {
    if (!this.principalBuilder) {
      throw new Error("This container was built without an auth config.");
    }
    return this.principalBuilder;
  }

  // A getter, so a process reaching it without ClickHouse configured fails with a
  // sentence rather than at the first insert with a `TypeError`.
  public get projector(): AnalyticsProjector {
    if (!this.analyticsProjector) {
      throw new Error("This container was built without an analytics.clickhouse config.");
    }
    return this.analyticsProjector;
  }

  // What the worker branches on: registering a projection consumer against a store that
  // is not running is the failure this prevents.
  public get hasProjector(): boolean {
    return this.analyticsProjector !== undefined;
  }

  public get logs(): LogReader {
    if (!this.logReader) throw new Error("This container was built without a logs config.");
    return this.logReader;
  }

  public get hasLogs(): boolean {
    return this.logReader !== undefined;
  }

  // Postgres and both Redis instances, as a breakdown rather than one boolean: the body
  // of a failing probe is what an operator reads. See docs/reference/container.md.
  public async health(): Promise<HealthReport> {
    const [database, cache, queue, analytics, realtime] = await Promise.all([
      this.database.isHealthy(),
      this.redis.healthy("cache"),
      this.redis.healthy("queue"),
      // `null` rather than `true` when absent: it is not healthy and not degraded, it
      // is not running one. Loki is absent from this list on purpose.
      this.clickhouse ? this.clickhouse.healthy() : Promise.resolve(null),
      // Asked only of a connection that exists. `healthy()` would create one, and a
      // worker reporting on a subscriber it opened to answer this is reporting on itself.
      this.redis.opened("subscriber") ? this.redis.healthy("subscriber") : Promise.resolve(null),
    ]);

    return {
      healthy: database && cache && queue && analytics !== false && realtime !== false,
      database,
      cache,
      queue,
      analytics,
      realtime,
      // Not part of `healthy`: a saturated pool is a load signal, not a broken
      // dependency, and a health check that fails under load takes the process out.
      pool: this.database.stats(),
    };
  }

  // One line per episode, not per tick: the counter keeps climbing while the queue stays
  // non-empty, and `forMs` is what says whether this is a spike or a ceiling.
  private probePool(): void {
    const pool = this.database.stats();

    if (pool.waiting === 0) {
      this.poolWaitingTicks = 0;
      return;
    }

    this.poolWaitingTicks += 1;
    if (this.poolWaitingTicks < Container.POOL_PROBE_TICKS) return;

    this.logger.emit("database.pool.saturated", {
      waiting: pool.waiting,
      total: pool.total,
      max: pool.max,
      forMs: this.poolWaitingTicks * this.poolProbeMs,
    });
  }

  // `Database`'s own default when the config omits one, because the two numbers have to
  // agree: a probe slower than the connect timeout watches a queue that is never there.
  private static probeIntervalFor(connectTimeoutMs: number | undefined): number {
    const timeout = connectTimeoutMs ?? 5_000;
    return Math.max(
      Container.POOL_PROBE_MIN_MS,
      Math.floor(timeout / Container.POOL_PROBE_DIVISOR),
    );
  }

  // Reverse construction order: closing Redis while BullMQ holds blocking connections
  // hangs on shutdown, and it is a deadlock.
  public async dispose(): Promise<void> {
    clearInterval(this.poolProbe);
    await this.queuePublisher.close();
    await this.redis.close();
    await this.clickhouse?.close();
    // Before Postgres only because nothing else depends on it: an unclosed transport is
    // its own reason to be here, not a step in the ordering above.
    await this.emailSender.close();
    await this.database.close();
    await this.directDatabase.close();
  }

  // A static, so adopting a dedicated vector store is a `case` the compiler checks. The
  // swap is cheap because `search()` takes the resolved goal scope as a parameter.
  private static buildVectorStore(
    config: ContainerConfig,
    database: Database,
    transactions: TransactionScope,
  ): VectorStore {
    switch (config.vector.driver) {
      case "pgvector":
        return new PgVectorStore(database, transactions);
      default: {
        // Exhaustiveness at build time: a driver added to the union and not here is a
        // compile error rather than a runtime surprise.
        const unreachable: never = config.vector.driver;
        throw new Error(`Unknown vector driver: ${String(unreachable)}`);
      }
    }
  }
}
