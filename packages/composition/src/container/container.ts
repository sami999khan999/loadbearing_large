import {
  type ActivityArchiveGateway,
  type ActivityLogger,
  type ActivityReplayReader,
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
  type ContentSource,
  CountUnreadNotificationsUseCase,
  CreateApiKeyUseCase,
  CreateRoleUseCase,
  Database,
  DeleteRoleUseCase,
  DeliverNotificationUseCase,
  type DomainEventPublisher,
  type EmailSender,
  type EmbeddingProvider,
  GetNotificationPreferencesUseCase,
  GrantPermissionUseCase,
  IndexDocumentUseCase,
  InspectEffectivePermissionsUseCase,
  type InvitationClaimer,
  InvitationClaimingEnroller,
  InviteMemberUseCase,
  JsonLogger,
  ListApiKeysUseCase,
  ListDigestOrganizationsUseCase,
  ListInvitationsUseCase,
  ListMembersUseCase,
  ListNotificationsUseCase,
  ListRolesUseCase,
  type Logger,
  type LogReader,
  LokiLogReader,
  type MailPublisher,
  type MailRenderer,
  type MaintenanceGateway,
  MarkAllNotificationsReadUseCase,
  MarkNotificationReadUseCase,
  MemberRealtimeSubscriber,
  type MembershipEnroller,
  type MembershipReader,
  NotificationSubscriber,
  NullMembershipEnroller,
  OpenAiEmbeddingProvider,
  type OrganizationFounder,
  type OutboxGateway,
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
  PrincipalBuilder,
  QueueDocumentIndexUseCase,
  type QueuePublisher,
  type RealtimePublisher,
  type RealtimeSubscriber,
  RedisCacheStore,
  RedisConnection,
  RedisRealtimePublisher,
  RedisRealtimeSubscriber,
  RevokeApiKeyUseCase,
  RevokeInvitationUseCase,
  RevokePermissionUseCase,
  S3StorageGateway,
  SERVER_CATALOG,
  SearchDocumentsUseCase,
  SendMailUseCase,
  SendNotificationDigestUseCase,
  type SessionResolver,
  SetMemberActiveUseCase,
  SmtpEmailSender,
  StaticContentSource,
  type StorageGateway,
  SubscriberRegistry,
  SystemClock,
  TransactionScope,
  type UnitOfWork,
  UpdateNotificationPreferenceUseCase,
  UpdateRoleUseCase,
  type VectorStore,
} from "../import.js";
import {
  ContentMailRenderer,
  QueuedAuthMailer,
  QueuedInvitationMailer,
  QueuedMailPublisher,
} from "../mail/index.js";
import type { ContainerConfig } from "./container.config.js";

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
}

// The only class in the repository that knows both an abstract port and the concrete
// class behind it. That is the entire job, and it is why a swap is one line here.
export class Container {
  // Not configurable: the number that matters is how far behind a reader may fall before
  // a refetch is cheaper than the memory, and it is the same on every deployment.
  private static readonly REALTIME_QUEUE_SIZE = 256;

  // ── infrastructure, private ───────────────────────────────
  private readonly database: Database;
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
  public readonly activityArchive: ActivityArchiveGateway;
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
  // Inside `auth`'s block below, because a key is issued *by* someone: without an auth
  // config there is no principal to be the issuer.
  private readonly apiKeyUseCases: ApiKeyUseCases | undefined;
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
    this.database = new Database(config.database);
    this.redis = new RedisConnection({
      cacheUrl: config.redis.cacheUrl,
      queueUrl: config.redis.queueUrl,
    });
    this.transactions = new TransactionScope();

    // First, so a failure in anything below it has somewhere to be recorded. `app` and
    // `env` are bound because they belong on every line.
    this.logger = new JsonLogger({
      level: config.logging.level,
      pretty: config.logging.pretty,
      bound: { app: config.logging.app, env: config.logging.env },
    });

    this.clock = new SystemClock();
    this.authorizer = new Authorizer();

    this.cache = new RedisCacheStore(this.redis.client(), this.logger);
    this.storage = new S3StorageGateway(config.storage);
    this.queuePublisher = new BullMqQueuePublisher(this.redis.queueClient());
    this.queue = this.queuePublisher;
    this.unitOfWork = new PgUnitOfWork(this.database, this.transactions);
    this.maintenance = new PgMaintenanceGateway(this.database, this.transactions);

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
    this.capabilities = new CapabilityCache(capabilityRepository, this.cache);

    // Shares the transaction scope, which is what makes the audit row commit with the
    // state change rather than beside it.
    this.activity = new PgActivityLogger(this.database, this.transactions, this.clock);
    this.eventPublisher = new PgOutboxPublisher(this.database, this.transactions, this.clock);
    this.outbox = new PgOutboxGateway(this.database, this.transactions, this.unitOfWork);
    this.realtime = new RedisRealtimePublisher(this.redis.client(), this.logger);
    // The connection behind it is opened on the first `subscribe`, not here, so the
    // worker never holds one — which is what makes `health().realtime` honestly `null`.
    this.realtimeSubscriber = new RedisRealtimeSubscriber(this.redis.subscriberClient(), {
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

    // A frozen list, and the registry rejects a duplicate name or an unknown event at
    // construction — so a wiring mistake is a startup crash rather than a lost event.
    this.subscribers = new SubscriberRegistry([
      new MemberRealtimeSubscriber(this.realtime),
      new NotificationSubscriber(this.notification.deliver),
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

    // Takes the storage gateway: archiving a partition is a database read and an object
    // write in one operation.
    this.activityArchive = new PgActivityArchiveGateway(
      this.database,
      this.transactions,
      this.storage,
    );

    this.activityReplay = new PgActivityReplayReader(this.database, this.transactions);

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
    };
  }

  // Reverse construction order: closing Redis while BullMQ holds blocking connections
  // hangs on shutdown, and it is a deadlock.
  public async dispose(): Promise<void> {
    await this.queuePublisher.close();
    await this.redis.close();
    await this.clickhouse?.close();
    // Before Postgres only because nothing else depends on it: an unclosed transport is
    // its own reason to be here, not a step in the ordering above.
    await this.emailSender.close();
    await this.database.close();
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
