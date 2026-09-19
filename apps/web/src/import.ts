// **The first of this app's two outside surfaces**, and the client-safe one: a
// server-only package here is the leak. See docs/reference/import-surfaces.md.

// ── @loadbearing/api-client ──────────────────────────────────────────────────
// `AuthClient` is constructed per component, never a module singleton: the instance
// differs per environment.
export {
  AccountClient,
  ApiClient,
  type AppClientContext,
  AuthClient,
  CookieAuthStrategy,
  OrganizationClient,
} from "@loadbearing/api-client";

// ── @loadbearing/content ─────────────────────────────────────────────────────
// The client catalog, never `SERVER_CATALOG`: the `email` namespace is the worker's, and
// the ESLint ban fires on this line.
export {
  type ClientNamespace,
  ContentSource,
  type Locale,
  Locales,
  type MessageSnapshot,
  MessageStore,
  StaticContentSource,
} from "@loadbearing/content";

// ── @loadbearing/contracts ───────────────────────────────────────────────────
// The two branded ids `session.fn.ts` casts to. The shapes a component renders arrive
// through `@loadbearing/query`.
export type { OrganizationId, UserId } from "@loadbearing/contracts";

// ── @loadbearing/feature ─────────────────────────────────────────────────────
export {
  ActiveSessionList,
  ApiKeyList,
  ChangeEmailForm,
  ChangePasswordForm,
  ConversationList,
  CreateApiKeyForm,
  CreateOrganizationForm,
  CreateRoleForm,
  DeleteTenantPanel,
  DocumentSearch,
  EffectivePermissionsInspector,
  ForgotPasswordForm,
  IndexDocumentForm,
  InvitationAccept,
  InvitationList,
  InviteMemberForm,
  LinkedAccountList,
  MemberCount,
  MemberList,
  MessageComposer,
  MessageList,
  MessageProvider,
  ModuleNav,
  NotificationBell,
  NotificationList,
  NotificationPreferenceForm,
  OrganizationSwitcher,
  PlatformStatusPanel,
  ProfileForm,
  ProjectionPolicyForm,
  ResetPasswordForm,
  RestorePartitionPanel,
  RetentionPolicyForm,
  RoleList,
  RoleMatrix,
  SessionProvider,
  type SessionUser,
  SignInForm,
  SignOutButton,
  SignUpForm,
  SocialSignIn,
  TenantExportPanel,
  TenantRetentionForm,
  TenantStorageList,
  TwoFactorForm,
  TwoFactorPanel,
  TwoFactorSetup,
  TypingNotice,
  useCapabilities,
  useErrorMessage,
  useMessages,
  useSession,
  VerifyEmailNotice,
} from "@loadbearing/feature";

// ── @loadbearing/permissions ─────────────────────────────────────────────────
// The same `can()` the server calls, which is why the guard rebuilds the DTO rather than
// shape-checking the JSON.
export {
  CapabilitySet,
  type CapabilitySetDto,
  type PermissionKey,
  ROUTES,
} from "@loadbearing/permissions";

// ── @loadbearing/query ───────────────────────────────────────────────────────
export {
  ApiClientProvider,
  ApiKeyQueries,
  createQueryClient,
  MemberQueries,
  PlatformQueries,
  RealtimeProvider,
  RoleQueries,
  useApiClient,
  useAppQuery,
  useConversationStream,
} from "@loadbearing/query";

// ── @loadbearing/ui ──────────────────────────────────────────────────────────
export {
  type BadgeTone,
  Button,
  type ButtonVariant,
  Callout,
  type CalloutTone,
  Can,
  CodeList,
  DataTable,
  EmptyState,
  Field,
  type FontKey,
  FontRegistry,
  Icon,
  Input,
  type ModeKey,
  type ModePreference,
  ModeRegistry,
  QrCode,
  StatusBadge,
  type ThemeKey,
  ThemeRegistry,
} from "@loadbearing/ui";

// ── @loadbearing/ui — stylesheets ────────────────────────────────────────────
// The order they are written into <head> matters, not the order here: `class.css` reads
// the token names `theme.css` defines.
export { default as classCss } from "@loadbearing/ui/class.css?url";
export { default as themeCss } from "@loadbearing/ui/theme.css?url";

// ── @tanstack/react-query ────────────────────────────────────────────────────
export { type QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── @tanstack/react-router ───────────────────────────────────────────────────
// `router.tsx` only. Everything under `route/` imports this package directly.
export { createRouter } from "@tanstack/react-router";

// ── @tanstack/react-start ────────────────────────────────────────────────────
// Not a `/server` entry, so unlike the three `*.fn.ts` files this one goes through
// the surface. The plugin strips each branch from the build that does not run it.
export { createIsomorphicFn } from "@tanstack/react-start";

// ── react ────────────────────────────────────────────────────────────────────
export { type CSSProperties, type ReactNode, useMemo, useState } from "react";

// ── zod ──────────────────────────────────────────────────────────────────────
// Search-parameter schemas only: a route validates what a browser put in its own URL
// bar, and the wire shapes are `contracts`' business.
export { z } from "zod";
