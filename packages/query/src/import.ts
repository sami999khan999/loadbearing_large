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
  ArchivedNotificationQuery,
  ChangeMemberRoleInput,
  ChangeRolePermissionInput,
  ConversationDto,
  ConversationMemberInput,
  CreateApiKeyInput,
  CreateConversationInput,
  CreatedApiKeyDto,
  CreateRoleInput,
  DeleteMessageInput,
  DeleteRoleInput,
  DocumentHitDto,
  EditMessageInput,
  ExportRequestedDto,
  IndexDocumentContractInput,
  InvitationDto,
  InviteMemberInput,
  LeaveConversationInput,
  ListConversationsInput,
  ListMessagesInput,
  ListNotificationsInput,
  MarkConversationReadInput,
  MarkNotificationReadInput,
  MemberDto,
  MessageDto,
  NotificationDto,
  OrganizationId,
  PaginationQuery,
  ProjectionToggleInput,
  ProjectionUpdateInput,
  QueuedDocumentDto,
  RealtimeEventName,
  RealtimeMessage,
  ReprojectInput,
  ReprojectRequestedDto,
  ResendInvitationInput,
  RestoreInput,
  RestoreRequestedDto,
  RetentionUpdateInput,
  RevokeApiKeyInput,
  RevokeInvitationInput,
  RoleDto,
  SearchDocumentsContractInput,
  SendMessageInput,
  SetMemberActiveInput,
  ShardMapQuery,
  TenantDeletedDto,
  TenantDeleteInput,
  TenantExportInput,
  TenantRetentionUpdateInput,
  TenantStorageQuery,
  TypingInput,
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
