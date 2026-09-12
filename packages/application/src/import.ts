// Everything this package takes from outside itself, in one place. No relative
// re-exports live here — that is what keeps it cycle-free.

// ── @loadbearing/content ─────────────────────────────────────────────────────
// A type and nothing else. Mail is composed per recipient, so a locale rides every mail
// request — and `content` sits left of this package, which is what makes the edge legal.
export type { Locale } from "@loadbearing/content";

// ── @loadbearing/contracts ───────────────────────────────────────────────────
export {
  type ApiKeyId,
  type GoalId,
  type InvitationId,
  type MailTemplateKey,
  type MailTemplateParams,
  MailTemplates,
  type OrganizationId,
  type PaginationQuery,
  type RoleId,
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
export type { CapabilitySet, PermissionKey } from "@loadbearing/permissions";
// ── @loadbearing/permissions ─────────────────────────────────────────────────
export { PermissionRegistry } from "@loadbearing/permissions";
