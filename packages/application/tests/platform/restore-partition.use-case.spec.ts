import { Identifiers } from "@loadbearing/contracts";
import { CapabilitySet } from "@loadbearing/permissions";
import { describe, expect, it } from "vitest";
import type { PlatformReader } from "../../src/platform/platform.reader.js";
import { RestorePartitionUseCase } from "../../src/platform/restore-partition.use-case.js";
import type {
  ActivityLogger,
  PartitionArchiveGateway,
  QueuePublisher,
} from "../../src/port/index.js";
import { Authorizer } from "../../src/primitive/authorizer.js";
import { Principal } from "../../src/primitive/principal.js";

const PLATFORM = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000001");
const ACTOR = Identifiers.userId.parse("018f8c00-0000-7000-8000-000000000011");

const admin = new Principal(
  PLATFORM,
  ACTOR,
  CapabilitySet.from({
    wildcard: false,
    org: { grants: [], denies: [] },
    goals: {},
    platform: { grants: ["platform.retention.manage"], denies: [] },
  }),
);

const build = () => {
  const published: { table: unknown; id: unknown }[] = [];
  const useCase = new RestorePartitionUseCase(
    new Authorizer(),
    { entriesFor: () => Promise.resolve([{}]) } as unknown as PartitionArchiveGateway,
    {
      publish: (_queue: unknown, data: { table: unknown }, options: { inFlightId: unknown }) => {
        published.push({ table: data.table, id: options.inFlightId });
        return Promise.resolve();
      },
    } as unknown as QueuePublisher,
    { organizationId: () => Promise.resolve(PLATFORM) } as unknown as PlatformReader,
    { record: () => Promise.resolve() } as unknown as ActivityLogger,
  );
  return { published, useCase };
};

// `26.4`. A message month is read with its reactions and files, so it comes back with them.
describe("RestorePartitionUseCase — the message group", () => {
  it("queues the month for messages, its reactions and its files", async () => {
    const { published, useCase } = build();

    await useCase.execute(admin, { tableName: "messages", period: "2025-03-01" });

    expect(published).toEqual([
      { table: "messages", id: "cold-restore.messages.2025-03-01.all" },
      { table: "message_reactions", id: "cold-restore.message_reactions.2025-03-01.all" },
      { table: "message_attachments", id: "cold-restore.message_attachments.2025-03-01.all" },
    ]);
  });

  it("refuses a group member on its own", async () => {
    const { useCase } = build();

    await expect(
      useCase.execute(admin, { tableName: "message_reactions", period: "2025-03-01" }),
    ).rejects.toMatchObject({ fields: [{ field: "tableName", rule: "group" }] });
  });

  it("queues one job for any other table", async () => {
    const { published, useCase } = build();

    await useCase.execute(admin, { tableName: "activity_log", period: "2025-03-01" });

    expect(published.map((job) => job.table)).toEqual(["activity_log"]);
  });
});
