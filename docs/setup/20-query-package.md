# 20 · `@loadbearing/query`

> The single TanStack owner. Query keys, query and mutation options, the provider, and the client factory.

**Delivers:** `QueryKeys`, `createQueryClient()`, `ApiClientProvider`, `useAppMutation`, and session state living in the same cache as everything else.

**Prerequisite:** [19 · `@loadbearing/content`](19-content-package.md)

---

## One package imports `@tanstack/*`. Nothing else in the repo may.

`api-client` stays React-free so scripts, tests, and non-React hosts can load it. `feature` reads through this package and is forbidden from importing `api-client` directly. `ui` knows nothing about data at all. **And this package must not import `@tanstack/react-router`** — routing stays in `apps/web`, which is what lets the Tauri app reuse everything above it.

```
packages/query/src/
├── index.ts
├── query-key.ts                → QueryKeys
├── query-client.ts             → createQueryClient()
├── api-client.context.tsx      → ApiClientProvider, useApiClient
├── use-app-mutation.ts         → useAppMutation
└── session/
    ├── index.ts
    ├── session.queries.ts      → SessionQueries
    └── session.mutations.ts    → SessionMutations
```

---

## Step 20.1 — `QueryKeys`

**`packages/query/src/query-key.ts`**

```ts
export class QueryKeys {
  private constructor() {}

  public static readonly session = ["session"] as const;

  public static readonly task = {
    all: () => ["task"] as const,
    list: (params: { goalId: string; status?: string }) => ["task", "list", params] as const,
    detail: (taskId: string) => ["task", "detail", taskId] as const,
  };

  public static readonly rbac = {
    all: () => ["rbac"] as const,
    roles: () => ["rbac", "role", "list"] as const,
    effective: (userId: string) => ["rbac", "effective", userId] as const,
  };
}
```

**Every key mirrors its procedure path, with parameters last.** `contract.task.list` → `["task", "list", params]`. Given a procedure, you can write its key without looking anything up — the same derivability property the file-naming convention has.

**Keys are never hand-written at a call site.** Centralising them is what makes invalidation trustworthy: when task reactivation starts also invalidating capacity and KPI panels, you edit one method rather than grepping the codebase for `invalidateQueries`.

**`all()` exists on every namespace** so a broad invalidation is `queryClient.invalidateQueries({ queryKey: QueryKeys.task.all() })`. TanStack matches by prefix, so that one call catches every list and detail below it.

**Parameters go in an object, not spread as positional members.** `["task", "list", { goalId, status }]` rather than `["task", "list", goalId, status]`. Adding a filter later then does not shift every key and invalidate the entire namespace on deploy.

---

## Step 20.2 — `createQueryClient()`

**`packages/query/src/query-client.ts`**

```ts
import { QueryClient } from "@tanstack/react-query";
import type { ApiClient } from "@loadbearing/api-client";

export interface QueryClientOptions {
  readonly transport: ApiClient;
  readonly staleTimeMs?: number;
}

export interface QueryRuntime {
  readonly queryClient: QueryClient;
  readonly apiClient: ApiClient;
}

export function createQueryClient(options: QueryClientOptions): QueryRuntime {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: options.staleTimeMs ?? 30_000,
        gcTime: 5 * 60_000,
        retry: (failureCount, error) => {
          const code = (error as { code?: string }).code;
          // Never retry a permission or validation failure — the answer will not change.
          if (code === "FORBIDDEN" || code === "UNAUTHORIZED" || code === "BAD_REQUEST") {
            return false;
          }
          return failureCount < 2;
        },
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });

  return { queryClient, apiClient: options.transport };
}
```

### `createQueryClient` is a factory, never a module-scope instance

This is not stylistic.

| Entry point | Lifetime | Why |
|---|---|---|
| `apps/web` SSR | **one per request** | A shared server-side instance serves user A's cached data to user B. Under this permission model that is a cross-tenant leak, not a caching bug. |
| `apps/web` browser | one singleton | Normal client behaviour |
| Tauri webview | one singleton | Same as browser — there is no SSR, so no per-request concern |

A module-scope `new QueryClient()` inside a server bundle is shared across every concurrent request. It will work perfectly in development, where there is one user.

