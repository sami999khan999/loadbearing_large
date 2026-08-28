import { AuthMailer, type ContentSource, type EmailSender, Locales } from "../import.js";

// The one place `AuthMailer` (a port in `auth`), `EmailSender` (a port in `application`)
// and `ContentSource` (the copy) meet — which is why it lives in the wiring package and
// not in either of the two packages it joins. `auth` must not learn what a user reads;
// `content` must not learn how a message is sent.
//
// The shape is `apps/worker`'s `DigestComposer` one layer down: copy through
// `ContentSource`, so a subject line and a button label share one `Translator`, one
// interpolation implementation, and one typo fix.
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

  // The default locale, not a negotiated one. Better Auth calls these from a token
  // endpoint that carries no request in `sendResetPassword`'s signature and no stored
  // preference — and `users.locale` exists precisely so this becomes a lookup rather
  // than a guess the day the port grows a recipient rather than an address.
  private async send(
    to: string,
    url: string,
    subject: "email.verify.subject" | "email.reset.subject",
    body: "email.verify.body" | "email.reset.body",
    action: "email.verify.action" | "email.reset.action",
  ): Promise<void> {
    const t = await this.content.translator(Locales.DEFAULT, ["email"]);

    await this.email.send({
      to,
      subject: t.t(subject),
      // Text only. The link is the message, and a plain-text transactional email is
      // the one shape every client renders and no spam filter penalises.
      text: [t.t(body), `${t.t(action)}: ${url}`].join("\n\n"),
    });
  }
}
