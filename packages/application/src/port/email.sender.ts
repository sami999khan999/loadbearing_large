export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  // Plain text is required and HTML is not, deliberately. Every client renders text,
  // a text part is what keeps a message out of a spam folder, and a transactional
  // email whose whole content is a link does not need a layout to be readable.
  readonly text: string;
  readonly html?: string;
}

// No provider, no credentials, no from-address — those are adapter configuration, the
// same way a bucket and a region are absent from `StorageGateway`.
//
// One method, because the system sends transactional messages and nothing else. A
// campaign, a template registry, or a suppression list is a different product with a
// different port; adding them here would make every adapter owe an implementation of
// features the domain never asks for.
export abstract class EmailSender {
  // Resolves when the transport has accepted the message, which is not the same as
  // delivery and never can be. A caller that needs delivery confirmation is asking a
  // question only a webhook from the provider can answer.
  public abstract send(message: EmailMessage): Promise<void>;
}
