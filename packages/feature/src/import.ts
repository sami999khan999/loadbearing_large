// The two bans made visible: the transport package appears once and only as a type, and
// the router package not at all. Both are enforced in the root ESLint config.

// ── @loadbearing/api-client ──────────────────────────────────────────────────
// Type-only. The instance arrives as a prop, so this creates no runtime dependency and
// no read can bypass a defined query.
export type { AccountClient, AuthClient, OrganizationClient } from "@loadbearing/api-client";
export type {
  ClientNamespace,
  MessageParams,
  MessageStore,
  NamespaceKeys,
  NavItem,
  ShellNamespace,
  Translator,
} from "@loadbearing/content";
// ── @loadbearing/content ─────────────────────────────────────────────────────
// `ErrorCopy` is the only value taken from here: it is where a failure gets words, and
// taking the map instead would put the fallback rule in every call site.
export { ErrorCopy } from "@loadbearing/content";
// ── @loadbearing/contracts ───────────────────────────────────────────────────
// The shapes the server returns, plus the one value: `Password` carries the bounds the
// server enforces, so a form cannot advertise a different floor.
export {
  type AccountDenyDto,
  type AccountDto,
  type AccountMembershipDto,
  type ActivityPointDto,
  type AdjustmentDto,
  type ApiKeyDto,
  ApiKeyEntity,
  type CapabilitiesDto,
  type ColdModeDto,
  type ConversationDto,
  ConversationEntity,
  type DocumentHitDto,
  type ExplanationDto,
  type FlagDto,
  type InvitationDto,
  type MemberDto,
  type MessageDto,
  type NotificationDto,
  type NotificationPreferenceDto,
  type OrganizationId,
  type OverrideEntityDto,
  Password,
  type PlanDto,
  type ProjectionEntryDto,
  type RestoreRequestedDto,
  type RetentionEntryDto,
  type RetentionPreviewDto,
  type RoleDto,
  type ShardMovesDto,
  type ShardNodeDto,
  type ShardTenantDto,
  type TenantStorageMonthDto,
  type TenantStorageRowDto,
} from "@loadbearing/contracts";

// ── @loadbearing/errors ──────────────────────────────────────────────────────
export { type ErrorEnvelope, ErrorNormalizer } from "@loadbearing/errors";

// ── @loadbearing/permissions ─────────────────────────────────────────────────
export {
  CapabilitySet,
  type CapabilitySetDto,
  CORE_MODULE,
  type FlagKey,
  type ModuleKey,
  ModuleRegistry,
  type PermissionKey,
  PermissionRegistry,
  type PermissionScope,
} from "@loadbearing/permissions";

// ── @loadbearing/query ───────────────────────────────────────────────────────
// Defined queries and the two runtime hooks, never the cache library: a component naming
// `useQuery` directly would be a read outside the seam.
export {
  AccountMutations,
  AccountQueries,
  AnalyticsQueries,
  ApiKeyMutations,
  ApiKeyQueries,
  DocumentMutations,
  MemberMutations,
  MemberQueries,
  MessagingMutations,
  MessagingQueries,
  NotificationMutations,
  NotificationQueries,
  OrganizationMutations,
  OverrideMutations,
  OverrideQueries,
  PlatformMutations,
  PlatformQueries,
  RoleMutations,
  RoleQueries,
  SessionMutations,
  useApiClient,
  useAppInfiniteQuery,
  useAppQuery,
} from "@loadbearing/query";

// ── @loadbearing/ui ──────────────────────────────────────────────────────────
export {
  Button,
  ByteFormat,
  Callout,
  Can,
  CodeList,
  DataTable,
  DateFormat,
  EmptyState,
  Field,
  Icon,
  IconRegistry,
  Input,
  Popover,
  QrCode,
  StatusBadge,
  type TableColumn,
  Textarea,
} from "@loadbearing/ui";

// ── react ────────────────────────────────────────────────────────────────────
export {
  createContext,
  type FormEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
