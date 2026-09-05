// The only `import.ts` allowed to name the cache library — and never the router from the
// same vendor, which is what lets a second shell reuse this package.

// ── @loadbearing/api-client ──────────────────────────────────────────────────
export type {
  AccountClient,
  ApiClient,
  AuthClient,
  OrganizationClient,
  OrganizationSwitch,
  TwoFactorEnrolment,
} from "@loadbearing/api-client";

// ── @loadbearing/contracts ───────────────────────────────────────────────────
// Types only: this package caches what the contract describes, with no opinion about it.
export type {
  InvitationDto,
  InviteMemberInput,
  PaginationQuery,
  RevokeInvitationInput,
  RoleDto,
} from "@loadbearing/contracts";

// ── @loadbearing/errors ──────────────────────────────────────────────────────
// Retryability is a fact about the code, declared once in the catalog and read here.
export { ERROR_CATALOG, ErrorNormalizer } from "@loadbearing/errors";

// ── @tanstack/react-query ────────────────────────────────────────────────────
export {
  QueryClient,
  type QueryKey,
  queryOptions,
  type UseMutationOptions,
  type UseQueryOptions,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

// ── react ────────────────────────────────────────────────────────────────────
export { createContext, type ReactNode, useContext } from "react";
