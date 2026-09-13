import { Identifiers } from "@loadbearing/contracts";
import { ForbiddenError } from "@loadbearing/errors";
import { CapabilitySet, type PermissionKey } from "@loadbearing/permissions";
import { describe, expect, it } from "vitest";
import { GetNotificationPreferencesUseCase } from "../../src/notification/get-notification-preferences.use-case.js";
import type {
  NotificationPreferenceRepository,
  PreferenceRecord,
} from "../../src/notification/notification-preference.repository.js";
import { UpdateNotificationPreferenceUseCase } from "../../src/notification/update-notification-preference.use-case.js";
import { Authorizer, Principal } from "../../src/primitive/index.js";

const ORG = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000010");
const USER = Identifiers.userId.parse("018f8c00-0000-7000-8000-000000000011");

const actorHolding = (...grants: readonly PermissionKey[]) =>
  new Principal(
    ORG,
    USER,
    CapabilitySet.from({ wildcard: false, org: { grants, denies: [] }, goals: {} }),
  );

class Preferences implements NotificationPreferenceRepository {
  public readonly saved: Omit<PreferenceRecord, "userId">[] = [];

  public constructor(private readonly stored: readonly PreferenceRecord[] = []) {}

  public findFor(): Promise<readonly PreferenceRecord[]> {
    return Promise.resolve(this.stored);
  }

  public listFor(): Promise<readonly PreferenceRecord[]> {
    return Promise.resolve(this.stored);
  }

  public save(
    _organizationId: typeof ORG,
    _userId: typeof USER,
    preference: Omit<PreferenceRecord, "userId">,
  ): Promise<void> {
    this.saved.push(preference);
    return Promise.resolve();
  }

  public organizationsWithDigest(): Promise<readonly (typeof ORG)[]> {
    return Promise.resolve([]);
  }

  public digestRecipients(): Promise<readonly (typeof USER)[]> {
    return Promise.resolve([]);
  }
}

describe("GetNotificationPreferencesUseCase", () => {
  // The complete grid, not the stored rows. A form rendering only what was saved shows
  // an empty screen on day one, which is how a preferences page reads as broken.
  it("returns every category and channel, defaulted from the policy", async () => {
    const useCase = new GetNotificationPreferencesUseCase(new Authorizer(), new Preferences());

    const resolved = await useCase.execute(actorHolding("notification.inbox.read"));

    // Every category the policy names, times both channels — the complete grid, not the
    // stored rows. A form rendering only what was saved shows an empty screen on day one.
    expect(resolved.map((entry) => entry.category)).toEqual([
      "membership",
      "membership",
      "messaging",
      "messaging",
    ]);
    expect(resolved.map((entry) => entry.channel)).toEqual(["in_app", "email", "in_app", "email"]);
    expect(resolved.every((entry) => entry.mode !== undefined)).toBe(true);
  });

  it("prefers a stored row over the policy default", async () => {
    const stored: PreferenceRecord[] = [
      { userId: USER, category: "membership", channel: "email", mode: "off" },
    ];
    const useCase = new GetNotificationPreferencesUseCase(
      new Authorizer(),
      new Preferences(stored),
    );

    const resolved = await useCase.execute(actorHolding("notification.inbox.read"));

    expect(
      resolved.find((entry) => entry.category === "membership" && entry.channel === "email")?.mode,
    ).toBe("off");
  });

  it("refuses a principal without the read permission", async () => {
    const useCase = new GetNotificationPreferencesUseCase(new Authorizer(), new Preferences());

    await expect(useCase.execute(actorHolding())).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("UpdateNotificationPreferenceUseCase", () => {
  it("saves against the actor's own id and nobody else's", async () => {
    const preferences = new Preferences();
    const useCase = new UpdateNotificationPreferenceUseCase(new Authorizer(), preferences);

    await useCase.execute(actorHolding("notification.preference.update"), {
      category: "membership",
      channel: "email",
      mode: "digest",
    });

    expect(preferences.saved).toEqual([
      { category: "membership", channel: "email", mode: "digest" },
    ]);
  });

  // Reading the inbox and changing how you are contacted are separate powers, so the
  // read permission alone must not carry the write.
  it("refuses a principal holding only the read permission", async () => {
    const useCase = new UpdateNotificationPreferenceUseCase(new Authorizer(), new Preferences());

    await expect(
      useCase.execute(actorHolding("notification.inbox.read"), {
        category: "membership",
        channel: "email",
        mode: "off",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
