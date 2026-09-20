import type { NotificationCategory, OrganizationId, UserId } from "../import.js";
import type { MailPublisher, OrganizationReader } from "../port/index.js";
import type { Principal } from "../primitive/index.js";
import { NotificationPolicy } from "./notification.policy.js";
import type { NotificationRecord, NotificationRepository } from "./notification.repository.js";
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

// The categories a preference can be stored against. Read per page rather than per
// person, so the page costs one query each instead of one per recipient.
const CATEGORIES: readonly NotificationCategory[] = Object.freeze(["membership", "messaging"]);

const storedKey = (userId: UserId, category: NotificationCategory) => `${userId}:${category}`;

export class SendNotificationDigestUseCase {
  public constructor(
    private readonly notifications: NotificationRepository,
    private readonly preferences: NotificationPreferenceRepository,
    private readonly recipients: NotificationRecipientReader,
    private readonly mail: MailPublisher,
    private readonly organizations: OrganizationReader,
  ) {}

  public async execute(actor: Principal, input: SendNotificationDigestInput): Promise<void> {
    const since = new Date(new Date(`${input.day}T00:00:00.000Z`).getTime() - DAY_MS);
    // Once per run, not per recipient. The footer reads "you belong to {organization}",
    // and the id is what a person saw there before this.
    const organization = (await this.organizations.nameOf(input.organizationId)) ?? "";
    let after: UserId | null = null;

    // Paged, because a digest over a large tenant is the one job here whose recipient
    // list does not fit in memory and whose failure mode is silent truncation.
    for (;;) {
      const page = await this.notifications.recipientsWithUnreadSince(
        input.organizationId,
        since,
        PAGE,
        after,
      );
      if (page.length === 0) break;

      await this.sendTo(input, page, since, organization);

      after = page.at(-1) ?? null;
      if (page.length < PAGE) break;
    }

    void actor;
  }

  private async sendTo(
    input: SendNotificationDigestInput,
    userIds: readonly UserId[],
    since: Date,
    organization: string,
  ): Promise<void> {
    // One query for the page's addresses and locales, not one per recipient.
    const people = await this.recipients.users(input.organizationId, userIds);
    const stored = await this.storedModes(input.organizationId, userIds);

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
      // The candidate list is everyone with unread rows, so this is where the reader's
      // own answer is applied — stored if they set one, the policy's default if not.
      if (!SendNotificationDigestUseCase.wantsDigest(stored, person.userId, unread)) continue;

      await this.mail.publish({
        template: "notification.digest",
        to: person.email,
        locale: person.locale,
        params: {
          count: unread.length,
          name: person.name,
          organization,
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

  // One query per category for the whole page. `findFor` takes many users and one
  // category, which is what keeps this two round trips rather than two per person.
  private async storedModes(
    organizationId: OrganizationId,
    userIds: readonly UserId[],
  ): Promise<ReadonlyMap<string, string>> {
    const modes = new Map<string, string>();

    for (const category of CATEGORIES) {
      const rows = await this.preferences.findFor(organizationId, userIds, category);
      for (const row of rows) {
        if (row.channel !== "email") continue;
        modes.set(storedKey(row.userId, row.category), row.mode);
      }
    }

    return modes;
  }

  // One unread row on digest is enough. A reader who set `messaging` to digest and left
  // `membership` alone still gets a digest, and it is the messaging rows that earned it.
  private static wantsDigest(
    stored: ReadonlyMap<string, string>,
    userId: UserId,
    unread: readonly NotificationRecord[],
  ): boolean {
    return unread.some((row) => {
      const mode =
        stored.get(storedKey(userId, row.category)) ??
        NotificationPolicy.defaultModeForKind(row.kind, "email");

      return mode === "digest";
    });
  }
}
