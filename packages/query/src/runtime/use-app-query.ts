import { type QueryKey, type UseQueryOptions, type UseQueryResult, useQuery } from "../import.js";

// A pass-through, and that is the entire point: it exists so `packages/feature` can read
// through a defined query without naming the cache library. One package imports
// `@tanstack/*`, and this is the seam that keeps that true once feature slices arrive.
//
// It takes what `queryOptions()` produces, unchanged — all four generics are inferred
// from the argument, so `useAppQuery(TaskQueries.list(client, params))` types its `data`
// exactly as `useQuery` would. Adding a defaulted parameter here would break that
// inference, which is why there is nothing else in this function.
export function useAppQuery<TQueryFnData, TError, TData, TQueryKey extends QueryKey>(
  options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
): UseQueryResult<TData, TError> {
  return useQuery(options);
}
