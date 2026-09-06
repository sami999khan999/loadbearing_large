import { describe, expect, it } from "vitest";
import { TestContainer } from "../../src/container/test-container.js";
import { RecordingActivityLogger, RecordingQueuePublisher } from "../../src/fake/index.js";

describe("TestContainer", () => {
  it("builds every port without touching infrastructure", () => {
    const harness = TestContainer.build();

    // Every key, from the object rather than by hand: a listed subset passes while
    // a port added to `TestPorts` goes unbuilt, which is what this once did.
    for (const [name, port] of Object.entries(harness)) {
      expect(port, `${name} is not built`).toBeDefined();
    }
  });

  it("builds one port per abstract class in application/src/port", () => {
    const harness = TestContainer.build();

    // `content` has no port file — `ContentSource` is `@loadbearing/content`'s, and
    // its real implementation is the test double. The rest are one-for-one.
    expect(Object.keys(harness).sort()).toEqual([
      "activity",
      "activityArchive",
      "activityReplay",
      "analytics",
      "analyticsProjector",
      "authorizer",
      "cache",
      "clock",
      "content",
      "email",
      "embeddings",
      "logger",
      "logs",
      "maintenance",
      "queue",
      "sessions",
      "storage",
      "unitOfWork",
      "vectors",
    ]);
  });

  it("freezes the clock at the same instant every run", () => {
    expect(TestContainer.build().clock.now().toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("hands the override back rather than the default", () => {
    const activity = new RecordingActivityLogger();
    const harness = TestContainer.build({ activity });

    expect(harness.activity).toBe(activity);
  });

  it("leaves the un-overridden ports on their defaults", () => {
    const queue = new RecordingQueuePublisher();
    const harness = TestContainer.build({ queue });

    expect(harness.queue).toBe(queue);
    expect(harness.cache).not.toBe(queue);
  });

  it("emits without a console mock", () => {
    // The point of `SilentLogger` here: a use-case spec that logs needs no stubbing,
    // and nothing reaches stdout to pollute the run.
    expect(() => {
      TestContainer.build().logger.emit("process.started", { service: "test" });
    }).not.toThrow();
  });
});
