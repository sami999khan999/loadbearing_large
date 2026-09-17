import type { ActivityRecord } from "@loadbearing/application";
import type { Container } from "@loadbearing/composition";
import {
  FixedClock,
  InMemoryActivityReplayReader,
  InMemoryAnalyticsProjector,
  InMemoryOrganizationReader,
  TestContainer,
} from "@loadbearing/composition";
import { Identifiers } from "@loadbearing/contracts";
import type { Job } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import { AnalyticsConsumer } from "../../src/consumer/analytics.consumer.js";

const NOW = new Date("2026-08-15T12:00:00.000Z");
const ORG = "018f8c00-0000-7000-8000-000000000010";
const ACTOR = "018f8c00-0000-7000-8000-000000000011";

// The projection walks tenants since `16.6`, so a harness with no tenant list projects
// nothing at all — which is also what a deployment with no organizations does.
const TENANTS = [Identifiers.organizationId.parse(ORG)];

const minutesBefore = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

const record = (id: string, occurredAt: Date): ActivityRecord => ({
  id,
  organizationId: ORG as ActivityRecord["organizationId"],
  occurredAt,
  actorId: ACTOR as ActivityRecord["actorId"],
  action: "task.created",
  subjectId: null,
  payload: {},
});

function harness(records: readonly ActivityRecord[]) {
  const activityReplay = new InMemoryActivityReplayReader(records);
  const analyticsProjector = new InMemoryAnalyticsProjector();
  const logger = { emit: vi.fn(), failure: vi.fn() };

  const container = {
    ...TestContainer.build({
      activityReplay,
      analyticsProjector,
      organizations: new InMemoryOrganizationReader(TENANTS),
    }),
    // The consumer reads `container.projector`; the harness names the port after the
    // abstract class. Mapping it here is what keeps both names honest.
    projector: analyticsProjector,
    clock: new FixedClock(NOW),
    logger,
  } as unknown as Container;

  return { consumer: new AnalyticsConsumer(container, undefined as never, 1), logger };
}

const job = (name: string): Job => ({ name }) as Job;

const emitted = (logger: { emit: ReturnType<typeof vi.fn> }, code: string) =>
  logger.emit.mock.calls.filter((call) => call[0] === code).map((call) => call[1]);

describe("AnalyticsConsumer project", () => {
  it("reports no lag once it has caught up, however old the newest row is", async () => {
    const { consumer, logger } = harness([record("a", minutesBefore(90))]);

    await consumer.handle(job("project"));

    // The regression: lag was the age of the *newest projected* row, so a quiet system
    // that had drained everything reported an hour and a half behind.
    expect(emitted(logger, "analytics.projection.completed")[0]).toMatchObject({
      tenants: 1,
      events: 1,
      lagSeconds: 0,
      capped: false,
    });
  });

  it("does not warn about lag on a system that is idle rather than behind", async () => {
    const { consumer, logger } = harness([record("a", minutesBefore(90))]);

    await consumer.handle(job("project"));

    // 90 minutes is well past `LAG_WARNING_MS`, so the old computation fired this every
    // run, forever, on a deployment where nothing was wrong.
    expect(emitted(logger, "analytics.projection.lagged")).toHaveLength(0);
  });

  it("reports zero against an empty audit trail", async () => {
    const { consumer, logger } = harness([]);

    await consumer.handle(job("project"));

    expect(emitted(logger, "analytics.projection.completed")[0]).toMatchObject({
      events: 0,
      lagSeconds: 0,
    });
  });
});

describe("AnalyticsConsumer reconcile", () => {
  it("completes with a drift count of zero when both sides agree", async () => {
    const { consumer, logger } = harness([record("a", minutesBefore(60 * 24))]);

    await consumer.handle(job("project"));
    await consumer.handle(job("reconcile"));

    expect(emitted(logger, "analytics.reconciliation.drifted")).toHaveLength(0);
    expect(emitted(logger, "analytics.reconciliation.completed")[0]).toMatchObject({ drifted: 0 });
  });

  it("still completes when it found drift, and says how much", async () => {
    // Projected nothing, so every day in the window is short by its whole count.
    const { consumer, logger } = harness([record("a", minutesBefore(60 * 24))]);

    await consumer.handle(job("reconcile"));

    const drift = emitted(logger, "analytics.reconciliation.drifted");
    expect(drift).toHaveLength(1);
    // Per tenant, because both sides answer per tenant: a drifting day belongs to one.
    expect(drift[0]).toMatchObject({ organizationId: ORG });

    // The regression: it returned early, so a reconciliation that was finding drift and
    // a consumer that had stopped were the same absence on a dashboard.
    expect(emitted(logger, "analytics.reconciliation.completed")[0]).toMatchObject({
      days: 1,
      drifted: 1,
    });
  });
});
