import { type OrganizationId, ValidationError } from "../import.js";
import type { Authorizer, Principal } from "../primitive/index.js";
import type {
  MailDeliveryCursor,
  MailDeliveryRecord,
  MailDeliveryRepository,
} from "./mail-delivery.repository.js";

export interface ListMailDeliveriesInput {
  readonly organizationId: OrganizationId;
  readonly recipient?: string;
  readonly limit: number;
  readonly cursor?: string;
}

export interface MailDeliveryPage {
  readonly items: readonly MailDeliveryRecord[];
  readonly nextCursor: string | null;
}

// "Was this sent?" for one tenant at a time, the platform organization's included: a
// search across every tenant is never a Postgres query.
export class ListMailDeliveriesUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly deliveries: MailDeliveryRepository,
  ) {}

  public async execute(
    actor: Principal,
    input: ListMailDeliveriesInput,
  ): Promise<MailDeliveryPage> {
    this.authorizer.assert(actor, "platform.mail.read");

    const recipient = input.recipient?.trim().toLowerCase() || null;
    // One more than the page, so a full last page is known to be the last.
    const rows = await this.deliveries.list(
      input.organizationId,
      recipient,
      input.limit + 1,
      input.cursor ? ListMailDeliveriesUseCase.decode(input.cursor) : null,
    );
    const items = rows.slice(0, input.limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > input.limit && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
    };
  }

  private static decode(cursor: string): MailDeliveryCursor {
    const [iso, id, ...rest] = cursor.split("|");
    const createdAt = new Date(iso ?? "");
    if (rest.length > 0 || !id || Number.isNaN(createdAt.getTime())) {
      throw new ValidationError([{ field: "cursor", rule: "format" }]);
    }
    return { createdAt, id };
  }
}
