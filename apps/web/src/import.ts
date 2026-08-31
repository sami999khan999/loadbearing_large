// Everything the client-safe half of this app takes from outside itself, in one place.
// No relative re-exports live here — that is what keeps it cycle-free.
//
// **The first of this app's two outside surfaces.** The second is
// `server/import.ts`, and the split is the server-only boundary made readable: nothing
// below may appear in a browser bundle by accident, so a server-only package showing up
// on this file is the leak, visible at one line rather than after a bundle grep.
//
// **Three things are deliberately not here.** `env.ts` keeps its own imports — it carries
// the marker that makes Start fail the build if it ever becomes reachable from the
// client graph, and a side-effect import cannot be re-exported. And `@tanstack/react-router`
// is imported directly inside `route/`: the route generator only recognises
// `createFileRoute` when it is imported from that specifier literally, and prepends its
// own import when it is not. `createRouter` below is for `router.tsx`, which the
// generator never reads. Third, `@tanstack/react-start` and its `/server` subpath: the
// two `server/*.fn.ts` files import both directly, because a re-exported `/server`
// entry is a client-graph edge that Start's import protection denies outright — a
// server function's stub ships to the browser even though its handler body does not.

// ── @loadbearing/api-client ──────────────────────────────────────────────────
// `AuthClient` is constructed per component, never a module singleton: the instance
// differs per environment, and the desktop shell supplies absolute URLs of its own (23).
export { ApiClient, AuthClient, CookieAuthStrategy } from "@loadbearing/api-client";

// ── @loadbearing/content ─────────────────────────────────────────────────────
// The client catalog by way of `StaticContentSource`, never `SERVER_CATALOG` — the
// `email` namespace is the worker's and the ESLint ban in 05 fires on this line.
export {
  type ClientNamespace,
  ContentSource,
  type MessageSnapshot,
  MessageStore,
  StaticContentSource,
} from "@loadbearing/content";

// ── @loadbearing/contracts ───────────────────────────────────────────────────
// The two branded ids `session.fn.ts` casts to. Types only — the shapes a component
// renders arrive through `@loadbearing/query`, never from here directly.
export type { OrganizationId, UserId } from "@loadbearing/contracts";

// ── @loadbearing/feature ─────────────────────────────────────────────────────
export {
  EffectivePermissionsInspector,
  MessageProvider,
  RoleMatrix,
  SessionProvider,
  type SessionUser,
  SignInForm,
  TwoFactorForm,
  useMessages,
} from "@loadbearing/feature";

// ── @loadbearing/permissions ─────────────────────────────────────────────────
// The same `can()` the server calls — that identity is the point, and it is why the
// guard rebuilds the DTO rather than shape-checking the JSON (23).
export { CapabilitySet, type CapabilitySetDto, type PermissionKey } from "@loadbearing/permissions";

// ── @loadbearing/query ───────────────────────────────────────────────────────
export { ApiClientProvider, createQueryClient } from "@loadbearing/query";

// ── @loadbearing/ui ──────────────────────────────────────────────────────────
export {
  type BadgeTone,
  Button,
  type ButtonVariant,
  DataTable,
  EmptyState,
  Field,
  Icon,
  Input,
  type ModeKey,
  type ModePreference,
  ModeRegistry,
  StatusBadge,
  type ThemeKey,
  ThemeRegistry,
} from "@loadbearing/ui";

// ── @loadbearing/ui — stylesheets ────────────────────────────────────────────
// Two links, and the order they are written into <head> matters rather than the order
// they are named here: `class.css` reads the token names `theme.css` defines, and an
// app supplying its own design drops the second.
export { default as classCss } from "@loadbearing/ui/class.css?url";
export { default as themeCss } from "@loadbearing/ui/theme.css?url";

// ── @tanstack/react-query ────────────────────────────────────────────────────
export { type QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── @tanstack/react-router ───────────────────────────────────────────────────
// `router.tsx` only. Everything under `route/` imports this package directly — see the
// note at the top of this file.
export { createRouter } from "@tanstack/react-router";

// ── react ────────────────────────────────────────────────────────────────────
export { type CSSProperties, type ReactNode, useMemo, useState } from "react";
