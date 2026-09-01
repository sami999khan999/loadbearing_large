// Everything this package takes from outside itself, in one place. No relative
// re-exports live here — that is what keeps it cycle-free.
//
// Read it as the two bans made visible. The transport package appears once and only as a
// type; the router package does not appear at all. Both are enforced by the
// `packages/feature/src/**` block in the root ESLint config (05), which is where they
// have to live — Biome flags a type import identically and has no exemption for one.

// ── @loadbearing/api-client ──────────────────────────────────────────────────
// Type-only. The instance arrives as a prop, so this creates no runtime dependency and
// no read can bypass a defined query.
export type { AccountClient, AuthClient } from "@loadbearing/api-client";
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
export type { RoleDto } from "@loadbearing/contracts";

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
// Defined queries and the two runtime hooks, never the cache library itself. A
// component that named `useQuery` directly would be a read outside the seam, which is
// what the ban on importing the transport package one block up already prevents.
export {
  AccountMutations,
  AccountQueries,
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
  EmptyState,
  Field,
  Input,
  QrCode,
  StatusBadge,
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
