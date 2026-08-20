# 24 · `apps/web` — TanStack Start + oRPC

> The entire transport layer. Six files in `src/server/`, plus routes that compose rather than implement.

**Delivers:** A running fullstack app where every handler is three lines, auth is mounted, and all four enforcement surfaces share one `can()`.

**Prerequisite:** [23 · `@loadbearing/feature`](23-feature-package.md)

---

## Layout

```
apps/web/
├── vite.config.ts
├── tsconfig.json
└── src/
    ├── env.ts                      → Env  (one of two process.env readers in the repo)
    ├── router.tsx
    ├── server/                     ← the ONLY transport code in the repository
    │   ├── container.ts            ← module-scope Container, one per process
    │   ├── rpc-client.ts           → createServerRpcClient(request)
    │   └── orpc/
    │       ├── base.ts             → base, principalMiddleware, authed
    │       ├── error.interceptor.ts
    │       └── app.router.ts       → appRouter
    └── route/
        ├── __root.tsx
        ├── -guard.ts               → RouteGuard
        ├── api/
        │   ├── auth/$.ts           ← mounts Better Auth's fetch handler
        │   └── rpc.$.ts            ← mounts the oRPC fetch handler
        ├── index.tsx
        ├── sign-in.tsx
        └── forbidden.tsx
```

**`src/server/` is the entire transport layer.** That is what moves to `apps/api` if NestJS ever arrives — nothing above or below it changes.

---

## Step 24.1 — Scaffold

```bash
cd apps
pnpm dlx create-start-app@latest web
cd web
node -e "require('fs').rmSync('.git', { recursive: true, force: true })"
cd ../..
```
> Take the defaults; most of it gets replaced. `rmSync` is the cross-platform `rm -rf` and removes the nested Git repo the scaffolder creates.

Set `"name": "@loadbearing/web"` in `apps/web/package.json`, then:

```bash
pnpm add --filter @loadbearing/web \
  @loadbearing/contracts@workspace:* @loadbearing/permissions@workspace:* \
  @loadbearing/api-client@workspace:* @loadbearing/query@workspace:* \
  @loadbearing/content@workspace:* @loadbearing/ui@workspace:* @loadbearing/feature@workspace:* \
  @loadbearing/composition@workspace:* @loadbearing/application@workspace:* @loadbearing/auth@workspace:* \
  @orpc/server@catalog: @orpc/client@catalog: @tanstack/react-query@catalog: zod@catalog:
```
> `@orpc/server` is here because the oRPC handler lives in `apps/web/src/server/` — this is the fullstack app, so it holds both sides. `composition`, `application`, and `auth` are server-only; the Biome boundary from [05](05-lint-and-format.md) restricts them to `src/server/**` and `src/route/api/**`.

**`apps/web/tsconfig.json`** — replace the generated one:

```json
{
  "extends": "@loadbearing/tsconfig/react.json",
  "compilerOptions": {
    "types": ["vite/client"],
    "paths": { "~/*": ["./src/*"] }
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

**`apps/web/vite.config.ts`**

```ts
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsConfigPaths(), tanstackStart()],
  resolve: { conditions: ["development"] },
  ssr: {
    resolve: { conditions: ["development"], externalConditions: ["development"] },
    noExternal: [/^@loadbearing\//],
  },
});
```
> The `development` condition makes Vite resolve workspace packages to their `src/` instead of `dist/`, so editing a package hot-reloads the browser with no rebuild. `noExternal` tells the SSR bundler to process your packages rather than treating them as external Node modules.
>
> If resolution misbehaves, delete both blocks. You fall back to consuming `dist/`, which still works with a rebuild between edit and reload.

> [!NOTE]
> **No lint config in the app.** The server-only boundary and the `env.ts` exemption are both `overrides` blocks in the root `biome.json` ([05](05-lint-and-format.md)), keyed on `apps/web/src/server/**`, `apps/web/src/route/api/**`, and `apps/*/src/env.ts`. Adding a config here would let the app opt itself out of the rules that exist to constrain it.

---

## Step 24.2 — `Env`

**`apps/web/src/env.ts`**

```ts
import { z } from "zod";

