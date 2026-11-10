import { Identifiers, type OrganizationId } from "@loadbearing/contracts";
import { ForbiddenError, ValidationError } from "@loadbearing/errors";
import { CapabilitySet, type PermissionKey } from "@loadbearing/permissions";
import { describe, expect, it } from "vitest";
import { ListMailDeliveriesUseCase } from "../../src/mail/list-mail-deliveries.use-case.js";
import type {
  MailDeliveryCursor,
  MailDeliveryRecord,
  MailDeliveryRepository,
} from "../../src/mail/mail-delivery.repository.js";
import { RecordMailDeliveryUseCase } from "../../src/mail/record-mail-delivery.use-case.js";
import type { PlatformReader } from "../../src/platform/index.js";
import { Authorizer } from "../../src/primitive/authorizer.js";
import { Principal } from "../../src/primitive/principal.js";

const PLATFORM = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000001");
const TENANT = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000010");
const ACTOR = Identifiers.userId.parse("018f8c00-0000-7000-8000-000000000011");
const NOW = new Date("2026-11-11T09:00:00.000Z");

class Deliveries implements MailDeliveryRepository {
  public readonly rows: MailDeliveryRecord[] = [];
  public readonly asked: {
    recipient: string | null;
    limit: number;
    before: MailDeliveryCursor | null;
  }[] = [];

  public save(delivery: MailDeliveryRecord) {
    this.rows.push(delivery);
    return Promise.resolve();
  }

  public list(
    organizationId: OrganizationId,
    recipient: string | null,
    limit: number,
    before: MailDeliveryCursor | null,
  ) {
    this.asked.push({ recipient, limit, before });
    return Promise.resolve(
      this.rows.filter((row) => row.organizationId === organizationId).slice(0, limit),
    );
  }
}

const platform = { organizationId: () => Promise.resolve(PLATFORM) } as unknown as PlatformReader;

const actor = (keys: readonly PermissionKey[]) =>
  new Principal(
    PLATFORM,
    ACTOR,
    CapabilitySet.from({
      wildcard: false,
      org: { grants: [], denies: [] },
      goals: {},
      platform: { grants: keys, denies: [] },
    }),
  );

const record = (deliveries: Deliveries, organizationId: OrganizationId | null, to: string) =>
  new RecordMailDeliveryUseCase(deliveries, platform, { now: () => NOW }).execute({
    organizationId,
    userId: null,
    template: "auth.verify",
    to,
    status: "sent",
    messageId: "<m@x>",
    attempts: 1,
  });

describe("RecordMailDeliveryUseCase", () => {
  it("files tenantless mail under the platform, with the address lower-cased", async () => {
    const deliveries = new Deliveries();
    await record(deliveries, null, "  Ada@Example.TEST ");
    await record(deliveries, TENANT, "b@example.test");

    expect(deliveries.rows.map((row) => [row.organizationId, row.recipient])).toEqual([
      [PLATFORM, "ada@example.test"],
      [TENANT, "b@example.test"],
    ]);
    expect(deliveries.rows[0]).toMatchObject({ status: "sent", attempts: 1, createdAt: NOW });
  });
});

describe("ListMailDeliveriesUseCase", () => {
  it("asks for one more than the page and hands back a cursor when there is more", async () => {
    const deliveries = new Deliveries();
    for (const to of ["a@x.test", "b@x.test", "c@x.test"]) await record(deliveries, TENANT, to);

    const page = await new ListMailDeliveriesUseCase(new Authorizer(), deliveries).execute(
      actor(["platform.mail.read"]),
      { organizationId: TENANT, recipient: " A@X.test ", limit: 2 },
    );

    expect(deliveries.asked[0]).toEqual({ recipient: "a@x.test", limit: 3, before: null });
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toMatch(/\|/);
  });

  it("refuses a cursor it did not write", async () => {
    await expect(
      new ListMailDeliveriesUseCase(new Authorizer(), new Deliveries()).execute(
        actor(["platform.mail.read"]),
        { organizationId: TENANT, limit: 2, cursor: "nonsense" },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses anyone without the platform key", async () => {
    await expect(
      new ListMailDeliveriesUseCase(new Authorizer(), new Deliveries()).execute(actor([]), {
        organizationId: TENANT,
        limit: 2,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
