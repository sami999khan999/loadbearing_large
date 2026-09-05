import {
  DirectUnitOfWork,
  InMemoryActivityReplayReader,
  InMemoryAnalyticsProjector,
  InMemoryCacheStore,
  InMemoryLogReader,
  InMemoryStorageGateway,
  InMemoryVectorStore,
  RecordingActivityArchiveGateway,
  RecordingActivityLogger,
  RecordingEmailSender,
  RecordingEventBus,
  RecordingMaintenanceGateway,
  RecordingQueuePublisher,
  StubAnalyticsReader,
  StubEmbeddingProvider,
  StubSessionResolver,
} from "../fake/index.js";
import {
  type ActivityArchiveGateway,
  type ActivityLogger,
  type ActivityReplayReader,
  type AnalyticsProjector,
  type AnalyticsReader,
  Authorizer,
  type CacheStore,
  type ContentSource,
  type EmailSender,
  type EmbeddingProvider,
  type EventBus,
  FixedClock,
  type Logger,
  type LogReader,
  type MaintenanceGateway,
  type QueuePublisher,
  type SessionResolver,
  SilentLogger,
  StaticContentSource,
  type StorageGateway,
  type UnitOfWork,
  type VectorStore,
} from "../import.js";

// One entry per port. In `src/` rather than a spec so `tsc` checks it: adding a port is
// a compile error here until it is written.
export interface TestPorts {
  readonly activity: ActivityLogger;
  readonly activityArchive: ActivityArchiveGateway;
  readonly activityReplay: ActivityReplayReader;
  readonly analytics: AnalyticsReader;
  // Present even though the real container leaves them absent: a test has no opinion
  // about the deployment, and a consumer spec needs both sides.
  readonly analyticsProjector: AnalyticsProjector;
  readonly cache: CacheStore;
  readonly content: ContentSource;
  readonly email: EmailSender;
  readonly embeddings: EmbeddingProvider;
  readonly events: EventBus;
  readonly logs: LogReader;
  readonly maintenance: MaintenanceGateway;
  readonly queue: QueuePublisher;
  readonly sessions: SessionResolver;
  readonly storage: StorageGateway;
  readonly unitOfWork: UnitOfWork;
  readonly vectors: VectorStore;
}

// The ports plus the three shared primitives. No auth: a use-case test builds a
// `Principal` directly and never authenticates.
export interface TestHarness extends TestPorts {
  readonly clock: FixedClock;
  readonly logger: Logger;
  readonly authorizer: Authorizer;
}

export class TestContainer {
  // Frozen, and the same instant in every spec. A test that needs time to pass calls
  // `clock.advance()`, which returns a new clock rather than mutating this one.
  private static readonly EPOCH = "2026-01-01T00:00:00Z";

  private constructor() {}

  // Ports come back as abstract types on purpose: construct the fake, keep the
  // reference, pass it in, and assert off the variable the spec already owns.
  public static build(overrides: Partial<TestPorts> = {}): TestHarness {
    return {
      clock: new FixedClock(new Date(TestContainer.EPOCH)),
      logger: new SilentLogger(),
      authorizer: new Authorizer(),

      activity: overrides.activity ?? new RecordingActivityLogger(),
      activityArchive: overrides.activityArchive ?? new RecordingActivityArchiveGateway(),
      activityReplay: overrides.activityReplay ?? new InMemoryActivityReplayReader(),
      analytics: overrides.analytics ?? new StubAnalyticsReader(),
      analyticsProjector: overrides.analyticsProjector ?? new InMemoryAnalyticsProjector(),
      cache: overrides.cache ?? new InMemoryCacheStore(),
      // Already in-memory — its catalog is a map of dynamic imports, so there is
      // nothing to fake. The one port whose real implementation is the test double.
      content: overrides.content ?? new StaticContentSource(),
      email: overrides.email ?? new RecordingEmailSender(),
      embeddings: overrides.embeddings ?? new StubEmbeddingProvider(),
      events: overrides.events ?? new RecordingEventBus(),
      logs: overrides.logs ?? new InMemoryLogReader(),
      maintenance: overrides.maintenance ?? new RecordingMaintenanceGateway(),
      queue: overrides.queue ?? new RecordingQueuePublisher(),
      sessions: overrides.sessions ?? new StubSessionResolver(),
      storage: overrides.storage ?? new InMemoryStorageGateway(),
      unitOfWork: overrides.unitOfWork ?? new DirectUnitOfWork(),
      vectors: overrides.vectors ?? new InMemoryVectorStore(),
    };
  }
}