const Schema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).transform((v) => v === "true"),

  AUTH_SECRET: z.string().min(32),
  AUTH_URL: z.string().url(),
  AUTH_TRUSTED_ORIGINS: z.string().transform((v) => v.split(",").map((s) => s.trim())),

  EMBEDDING_MODEL: z.string().min(1),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive(),
  OPENAI_API_KEY: z.string().default(""),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export class Env {
  private constructor() {}

  private static readonly parsed = Schema.parse(process.env);

  public static get isProduction(): boolean {
    return Env.parsed.NODE_ENV === "production";
  }

  public static get apiUrl(): string {
    return "/api/rpc";
  }

  public static get authUrl(): string {
    return `${Env.parsed.AUTH_URL}/api/auth`;
  }

  /** The one origin allowlist. Better Auth's CSRF check and CORS both read it. */
  public static get trustedOrigins(): readonly string[] {
    return Env.parsed.AUTH_TRUSTED_ORIGINS;
  }

  public static containerConfig() {
    const e = Env.parsed;
    return {
      database: { url: e.DATABASE_URL },
      redis: { url: e.REDIS_URL },
      storage: {
        endpoint: e.S3_ENDPOINT,
        region: e.S3_REGION,
        bucket: e.S3_BUCKET,
        accessKey: e.S3_ACCESS_KEY,
        secretKey: e.S3_SECRET_KEY,
        forcePathStyle: e.S3_FORCE_PATH_STYLE,
      },
      auth: {
        secret: e.AUTH_SECRET,
        baseUrl: e.AUTH_URL,
        trustedOrigins: e.AUTH_TRUSTED_ORIGINS,
        sessionMaxAgeSeconds: 60 * 60 * 24 * 7,
        cookieCacheMaxAgeSeconds: 300,
        requireEmailVerification: e.NODE_ENV === "production",
      },
      embedding: {
        apiKey: e.OPENAI_API_KEY,
        model: e.EMBEDDING_MODEL,
        dimensions: e.EMBEDDING_DIMENSIONS,
      },
    } as const;
  }
}
```

**Parse at module load, not on first access.** A missing `AUTH_SECRET` should crash the process at boot with a field path, not produce a 500 on the first sign-in attempt an hour later.

**`AUTH_SECRET` has a minimum length** because a short secret is a real weakness and the schema is the only place anyone will ever check.

**`AUTH_TRUSTED_ORIGINS` carries the Tauri origins from the first deployment**, not from whenever the desktop app is built:

```bash
AUTH_TRUSTED_ORIGINS=http://localhost:3000,tauri://localhost,http://tauri.localhost
```

Both Tauri entries, because the webview's scheme differs by platform — `tauri://localhost` on macOS and Linux, `http://tauri.localhost` on Windows. Ship one and the desktop app works for half your team ([30](30-desktop-app.md)).

`Env.trustedOrigins` exists so this list has exactly one reader-facing name. Better Auth's CSRF check consumes it through `containerConfig()` and the CORS layer in Step 24.7 consumes it directly — two consumers, one list. A second hardcoded copy is how one of them goes stale and someone spends an afternoon on a preflight failure.

**This file and `apps/worker/src/env.ts` are the only two `process.env` readers in the repository.** The ESLint rule from [05](05-lint-and-format.md) enforces it, and this method is the boundary where environment becomes `ContainerConfig`.

---

## Step 24.3 — The container

**`apps/web/src/server/container.ts`**

```ts
import { Container } from "@loadbearing/composition";
import { Env } from "~/env.js";

/** One per process, at module scope. Never per request. */
export const container = new Container(Env.containerConfig());
```

Module scope means one connection pool, one Redis connection, one Better Auth instance for the process lifetime. Constructing per request would open a pool per request, which exhausts Postgres in about four seconds under load.

---

## Step 24.4 — The oRPC base and principal middleware

**`apps/web/src/server/orpc/base.ts`**

