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
  type ApiKeyDto,
  ApiKeyEntity,
  type CapabilitiesDto,
  type ColdModeDto,
  type ConversationDto,
  type DocumentHitDto,
  type InvitationDto,
  type MemberDto,
  type MessageDto,
  type NotificationDto,
  type NotificationPreferenceDto,
  Password,
  type RetentionEntryDto,
  type RoleDto,
} from "@loadbearing/contracts";

// ── @loadbearing/errors ──────────────────────────────────────────────────────
export { type ErrorEnvelope, ErrorNormalizer } from "@loadbearing/errors";

// ── @loadbearing/permissions ─────────────────────────────────────────────────
export {
  CapabilitySet,
  type CapabilitySetDto,
  CORE_MODULE,
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
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
