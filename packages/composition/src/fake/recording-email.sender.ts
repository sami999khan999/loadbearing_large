import { type EmailMessage, EmailSender } from "../import.js";

// Records instead of sending: "a verification message went to that address, once, with
// the callback URL in it" is the assertion, and it needs no SMTP server.
export class RecordingEmailSender extends EmailSender {
  private readonly messages: EmailMessage[] = [];

  public override send(message: EmailMessage): Promise<void> {
    this.messages.push(message);
    return Promise.resolve();
  }

  public sent(): readonly EmailMessage[] {
    return this.messages;
  }

  public sentTo(address: string): readonly EmailMessage[] {
    return this.messages.filter((message) => message.to === address);
  }
}
