import { type ApiClient, ERROR_CATALOG, ErrorNormalizer, QueryClient } from "../import.js";

export interface QueryClientOptions {
  // A constructed client, never a base URL. That is what lets the server hand this an
  // in-process transport and the browser an HTTP one, with nothing downstream differing.
  readonly transport: ApiClient;
  readonly staleTimeMs?: number;
}

export interface QueryRuntime {
  readonly queryClient: QueryClient;
  readonly apiClient: ApiClient;
}

// A factory, never a module-scope instance. One `QueryClient` in a server bundle is
// shared across every concurrent request, which under this permission model is a
// cross-tenant leak rather than a caching bug — and it works perfectly in development,
// where there is one user. See docs/reference/lifetime.md.
export function createQueryClient(options: QueryClientOptions): QueryRuntime {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: options.staleTimeMs ?? 30_000,
        gcTime: 5 * 60_000,
        retry: (failureCount, error) => {
          // Retryability is a fact about the code, declared once in the catalog. A
          // `FORBIDDEN` retried twice with backoff turns an instant "you cannot do
          // that" into a three-second wait for the same answer.
          const normalized = ErrorNormalizer.normalize(error);
          if (!ERROR_CATALOG[normalized.code].retryable) return false;
          return failureCount < 2;
        },
        // The default suits a dashboard left open all day. Here every refetch is an
        // authenticated round trip carrying a capability resolution — so it is opt-in
        // per query, where freshness genuinely matters.
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });

  return { queryClient, apiClient: options.transport };
}
