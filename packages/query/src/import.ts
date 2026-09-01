// Everything this package takes from outside itself, in one place. No relative
// re-exports live here — that is what keeps it cycle-free.
//
// This is the only `import.ts` in the repository allowed to name the cache library.
// The router package from the same vendor must never appear on it: routing lives in
// `apps/web`, which is what lets the Tauri shell reuse everything above this package.
// The gate in 21 greps this tree for that specifier, comments included.

// ── @loadbearing/api-client ──────────────────────────────────────────────────
export type {
  AccountClient,
  ApiClient,
  AuthClient,
  TwoFactorEnrolment,
} from "@loadbearing/api-client";

// ── @loadbearing/contracts ───────────────────────────────────────────────────
// The shapes a defined query takes and returns. Types only: this package caches what
// the contract describes and has no opinion about it.
export type { PaginationQuery, RoleDto } from "@loadbearing/contracts";

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
