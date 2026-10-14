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
export type {
  DocNavNodeDto,
  DocPageDraftDto,
  DocPageId,
  DocReadingDto,
  DocSearchHitDto,
  DocSpaceDto,
  DocSpaceId,
  OrganizationId,
  UserId,
} from "@loadbearing/contracts";
// ── @loadbearing/contracts ───────────────────────────────────────────────────
// The two branded ids `session.fn.ts` casts to, and the one entity a route asks a
// question of. The shapes a component renders arrive through `@loadbearing/query`.
export { ConversationEntity, Identifiers } from "@loadbearing/contracts";

// ── @loadbearing/feature ─────────────────────────────────────────────────────
export {
  AccountPanel,
  ActiveSessionList,
  ActivityTrendPanel,
  ApiKeyList,
  ArchivedNotificationList,
  ChangeEmailForm,
  ChangePasswordForm,
  ConversationList,
  CreateApiKeyForm,
  CreateOrganizationForm,
  CreateRoleForm,
  DashboardZone,
  DeleteTenantPanel,
  DISMISSAL,
  DocEditorForm,
  DocGrantPanel,
  DocNavTree,
  DocPageTreeList,
  DocReaderPanel,
  DocRevisionList,
  type DocSearchHit,
  DocSpaceForm,
  DocSpaceList,
  DocumentSearch,
  EffectivePermissionsInspector,
  FlagList,
  ForgotPasswordForm,
  IndexDocumentForm,
  InvitationAccept,
  InvitationList,
  InviteMemberForm,
  LinkedAccountList,
  MemberAccessPanel,
  MemberList,
  MessageComposer,
  MessageList,
  MessageProvider,
  ModuleNav,
  ModuleSwitchPanel,
  NotificationBell,
  NotificationList,
  NotificationPreferenceForm,
  OrganizationEntitlementPanel,
  OrganizationSwitcher,
  PlanList,
  PlatformNav,
  PlatformStatusPanel,
  ProfileForm,
  ProjectionGapsPanel,
  ProjectionPolicyForm,
  ProjectionSwitchPanel,
  prefetchDashboard,
  ReplicaSwitchPanel,
  ResetPasswordForm,
  RestorePartitionPanel,
  RetentionPolicyForm,
  RoleList,
  RoleMatrix,
  SessionProvider,
  type SessionUser,
  ShardMapPanel,
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
  useIsPlatformOrganization,
  useMessages,
  useSession,
  VerifyEmailNotice,
  Widget,
  WidgetDefaultForm,
  WorkerProcessList,
  WorkerQueueList,
  widgetFacts,
} from "@loadbearing/feature";

// ── @loadbearing/permissions ─────────────────────────────────────────────────
// The same `can()` the server calls, which is why the guard rebuilds the DTO rather than
// shape-checking the JSON.
export {
  CapabilitySet,
  type CapabilitySetDto,
  type FlagKey,
  FlagRegistry,
  type PermissionKey,
  PLATFORM_ROUTE_PERMISSION,
  ROUTES,
  WidgetRegistry,
} from "@loadbearing/permissions";

// ── @loadbearing/query ───────────────────────────────────────────────────────
export {
  AnalyticsQueries,
  ApiClientProvider,
  ApiKeyQueries,
  createQueryClient,
  DocQueries,
  MemberQueries,
  MessagingQueries,
  NotificationQueries,
  OrganizationMutations,
  PlatformQueries,
  RealtimeProvider,
  RoleQueries,
  useApiClient,
  useAppQuery,
  useConversationStream,
  WidgetQueries,
} from "@loadbearing/query";

// ── @loadbearing/ui ──────────────────────────────────────────────────────────
export {
  AlertDialog,
  type BadgeTone,
  Button,
  type ButtonVariant,
  buttonClassName,
  Callout,
  type CalloutTone,
  Can,
  CodeList,
  cn,
  DataTable,
  Dialog,
  EmptyState,
  Field,
  type FontKey,
  FontRegistry,
  Icon,
  Input,
  type LinkAttributes,
  Menu,
  type ModeKey,
  type ModePreference,
  ModeRegistry,
  PageScrollbar,
  Popover,
  Prose,
  QrCode,
  readerClassName,
  Select,
  StatusBadge,
  Textarea,
  type ThemeKey,
  ThemeRegistry,
  ThemeScope,
  ThemeToggle,
  Tooltip,
  Zone,
} from "@loadbearing/ui";

// ── @tanstack/react-query ────────────────────────────────────────────────────
export {
  type DehydratedState,
  dehydrate,
  hydrate,
  type QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";

// ── @tanstack/react-router ───────────────────────────────────────────────────
// `router.tsx` only. Everything under `route/` imports this package directly.
export { createRouter } from "@tanstack/react-router";

// ── react ────────────────────────────────────────────────────────────────────
export { type CSSProperties, type ReactNode, useEffect, useMemo, useState } from "react";

// ── zod ──────────────────────────────────────────────────────────────────────
// Search-parameter schemas only: a route validates what a browser put in its own URL
// bar, and the wire shapes are `contracts`' business.
export { z } from "zod";
