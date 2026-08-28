import { type EmailMessage, EmailSender } from "../import.js";

// Records instead of sending. "A verification message went to that address, once, and
// its body carries the callback URL" is the assertion a sign-up test actually wants —
// and it is the only way to make one without a live SMTP server in the suite.
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
