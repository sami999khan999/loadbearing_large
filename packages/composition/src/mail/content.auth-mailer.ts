import { AuthMailer, type ContentSource, type EmailSender, Locales } from "../import.js";

// Where `AuthMailer`, `EmailSender` and `ContentSource` meet, which is why it is in the
// wiring package: `auth` owes no words and `content` owes no transport.
export class ContentAuthMailer extends AuthMailer {
  public constructor(
    private readonly content: ContentSource,
    private readonly email: EmailSender,
  ) {
    super();
  }

  public override async sendVerification(to: string, url: string): Promise<void> {
    await this.send(to, url, "email.verify.subject", "email.verify.body", "email.verify.action");
  }

  public override async sendPasswordReset(to: string, url: string): Promise<void> {
    await this.send(to, url, "email.reset.subject", "email.reset.body", "email.reset.action");
  }

  public override async sendEmailChangeConfirmation(to: string, url: string): Promise<void> {
    await this.send(to, url, "email.change.subject", "email.change.body", "email.change.action");
  }

  // Not routed through `send`, whose shape is "one sentence and a link": rendering a
  // code as a URL makes a second factor clickable on the wrong device.
  public override async sendTwoFactorOtp(to: string, code: string): Promise<void> {
    const t = await this.content.translator(Locales.DEFAULT, ["email"]);

    await this.email.send({
      to,
      subject: t.t("email.otp.subject"),
      text: [t.t("email.otp.body", { code }), t.t("email.otp.expiry")].join("\n\n"),
    });
  }

  // The default locale: Better Auth calls these from a token endpoint carrying no
  // request. `users.locale` is what makes it a lookup once the port grows a recipient.
  private async send(
    to: string,
    url: string,
    subject: "email.verify.subject" | "email.reset.subject" | "email.change.subject",
    body: "email.verify.body" | "email.reset.body" | "email.change.body",
    action: "email.verify.action" | "email.reset.action" | "email.change.action",
  ): Promise<void> {
    const t = await this.content.translator(Locales.DEFAULT, ["email"]);

    await this.email.send({
      to,
      subject: t.t(subject),
      // Text only: the link is the message, and every client renders text.
      text: [t.t(body), `${t.t(action)}: ${url}`].join("\n\n"),
    });
  }
}
