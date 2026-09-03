import {
  type ContentSource,
  type EmailSender,
  type InvitationMail,
  InvitationMailer,
  Locales,
  ROUTES,
} from "../import.js";

// The same join `ContentAuthMailer` makes — a port from `application`, the copy from
// `content`, the transport from `application`'s `EmailSender` — for the one message
// the member slice sends. Lives here because `application` may know neither the words
// nor the route, and `content` may not know how a message is sent.
export class ContentInvitationMailer extends InvitationMailer {
  public constructor(
    private readonly content: ContentSource,
    private readonly email: EmailSender,
    // `AUTH_URL`, which is the origin the app is served from. The link has to be
    // absolute — it is opened from a mail client, not from a page on this site.
    private readonly baseUrl: string,
  ) {
    super();
  }

  public override async send(mail: InvitationMail): Promise<void> {
    // The default locale, not the recipient's: they may not have an account yet, so
    // there is no `users.locale` to read.
    const t = await this.content.translator(Locales.DEFAULT, ["email"]);
    const params = { inviter: mail.inviterName, organization: mail.organizationName };
    // `ROUTES.shell.invitation` is the same literal the landing page's `createFileRoute`
    // spells, so the two agree by construction rather than by memory.
    const url = `${this.baseUrl}${ROUTES.shell.invitation}/${mail.token}`;

    await this.email.send({
      to: mail.to,
      subject: t.t("email.invitation.subject", params),
      // Text only, like every transactional message here: the link is the message.
      text: [
        t.t("email.invitation.body", params),
        `${t.t("email.invitation.action")}: ${url}`,
      ].join("\n\n"),
    });
  }
}
