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
  JsonLogger,
  ListRolesUseCase,
  type Logger,
  type LogReader,
  LokiLogReader,
  type MaintenanceGateway,
  type MembershipEnroller,
  type MembershipReader,
  OpenAiEmbeddingProvider,
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
  PgUnitOfWork,
  PgVectorStore,
  PrincipalBuilder,
  type QueuePublisher,
  RedisCacheStore,
  RedisConnection,
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
import { ContentAuthMailer } from "../mail/index.js";
import type { ContainerConfig } from "./container.config.js";

// What a readiness probe returns. One field per dependency the deployment cannot serve
// requests without, plus the roll-up the probe's status code is derived from.
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
  // Present only when `config.analytics.clickhouse` is. Held so `healthy()` can ping
  // it and `dispose()` can close it without `Container` handing the connection out.
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
  // Built unconditionally, unlike the derived stores below. A missing analytics store
  // means a feature is not deployed; a missing mail transport means every sign-up on a
  // default configuration is a dead end, so it is required configuration instead.
  public readonly email: EmailSender;
  // Platform housekeeping, carrying no principal because it owns no tenant's rows.
  // Reachable only from the worker's schedules, never from a request path.
  public readonly maintenance: MaintenanceGateway;
  public readonly activityArchive: ActivityArchiveGateway;
  // The source half of the projection pipeline. Always built, because replaying the
  // audit trail is useful with or without a derived store behind it — a reconciliation
  // against nothing is simply a count.
  public readonly activityReplay: ActivityReplayReader;

  // ── the derived stores, absent unless configured ─────────
  //
  // Optional fields rather than no-op implementations. A `NullAnalyticsProjector`
  // would let the worker register a projection consumer that runs every five minutes
  // and writes nowhere, which is indistinguishable from a working pipeline until a
  // quarterly report comes out wrong. Absent means the consumer is never registered.
  private readonly analyticsProjector: AnalyticsProjector | undefined;
  private readonly logReader: LogReader | undefined;

  // ── auth, absent in a process that never authenticates ────
  private readonly authInstance: AuthInstance | undefined;
  private readonly sessionResolver: SessionResolver | undefined;
  private readonly principalBuilder: PrincipalBuilder | undefined;
  public readonly capabilities: CapabilityCache;

  // ── use-cases, one field each, constructed eagerly ────────
  // Grouped by slice so a consumer reads `container.ai.indexDocument`. See
  // docs/reference/container.md.
  public readonly ai: { readonly indexDocument: IndexDocumentUseCase };
  public readonly rbac: { readonly listRoles: ListRolesUseCase };

  public constructor(config: ContainerConfig) {
    this.database = new Database(config.database);
    this.redis = new RedisConnection({
      cacheUrl: config.redis.cacheUrl,
      queueUrl: config.redis.queueUrl,
    });
    this.transactions = new TransactionScope();

    // First, so a failure in anything below it has somewhere to be recorded.
    // `app` and `env` are bound rather than passed through: they belong on every
    // line, and `JsonLoggerOptions` has no field of its own for either.
    this.logger = new JsonLogger({
      level: config.logging.level,
      pretty: config.logging.pretty,
      bound: { app: config.logging.app, env: config.logging.env },
    });

    this.clock = new SystemClock();
    this.authorizer = new Authorizer();

    this.cache = new RedisCacheStore(this.redis.client());
    this.storage = new S3StorageGateway(config.storage);
    this.queuePublisher = new BullMqQueuePublisher(this.redis.queueClient());
    this.queue = this.queuePublisher;
    this.unitOfWork = new PgUnitOfWork(this.database, this.transactions);
    this.maintenance = new PgMaintenanceGateway(this.database, this.transactions);

    // ── the swap points ──
    //
    // Each reads a `driver` off the config rather than naming one class directly.
    // That is the difference between a seam and a claim about one: the alternative
    // implementation is named here, in a switch a compiler checks, instead of in a
    // document describing what somebody would do.
    this.vectors = Container.buildVectorStore(config, this.database, this.transactions);
    this.embeddings = new OpenAiEmbeddingProvider(config.embedding);

    // ClickHouse is opt-in and stopped by default (`--profile analytics`). Building
    // the connection only when configured is what keeps "the seam exists, the
    // container exists, and nothing writes to it" true rather than aspirational.
    this.clickhouse = config.analytics.clickhouse
      ? new ClickHouseConnection(config.analytics.clickhouse)
      : undefined;

    // A `clickhouse` driver with no `clickhouse` block would otherwise degrade to
    // Postgres silently — the dashboard keeps answering, out of the store the
    // operator believed they had moved off.
    if (config.analytics.driver === "clickhouse" && !this.clickhouse) {
      throw new Error(
        "analytics.driver is clickhouse but no analytics.clickhouse config was given.",
      );
    }

    this.analytics =
      config.analytics.driver === "clickhouse" && this.clickhouse
        ? new ClickHouseAnalyticsReader(this.clickhouse)
        : new PgAnalyticsReader(this.database, this.transactions);

    // The writer is tied to the connection, not to the driver. Pointing the reader at
    // Postgres while the projection already fills ClickHouse is the supported way to
    // adopt it: project first, watch the reconciliation come back clean, then flip
    // `ANALYTICS_DRIVER` — rather than cutting reads over to an empty store.
    this.analyticsProjector = this.clickhouse
      ? new ClickHouseAnalyticsProjector(this.clickhouse)
      : undefined;

    // The only in-process reader of the diagnostic stream. Its absence changes
    // nothing about what is written: `JsonLogger` goes to stdout either way.
    this.logReader = config.logs ? new LokiLogReader(config.logs) : undefined;

    // The server catalog, which is the only one carrying the `email` namespace the
    // worker's digests read. A client bundle cannot reach it — 05 bans the import.
    this.content = new StaticContentSource(SERVER_CATALOG);
    this.email = new SmtpEmailSender(config.email);

    const capabilityRepository = new PgCapabilityRepository(this.database, this.transactions);
    this.capabilities = new CapabilityCache(capabilityRepository, this.cache);

    // Everything below is skipped when `config.auth` is absent — `apps/worker` builds a
    // `SystemPrincipal` from a named grant list and never resolves a credential (25.3).
    if (config.auth) {
      // The fourth argument is what pins a tenant onto every session at sign-in. It is
      // the one place `PgMembershipReader` is bound to the `MembershipReader` port that
      // `auth` declares — `db` cannot implement it nominally, because `auth` already
      // depends on `db`, so this line is where a signature drift is caught.
      const membershipReader: MembershipReader = new PgMembershipReader(
        this.database,
        this.transactions,
      );
      // The write half, bound the same way and for the same reason. It is what puts
      // the very first row in `memberships` — without it a fresh database can never
      // produce a session, because the hook above correctly refuses one to a user
      // with no membership and nothing else in the repository writes that table.
      const membershipEnroller: MembershipEnroller = new PgMembershipEnroller(
        this.database,
        this.transactions,
      ).withOrganizationSlug(config.auth.bootstrapOrganizationSlug);

      this.authInstance = AuthFactory.create(
        config.auth,
        this.database,
        this.cache,
        membershipReader,
        membershipEnroller,
        // The copy and the transport, joined here and nowhere else. `auth` owes no
        // words and `content` owes no transport, which is the whole reason this line
        // is in the wiring package.
        new ContentAuthMailer(this.content, this.email),
      );
      this.sessionResolver = new BetterAuthSessionResolver(this.authInstance);

      const apiKeyRepository = new PgApiKeyRepository(this.database, this.transactions);
      const apiKeyResolver = new ApiKeyResolver(apiKeyRepository, this.capabilities);
      this.principalBuilder = new PrincipalBuilder(
        this.sessionResolver,
        apiKeyResolver,
        this.capabilities,
      );
    }

    // Shares the transaction scope, which is what makes the audit row commit
    // with the state change rather than beside it.
    this.activity = new PgActivityLogger(this.database, this.transactions, this.clock);

    // Takes the storage gateway, because archiving a partition is a database read and
    // an object write in one operation — the only place those two ports meet.
    this.activityArchive = new PgActivityArchiveGateway(
      this.database,
      this.transactions,
      this.storage,
    );

    this.activityReplay = new PgActivityReplayReader(this.database, this.transactions);

    this.rbac = {
      listRoles: new ListRolesUseCase(
        this.authorizer,
        new PgRoleRepository(this.database, this.transactions),
      ),
    };

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

  // Getters rather than optional fields, so `apps/web` still reads `container.auth`
  // with no `?.` and a process that skipped auth fails loudly at the call site.
  public get auth(): AuthInstance {
    if (!this.authInstance) throw new Error("This container was built without an auth config.");
    return this.authInstance;
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

  // The projection writer, when one exists. A getter rather than a public optional
  // field, so `apps/worker` reads `container.projector` with no `?.` and a process
  // that reached it without ClickHouse configured fails at the call site with a
  // sentence rather than at the first insert with a `TypeError`.
  public get projector(): AnalyticsProjector {
    if (!this.analyticsProjector) {
      throw new Error("This container was built without an analytics.clickhouse config.");
    }
    return this.analyticsProjector;
  }

  // What the worker branches on. Registering a projection consumer against a store
  // that is not running is the exact failure this arrangement is shaped to prevent.
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

  // Postgres and both Redis instances. A cache that is down degrades; a queue
  // that is down silently stops accepting work, which is worth knowing about.
  //
  // A breakdown rather than one boolean, because the only consumer is a readiness probe
  // and the body of a failing probe is what an operator reads at three in the morning.
  // `false` alone says the deployment is unhealthy; it does not say whether to restart
  // the pod or page whoever owns Redis.
  public async health(): Promise<HealthReport> {
    const [database, cache, queue, analytics] = await Promise.all([
      this.database.isHealthy(),
      this.redis.healthy("cache"),
      this.redis.healthy("queue"),
      // Only when it is part of this deployment. `null` rather than `true` for a
      // container with no ClickHouse: it is not healthy and it is not degraded, it is
      // not running one, and a probe body saying `true` claims otherwise.
      //
      // The log platform is deliberately absent from this list. Loki being down
      // loses diagnostics and nothing else, and failing a readiness probe over it
      // takes the application down in order to protect its logs.
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

  // Reverse construction order. Closing Redis while BullMQ still holds blocking
  // connections produces a hang on shutdown that looks like a deadlock, because it is.
  public async dispose(): Promise<void> {
    await this.queuePublisher.close();
    await this.redis.close();
    await this.clickhouse?.close();
    await this.database.close();
  }

  // The one place a port and the concrete class behind it meet for vectors, kept as
  // a static so adopting a dedicated vector database is a `case` in a switch the
  // compiler checks rather than another branch inside an already-long constructor.
  //
  // What makes that swap cheap is not this method — it is that `VectorStore.search()`
  // takes the resolved goal scope as a parameter. A remote store holds no
  // `CapabilitySet` and can join back to nothing, so the permission filter had to
  // run on the input set from the first day or the port would have been unswappable.
  private static buildVectorStore(
    config: ContainerConfig,
    database: Database,
    transactions: TransactionScope,
  ): VectorStore {
    switch (config.vector.driver) {
      case "pgvector":
        return new PgVectorStore(database, transactions);
      default: {
        // Exhaustiveness, checked at build time. A driver added to the union and not
        // to this switch is a compile error rather than a runtime surprise.
        const unreachable: never = config.vector.driver;
        throw new Error(`Unknown vector driver: ${String(unreachable)}`);
      }
    }
  }
}
