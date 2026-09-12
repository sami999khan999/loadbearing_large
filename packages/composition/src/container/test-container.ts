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
  RecordingCapabilityInvalidator,
  RecordingEmailSender,
  RecordingMailPublisher,
  RecordingMaintenanceGateway,
  RecordingQueuePublisher,
  StubEmbeddingProvider,
  StubMailRenderer,
  StubSessionResolver,
} from "../fake/index.js";
import {
  type ActivityArchiveGateway,
  type ActivityLogger,
  type ActivityReplayReader,
  type AnalyticsProjector,
  Authorizer,
  type CacheStore,
  type CapabilityInvalidator,
  type ContentSource,
  type EmailSender,
  type EmbeddingProvider,
  FixedClock,
  type Logger,
  type LogReader,
  type MailPublisher,
  type MailRenderer,
  type MaintenanceGateway,
  type QueuePublisher,
  SERVER_CATALOG,
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
  // Present even though the real container leaves them absent: a test has no opinion
  // about the deployment, and a consumer spec needs both sides.
  readonly analyticsProjector: AnalyticsProjector;
  readonly cache: CacheStore;
  readonly capabilities: CapabilityInvalidator;
  readonly content: ContentSource;
  readonly email: EmailSender;
  readonly embeddings: EmbeddingProvider;
  readonly logs: LogReader;
  readonly mailPublisher: MailPublisher;
  readonly mailRenderer: MailRenderer;
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
      analyticsProjector: overrides.analyticsProjector ?? new InMemoryAnalyticsProjector(),
      cache: overrides.cache ?? new InMemoryCacheStore(),
      capabilities: overrides.capabilities ?? new RecordingCapabilityInvalidator(),
      // The one port whose real implementation is the test double, and `SERVER_CATALOG`
      // like `Container`: the client default carries no `email` namespace.
      content: overrides.content ?? new StaticContentSource(SERVER_CATALOG),
      email: overrides.email ?? new RecordingEmailSender(),
      embeddings: overrides.embeddings ?? new StubEmbeddingProvider(),
      logs: overrides.logs ?? new InMemoryLogReader(),
      mailPublisher: overrides.mailPublisher ?? new RecordingMailPublisher(),
      mailRenderer: overrides.mailRenderer ?? new StubMailRenderer(),
      maintenance: overrides.maintenance ?? new RecordingMaintenanceGateway(),
      queue: overrides.queue ?? new RecordingQueuePublisher(),
      sessions: overrides.sessions ?? new StubSessionResolver(),
      storage: overrides.storage ?? new InMemoryStorageGateway(),
      unitOfWork: overrides.unitOfWork ?? new DirectUnitOfWork(),
      vectors: overrides.vectors ?? new InMemoryVectorStore(),
    };
  }
}