```ts
import { ORPCError, os } from "@orpc/server";
import type { Principal } from "@loadbearing/application";
import type { Container } from "@loadbearing/composition";
import { ProcedurePermissions } from "@loadbearing/contracts";

/** Initial context: environment-shaped, injected once by the adapter. */
export const base = os.$context<{ container: Container; headers: Headers }>();

/** Execution context: per-request, resolved by middleware. */
export const principalMiddleware = base.middleware(async ({ context, next, path }) => {
  const principal: Principal | null = await context.container.principals.fromHeaders(
    context.headers,
  );

  if (!principal) throw new ORPCError("UNAUTHORIZED");

  // Defence in depth — fails closed on any procedure with no permission mapping.
  const required = ProcedurePermissions.required(path.join("."));
  if (!required) {
    throw new ORPCError("FORBIDDEN", { message: "Procedure is not permission-mapped." });
  }

  return next({ context: { principal } });
});

export const authed = base.use(principalMiddleware);
```

**The middleware calls `PrincipalBuilder`, never Better Auth directly.** That is what keeps the transport layer ignorant of the auth library, and it is why a NestJS migration rewrites a guard rather than rewriting authentication.

**Creating an `authed` base that already includes the middleware** means protected procedures cannot forget it. Anything built on `base` instead of `authed` is unauthenticated on purpose and should be obvious in review.

**The `ProcedurePermissions` check fails closed.** A procedure with no mapping is denied, not allowed. Paired with the coverage test in [10](10-contracts-package.md), forgetting to map a new procedure is caught at test time and, failing that, at request time — never by shipping an ungated endpoint.

**This is not the real gate.** `Authorizer.assert()` inside the use-case is. The worker bypasses this middleware entirely, and so does any SSR direct call that skipped the adapter. Two checks, and only one of them is on every path.

---

## Step 24.5 — The error interceptor

**`apps/web/src/server/orpc/error.interceptor.ts`**

```ts
import { ORPCError } from "@orpc/server";
import { ErrorNormalizer, HTTP_STATUS } from "@loadbearing/errors";

export class ErrorInterceptor {
  private constructor() {}

  public static toTransport(thrown: unknown): never {
    const error = ErrorNormalizer.normalize(thrown);
    throw new ORPCError(error.code, {
      status: HTTP_STATUS[error.code],
      data: error.toJSON(),
    });
  }
}
```

**Three lines, and no `CODE_MAP`.** `normalize()` guarantees an `AppError` for anything thrown — a `ZodError`, a Postgres failure, a rejected string — so there is no fall-through branch to get wrong, and `HTTP_STATUS` is total over `ErrorCode` so a new code cannot ship without a status ([09](09-errors-package.md)).

**The body is the envelope, not prose.** `error.toJSON()` sends `{ code, context, fields? }`, which the client reconstructs into the same class and renders through `content` in its own locale. The server has no opinion about the wording and never needs one.

**Nothing unmapped can leak.** The old failure mode — a Postgres error string in a client response telling an attacker your table names — is closed at the normaliser rather than guarded against here: an unrecognised throw becomes `INTERNAL`, and the original is kept on a non-enumerable `cause` for the logger where `toJSON()` cannot reach it.

---

## Step 24.6 — A router

**`apps/web/src/server/orpc/task.router.ts`** — illustrative; the kit ships none.

```ts
import { implement } from "@orpc/server";
import { contract } from "@loadbearing/contracts";
import { authed } from "./base.js";

export class TaskRouter {
  private constructor() {}

  public static readonly reactivate = implement(contract.task.reactivate)
    .use(authed)
    .handler(({ input, context }) =>
      context.container.task.reactivate.execute(context.principal, input),
    );

  public static readonly create = implement(contract.task.create)
    .use(authed)
    .handler(({ input, context }) =>
      context.container.task.create.execute(context.principal, input),
    );
}
```

**Three lines per procedure**: pull the use-case off the container, call `execute` with the principal and validated input, return the result. No business logic, no authorization decision, no error mapping. That is the entire transport layer for a feature, and it is what makes swapping to NestJS a rewrite of *these files* and nothing else.

**`apps/web/src/server/orpc/app.router.ts`**

```ts
import { TaskRouter } from "./task.router.js";

export const appRouter = {
  task: {
    reactivate: TaskRouter.reactivate,
    create: TaskRouter.create,
  },
};
```

The shape mirrors `contract` exactly. A mismatch is a type error.

---

## Step 24.7 — The HTTP entrypoints

