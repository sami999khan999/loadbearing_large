import type { OrganizationId } from "../import.js";
import type { EmailSender } from "./email.sender.js";

// The mail server a message goes out through (`26.11`). `null` asks for the platform's
// default; an answer of `null` means none is configured, and the deployment's is used.
export abstract class EmailSenderResolver {
  public abstract senderFor(organizationId: OrganizationId | null): Promise<EmailSender | null>;
}
