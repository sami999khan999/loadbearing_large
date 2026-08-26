import type { ApiClient } from "@loadbearing/api-client";
import type { MessageStore } from "@loadbearing/content";
import type { QueryClient } from "@tanstack/react-query";

// What every route sees. Built per request in `router.tsx`, never at module scope.
export interface RouterContext {
  readonly messages: MessageStore;
  readonly queryClient: QueryClient;
  readonly api: ApiClient;
}