One definition, three call sites:

```ts
// apps/web/src/router.tsx — browser
const { queryClient, apiClient } = createQueryClient({
  transport: ApiClient.overHttp(Env.apiUrl, new CookieAuthStrategy()),
});

// apps/web SSR — same factory, in-process transport, no network
const { queryClient, apiClient } = createQueryClient({
  transport: ApiClient.inProcess(createServerRpcClient(request)),
});
```

**`createQueryClient` takes a constructed `ApiClient`, not a base URL.** That is what lets the server hand it an in-process transport and the browser hand it an HTTP one. Everything downstream is identical.

**`retry: false` on `FORBIDDEN`.** Retrying a permission failure twice with backoff turns an instant "you cannot do that" into a three-second wait for the same answer, and it triples the load from a client stuck in a bad state.

**`refetchOnWindowFocus: false`.** The default is a reasonable choice for a dashboard someone leaves open all day and a poor one for an app where every refetch is an authenticated round trip carrying a capability resolution. Turn it on per-query where freshness genuinely matters.

**`createQueryClient` is an exported function, which the OOP rule would normally reject** — hence this package using the `react` config. It is a factory in the React idiom, and wrapping it in a class to satisfy a lint rule would be cargo cult.

---

## Step 20.3 — The provider

**`packages/query/src/api-client.context.tsx`**

```tsx
import { createContext, useContext, type ReactNode } from "react";
import type { ApiClient } from "@loadbearing/api-client";

const ApiClientContext = createContext<ApiClient | null>(null);

export function ApiClientProvider({
  client,
  children,
}: {
  client: ApiClient;
  children: ReactNode;
}) {
  return <ApiClientContext.Provider value={client}>{children}</ApiClientContext.Provider>;
}

export function useApiClient(): ApiClient {
  const client = useContext(ApiClientContext);
  if (!client) {
    throw new Error("useApiClient must be used inside an ApiClientProvider.");
  }
  return client;
}
```

Context rather than a module singleton, for the same reason `createQueryClient` is a factory: the SSR instance and the browser instance are different objects with different transports.

---

## Step 20.4 — `useAppMutation`

**`packages/query/src/use-app-mutation.ts`**

```tsx
import { useMutation, useQueryClient, type UseMutationOptions } from "@tanstack/react-query";

export interface AppMutationOptions<TData, TVariables>
  extends Omit<UseMutationOptions<TData, Error, TVariables>, "onSuccess"> {
  /** Keys invalidated after a successful mutation. Declared, never imperative. */
  readonly invalidates?: readonly (readonly unknown[])[];
  readonly onSuccess?: (data: TData, variables: TVariables) => void | Promise<void>;
}

export function useAppMutation<TData, TVariables>(
  options: AppMutationOptions<TData, TVariables>,
) {
  const queryClient = useQueryClient();

  return useMutation<TData, Error, TVariables>({
    ...options,
    onSuccess: async (data, variables) => {
      await Promise.all(
        (options.invalidates ?? []).map((queryKey) =>
          queryClient.invalidateQueries({ queryKey: [...queryKey] }),
        ),
      );
      await options.onSuccess?.(data, variables);
    },
  });
}
```

**Invalidation is declared, not written imperatively at each call site.** A mutation says *what it affects*; the hook does the invalidating. That means the "what does reactivating a task affect" question has one answer in one place, and updating it when a new panel starts depending on task state is a one-line edit.

---

## Step 20.5 — Session state

Session is the piece of state that gates everything else, so it lives in the same cache as everything else. This is why [17](17-api-client-package.md) wraps Better Auth's *vanilla* client rather than using `better-auth/react`.

**`packages/query/src/session/session.queries.ts`**

```ts
import { queryOptions } from "@tanstack/react-query";
import type { AuthClient } from "@loadbearing/api-client";
import { QueryKeys } from "../query-key.js";

export class SessionQueries {
  private constructor() {}

  public static current(auth: AuthClient) {
    return queryOptions({
      queryKey: QueryKeys.session,
      queryFn: () => auth.session(),
      staleTime: 60_000,
      retry: false,
    });
  }
}
```

**`packages/query/src/session/session.mutations.ts`**

