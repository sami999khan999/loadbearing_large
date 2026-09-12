import type {
  DomainEvent,
  DomainEventName,
  NotificationCategory,
  NotificationChannel,
  NotificationKind,
  NotificationMode,
  PermissionKey,
} from "../import.js";

// Who a notification goes to, as a rule rather than a query. `none` is a real answer:
// `member.invited` has no recipient with an account yet.
export type RecipientRule =
  | { readonly kind: "none" }
  | { readonly kind: "subject" }
  | { readonly kind: "organizationMembers"; readonly holding: PermissionKey };

export interface PolicyRow {
  readonly kind: NotificationKind;
  readonly category: NotificationCategory;
  readonly recipients: RecipientRule;
  readonly defaultMode: Readonly<Record<NotificationChannel, NotificationMode>>;
  readonly link: (event: DomainEvent) => string | null;
}

// A frozen table, one row per event that produces a notification. An event absent from
// it produces none, which is how most events behave and is not a gap.
const ROWS = Object.freeze({
  // Nobody: the invitee has no account, so there is no inbox to write to. The invitation
  // mail is the notification, and it is already sent.
  "member.invited": {
    kind: "member.joined",
    category: "membership",
    recipients: { kind: "none" },
    defaultMode: { in_app: "off", email: "off" },
    link: () => null,
  },
  "member.joined": {
    kind: "member.joined",
    category: "membership",
    // The people who can act on it. Not the whole organization: that is the write
    // amplification `data-and-scale.md` §6 warns about, per joiner.
    recipients: { kind: "organizationMembers", holding: "member.invite" },
    defaultMode: { in_app: "immediate", email: "digest" },
    link: () => "/settings/members",
  },
  "member.role.changed": {
    kind: "member.role.changed",
    category: "membership",
    // The person it happened to. What they may do just changed, which is the one thing
    // they cannot discover by looking.
    recipients: { kind: "subject" },
    defaultMode: { in_app: "immediate", email: "immediate" },
    link: () => "/settings/members",
  },
} as const satisfies Partial<Record<DomainEventName, PolicyRow>>);

const NAMES: readonly DomainEventName[] = Object.freeze(Object.keys(ROWS) as DomainEventName[]);

// The one place that decides what an event means to a person. A `Policy` rather than a
// use-case because it is a domain rule too broad for one entity.
export class NotificationPolicy {
  private constructor() {}

  // Every event this policy has an opinion about, which is exactly what the subscriber
  // subscribes to — so a row added here is delivered with no second edit.
  public static events(): readonly DomainEventName[] {
    return NAMES;
  }

  public static rowFor(name: DomainEventName): PolicyRow | null {
    return Object.hasOwn(ROWS, name) ? ((ROWS as Record<string, PolicyRow>)[name] ?? null) : null;
  }

  public static defaultMode(name: DomainEventName, channel: NotificationChannel): NotificationMode {
    return NotificationPolicy.rowFor(name)?.defaultMode[channel] ?? "off";
  }
}
