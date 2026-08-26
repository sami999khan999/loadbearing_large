import { describe, expect, it } from "vitest";
import { TestContainer } from "../../src/container/test-container.js";
import { RecordingActivityLogger, RecordingQueuePublisher } from "../../src/fake/index.js";

describe("TestContainer", () => {
  it("builds every port without touching infrastructure", () => {
    const harness = TestContainer.build();

    // One assertion per port, deliberately. This is the completeness check: a port
    // added to `application` and forgotten here fails to compile, and a port wired to
    // `undefined` fails right on this line.
    expect(harness.activity).toBeDefined();
    expect(harness.analytics).toBeDefined();
    expect(harness.cache).toBeDefined();
    expect(harness.content).toBeDefined();
    expect(harness.embeddings).toBeDefined();
    expect(harness.events).toBeDefined();
    expect(harness.queue).toBeDefined();
    expect(harness.sessions).toBeDefined();
    expect(harness.storage).toBeDefined();
    expect(harness.unitOfWork).toBeDefined();
    expect(harness.vectors).toBeDefined();
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
