import type {
  KeysetQuery,
  NotificationCategory,
  NotificationDto,
  NotificationId,
  NotificationKind,
  OrganizationId,
  UserId,
} from "../import.js";

export interface NotificationRecord {
  readonly id: NotificationId;
  readonly kind: NotificationKind;
  readonly category: NotificationCategory;
  readonly params: Readonly<Record<string, string>>;
  readonly link: string | null;
  readonly readAt: Date | null;
  readonly createdAt: Date;
}

export interface NotificationPage {
  readonly items: readonly NotificationRecord[];
  readonly nextCursor: string | null;
}

// What `saveMany` writes. `eventId` is the idempotency key, not decoration: delivery is
// at-least-once, so a replayed event has to find a row rather than write a second one.
export interface NewNotification {
  readonly organizationId: OrganizationId;
  readonly userId: UserId;
  readonly eventId: string;
  readonly kind: NotificationKind;
  readonly category: NotificationCategory;
  readonly params: Readonly<Record<string, string>>;
  readonly link: string | null;
  // What the notification is about, when that is narrower than the event — a
  // conversation id, say. Null for the rows whose subject is the event itself.
  readonly subjectId: string | null;
  // The **event's** timestamp, never the clock's. It is part of the dedupe key, which a
  // partitioned table forces to carry the partition column — see the pg schema.
  readonly createdAt: Date;
}

export interface UnreadQuery extends KeysetQuery {
  readonly unreadOnly: boolean;
}

export abstract class NotificationRepository {
  public abstract list(
    organizationId: OrganizationId,
    userId: UserId,
    query: UnreadQuery,
  ): Promise<NotificationPage>;

  // Capped rather than exact: past the cap the badge reads "99+", and the true number is
  // a count nobody looks at over a table that grows forever.
  public abstract countUnread(
    organizationId: OrganizationId,
    userId: UserId,
    cap: number,
  ): Promise<number>;

  // One statement for N recipients, and `ON CONFLICT DO NOTHING` on the dedupe index.
  // Returns how many rows were new, which is what tells the caller whom to notify.
  public abstract saveMany(records: readonly NewNotification[]): Promise<readonly UserId[]>;

  // "Is there already an unread one of these about this thing." One indexed query, and
  // what keeps a burst of ten messages to one bell item rather than ten.
  public abstract existsUnread(
    organizationId: OrganizationId,
    userId: UserId,
    kind: NotificationKind,
    subjectId: string,
  ): Promise<boolean>;

  // `createdAt` is the partition hint. Without it Postgres has to look in every month.
  public abstract markRead(
    organizationId: OrganizationId,
    userId: UserId,
    id: NotificationId,
    createdAt: Date,
    at: Date,
  ): Promise<void>;

  public abstract markAllRead(
    organizationId: OrganizationId,
    userId: UserId,
    at: Date,
  ): Promise<void>;

  // For the digest, which asks "what has this person not read since the last one".
  public abstract listUnreadSince(
    organizationId: OrganizationId,
    userId: UserId,
    since: Date,
    limit: number,
  ): Promise<readonly NotificationRecord[]>;
}

export type { NotificationDto };
