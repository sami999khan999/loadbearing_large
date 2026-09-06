import { ServerOnly } from "./import.js";

ServerOnly.assert("@loadbearing/composition");

export {
  Container,
  type ContainerConfig,
  type HealthReport,
  TestContainer,
  type TestHarness,
  type TestPorts,
} from "./container/index.js";
// The fakes ship beside the harness, because `TestContainer.build()` hands back abstract
// types: a spec constructs the fake it wants to assert on and passes it in.
export {
  DirectUnitOfWork,
  InMemoryActivityReplayReader,
  InMemoryAnalyticsProjector,
  InMemoryCacheStore,
  InMemoryLogReader,
  InMemoryStorageGateway,
  InMemoryVectorStore,
  type PublishedJob,
  type RecordedActivity,
  RecordingActivityArchiveGateway,
  RecordingActivityLogger,
  RecordingEmailSender,
  RecordingMaintenanceGateway,
  RecordingQueuePublisher,
  StubEmbeddingProvider,
  StubSessionResolver,
} from "./fake/index.js";
// `TestHarness.clock` is one, so a consumer naming that type needs it — and a spec that
// wants a different instant replaces it rather than reaching for `@loadbearing/core`.
export { FixedClock } from "./import.js";
