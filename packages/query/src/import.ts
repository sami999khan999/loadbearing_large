// The only `import.ts` allowed to name the cache library — and never the router from the
// same vendor, which is what lets a second shell reuse this package.

// ── @loadbearing/api-client ──────────────────────────────────────────────────
export type {
  AccountClient,
  ActiveSession,
  ApiClient,
  AuthClient,
  LinkedAccount,
  OrganizationClient,
  OrganizationSwitch,
  TwoFactorEnrolment,
} from "@loadbearing/api-client";

// ── @loadbearing/contracts ───────────────────────────────────────────────────
// Types only: this package caches what the contract describes, with no opinion about it.
export type {
  ApiKeyDto,
  ChangeMemberRoleInput,
  ChangeRolePermissionInput,
  CreateApiKeyInput,
  CreatedApiKeyDto,
  CreateRoleInput,
  DeleteRoleInput,
  DocumentHitDto,
  IndexDocumentContractInput,
  InvitationDto,
  InviteMemberInput,
  ListNotificationsInput,
  MarkNotificationReadInput,
  MemberDto,
  NotificationDto,
  PaginationQuery,
  QueuedDocumentDto,
  RealtimeEventName,
  RealtimeMessage,
  RevokeApiKeyInput,
  RevokeInvitationInput,
  RoleDto,
  SearchDocumentsContractInput,
  SetMemberActiveInput,
  UpdateNotificationPreferenceInput,
  UpdateRoleInput,
} from "@loadbearing/contracts";

// ── @loadbearing/errors ──────────────────────────────────────────────────────
// Retryability is a fact about the code, declared once in the catalog and read here.
export { ERROR_CATALOG, ErrorNormalizer } from "@loadbearing/errors";

// ── @tanstack/react-query ────────────────────────────────────────────────────
export {
  type InfiniteData,
  infiniteQueryOptions,
  QueryClient,
  type QueryKey,
  queryOptions,
  type UseInfiniteQueryOptions,
  type UseInfiniteQueryResult,
  type UseMutationOptions,
  type UseQueryOptions,
  type UseQueryResult,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

// ── react ────────────────────────────────────────────────────────────────────
export { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
