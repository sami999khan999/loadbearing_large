import type { OrganizationId, UserId } from "../import.js";

export type MailDeliveryStatus = "sent" | "failed";

// One row per message that reached an outcome: sent, or failed on its last attempt. Mail
// that belongs to no tenant is the platform organization's.
export interface MailDeliveryRecord {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly userId: UserId | null;
  readonly template: string;
  // Lower-cased, so a search matches however the address was typed.
  readonly recipient: string;
  readonly status: MailDeliveryStatus;
  // The id the mail server gave, which a provider's own log is searched by. Null on failure.
  readonly messageId: string | null;
  readonly attempts: number;
  readonly createdAt: Date;
}

export interface MailDeliveryCursor {
  readonly createdAt: Date;
  readonly id: string;
}

// Append-only, written after the send and never read by it (`26.10`): the record of what
// happened, not state the send path depends on.
export abstract class MailDeliveryRepository {
  public abstract save(delivery: MailDeliveryRecord): Promise<void>;

  // Newest first, within one tenant; `recipient` narrows to one address.
  public abstract list(
    organizationId: OrganizationId,
    recipient: string | null,
    limit: number,
    before: MailDeliveryCursor | null,
  ): Promise<readonly MailDeliveryRecord[]>;
}
