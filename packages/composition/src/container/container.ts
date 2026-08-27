import {
  type ActivityLogger,
  type AnalyticsReader,
  ApiKeyResolver,
  AuthFactory,
  type AuthInstance,
  Authorizer,
  BetterAuthSessionResolver,
  BullMqQueuePublisher,
  type CacheStore,
  CapabilityCache,
  type Clock,
  type ContentSource,
  Database,
  type EmbeddingProvider,
  IndexDocumentUseCase,
  JsonLogger,
  type Logger,
  type MembershipReader,
  OpenAiEmbeddingProvider,
  PgActivityLogger,
  PgAnalyticsReader,
  PgApiKeyRepository,
  PgCapabilityRepository,
  PgMembershipReader,
  PgUnitOfWork,
  PgVectorStore,
  PrincipalBuilder,
  type QueuePublisher,
  RedisCacheStore,
  RedisConnection,
  S3StorageGateway,
  SERVER_CATALOG,
  type SessionResolver,
  StaticContentSource,
  type StorageGateway,
  SystemClock,
  TransactionScope,
  type UnitOfWork,
  type VectorStore,
} from "../import.js";
import type { ContainerConfig } from "./container.config.js";

// The only class in the repository that knows both an abstract port and the concrete
// class behind it. That is the entire job, and it is why a swap is one line here.
export class Container {
  // ── infrastructure, private ───────────────────────────────
  private readonly database: Database;
  private readonly redis: RedisConnection;
  private readonly queuePublisher: BullMqQueuePublisher;
  private readonly transactions: TransactionScope;

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

  // ── auth, absent in a process that never authenticates ────
  private readonly authInstance: AuthInstance | undefined;
  private readonly sessionResolver: SessionResolver | undefined;
  private readonly principalBuilder: PrincipalBuilder | undefined;
  public readonly capabilities: CapabilityCache;

  // ── use-cases, one field each, constructed eagerly ────────
  // Grouped by slice so a consumer reads `container.ai.indexDocument`. See
  // docs/reference/container.md.
  public readonly ai: { readonly indexDocument: IndexDocumentUseCase };

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

    // ── the three swap points ──
    this.vectors = new PgVectorStore(this.database, this.transactions);
    this.analytics = new PgAnalyticsReader(this.database, this.transactions);
    this.embeddings = new OpenAiEmbeddingProvider(config.embedding);

    // The server catalog, which is the only one carrying the `email` namespace the
    // worker's digests read. A client bundle cannot reach it — 05 bans the import.
    this.content = new StaticContentSource(SERVER_CATALOG);

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
      this.authInstance = AuthFactory.create(
        config.auth,
        this.database,
        this.cache,
        membershipReader,
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

  // Postgres and both Redis instances. A cache that is down degrades; a queue
  // that is down silently stops accepting work, which is worth knowing about.
  public async healthy(): Promise<boolean> {
    const [database, cache, queue] = await Promise.all([
      this.database.isHealthy(),
      this.redis.healthy("cache"),
      this.redis.healthy("queue"),
    ]);
    return database && cache && queue;
  }

  // Reverse construction order. Closing Redis while BullMQ still holds blocking
  // connections produces a hang on shutdown that looks like a deadlock, because it is.
  public async dispose(): Promise<void> {
    await this.queuePublisher.close();
    await this.redis.close();
    await this.database.close();
  }
}
