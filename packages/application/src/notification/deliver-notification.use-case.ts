import {
  type DomainEvent,
  type NotificationChannel,
  type NotificationMode,
  type UserId,
  Uuid,
} from "../import.js";
import type { CacheStore, MailPublisher, RealtimePublisher } from "../port/index.js";
import { type Principal, RealtimeChannels } from "../primitive/index.js";
import { CountUnreadNotificationsUseCase } from "./count-unread-notifications.use-case.js";
import { NotificationPolicy, type PolicyRow } from "./notification.policy.js";
import type { NewNotification, NotificationRepository } from "./notification.repository.js";
import type {
  NotificationPreferenceRepository,
  PreferenceRecord,
} from "./notification-preference.repository.js";
import type { NotificationRecipientReader, Recipient } from "./notification-recipient.reader.js";

// One page of recipients. A policy that resolves to more than this in one organization
// is the fan-out `data-and-scale.md` §6 says to load-test before trusting.
const RECIPIENT_LIMIT = 500;

// What the subscriber hands in: the event, nothing else. It asserts no permission —
// see docs/reference/ports.md.
export class DeliverNotificationUseCase {
  public constructor(
    private readonly notifications: NotificationRepository,
    private readonly preferences: NotificationPreferenceRepository,
    private readonly recipients: NotificationRecipientReader,
    private readonly mail: MailPublisher,
    private readonly realtime: RealtimePublisher,
    private readonly cache: CacheStore,
  ) {}

  public async execute(actor: Principal, event: DomainEvent): Promise<void> {
    const row = NotificationPolicy.rowFor(event.name);
    if (!row) return;

    const audience = await this.audienceFor(event, row);
    if (audience.length === 0) return;

    // One statement for N recipients, and idempotent on `(event_id, user_id, kind)`.
    // The rows it reports as new are the ones nobody has been told about yet.
    const written = await this.notifications.saveMany(
      audience.map((recipient) => DeliverNotificationUseCase.rowFor(event, row, recipient)),
    );
    if (written.length === 0) return;

    const fresh = audience.filter((recipient) => written.includes(recipient.userId));
    const modes = await this.preferences.findFor(
      event.organizationId,
      fresh.map((recipient) => recipient.userId),
      row.category,
    );

    await this.notifyInApp(event, fresh, modes, row);
    await this.notifyByEmail(event, fresh, modes, row);
    void actor;
  }

  private async audienceFor(event: DomainEvent, row: PolicyRow): Promise<readonly Recipient[]> {
    const organizationId = event.organizationId;

    switch (row.recipients.kind) {
      case "none":
        return [];
      case "subject": {
        const subject = DeliverNotificationUseCase.subjectOf(event);
        if (!subject) return [];
        const recipient = await this.recipients.user(organizationId, subject);
        return recipient ? [recipient] : [];
      }
      case "organizationMembers": {
        const all = await this.recipients.organizationMembers(
          organizationId,
          row.recipients.holding,
          RECIPIENT_LIMIT,
          null,
        );
        // Never the actor: being told about a thing you just did is noise, and it is the
        // single most common reason a notification system gets muted.
        return all.filter((recipient) => recipient.userId !== event.actorId);
      }
    }
  }

  // Best effort, and after the row is written: a failed publish is a missing frame, and
  // the client refetches. A failed *row* would be a missing notification.
  private async notifyInApp(
    event: DomainEvent,
    recipients: readonly Recipient[],
    modes: readonly PreferenceRecord[],
    row: PolicyRow,
  ): Promise<void> {
    for (const recipient of recipients) {
      await this.cache.delete(
        CountUnreadNotificationsUseCase.key(event.organizationId, recipient.userId),
      );

      if (DeliverNotificationUseCase.modeFor(modes, recipient.userId, "in_app", event) === "off") {
        continue;
      }

      await this.realtime.publish(RealtimeChannels.user(event.organizationId, recipient.userId), {
        kind: "event",
        id: Uuid.v7(),
        name: "notification.created",
        at: event.occurredAt,
        payload: { kind: row.kind },
      });
    }
  }

  // `immediate` only. `digest` recipients are collected by the daily schedule, and `off`
  // means in-app only rather than nothing at all.
  private async notifyByEmail(
    event: DomainEvent,
    recipients: readonly Recipient[],
    modes: readonly PreferenceRecord[],
    row: PolicyRow,
  ): Promise<void> {
    for (const recipient of recipients) {
      const mode = DeliverNotificationUseCase.modeFor(modes, recipient.userId, "email", event);
      if (mode !== "immediate") continue;

      await this.mail.publish({
        template: "notification.single",
        to: recipient.email,
        locale: recipient.locale,
        params: { kind: row.kind, name: recipient.name, url: row.link(event) ?? "" },
        organizationId: event.organizationId,
        userId: recipient.userId,
        // The row's own id would do, but the event id plus the recipient is what makes a
        // replayed event send one message rather than two.
        dedupeKey: `notification_${event.id}_${recipient.userId}`,
      });
    }
  }

  private static modeFor(
    modes: readonly PreferenceRecord[],
    userId: UserId,
    channel: NotificationChannel,
    event: DomainEvent,
  ): NotificationMode {
    const stored = modes.find((mode) => mode.userId === userId && mode.channel === channel);
    return stored?.mode ?? NotificationPolicy.defaultMode(event.name, channel);
  }

  private static rowFor(event: DomainEvent, row: PolicyRow, to: Recipient): NewNotification {
    return {
      organizationId: event.organizationId,
      userId: to.userId,
      eventId: event.id,
      kind: row.kind,
      category: row.category,
      // The values the copy interpolates, never the row. A snapshot here would be read
      // by somebody who was never authorised for the thing it describes.
      params: { actorId: event.actorId },
      link: row.link(event),
      // The event's own instant. It is half the dedupe key, so a redelivery must compute
      // the same one — and a notification is about when the thing happened anyway.
      createdAt: event.occurredAt,
    };
  }

  // Named positively rather than by exclusion. The event union has grown past the three
  // this policy knows, and an `!== "member.invited"` test would read a field off the rest.
  private static subjectOf(event: DomainEvent): UserId | null {
    if (event.name === "member.joined" || event.name === "member.role.changed") {
      return event.payload.userId;
    }

    return null;
  }
}
