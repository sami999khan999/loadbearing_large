import { describe, expect, it } from "vitest";
import type { MailSettingsRecord, PlatformReader } from "../../src/import.js";
import { SmtpEmailSenderResolver } from "../../src/smtp/smtp-email-sender.resolver.js";

const PLATFORM = "018f8c00-0000-7000-8000-000000000001";
const TENANT = "018f8c00-0000-7000-8000-000000000020";

const row = (organizationId: string, updatedAt: number, passwordCiphertext: string | null = null) =>
  ({
    organizationId,
    host: "smtp.example.test",
    port: 587,
    secure: false,
    username: passwordCiphertext ? "u" : null,
    passwordCiphertext,
    fromAddress: "a@example.test",
    updatedAt: new Date(updatedAt),
    updatedBy: TENANT,
  }) as unknown as MailSettingsRecord;

const harness = (rows: Map<string, MailSettingsRecord>) => {
  let clock = 0;
  let reads = 0;
  const lines: unknown[] = [];
  const resolver = new SmtpEmailSenderResolver(
    {
      findByOrganization: (id: string) => {
        reads += 1;
        return Promise.resolve(rows.get(id) ?? null);
      },
    } as never,
    {
      encrypt: (x: string) => x,
      decrypt: () => {
        throw new Error("rotated");
      },
    },
    { organizationId: () => Promise.resolve(PLATFORM) } as unknown as PlatformReader,
    { emit: (...args: unknown[]) => lines.push(args) } as never,
    () => clock,
  );
  return { resolver, advance: (ms: number) => (clock += ms), reads: () => reads, lines };
};

describe("SmtpEmailSenderResolver", () => {
  it("answers null for an organization with no server, and the platform's row for null", async () => {
    const { resolver } = harness(new Map([[PLATFORM, row(PLATFORM, 1)]]));
    expect(await resolver.senderFor(TENANT as never)).toBeNull();
    expect(await resolver.senderFor(null)).not.toBeNull();
    await resolver.close();
  });

  it("reuses one pooled sender until the row changes, re-reading at most once a minute", async () => {
    const rows = new Map([[TENANT, row(TENANT, 1)]]);
    const { resolver, advance, reads } = harness(rows);

    const first = await resolver.senderFor(TENANT as never);
    expect(await resolver.senderFor(TENANT as never)).toBe(first);
    expect(reads()).toBe(1);

    advance(61_000);
    expect(await resolver.senderFor(TENANT as never)).toBe(first);
    rows.set(TENANT, row(TENANT, 2));
    advance(61_000);
    expect(await resolver.senderFor(TENANT as never)).not.toBe(first);
    await resolver.close();
  });

  it("falls back, and says why, when a saved password will not decrypt", async () => {
    const { resolver, lines } = harness(new Map([[TENANT, row(TENANT, 1, "v1.a.b.c")]]));
    expect(await resolver.senderFor(TENANT as never)).toBeNull();
    expect(JSON.stringify(lines)).toContain("undecryptable");
  });
});
