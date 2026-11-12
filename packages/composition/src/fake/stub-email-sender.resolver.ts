import { type EmailSender, EmailSenderResolver } from "../import.js";

// No mail server configured anywhere: every message falls back to the deployment's sender.
export class StubEmailSenderResolver extends EmailSenderResolver {
  public override senderFor(): Promise<EmailSender | null> {
    return Promise.resolve(null);
  }
}
