import { Identifiers, type OrganizationId } from "@loadbearing/contracts";
import { ForbiddenError } from "@loadbearing/errors";
import { CapabilitySet, type PermissionKey } from "@loadbearing/permissions";
import { describe, expect, it } from "vitest";
import type {
  AssistantUsageReader,
  AssistantUsageRow,
} from "../../src/assistant/assistant-usage.reader.js";
import { GetAssistantUsageReportUseCase } from "../../src/assistant/get-assistant-usage-report.use-case.js";
import type { OrganizationReader } from "../../src/port/index.js";
import { Authorizer } from "../../src/primitive/authorizer.js";
import { Principal } from "../../src/primitive/principal.js";

const PLATFORM = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000001");
const ACTOR = Identifiers.userId.parse("018f8c00-0000-7000-8000-000000000011");
const ACME = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000010");
const GONE = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000012");
const clock = { now: () => new Date("2026-09-25T21:30:00.000Z") };

const row = (organizationId: OrganizationId, day: string): AssistantUsageRow => ({
  organizationId,
  model: "gpt-test",
  day,
  inputTokens: 100,
  outputTokens: 40,
  answers: 2,
});

class Reader implements AssistantUsageReader {
  public readonly asked: { from: string; to: string; limit: number }[] = [];
  public constructor(private readonly rows: readonly AssistantUsageRow[]) {}

  public usageByDay(from: string, to: string, limit: number) {
    this.asked.push({ from, to, limit });
    return Promise.resolve(this.rows.slice(0, limit));
  }
}

class Names {
  public readonly calls: (readonly OrganizationId[])[] = [];

  public namesOf(ids: readonly OrganizationId[]) {
    this.calls.push(ids);
    return Promise.resolve(new Map(ids.filter((id) => id === ACME).map((id) => [id, "Acme"])));
  }
}

const actor = (platform: readonly PermissionKey[]) =>
  new Principal(
    PLATFORM,
    ACTOR,
    CapabilitySet.from({
      wildcard: false,
      org: { grants: [], denies: [] },
      goals: {},
      platform: { grants: platform, denies: [] },
    }),
  );

const useCase = (reader: AssistantUsageReader | null, names = new Names()) =>
  new GetAssistantUsageReportUseCase(
    new Authorizer(),
    reader,
    names as unknown as OrganizationReader,
    clock,
  );

describe("GetAssistantUsageReportUseCase", () => {
  it("names each tenant with one catalog read, and keeps a deleted tenant's id", async () => {
    const names = new Names();
    const reader = new Reader([
      row(ACME, "2026-09-25"),
      row(ACME, "2026-09-24"),
      row(GONE, "2026-09-24"),
    ]);
    const report = await useCase(reader, names).execute(actor(["platform.analytics.read"]), {
      days: 7,
    });

    expect(reader.asked).toEqual([{ from: "2026-09-19", to: "2026-09-26", limit: 501 }]);
    expect(names.calls).toEqual([[ACME, GONE]]);
    expect(report.rows.map((r) => r.organizationName)).toEqual(["Acme", "Acme", null]);
    expect(report).toMatchObject({ configured: true, truncated: false });
  });

  it("says it was cut when the store holds more rows than the page", async () => {
    const rows = Array.from({ length: 501 }, (_, at) =>
      row(ACME, `2026-09-${String((at % 25) + 1).padStart(2, "0")}`),
    );
    const report = await useCase(new Reader(rows)).execute(actor(["platform.analytics.read"]), {
      days: 30,
    });

    expect(report.rows).toHaveLength(500);
    expect(report.truncated).toBe(true);
  });

  it("answers not configured, rather than zero use, with no analytics store", async () => {
    const report = await useCase(null).execute(actor(["platform.analytics.read"]), { days: 30 });
    expect(report).toMatchObject({ configured: false, rows: [], truncated: false });
  });

  it("refuses a tenant administrator", async () => {
    await expect(useCase(new Reader([])).execute(actor([]), { days: 30 })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
