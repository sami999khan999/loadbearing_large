import { Identifiers } from "@loadbearing/contracts";
import { ForbiddenError, ValidationError } from "@loadbearing/errors";
import { CapabilitySet, type PermissionKey } from "@loadbearing/permissions";
import { describe, expect, it } from "vitest";
import { GetDigestHourUseCase } from "../../src/notification/get-digest-hour.use-case.js";
import type { NotificationSettingsRepository } from "../../src/notification/notification-settings.repository.js";
import { UpdateDigestHourUseCase } from "../../src/notification/update-digest-hour.use-case.js";
import type { ActivityLogger, UnitOfWork } from "../../src/port/index.js";
import { Authorizer } from "../../src/primitive/authorizer.js";
import { Principal } from "../../src/primitive/principal.js";

const TENANT = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000010");
const ACTOR = Identifiers.userId.parse("018f8c00-0000-7000-8000-000000000011");

const harness = () => {
  const hours = new Map<string, number>();
  const audited: unknown[] = [];
  const settings = {
    digestHourOf: (organizationId: string) => Promise.resolve(hours.get(organizationId) ?? null),
    saveDigestHour: (organizationId: string, hour: number) => {
      hours.set(organizationId, hour);
      return Promise.resolve();
    },
  } as unknown as NotificationSettingsRepository;
  const activity = {
    record: (_actor: unknown, action: string, payload: unknown) => {
      audited.push([action, payload]);
      return Promise.resolve();
    },
  } as unknown as ActivityLogger;
  const uow = { run: <T>(work: () => Promise<T>) => work() } as unknown as UnitOfWork;
  return {
    get: new GetDigestHourUseCase(new Authorizer(), settings),
    update: new UpdateDigestHourUseCase(new Authorizer(), settings, activity, uow, {
      now: () => new Date(),
    }),
    audited,
  };
};

const actor = (grants: readonly PermissionKey[]) =>
  new Principal(
    TENANT,
    ACTOR,
    CapabilitySet.from({ wildcard: false, org: { grants, denies: [] }, goals: {} }),
  );

describe("the digest hour", () => {
  it("is 07:00 until someone chooses, then the chosen hour, and the change is audited", async () => {
    const { get, update, audited } = harness();
    const admin = actor(["notification.inbox.read", "notification.digest.manage"]);

    expect(await get.execute(admin)).toEqual({ hour: 7 });
    await update.execute(admin, { hour: 18 });
    expect(await get.execute(admin)).toEqual({ hour: 18 });
    expect(audited).toEqual([["notification.digest.rescheduled", { hour: 18 }]]);
  });

  it("refuses an hour outside the day", async () => {
    const { update } = harness();
    await expect(
      update.execute(actor(["notification.digest.manage"]), { hour: 24 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("lets a member see it but not change it", async () => {
    const { get, update } = harness();
    const member = actor(["notification.inbox.read"]);
    expect(await get.execute(member)).toEqual({ hour: 7 });
    await expect(update.execute(member, { hour: 9 })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