```ts
import type { AuthClient } from "@loadbearing/api-client";
import { QueryKeys } from "../query-key.js";
import { useAppMutation } from "../use-app-mutation.js";

export class SessionMutations {
  private constructor() {}

  public static useSignIn(auth: AuthClient) {
    return useAppMutation<void, { email: string; password: string }>({
      mutationFn: ({ email, password }) => auth.signIn(email, password),
      invalidates: [QueryKeys.session],
    });
  }

  public static useSignOut(auth: AuthClient, onDone?: () => void) {
    return useAppMutation<void, void>({
      mutationFn: () => auth.signOut(),
      onSuccess: onDone,
    });
  }
}
```

**Sign-out clears the entire cache, not just the session key.** Invalidating only `["session"]` leaves every other user's-eye-view query sitting in memory, and the next person to sign in on that machine sees a flash of the previous user's data before refetch completes. The caller wires this in `apps/web`:

```ts
const signOut = SessionMutations.useSignOut(auth, () => {
  queryClient.clear();
  navigate({ to: "/sign-in" });
});
```

`queryClient.clear()` belongs at the call site rather than inside the mutation because it is a lifecycle decision, and the desktop app may want to preserve an offline cache across sign-out.

**A class holding static hook factories is fine here.** The hook rules apply to the call site — `SessionMutations.useSignIn(auth)` is called unconditionally at the top of a component, which is all React requires.

---

## Step 20.6 — What a feature slice looks like

For each contract namespace, two files:

```ts
// packages/query/src/task/task.queries.ts
import { queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "@loadbearing/api-client";
import { QueryKeys } from "../query-key.js";

export class TaskQueries {
  private constructor() {}

  public static list(client: ApiClient, params: { goalId: string; status?: string }) {
    return queryOptions({
      queryKey: QueryKeys.task.list(params),
      queryFn: () => client.task.list(params),
    });
  }
}
```

```ts
// packages/query/src/task/task.mutations.ts
export class TaskMutations {
  private constructor() {}

  public static useReactivate(client: ApiClient, goalId: string) {
    return useAppMutation<TaskDto, ReactivateTaskInput>({
      mutationFn: (input) => client.task.reactivate(input),
      invalidates: [QueryKeys.task.all(), QueryKeys.rbac.all()],
    });
  }
}
```

**`queryOptions` rather than a bare `useQuery` wrapper.** It is a plain object, so a route loader can prefetch with `queryClient.ensureQueryData(TaskQueries.list(client, params))` and the component can call `useQuery(TaskQueries.list(client, params))` — same definition, same key, guaranteed cache hit.

---

## Step 20.7 — The barrel

**`packages/query/src/index.ts`**

```ts
export * from "./api-client.context.js";
export * from "./query-client.js";
export * from "./query-key.js";
export * from "./session/index.js";
export * from "./use-app-mutation.js";
```

---

## What a backend swap costs here

Keys and options never name a transport, so all of it is `ApiClient`-internal:

| Scenario | Changes in `packages/query/` |
|---|---|
| TanStack Start + oRPC (today) | — |
| NestJS + oRPC | nothing — `ApiClient` swaps its link |
| NestJS + plain REST | nothing — `ApiClient` gets a REST transport |
| `apps/worker` | does not import it — calls use-cases in-process |
| Tauri desktop | imports it unchanged |
| CLI or script | does not import it — uses `api-client` directly |

**SSR router integration stays in `apps/web`.** `routerWithQueryClient` needs `@tanstack/react-router`, which this package is forbidden to import. So `query` exports the factory and the app wires it to the router. That asymmetry is deliberate: routing is the one thing the desktop shell replaces.

---

## ✅ Gate

```bash
grep -rn "@tanstack" packages --include=*.ts --include=*.tsx | grep -v "packages/query"
```

Returns nothing.

```bash
grep -rn "@tanstack/react-router" packages/query/src
```

Returns nothing.

- `packages/query/package.json` has `react` as a peer, not a dependency.
- `createQueryClient` is called nowhere at module scope.

Do not proceed until this passes.

---

[← `@loadbearing/content`](19-content-package.md) · [`@loadbearing/ui` →](21-ui-package.md)
