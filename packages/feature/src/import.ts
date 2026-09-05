// The two bans made visible: the transport package appears once and only as a type, and
// the router package not at all. Both are enforced in the root ESLint config.

// ── @loadbearing/api-client ──────────────────────────────────────────────────
// Type-only. The instance arrives as a prop, so this creates no runtime dependency and
// no read can bypass a defined query.
export type { AccountClient, AuthClient, OrganizationClient } from "@loadbearing/api-client";
// ── @loadbearing/content ─────────────────────────────────────────────────────
export type {
  ClientNamespace,
  MessageParams,
  MessageStore,
  NamespaceKeys,
  ShellNamespace,
  Translator,
} from "@loadbearing/content";
// ── @loadbearing/contracts ───────────────────────────────────────────────────
// The shapes the server returns. Types only — this package renders them and has no
// opinion about how they arrived.
export type { InvitationDto, MemberDto, RoleDto } from "@loadbearing/contracts";

// ── @loadbearing/errors ──────────────────────────────────────────────────────
export { ErrorNormalizer } from "@loadbearing/errors";

// ── @loadbearing/permissions ─────────────────────────────────────────────────
export {
  CapabilitySet,
  type CapabilitySetDto,
  type PermissionKey,
  PermissionRegistry,
} from "@loadbearing/permissions";

// ── @loadbearing/query ───────────────────────────────────────────────────────
// Defined queries and the two runtime hooks, never the cache library: a component naming
// `useQuery` directly would be a read outside the seam.
export {
  AccountMutations,
  AccountQueries,
  MemberMutations,
  MemberQueries,
  OrganizationMutations,
  RoleQueries,
  SessionMutations,
  useApiClient,
  useAppQuery,
} from "@loadbearing/query";

// ── @loadbearing/ui ──────────────────────────────────────────────────────────
export {
  Button,
  Callout,
  Can,
  CodeList,
  DataTable,
  EmptyState,
  Field,
  Input,
  QrCode,
  StatusBadge,
  type TableColumn,
} from "@loadbearing/ui";

// ── react ────────────────────────────────────────────────────────────────────
export {
  createContext,
  type FormEvent,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
