# 18 · `@loadbearing/api-client`

> The typed oRPC client, the auth-strategy hierarchy, and the transport seam that lets SSR skip the network entirely. React-free.

**Delivers:** One client serving browser cookies, in-process SSR calls, and desktop bearer tokens — with no call-site changes between them.

**Prerequisite:** [17 · `@loadbearing/composition`](17-composition-container.md)

---

## The one-line summary

**`api-client` is how to reach the server. `query` is how to cache what comes back.** They change for different reasons — the first when the backend changes, the second when product behaviour does — which is why they are two packages.

The harder constraint: **no `@tanstack/*` and no `react` here, ever.** This package must load in plain Node scripts, in integration tests, and in any future non-React host — a CLI, a migration script, a sidecar process. One React import makes all of those impossible.

```
packages/api-client/src/
├── index.ts
├── api-client.ts                    → ApiClient
└── auth/
    ├── index.ts
    ├── auth.client.ts               → AuthClient  (better-auth vanilla)
    ├── auth.strategy.ts             → AuthStrategy (abstract)
    ├── cookie-auth.strategy.ts      → CookieAuthStrategy
    ├── bearer-auth.strategy.ts      → BearerAuthStrategy
    └── token.provider.ts            → TokenProvider (abstract)
```

---

## Step 18.1 — Auth strategies

**`packages/api-client/src/auth/token.provider.ts`**

```ts
export abstract class TokenProvider {
  public abstract get(): Promise<string | null>;
  public abstract set(token: string | null): Promise<void>;
}
```

**`packages/api-client/src/auth/auth.strategy.ts`**

```ts
export abstract class AuthStrategy {
  public abstract headers(): Promise<Record<string, string>>;
  public abstract get credentials(): RequestCredentials;
}
```

**`packages/api-client/src/auth/cookie-auth.strategy.ts`**

```ts
import { AuthStrategy } from "./auth.strategy.js";

export class CookieAuthStrategy extends AuthStrategy {
  public override async headers(): Promise<Record<string, string>> {
    return {};
  }

  public override get credentials(): RequestCredentials {
    return "include";
  }
}
```

**`packages/api-client/src/auth/bearer-auth.strategy.ts`**

```ts
import { AuthStrategy } from "./auth.strategy.js";
import type { TokenProvider } from "./token.provider.js";

export class BearerAuthStrategy extends AuthStrategy {
  constructor(private readonly tokens: TokenProvider) {
    super();
  }

  public override async headers(): Promise<Record<string, string>> {
    const token = await this.tokens.get();
    return token ? { authorization: `Bearer ${token}` } : {};
  }

  public override get credentials(): RequestCredentials {
    return "omit";
  }
}
```

A Tauri webview runs on a `tauri://` origin, so a cookie set by your API is never sent with its requests. That is the entire reason this seam exists. Web constructs one strategy, desktop constructs another, and nothing above changes — not `query`, not `feature`, not a single component.

`TokenProvider` is abstract because *where* the token lives differs by host: the OS keychain reached through a Tauri command, a mobile keychain, an in-memory value in a test. None of those belong in this package — and note that all three are asynchronous, which is why `get()` returns a promise.

`set(null)` is the clear path, so two methods cover storing, reading, and signing out. See [30](30-desktop-app.md) for the Tauri implementation.

---

## Step 18.2 — `ApiClient` takes a transport, not a URL

The obvious design — `new ApiClient(baseUrl, auth)` — has a hidden cost during SSR. `"/api/rpc"` resolves to your own server, so every loader makes a real HTTP request out through the loopback interface and back in. You serialise and deserialise the same payload twice and burn two extra event-loop trips per query. A page with six loaders makes six self-requests before rendering a byte, and they compete with real user requests for your connection pool.

So the constructor is private and there are two factories.

**`packages/api-client/src/api-client.ts`**

```ts
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import type { AppContract } from "@loadbearing/contracts";
import type { AuthStrategy } from "./auth/auth.strategy.js";

export type AppClient = ContractRouterClient<AppContract>;

export class ApiClient {
  private constructor(private readonly rpc: AppClient) {}

  // Browser, Tauri webview, and any cross-process caller.
  public static overHttp(baseUrl: string, auth: AuthStrategy): ApiClient {
    const link = new RPCLink({
      url: baseUrl,
      headers: () => auth.headers(),
      fetch: (request, init) => fetch(request, { ...init, credentials: auth.credentials }),
    });
    return new ApiClient(createORPCClient<AppClient>(link));
  }

  // SSR — no network. The router client is built by apps/web and injected.
  public static inProcess(rpc: AppClient): ApiClient {
    return new ApiClient(rpc);
  }

  // Add one accessor per contract namespace as features arrive.
  public get raw(): AppClient {
    return this.rpc;
  }
}
```

> Check `RPCLink`'s import path and options against the oRPC version your catalog pins — the client packages move faster than the contract package. The *shape* — a link, a headers callback, a fetch override — is stable.

