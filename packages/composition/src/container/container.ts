import {
  type ActivityArchiveGateway,
  type ActivityLogger,
  type ActivityReplayReader,
  type AnalyticsProjector,
  type AnalyticsReader,
  ApiKeyResolver,
  AuthFactory,
  type AuthInstance,
  Authorizer,
  BetterAuthSessionResolver,
  BullMqQueuePublisher,
  type CacheStore,
  CapabilityCache,
  ClickHouseAnalyticsProjector,
  ClickHouseAnalyticsReader,
  ClickHouseConnection,
  type Clock,
  type ContentSource,
  Database,
  type EmailSender,
  type EmbeddingProvider,
  IndexDocumentUseCase,
  type InvitationClaimer,
  InvitationClaimingEnroller,
  InviteMemberUseCase,
  JsonLogger,
  ListInvitationsUseCase,
  ListMembersUseCase,
  ListRolesUseCase,
  type Logger,
  type LogReader,
  LokiLogReader,
  type MaintenanceGateway,
  type MembershipEnroller,
  type MembershipReader,
  NullMembershipEnroller,
  OpenAiEmbeddingProvider,
  type OrganizationFounder,
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
  PrincipalBuilder,
  type QueuePublisher,
  RedisCacheStore,
  RedisConnection,
  RevokeInvitationUseCase,
  S3StorageGateway,
  SERVER_CATALOG,
  type SessionResolver,
  SmtpEmailSender,
  StaticContentSource,
  type StorageGateway,
  SystemClock,
  TransactionScope,
  type UnitOfWork,
  type VectorStore,
} from "../import.js";
import { ContentAuthMailer, ContentInvitationMailer } from "../mail/index.js";
import type { ContainerConfig } from "./container.config.js";

// The member slice's use-cases. Named so the getter can say what is absent rather than
// handing out `undefined`.
export interface MemberUseCases {
  readonly listMembers: ListMembersUseCase;
  readonly listInvitations: ListInvitationsUseCase;
  readonly inviteMember: InviteMemberUseCase;
  readonly revokeInvitation: RevokeInvitationUseCase;
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
}

// The only class in the repository that knows both an abstract port and the concrete
// class behind it. That is the entire job, and it is why a swap is one line here.
export class Container {
  // ── infrastructure, private ───────────────────────────────
  private readonly database: Database;
  private readonly redis: RedisConnection;
  private readonly queuePublisher: BullMqQueuePublisher;
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
  public readonly analytics: AnalyticsReader;
  public readonly embeddings: EmbeddingProvider;
  public readonly activity: ActivityLogger;
  public readonly unitOfWork: UnitOfWork;
  public readonly content: ContentSource;
  // Built unconditionally: a missing analytics store means a feature is not deployed, a
  // missing mail transport means every sign-up is a dead end.
  public readonly email: EmailSender;
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
  public readonly ai: { readonly indexDocument: IndexDocumentUseCase };
  public readonly rbac: { readonly listRoles: ListRolesUseCase };
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

    // Otherwise a `clickhouse` driver with no block degrades to Postgres silently, out
    // of the store the operator believed they had moved off.
    if (config.analytics.driver === "clickhouse" && !this.clickhouse) {
      throw new Error(
        "analytics.driver is clickhouse but no analytics.clickhouse config was given.",
      );
    }

    this.analytics =
      config.analytics.driver === "clickhouse" && this.clickhouse
        ? new ClickHouseAnalyticsReader(this.clickhouse)
        : new PgAnalyticsReader(this.database, this.transactions);

    // The writer follows the connection, not the driver: project first, watch the
    // reconciliation come back clean, then flip `ANALYTICS_DRIVER`.
    this.analyticsProjector = this.clickhouse
      ? new ClickHouseAnalyticsProjector(this.clickhouse)
      : undefined;

    // Its absence changes nothing about what is written: `JsonLogger` goes to stdout
    // either way.
    this.logReader = config.logs ? new LokiLogReader(config.logs, this.logger) : undefined;

    // The only catalog carrying the `email` namespace the worker's digests read. A
    // client bundle cannot reach it.
    this.content = new StaticContentSource(SERVER_CATALOG);
    this.email = new SmtpEmailSender(config.email, this.logger);

    const capabilityRepository = new PgCapabilityRepository(this.database, this.transactions);
    this.capabilities = new CapabilityCache(capabilityRepository, this.cache);

    // Shares the transaction scope, which is what makes the audit row commit with the
    // state change rather than beside it.
    this.activity = new PgActivityLogger(this.database, this.transactions, this.clock);

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
        new ContentAuthMailer(this.content, this.email),
        this.invitationClaimer,
        this.organizationFounder,
      );
      this.sessionResolver = new BetterAuthSessionResolver(this.authInstance);

      const apiKeyRepository = new PgApiKeyRepository(this.database, this.transactions);
      const apiKeyResolver = new ApiKeyResolver(apiKeyRepository, this.capabilities);
      this.principalBuilder = new PrincipalBuilder(
        this.sessionResolver,
        apiKeyResolver,
        this.capabilities,
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
          new ContentInvitationMailer(this.content, this.email, config.auth.baseUrl),
          this.activity,
          this.unitOfWork,
          this.clock,
        ),
        revokeInvitation: new RevokeInvitationUseCase(
          this.authorizer,
          invitations,
          this.activity,
          this.unitOfWork,
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

    this.rbac = { listRoles: new ListRolesUseCase(this.authorizer, roles) };

    this.ai = {
      indexDocument: new IndexDocumentUseCase(
        this.authorizer,
        this.embeddings,
        this.vectors,
        this.activity,
        this.unitOfWork,
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
    const [database, cache, queue, analytics] = await Promise.all([
      this.database.isHealthy(),
      this.redis.healthy("cache"),
      this.redis.healthy("queue"),
      // `null` rather than `true` when absent: it is not healthy and not degraded, it
      // is not running one. Loki is absent from this list on purpose.
      this.clickhouse ? this.clickhouse.healthy() : Promise.resolve(null),
    ]);

    return {
      healthy: database && cache && queue && analytics !== false,
      database,
      cache,
      queue,
      analytics,
    };
  }

  // Reverse construction order: closing Redis while BullMQ holds blocking connections
  // hangs on shutdown, and it is a deadlock.
  public async dispose(): Promise<void> {
    await this.queuePublisher.close();
    await this.redis.close();
    await this.clickhouse?.close();
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
