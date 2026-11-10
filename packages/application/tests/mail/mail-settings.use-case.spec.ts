import { Identifiers, type OrganizationId } from "@loadbearing/contracts";
import { ConflictError, ForbiddenError } from "@loadbearing/errors";
import { CapabilitySet, type PermissionKey } from "@loadbearing/permissions";
import { describe, expect, it } from "vitest";
import type {
  MailSettingsRecord,
  MailSettingsRepository,
} from "../../src/mail/mail-settings.repository.js";
import { SaveMailSettingsUseCase } from "../../src/mail/save-mail-settings.use-case.js";
import type { PlatformReader } from "../../src/platform/index.js";
import type { ActivityLogger, SecretCipher, UnitOfWork } from "../../src/port/index.js";
import { Authorizer } from "../../src/primitive/authorizer.js";
import { Principal } from "../../src/primitive/principal.js";

const PLATFORM = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000001");
const TENANT = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000020");
const ACTOR = Identifiers.userId.parse("018f8c00-0000-7000-8000-000000000011");

class Settings implements MailSettingsRepository {
  public readonly rows = new Map<string, MailSettingsRecord>();
  public findByOrganization(organizationId: OrganizationId) {
    return Promise.resolve(this.rows.get(organizationId) ?? null);
  }
  public save(settings: MailSettingsRecord) {
    this.rows.set(settings.organizationId, settings);
    return Promise.resolve();
  }
  public delete(organizationId: OrganizationId) {
    this.rows.delete(organizationId);
    return Promise.resolve();
  }
}

const cipher = {
  encrypt: (plain: string) => `sealed:${plain}`,
  decrypt: (sealed: string) => sealed.slice(7),
} as SecretCipher;

const harness = (withCipher = true) => {
  const settings = new Settings();
  const audited: { action: string; payload: unknown }[] = [];
  const activity = {
    record: (_actor: unknown, action: string, payload: unknown) => {
      audited.push({ action, payload });
      return Promise.resolve();
    },
  } as unknown as ActivityLogger;
  const useCase = new SaveMailSettingsUseCase(
    new Authorizer(),
    settings,
    withCipher ? cipher : null,
    { organizationId: () => Promise.resolve(PLATFORM) } as unknown as PlatformReader,
    activity,
    { run: <T>(work: () => Promise<T>) => work() } as unknown as UnitOfWork,
    { now: () => new Date("2026-11-11T00:00:00.000Z") },
  );
  return { useCase, settings, audited };
};

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

const input = {
  organizationId: TENANT,
  host: " smtp.example.test ",
  port: 587,
  secure: false,
  username: "mailer",
  fromAddress: "Acme <no-reply@acme.test>",
};

describe("SaveMailSettingsUseCase", () => {
  it("encrypts a password, keeps it when absent, and clears it when null", async () => {
    const { useCase, settings } = harness();
    const admin = actor(["platform.mail.read", "platform.mail.manage"]);

    const first = await useCase.execute(admin, { ...input, password: "hunter2" });
    expect(settings.rows.get(TENANT)?.passwordCiphertext).toBe("sealed:hunter2");
    expect(first).toMatchObject({ host: "smtp.example.test", hasPassword: true });
    expect(first).not.toHaveProperty("passwordCiphertext");

    await useCase.execute(admin, { ...input, port: 2525 });
    expect(settings.rows.get(TENANT)).toMatchObject({
      port: 2525,
      passwordCiphertext: "sealed:hunter2",
    });

    await useCase.execute(admin, { ...input, password: null });
    expect(settings.rows.get(TENANT)?.passwordCiphertext).toBeNull();
  });

  it("never writes the password into the audit row", async () => {
    const { useCase, audited } = harness();
    await useCase.execute(actor(["platform.mail.read", "platform.mail.manage"]), {
      ...input,
      password: "hunter2",
    });
    expect(audited).toHaveLength(1);
    expect(JSON.stringify(audited)).not.toContain("hunter2");
  });

  it("refuses a password with no key to store it under", async () => {
    const { useCase } = harness(false);
    await expect(
      useCase.execute(actor(["platform.mail.read", "platform.mail.manage"]), {
        ...input,
        password: "x",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses a reader who may only look", async () => {
    const { useCase } = harness();
    await expect(useCase.execute(actor(["platform.mail.read"]), input)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
