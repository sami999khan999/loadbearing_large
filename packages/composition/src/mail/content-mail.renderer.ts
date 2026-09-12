import {
  type ContentSource,
  type Locale,
  MailRenderer,
  type MailTemplateKey,
  type MailTemplateParams,
  type RenderedMail,
  type Translator,
} from "../import.js";
import { MailLayout } from "./mail-layout.js";

// Where the `email` catalog and the mail layout meet, which is why it is in the wiring
// package: `application` owes no words and `content` owes no markup.
export class ContentMailRenderer extends MailRenderer {
  public constructor(private readonly content: ContentSource) {
    super();
  }

  public override async render<K extends MailTemplateKey>(
    template: K,
    locale: Locale,
    params: MailTemplateParams<K>,
  ): Promise<RenderedMail> {
    // The recipient's locale, resolved per message. `Translator` is immutable, so this is
    // a lookup rather than a second rendering system.
    const t = await this.content.translator(locale, ["email"]);

    // Widened to the union before the switch: TypeScript narrows a union, not a type
    // parameter, so switching on `template` directly leaves the default unreachable-typed.
    const key: MailTemplateKey = template;

    switch (key) {
      case "auth.verify":
        return ContentMailRenderer.link(t, "verify", params as MailTemplateParams<"auth.verify">);
      case "auth.reset":
        return ContentMailRenderer.link(t, "reset", params as MailTemplateParams<"auth.reset">);
      case "auth.change":
        return ContentMailRenderer.link(t, "change", params as MailTemplateParams<"auth.change">);
      case "auth.otp":
        return ContentMailRenderer.otp(t, params as MailTemplateParams<"auth.otp">);
      case "member.invitation":
        return ContentMailRenderer.invitation(t, params as MailTemplateParams<"member.invitation">);
      default:
        // Exhaustive: a key added to the manifest fails to compile here until it has a
        // template, which is the whole reason the manifest is closed.
        return ContentMailRenderer.unreachable(key);
    }
  }

  // The three that are one sentence and a link. They differ only in their key prefix, so
  // writing them out three times would be three places to forget the plain-text part.
  private static link(
    t: Translator,
    kind: "verify" | "reset" | "change",
    params: { readonly url: string },
  ): RenderedMail {
    const subject = t.t(`email.${kind}.subject`);

    return ContentMailRenderer.compose(subject, [t.t(`email.${kind}.body`)], {
      label: t.t(`email.${kind}.action`),
      url: params.url,
    });
  }

  // No action link, deliberately: a code rendered as a URL is a second factor made
  // clickable on the device the sign-in is not happening on.
  private static otp(t: Translator, params: { readonly code: string }): RenderedMail {
    return ContentMailRenderer.compose(t.t("email.otp.subject"), [
      t.t("email.otp.body", { code: params.code }),
      t.t("email.otp.expiry"),
    ]);
  }

  private static invitation(
    t: Translator,
    params: { readonly url: string; readonly inviter: string; readonly organization: string },
  ): RenderedMail {
    const copy = { inviter: params.inviter, organization: params.organization };

    return ContentMailRenderer.compose(
      t.t("email.invitation.subject", copy),
      [t.t("email.invitation.body", copy)],
      { label: t.t("email.invitation.action"), url: params.url },
    );
  }

  // The subject doubles as the heading. Two keys per message that always said the same
  // thing would be two translations to keep in step for no reader's benefit.
  private static compose(
    subject: string,
    paragraphs: readonly string[],
    action?: { readonly label: string; readonly url: string },
  ): RenderedMail {
    const content = { heading: subject, paragraphs, ...(action ? { action } : {}) };

    return { subject, text: MailLayout.text(content), html: MailLayout.html(content) };
  }

  private static unreachable(template: never): never {
    throw new Error(`Unrendered mail template: ${String(template)}`);
  }
}
