import type { OrganizationId, UserId } from "../import.js";
import type { MailPublisher } from "../port/index.js";
import type { Principal } from "../primitive/index.js";
import type { NotificationRepository } from "./notification.repository.js";
import type { NotificationPreferenceRepository } from "./notification-preference.repository.js";
import type { NotificationRecipientReader } from "./notification-recipient.reader.js";

export interface SendNotificationDigestInput {
  readonly organizationId: OrganizationId;
  // The ISO day the digest covers, which is also half its dedupe key. From the job
  // rather than the clock, so a retried job sends the same day's digest.
  readonly day: string;
}

// A page of recipients per round. Keyset rather than offset for the reason every list
// here uses it: the page after the ten-thousandth costs the same as the first.
const PAGE = 200;

// Enough to say "and 47 more". Rendering every row would be a second layout to keep
// translated, and the digest links to the inbox.
const SAMPLE = 100;

const DAY_MS = 24 * 60 * 60 * 1000;

export class SendNotificationDigestUseCase {
  public constructor(
    private readonly notifications: NotificationRepository,
    private readonly preferences: NotificationPreferenceRepository,
    private readonly recipients: NotificationRecipientReader,
    private readonly mail: MailPublisher,
  ) {}

  public async execute(actor: Principal, input: SendNotificationDigestInput): Promise<void> {
    const since = new Date(new Date(`${input.day}T00:00:00.000Z`).getTime() - DAY_MS);
    let after: UserId | null = null;

    // Paged, because a digest over a large tenant is the one job here whose recipient
    // list does not fit in memory and whose failure mode is silent truncation.
    for (;;) {
      const page = await this.preferences.digestRecipients(input.organizationId, PAGE, after);
      if (page.length === 0) break;

      await this.sendTo(input, page, since);

      after = page.at(-1) ?? null;
      if (page.length < PAGE) break;
    }

    void actor;
  }

  private async sendTo(
    input: SendNotificationDigestInput,
    userIds: readonly UserId[],
    since: Date,
  ): Promise<void> {
    // One query for the page's addresses and locales, not one per recipient.
    const people = await this.recipients.users(input.organizationId, userIds);

    for (const person of people) {
      const unread = await this.notifications.listUnreadSince(
        input.organizationId,
        person.userId,
        since,
        SAMPLE,
      );
      // Nothing to say. A daily message reading "you have 0 notifications" is how a
      // digest gets filtered.
      if (unread.length === 0) continue;

      await this.mail.publish({
        template: "notification.digest",
        to: person.email,
        locale: person.locale,
        params: {
          count: unread.length,
          name: person.name,
          organization: input.organizationId,
          url: "/notifications",
        },
        organizationId: input.organizationId,
        userId: person.userId,
        // Organization, person and day. A redelivered job produces the same key, so a
        // retry sends one message rather than a second copy of the same morning.
        dedupeKey: `digest_${input.organizationId}_${person.userId}_${input.day}`,
      });
    }
  }
}
