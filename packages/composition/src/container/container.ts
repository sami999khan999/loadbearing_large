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
  public readonly sessions: SessionResolver;
  public readonly activity: ActivityLogger;
  public readonly unitOfWork: UnitOfWork;
  public readonly content: ContentSource;

  // ── auth ──────────────────────────────────────────────────
  public readonly auth: AuthInstance;
  public readonly capabilities: CapabilityCache;
  public readonly principals: PrincipalBuilder;

  // ── use-cases go here as features arrive ──────────────────
  // Each is a field on this class, constructed eagerly. See docs/reference/container.md.

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

    // No argument: `SERVER_CATALOG` and the `email` namespace arrive with 20, and
    // until then the server catalog would be a copy of the client one.
    this.content = new StaticContentSource();

    // The fourth argument is what pins a tenant onto every session at sign-in. It is
    // the one place `PgMembershipReader` is bound to the `MembershipReader` port that
    // `auth` declares — `db` cannot implement it nominally, because `auth` already
    // depends on `db`, so this line is where a signature drift is caught.
    const membershipReader: MembershipReader = new PgMembershipReader(
      this.database,
      this.transactions,
    );
    this.auth = AuthFactory.create(config.auth, this.database, this.cache, membershipReader);
    this.sessions = new BetterAuthSessionResolver(this.auth);

    const capabilityRepository = new PgCapabilityRepository(this.database, this.transactions);
    this.capabilities = new CapabilityCache(capabilityRepository, this.cache);

    const apiKeyRepository = new PgApiKeyRepository(this.database, this.transactions);
    const apiKeyResolver = new ApiKeyResolver(apiKeyRepository, this.capabilities);
    this.principals = new PrincipalBuilder(this.sessions, apiKeyResolver, this.capabilities);

    // Shares the transaction scope, which is what makes the audit row commit
    // with the state change rather than beside it.
    this.activity = new PgActivityLogger(this.database, this.transactions, this.clock);
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
