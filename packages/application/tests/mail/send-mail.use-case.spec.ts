import { Identifiers } from "@loadbearing/contracts";
import { ValidationError } from "@loadbearing/errors";
import { CapabilitySet } from "@loadbearing/permissions";
import { describe, expect, it } from "vitest";
import { SendMailUseCase } from "../../src/mail/send-mail.use-case.js";
import type {
  EmailMessage,
  EmailReceipt,
  EmailSender,
  MailRenderer,
  RenderedMail,
} from "../../src/port/index.js";
import { Principal } from "../../src/primitive/principal.js";

const ORG = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000010");
const SYSTEM = Identifiers.userId.parse("018f8c00-0000-7000-8000-000000000011");

const platform = () =>
  new Principal(
    ORG,
    SYSTEM,
    CapabilitySet.from({ wildcard: false, org: { grants: [], denies: [] }, goals: {} }),
  );

class RecordingRenderer implements MailRenderer {
  public readonly rendered: { template: string; locale: string; params: unknown }[] = [];

  public render(template: string, locale: string, params: unknown): Promise<RenderedMail> {
    this.rendered.push({ template, locale, params });
    return Promise.resolve({ subject: "s", text: "t", html: "<p>h</p>" });
  }
}

class RecordingSender implements EmailSender {
  public readonly sent: EmailMessage[] = [];

  public send(message: EmailMessage): Promise<EmailReceipt> {
    this.sent.push(message);
    return Promise.resolve({ messageId: null });
  }
}

const build = () => {
  const renderer = new RecordingRenderer();
  const email = new RecordingSender();
  return { renderer, email, useCase: new SendMailUseCase(renderer, email) };
};

describe("SendMailUseCase", () => {
  it("renders the template and sends both parts", async () => {
    const { renderer, email, useCase } = build();

    await useCase.execute(platform(), {
      template: "auth.verify",
      to: "a@example.test",
      locale: "en",
      params: { url: "https://example.test/verify?token=abc" },
    });

    expect(renderer.rendered).toHaveLength(1);
    // Both parts reach the transport: a text-only send is what the HTML layout replaced.
    expect(email.sent[0]).toMatchObject({ to: "a@example.test", text: "t", html: "<p>h</p>" });
  });

  // A job carries a string, so an unknown key is a runtime value rather than a compile
  // error — and it must fail where nothing has been sent yet.
  it("rejects a template the manifest does not know, before the transport", async () => {
    const { email, useCase } = build();

    const thrown = await useCase
      .execute(platform(), {
        template: "auth.nope",
        to: "a@example.test",
        locale: "en",
        params: {},
      })
      .catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(ValidationError);
    expect(email.sent).toEqual([]);
  });

  it("rejects params that do not match the template, before the transport", async () => {
    const { renderer, email, useCase } = build();

    const thrown = await useCase
      .execute(platform(), {
        template: "member.invitation",
        to: "a@example.test",
        locale: "en",
        // `inviter` and `organization` missing, and `url` is not one.
        params: { url: "not-a-url" },
      })
      .catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(ValidationError);
    // Nothing rendered either: a message that cannot be built will not build on a retry.
    expect(renderer.rendered).toEqual([]);
    expect(email.sent).toEqual([]);
  });

  it("hands the renderer the recipient's locale rather than a default", async () => {
    const { renderer, useCase } = build();

    await useCase.execute(platform(), {
      template: "auth.otp",
      to: "a@example.test",
      locale: "bn",
      params: { code: "123456" },
    });

    expect(renderer.rendered[0]?.locale).toBe("bn");
  });

  // `26.11`: tenant, then platform default, then `.env` — and sign-in mail never the tenant.
  describe("choosing the mail server", () => {
    const TENANT = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000020");

    const resolving = (servers: { tenant: boolean; platform: boolean }) => {
      const renderer = new RecordingRenderer();
      const env = new RecordingSender();
      const tenant = new RecordingSender();
      const platformDefault = new RecordingSender();
      const asked: (string | null)[] = [];
      const senders = {
        senderFor: (organizationId: string | null) => {
          asked.push(organizationId);
          if (organizationId === null)
            return Promise.resolve(servers.platform ? platformDefault : null);
          return Promise.resolve(servers.tenant ? tenant : null);
        },
      };
      const useCase = new SendMailUseCase(renderer, env, senders);
      return { useCase, env, tenant, platformDefault, asked };
    };

    const invitation = {
      template: "member.invitation",
      to: "a@example.test",
      locale: "en" as const,
      params: { url: "https://example.test/i", inviter: "Ada", organization: "Acme" },
      organizationId: TENANT,
    };

    it("sends a tenant's mail through its own server", async () => {
      const { useCase, tenant, env } = resolving({ tenant: true, platform: true });
      await useCase.execute(platform(), invitation);
      expect([tenant.sent.length, env.sent.length]).toEqual([1, 0]);
    });

    it("falls back to the platform default, then to the deployment's", async () => {
      const first = resolving({ tenant: false, platform: true });
      await first.useCase.execute(platform(), invitation);
      expect(first.platformDefault.sent).toHaveLength(1);

      const second = resolving({ tenant: false, platform: false });
      await second.useCase.execute(platform(), invitation);
      expect(second.env.sent).toHaveLength(1);
    });

    it("never sends sign-in mail through a tenant's server", async () => {
      const { useCase, tenant, platformDefault, asked } = resolving({
        tenant: true,
        platform: true,
      });
      await useCase.execute(platform(), {
        template: "auth.verify",
        to: "a@example.test",
        locale: "en",
        params: { url: "https://example.test/verify?token=abc" },
        organizationId: TENANT,
      });
      expect(asked).toEqual([null]);
      expect([tenant.sent.length, platformDefault.sent.length]).toEqual([0, 1]);
    });
  });
});
