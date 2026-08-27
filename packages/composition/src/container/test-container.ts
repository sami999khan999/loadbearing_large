import {
  DirectUnitOfWork,
  InMemoryCacheStore,
  InMemoryStorageGateway,
  InMemoryVectorStore,
  RecordingActivityArchiveGateway,
  RecordingActivityLogger,
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
  type AnalyticsReader,
  Authorizer,
  type CacheStore,
  type ContentSource,
  type EmbeddingProvider,
  type EventBus,
  FixedClock,
  type Logger,
  type MaintenanceGateway,
  type QueuePublisher,
  type SessionResolver,
  SilentLogger,
  StaticContentSource,
  type StorageGateway,
  type UnitOfWork,
  type VectorStore,
} from "../import.js";

// One entry per port in `application/src/port/`. Adding a port there is one line here
// and a compile error until it is written — which is the entire reason this file is in
// `src/` rather than in a spec: it is checked by `tsc`, not by a test that runs.
export interface TestPorts {
  readonly activity: ActivityLogger;
  readonly activityArchive: ActivityArchiveGateway;
  readonly analytics: AnalyticsReader;
  readonly cache: CacheStore;
  readonly content: ContentSource;
  readonly embeddings: EmbeddingProvider;
  readonly events: EventBus;
  readonly maintenance: MaintenanceGateway;
  readonly queue: QueuePublisher;
  readonly sessions: SessionResolver;
  readonly storage: StorageGateway;
  readonly unitOfWork: UnitOfWork;
  readonly vectors: VectorStore;
}

// The ports, plus the three shared primitives a use-case is constructed with. No
// `auth`, no `principals`, no `capabilities`: a use-case test builds a `Principal`
// directly with a hand-made `CapabilitySet` and never authenticates.
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

  // Ports come back as their abstract types, which is the opposite of what a test
  // asserting on a fake needs. That is deliberate: construct the fake yourself, keep
  // the reference, and pass it in — `TestContainer.build({ activity })` — so the
  // assertion reads `activity.actions()` off a variable the spec already owns.
  public static build(overrides: Partial<TestPorts> = {}): TestHarness {
    return {
      clock: new FixedClock(new Date(TestContainer.EPOCH)),
      logger: new SilentLogger(),
      authorizer: new Authorizer(),

      activity: overrides.activity ?? new RecordingActivityLogger(),
      activityArchive: overrides.activityArchive ?? new RecordingActivityArchiveGateway(),
      analytics: overrides.analytics ?? new StubAnalyticsReader(),
      cache: overrides.cache ?? new InMemoryCacheStore(),
      // Already in-memory — its catalog is a map of dynamic imports, so there is
      // nothing to fake. The one port whose real implementation is the test double.
      content: overrides.content ?? new StaticContentSource(),
      embeddings: overrides.embeddings ?? new StubEmbeddingProvider(),
      events: overrides.events ?? new RecordingEventBus(),
      maintenance: overrides.maintenance ?? new RecordingMaintenanceGateway(),
      queue: overrides.queue ?? new RecordingQueuePublisher(),
      sessions: overrides.sessions ?? new StubSessionResolver(),
      storage: overrides.storage ?? new InMemoryStorageGateway(),
      unitOfWork: overrides.unitOfWork ?? new DirectUnitOfWork(),
      vectors: overrides.vectors ?? new InMemoryVectorStore(),
    };
  }
}
