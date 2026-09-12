// Everything this package takes from outside itself, in one place. No relative
// re-exports live here — that is what keeps it cycle-free.

// ── @loadbearing/content ─────────────────────────────────────────────────────
// A type and nothing else. Mail is composed per recipient, so a locale rides every mail
// request — and `content` sits left of this package, which is what makes the edge legal.
export type { Locale } from "@loadbearing/content";

// ── @loadbearing/contracts ───────────────────────────────────────────────────
export {
  type ApiKeyId,
  type DomainEvent,
  type DomainEventInput,
  type DomainEventName,
  DomainEvents,
  type GoalId,
  type InvitationId,
  type KeysetQuery,
  type ListNotificationsInput,
  type MailTemplateKey,
  type MailTemplateParams,
  MailTemplates,
  type MarkNotificationReadInput,
  type NotificationCategory,
  type NotificationChannel,
  type NotificationDto,
  type NotificationId,
  type NotificationKind,
  type NotificationMode,
  type OrganizationId,
  type PaginationQuery,
  type RealtimeMessage,
  type RoleId,
  type UpdateNotificationPreferenceInput,
  type UserId,
} from "@loadbearing/contracts";

// ── @loadbearing/core ────────────────────────────────────────────────────────
export { type Clock, ServerOnly, Token, Uuid } from "@loadbearing/core";

// ── @loadbearing/errors ──────────────────────────────────────────────────────
export {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  type SchemaIssue,
  UnavailableError,
  ValidationError,
} from "@loadbearing/errors";
// A value, not a type: a subscriber builds an empty set to make a system principal
// that asserts nothing.
// ── @loadbearing/permissions ─────────────────────────────────────────────────
export { CapabilitySet, type PermissionKey, PermissionRegistry } from "@loadbearing/permissions";
