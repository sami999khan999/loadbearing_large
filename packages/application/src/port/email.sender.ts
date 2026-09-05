export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  // Text required, HTML not: every client renders text, and a text part is what keeps a
  // message out of a spam folder.
  readonly text: string;
  readonly html?: string;
}

// No provider, credentials or from-address — those are adapter configuration. One
// method, because a campaign or a suppression list is a different port.
export abstract class EmailSender {
  // Accepted by the transport, which is not delivery and never can be: only a provider
  // webhook can answer that.
  public abstract send(message: EmailMessage): Promise<void>;
}
