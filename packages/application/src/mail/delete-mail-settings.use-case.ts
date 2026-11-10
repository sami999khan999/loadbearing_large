import type { OrganizationId } from "../import.js";
import type { PlatformReader } from "../platform/index.js";
import type { ActivityLogger, UnitOfWork } from "../port/index.js";
import { type Authorizer, Principal } from "../primitive/index.js";
import type { MailSettingsRepository } from "./mail-settings.repository.js";

// The organization falls back: a tenant to the platform default, the platform to `.env`.
export class DeleteMailSettingsUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly settings: MailSettingsRepository,
    private readonly platform: PlatformReader,
    private readonly activity: ActivityLogger,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  public async execute(
    actor: Principal,
    input: { readonly organizationId: OrganizationId },
  ): Promise<void> {
    this.authorizer.assert(actor, "platform.mail.manage");

    const auditor = new Principal(
      await this.platform.organizationId(),
      actor.userId,
      actor.capabilities,
      actor.kind,
    );

    await this.unitOfWork.run(async () => {
      await this.settings.delete(input.organizationId);
      await this.activity.record(auditor, "platform.mail.settings.removed", {
        organizationId: input.organizationId,
      });
    });
  }
}
