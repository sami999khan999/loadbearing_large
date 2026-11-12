import { type Clock, type OrganizationId, type UserId, Uuid } from "../import.js";
import type { PlatformReader } from "../platform/index.js";
import type { MailDeliveryRepository, MailDeliveryStatus } from "./mail-delivery.repository.js";

export interface RecordMailDeliveryInput {
  readonly organizationId: OrganizationId | null;
  readonly userId: UserId | null;
  readonly template: string;
  readonly to: string;
  readonly status: MailDeliveryStatus;
  readonly messageId: string | null;
  readonly attempts: number;
}

// Called by the mail consumer once a message has an outcome. It asserts nothing: the
// consumer acts for the platform, and the caller decides only what happened.
export class RecordMailDeliveryUseCase {
  public constructor(
    private readonly deliveries: MailDeliveryRepository,
    private readonly platform: PlatformReader,
    private readonly clock: Clock,
  ) {}

  // The tenant the row is placed under, which the caller needs before it opens the shard.
  public async tenantOf(organizationId: OrganizationId | null): Promise<OrganizationId> {
    return organizationId ?? (await this.platform.organizationId());
  }

  public async execute(input: RecordMailDeliveryInput): Promise<void> {
    await this.deliveries.save({
      id: Uuid.v7(),
      organizationId: await this.tenantOf(input.organizationId),
      userId: input.userId,
      template: input.template,
      recipient: input.to.trim().toLowerCase(),
      status: input.status,
      messageId: input.messageId,
      attempts: input.attempts,
      createdAt: this.clock.now(),
    });
  }
}
