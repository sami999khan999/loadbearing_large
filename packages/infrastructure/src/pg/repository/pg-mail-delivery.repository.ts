import {
  and,
  desc,
  eq,
  type MailDeliveryCursor,
  type MailDeliveryRecord,
  type MailDeliveryRepository,
  type OrganizationId,
  type Placement,
  sql,
} from "../../import.js";
import { BaseRepository } from "../primitive/index.js";
import { mailDelivery } from "../schema/index.js";

export class PgMailDeliveryRepository extends BaseRepository implements MailDeliveryRepository {
  protected override readonly placement: Placement = "routed";

  public async save(delivery: MailDeliveryRecord): Promise<void> {
    await this.db.insert(mailDelivery).values(delivery);
  }

  // A keyset on `(created_at, id)`, which both indexes serve after the tenant and address.
  public async list(
    organizationId: OrganizationId,
    recipient: string | null,
    limit: number,
    before: MailDeliveryCursor | null,
  ): Promise<readonly MailDeliveryRecord[]> {
    return this.db
      .select()
      .from(mailDelivery)
      .where(
        and(
          eq(mailDelivery.organizationId, organizationId),
          recipient === null ? undefined : eq(mailDelivery.recipient, recipient),
          before
            ? sql`(${mailDelivery.createdAt}, ${mailDelivery.id}) < (${before.createdAt}, ${before.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(desc(mailDelivery.createdAt), desc(mailDelivery.id))
      .limit(limit);
  }
}