**`apps/web/src/route/api/rpc.$.ts`** mounts an oRPC fetch handler at `/api/rpc`, passing the module-scope container and the request headers as initial context, with `ErrorInterceptor` wired in.

**`apps/web/src/route/api/auth/$.ts`** mounts Better Auth's handler:

```ts
import { container } from "~/server/container.js";

export const ServerRoute = createServerFileRoute().methods({
  GET: ({ request }) => container.auth.handler(request),
  POST: ({ request }) => container.auth.handler(request),
});
```

Better Auth speaks the Fetch API, so it drops into any Fetch-based router. Two handlers, one server directory.

### CORS, because the desktop client is cross-origin

A Tauri webview is served from a custom protocol, so **every** call it makes to these two routes is cross-origin — there is no configuration that makes it same-origin. Both handlers need a CORS layer, and it reads the same allowlist as the CSRF check:

**`apps/web/src/server/cors.ts`**

```ts
import { Env } from "~/env.js";

export class Cors {
  private constructor() {}

  private static headersFor(origin: string | null): Headers {
    const headers = new Headers();
    if (!origin || !Env.trustedOrigins.includes(origin)) return headers;

    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Access-Control-Allow-Headers", "content-type,authorization,x-api-key");
    headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    headers.set("Vary", "Origin");
    return headers;
  }

  /** Preflight. Returns null when the request is not one. */
  public static preflight(request: Request): Response | null {
    if (request.method !== "OPTIONS") return null;
    return new Response(null, { status: 204, headers: Cors.headersFor(request.headers.get("origin")) });
  }

  public static apply(request: Request, response: Response): Response {
    for (const [key, value] of Cors.headersFor(request.headers.get("origin"))) {
      response.headers.set(key, value);
    }
    return response;
  }
}
```

Wire it into both entrypoints — answer the preflight first, then decorate the real response:

```ts
const preflight = Cors.preflight(request);
if (preflight) return preflight;
return Cors.apply(request, await container.auth.handler(request));
```

Four things that matter more than they look:

**Echo the origin, never reflect it blindly.** `Access-Control-Allow-Origin` is set only for an origin already on the allowlist. Reflecting whatever arrived, with `Allow-Credentials: true`, is a hole large enough to drive a CSRF through — and the two headers are specified never to be combined with `*` for exactly that reason.

**`Vary: Origin` is not optional.** Without it any cache in front of this — a CDN, a reverse proxy — can serve one origin's CORS response to another origin and the failure looks random.

**`Allow-Credentials: true` and `Allow-Headers: authorization` are both required**, because the web client authenticates with a cookie and the desktop client with a bearer token, against the same two routes ([16](16-auth-package.md), [18](18-api-client-package.md)).

**`x-api-key` is in the list** because `PrincipalBuilder` checks it first ([16](16-auth-package.md)); omitting it means integrations calling from a browser context fail preflight with a message that does not mention the header.

> **Check the current oRPC fetch-adapter and TanStack Start server-route signatures when you write `rpc.$.ts`.** Both are version-sensitive, and this is the one file where copying a stale snippet costs an afternoon. The *contract* — mount a fetch handler, inject `{ container, headers }`, intercept errors — is stable; the API surface is not.

---

## Step 24.8 — SSR without a network hop

During SSR the app must not call its own HTTP endpoint. `"/api/rpc"` resolves to your own server, so each loader would round-trip through the loopback interface — serialising and deserialising the same payload twice and competing with real user requests for the connection pool. Six loaders means six self-requests before a byte renders.

**`apps/web/src/server/rpc-client.ts`**

```ts
import { createRouterClient } from "@orpc/server";
import { container } from "./container.js";
import { appRouter } from "./orpc/app.router.js";

export function createServerRpcClient(request: Request) {
  return createRouterClient(appRouter, {
    context: { container, headers: request.headers },
  });
}
```

`createQueryClient()` chooses per environment — `ApiClient.inProcess(...)` on the server, `ApiClient.overHttp(...)` in the browser. Both satisfy the same contract type, so loaders and components cannot tell which they got, and client-side navigation picks up the HTTP client automatically.

**Two rules keep this honest:**