**The in-process client is constructed in `apps/web`, not here.** This package must never import server code:

```ts
// apps/web/src/server/rpc-client.ts
export function createServerRpcClient(request: Request) {
  return createRouterClient(appRouter, {
    context: { container, headers: request.headers },
  });
}
```

`createQueryClient()` in [21](21-query-package.md) then picks per environment — `inProcess` on the server, `overHttp` in the browser. Both satisfy the same type, so `query`, `feature`, and every component are identical either way. On client-side navigation the same loader runs in the browser and uses the HTTP client automatically, provided the client comes from the environment-aware factory rather than a module-scope singleton.

> **In-process is a transport optimisation, never an authorization shortcut.** Pass the real request headers into the context. It is tempting to skip them since you are already on the server, but `principalMiddleware` resolves the session from those headers — dropping them either breaks auth or tempts someone into constructing a privileged principal directly. Same middleware, same `Authorizer.assert()`, same everything; only the serialisation is skipped.

---

## Step 18.3 — Namespace accessors

As contract namespaces arrive, expose them as getters rather than making callers reach through `raw`:

```ts
public get task() {
  return this.rpc.task;
}

public get goal() {
  return this.rpc.goal;
}
```

Two lines per feature module, and it means `ApiClient` has a readable public surface rather than being a pass-through. It also gives you somewhere to put a per-namespace concern later — a retry policy for a flaky third-party-backed procedure, say — without touching call sites.

---

## Step 18.4 — The auth client

Better Auth's **vanilla** client, never `better-auth/react`.

**`packages/api-client/src/auth/auth.client.ts`**

```ts
import { createAuthClient } from "better-auth/client";
import { twoFactorClient } from "better-auth/client/plugins";

export interface AuthClientConfig {
  readonly baseUrl: string;
}

export class AuthClient {
  private readonly client: ReturnType<typeof createAuthClient>;

  constructor(config: AuthClientConfig) {
    this.client = createAuthClient({
      baseURL: config.baseUrl,
      plugins: [twoFactorClient()],
    });
  }

  public async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.client.signIn.email({ email, password });
    if (error) throw new Error(error.message ?? "Sign-in failed.");
  }

  public async signOut(): Promise<void> {
    await this.client.signOut();
  }

  public async session() {
    const { data } = await this.client.getSession();
    return data ?? null;
  }

  public get raw() {
    return this.client;
  }
}
```

**Why not `better-auth/react`.** Its `useSession` hook maintains its own cache with its own invalidation rules. Adopting it means two caching systems in one app: TanStack Query for everything, and a separate one for the single piece of state that gates all of it. When they disagree — and they will, on sign-out — the UI shows a signed-in shell around a sequence of `UNAUTHORIZED` responses.

Wrapping the vanilla client here means session state lives in the same TanStack cache as everything else, through `SessionQueries` in [21](21-query-package.md). One owner, one invalidation story.

**`AuthClient` throws on error rather than returning it.** Better Auth's client returns `{ data, error }`; the rest of this codebase throws. Normalising at the boundary means a `SignInForm` uses the same error handling as every other mutation.

---

## Step 18.5 — The barrel

**`packages/api-client/src/index.ts`**

```ts
export { ApiClient, type AppClient } from "./api-client.js";
export {
  AuthClient,
  type AuthClientConfig,
  AuthStrategy,
  BearerAuthStrategy,
  CookieAuthStrategy,
  TokenProvider,
} from "./auth/index.js";
```

---

## What a backend swap costs

The whole reason for the `ApiClient`/`query` split:

| Scenario | Changes in `api-client` | Changes anywhere else |
|---|---|---|
| TanStack Start + oRPC (today) | — | — |
| NestJS + oRPC | `RPCLink` → `OpenAPILink` | none |
| NestJS + plain REST | add a `RestTransport` | none |
| Tauri desktop | swap `CookieAuthStrategy` → `BearerAuthStrategy` | none |
| CLI or script | constructs `ApiClient.overHttp` directly, skips `query` | none |

**When NestJS arrives, SSR loses its in-process shortcut** — the API is a separate process, so loaders make real HTTP calls. Point the server-side client at an internal URL so traffic does not leave your network, and forward the incoming request's cookies onto the outbound call. That is a change to one factory, which is only true because loaders go through `ApiClient` instead of importing the router.

---

## ✅ Gate

```bash
grep -rnE "@tanstack|from \"react\"|from 'react'" packages/api-client/src
```

Returns nothing.

- `packages/api-client/package.json` lists no `react` and no `@tanstack/*`.
- Swapping `CookieAuthStrategy` for `BearerAuthStrategy` at the construction site requires no other edit anywhere.

Do not proceed until this passes.

---

[← `@loadbearing/composition`](17-composition-container.md) · [`@loadbearing/asset` →](19-asset-package.md)