**Pass the real request headers.** `principalMiddleware` resolves the principal from them. Skipping them because "we are already on the server" either breaks auth or invites someone to construct a privileged principal directly. In-process skips serialisation, nothing else — same middleware, same `Authorizer.assert()`.

**Loaders talk to `ApiClient`, never to `appRouter`.** A loader importing the router is importing server code that will not exist once NestJS owns the API, and every loader would then need touching. Going through the client means one factory changes instead.

---

## Step 24.9 — Route and UI gating

**`apps/web/src/route/-guard.ts`**

```ts
import { redirect } from "@tanstack/react-router";
import type { CapabilitySet, PermissionKey } from "@loadbearing/permissions";

export class RouteGuard {
  private constructor() {}

  public static requirePermission(permission: PermissionKey, goalId?: string) {
    return ({ context }: { context: { capabilities: CapabilitySet } }): void => {
      if (!context.capabilities.can(permission, goalId)) {
        throw redirect({ to: "/forbidden", search: { permission } });
      }
    };
  }

  public static requireSession() {
    return ({ context }: { context: { user: { id: string } | null } }): void => {
      if (!context.user) throw redirect({ to: "/sign-in" });
    };
  }
}
```

Used in a route's `beforeLoad`. Same `CapabilitySet.can()` the server calls — that identity is the entire point.

**The `-guard.ts` filename leads with a hyphen** because TanStack Start's file-based routing treats `-`-prefixed files as non-routes. Framework naming wins inside `src/route/`.

---

## Step 24.10 — The root route

`__root.tsx` is where everything composes. In order:

1. Import `@loadbearing/ui/token.css` and `@loadbearing/ui/theme.css`.
2. An inline script in `<head>` applying the stored theme **before** hydration, or dark-mode users get a white flash on every load.
3. `ApiClientProvider` with the environment-appropriate client.
4. `QueryClientProvider` with the per-request or singleton `QueryClient`.
5. `MessageProvider` with a translator built server-side from the request locale.
6. `SessionProvider` with the user and the `CapabilitySetDto` resolved during SSR.

That last one matters: resolving capabilities on the server and serialising the DTO means the first rendered HTML already has correct permission gating. Fetching them client-side means every gated element flashes.

---

## Step 24.11 — Prove the wiring

Add to the root route component, temporarily:

```tsx
import { CorePackage } from "@loadbearing/core";
// render {CorePackage.id} somewhere visible
```

```bash
pnpm dev:web
```

**That string travelling from a workspace package into the browser proves the entire chain**: workspace link → tsup build → export condition → Vite resolution → SSR → hydration. If it renders, everything below it is wired. Delete the placeholder afterwards.

---

## Two habits that decide whether a NestJS migration is cheap

**1. Never use `createServerFn` for a business operation.** TanStack server functions are a Start-only transport with no NestJS equivalent, so anything written that way must be *rewritten* rather than moved — and it will be scattered across route files rather than confined to one folder.

```ts
// ✗ has to be rewritten later, and it bypasses the contract entirely
const reactivate = createServerFn().handler(async ({ data }) => { ... });

// ✓ moves to a Nest controller unchanged
TaskRouter.reactivate  // implements contract.task.reactivate
```

Server functions are fine for genuinely framework-local concerns — setting a cookie, issuing a redirect — provided they contain no business logic and no authorization decision.

**2. Route loaders reach the server through `ApiClient`, never the router directly.** Add both to the lint config: `no-restricted-imports` blocking `@tanstack/react-start/server` outside `src/server/**`, and blocking the router module outside the same directory.

---

## ✅ Gate

- `http://localhost:3000` renders and shows `@loadbearing/core`.
- Sign-in works against `/api/auth` and sets an httpOnly cookie.
- An SSR page load produces **zero** requests to your own `/api/rpc` — check the server access log; it should be silent during SSR.
- Removing a permission from a role removes the nav item **and** the call returns `FORBIDDEN`.
- Importing `@loadbearing/db` from a component is a Biome error; importing it from `src/server/**` is fine.

Do not proceed until this passes.

---

[← `@loadbearing/feature`](23-feature-package.md) · [`apps/worker` →](25-worker-app.md)
