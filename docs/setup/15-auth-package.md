# 15 · `@ratchet/auth`

> Better Auth, self-hosted, in its own server-only package. Authentication only — every authorization decision stays in `CapabilitySet`.

**Delivers:** One identity layer serving the web app, the desktop app, a client portal, and API-key integrations, all collapsing into the single `Principal` the rest of the system already understands.

**Prerequisite:** [14 · `@ratchet/infrastructure`](14-infrastructure-package.md)

---

## Decisions at a glance

| Question | Answer |
|---|---|
| Library | Better Auth, self-hosted, tables in your own Postgres |
| Package | One — `packages/auth`, server-only. Not two |
| Roles / permissions | **Not** Better Auth's. `PermissionRegistry` and `CapabilitySet` keep that job |
| Organization plugin | No. You already have `memberships` and `goal_members` |
| Session transport | Cookie (web) **and** bearer token (desktop) from day one |
| API keys | Your own implementation, not the plugin's session mocking |
| Session storage | Postgres, with Redis as secondary storage |
| Client-side session | Through `@ratchet/query`, not Better Auth's React hooks |

---

## What Better Auth owns, and what it does not

**It owns** password hashing, session issuance and rotation, email verification, password reset, OAuth account linking, two-factor, and bearer tokens — all the boring, security-critical machinery you do not want to write.

**It does not own authorization.** Better Auth ships an organization plugin with its own `createAccessControl` and role definitions. **Do not use it.** The architecture's strongest claim is that there is no second security model to keep in sync; adopting its roles gives you exactly that — one permission model in `PermissionRegistry`, another in the auth library, drifting apart the first time someone edits only one.

**Skip the organization plugin entirely.** `memberships` and `goal_members` already exist ([12](12-db-package.md)) and point at your own `roles` table. The plugin would add a parallel `member.role` string column meaning something different, and reconciling the two is worse than not having it.

**Do not use the API-key plugin's session mocking.** It mints a session for a key, which means a leaked key impersonates a full user with that user's live permissions. The model in Step 15.6 is strictly better: a key is a principal with its own capability set that cannot exceed its issuer's, re-intersected on every request.

---

## Layout

```
packages/auth/src/
├── index.ts                              ← ServerOnly.assert()
├── auth.config.ts                        → AuthConfig
├── auth.factory.ts                       → AuthFactory.create(config)
├── session/
│   ├── index.ts
│   └── better-auth.session-resolver.ts   → BetterAuthSessionResolver
├── principal/
│   ├── index.ts
│   ├── principal.builder.ts              → PrincipalBuilder
│   └── capability.cache.ts               → CapabilityCache
└── apikey/
    ├── index.ts
    ├── api-key.hasher.ts                 → ApiKeyHasher
    └── api-key.resolver.ts               → ApiKeyResolver
```

**Depends on** `core`, `contracts`, `permissions`, `application`, `db`, `infrastructure`.
**Used by** `composition` only. Never by `apps/web`'s component tree.

The **client** side of auth does not live here. Better Auth's client is a thin fetch wrapper around endpoints, and `@ratchet/api-client` is the package whose entire job is "how to reach the server." See [17](17-api-client-package.md).

```js
// packages/auth/eslint.config.js
export { default } from "@ratchet/eslint-config/oop";
```

---

## Step 15.1 — Generate the auth schema

Better Auth's CLI writes the tables it needs. Run it, commit the output, and let your normal Drizzle migrations own it from then on.

Add to **`packages/auth/package.json`**:

```json
"scripts": {
  "auth:generate": "better-auth generate --config ./src/auth.config.ts --output ../db/src/rbac/auth.schema.ts"
}
```

```bash
pnpm auth:generate
```

It produces `user`, `session`, `account`, and `verification` tables (plus `twoFactor` if that plugin is enabled). Add the file to `packages/db/src/schema.ts`, then:

```bash
pnpm db:generate && pnpm db:migrate
```

**Now add the real foreign keys.** Your domain tables reference `user_id` as `text` from [12](12-db-package.md) precisely so this works. Write a hand-authored migration:

```sql
ALTER TABLE memberships
  ADD CONSTRAINT memberships_user_fk
  FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

ALTER TABLE goal_members
  ADD CONSTRAINT goal_members_user_fk
  FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

ALTER TABLE permission_overrides
  ADD CONSTRAINT permission_overrides_user_fk
  FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;
```

> `"user"` is quoted because it is a reserved word in SQL. Better Auth's naming, not a choice you get to make.

Deleting a user now cascades their role assignments, which is what you want. It also means there is exactly one users table — a claim worth being able to make.

---

## Step 15.2 — `AuthConfig` and `AuthFactory`

**`packages/auth/src/auth.config.ts`**

```ts
export interface AuthConfig {
  readonly secret: string;
  readonly baseUrl: string;
  readonly trustedOrigins: readonly string[];
  readonly sessionMaxAgeSeconds: number;
  readonly cookieCacheMaxAgeSeconds: number;
  readonly requireEmailVerification: boolean;
}
```

**`packages/auth/src/auth.factory.ts`**

```ts
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, twoFactor } from "better-auth/plugins";
import type { Database } from "@ratchet/db";
import type { CacheStore } from "@ratchet/application";
import type { AuthConfig } from "./auth.config.js";

export type AuthInstance = ReturnType<typeof betterAuth>;

export class AuthFactory {
  private constructor() {}

  public static create(config: AuthConfig, database: Database, cache: CacheStore): AuthInstance {
    const options = {
      secret: config.secret,
      baseURL: config.baseUrl,
      trustedOrigins: [...config.trustedOrigins],

      database: drizzleAdapter(database.client, { provider: "pg" }),

      emailAndPassword: {
        enabled: true,
        requireEmailVerification: config.requireEmailVerification,
        revokeSessionsOnPasswordReset: true,
      },

      session: {
        expiresIn: config.sessionMaxAgeSeconds,
        updateAge: Math.floor(config.sessionMaxAgeSeconds / 4),
        cookieCache: {
          enabled: true,
          maxAge: config.cookieCacheMaxAgeSeconds,
        },
      },

      advanced: {
        cookiePrefix: "ratchet",
        defaultCookieAttributes: {
          httpOnly: true,
          sameSite: "lax",
          secure: config.baseUrl.startsWith("https://"),
        },
      },

      rateLimit: {
        enabled: true,
        window: 60,
        max: 20,
        storage: "secondary-storage",
      },

      // Redis as secondary storage — sessions and rate limits stop hitting Postgres.
      secondaryStorage: {
        get: async (key) => cache.get<string>(`auth:${key}`),
        set: async (key, value, ttl) => cache.set(`auth:${key}`, value, ttl ?? 300),
        delete: async (key) => cache.delete(`auth:${key}`),
      },

      plugins: [bearer(), twoFactor()],
    } satisfies BetterAuthOptions;

    return betterAuth(options);
  }
}
```

> Better Auth's option names move between minor versions. Check the current documentation for `secondaryStorage`, `cookieCache`, and the plugin signatures against the version your catalog pins. The *shape* above — Drizzle adapter, cookie cache on, Redis secondary storage, bearer enabled — is what matters and is stable.

### Three configuration decisions

**Enable the bearer plugin now, not when the desktop app ships.** A Tauri webview runs on a custom `tauri://localhost` origin (`http://tauri.localhost` on Windows), so every call to your API is cross-origin and a session cookie is never sent. It needs a token. Retrofitting bearer auth into a cookie-only API means touching every endpoint, every guard, and every test. Enabling it today costs one array element.

**Cookie cache on, with a short TTL.** Better Auth can store signed session data in the cookie itself, so most requests skip the session lookup entirely. This is the single biggest performance win available here and it costs one config block. **Keep the TTL under five minutes** — revocation only takes effect when the cookie cache expires, and that window is the price you pay.

**`trustedOrigins` is your CSRF defence**, and it must be explicit. Add the Tauri origins when the desktop app ships — `tauri://localhost` and `http://tauri.localhost`, both, because the scheme differs by platform. A wildcard here is not a shortcut; it is the vulnerability.

---

## Step 15.3 — `BetterAuthSessionResolver`

**`packages/auth/src/session/better-auth.session-resolver.ts`**

```ts
import type { UserId } from "@ratchet/contracts";
import { SessionResolver, type ResolvedSession } from "@ratchet/application";
import type { AuthInstance } from "../auth.factory.js";

export class BetterAuthSessionResolver extends SessionResolver {
  constructor(private readonly auth: AuthInstance) {
    super();
  }

  public override async resolve(headers: Headers): Promise<ResolvedSession | null> {
    const result = await this.auth.api.getSession({ headers });
    if (!result?.session) return null;

    return {
      userId: result.session.userId as UserId,
      sessionId: result.session.id,
      expiresAt: new Date(result.session.expiresAt),
    };
  }
}
```

**This class is the only place in the repository that names Better Auth's session API.** Everything else depends on `SessionResolver` from `application`. Replacing the auth library means rewriting this file and nothing else — which is the same reason `packages/auth` is a package rather than living in `apps/web/src/server/`.

`getSession` handles cookie and bearer transparently; both arrive as headers.

---

## Step 15.4 — `CapabilityCache`

`PgCapabilityRepository.resolveFor()` is three queries across role permissions, goal memberships, and overrides. It runs on essentially every request. Fine at ten users, not at five hundred.

**`packages/auth/src/principal/capability.cache.ts`**

```ts
import type { CacheStore } from "@ratchet/application";
import type { CapabilityRepository } from "@ratchet/application";
import { CapabilitySet, type CapabilitySetDto } from "@ratchet/permissions";

export class CapabilityCache {
  private static readonly PREFIX = "capability:user:";
  private static readonly TTL_SECONDS = 60;

  constructor(
    private readonly repository: CapabilityRepository,
    private readonly cache: CacheStore,
  ) {}

  public async forUser(userId: string): Promise<CapabilitySet> {
    const key = `${CapabilityCache.PREFIX}${userId}`;

    const cached = await this.cache.get<CapabilitySetDto>(key);
    if (cached) return CapabilitySet.from(cached);

    const resolved = await this.repository.resolveFor(userId);
    await this.cache.set(key, resolved.toJSON(), CapabilityCache.TTL_SECONDS);
    return resolved;
  }

  /** Call on every RBAC write. See the invalidation list below. */
  public async invalidate(userId: string): Promise<void> {
    await this.cache.delete(`${CapabilityCache.PREFIX}${userId}`);
  }

  /** Role edits affect everyone holding it — cheaper to flush than to enumerate. */
  public async invalidateAll(): Promise<void> {
    await this.cache.deletePrefix(CapabilityCache.PREFIX);
  }
}
```

### Invalidation is part of the RBAC write path, not an optimization

Every one of these must evict:

| Event | Evict |
|---|---|
| Role's permissions changed | `invalidateAll()` |
| Role deleted | `invalidateAll()` |
| Membership added or removed | `invalidate(userId)` |
| Goal member added or removed | `invalidate(userId)` |
| Permission override written or deleted | `invalidate(userId)` |
| User deactivated | `invalidate(userId)` |
| API key created or revoked | `invalidate(issuerId)` |

**Get this wrong in the stale direction and a revoked permission keeps working until the TTL expires.** That is a security bug, not a caching bug. Every one of these events is already written to the activity log, so the eviction hook has an obvious home next to that write.

**Sixty seconds, and no longer.** The TTL is a backstop for an invalidation you forgot, not the primary mechanism. Raising it to an hour because the cache hit rate looks better is trading a security window for a metric.

**`CapabilitySetDto` round-trips through JSON**, which is why this cache works at all — the same property that lets the browser reconstruct a `CapabilitySet` from an SSR payload ([08](08-permissions-package.md)).

---

## Step 15.5 — `PrincipalBuilder`

Every request, regardless of surface, resolves to the same `Principal`. This is the class that makes four auth mechanisms collapse into one authorization model.

```
request
  → credential detection   (x-api-key | cookie | bearer)
  → SessionResolver        → { userId } | null
  → CapabilityCache        → CapabilitySet   (Redis, else three DB queries)
  → Principal(userId, capabilities, kind)
  → use-case               → authorizer.assert(...)
```

**`packages/auth/src/principal/principal.builder.ts`**

```ts
import { Principal, type SessionResolver } from "@ratchet/application";
import type { UserId } from "@ratchet/contracts";
import type { ApiKeyResolver } from "../apikey/api-key.resolver.js";
import type { CapabilityCache } from "./capability.cache.js";

export class PrincipalBuilder {
  constructor(
    private readonly sessions: SessionResolver,
    private readonly apiKeys: ApiKeyResolver,
    private readonly capabilities: CapabilityCache,
  ) {}

  public async fromHeaders(headers: Headers): Promise<Principal | null> {
    const apiKey = headers.get("x-api-key");
    if (apiKey) return this.apiKeys.resolve(apiKey);

    const session = await this.sessions.resolve(headers);
    if (!session) return null;

    const caps = await this.capabilities.forUser(session.userId);
    return new Principal(session.userId as UserId, caps, "user");
  }
}
```

**The oRPC middleware calls this, never Better Auth directly** ([23](23-web-app.md)). That is what keeps the transport layer ignorant of the auth library, and it is why moving to NestJS later means rewriting a guard rather than rewriting authentication.

**API key is checked first.** A request carrying both a session cookie and an `x-api-key` header is an integration calling through a browser context, and the key is the more specific credential. Checking the session first would silently upgrade a scoped key to full user permissions.

---

## Step 15.6 — API keys

**`packages/db/src/rbac/api-key.schema.ts`**

```ts
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    issuerId: text("issuer_id").notNull(),

    /** First 8 chars of the token — indexed lookup without storing the secret. */
    prefix: text("prefix").notNull(),
    /** sha256(token). The token itself is never stored, anywhere, ever. */
    tokenHash: text("token_hash").notNull(),

    /** Scopes at creation, already intersected with the issuer's capabilities. */
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),

    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("api_keys_hash_uq").on(t.tokenHash), index("api_keys_prefix_idx").on(t.prefix)],
);
```

**`packages/auth/src/apikey/api-key.hasher.ts`**

```ts
import { Uuid } from "@ratchet/core";

export interface GeneratedApiKey {
  /** Shown to the user exactly once, at creation. Never stored. */
  readonly token: string;
  readonly prefix: string;
  readonly hash: string;
}

export class ApiKeyHasher {
  private static readonly PREFIX_LENGTH = 8;

  private constructor() {}

  public static async generate(): Promise<GeneratedApiKey> {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = `rk_${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
    return {
      token,
      prefix: token.slice(0, ApiKeyHasher.PREFIX_LENGTH),
      hash: await ApiKeyHasher.hash(token),
    };
  }

  public static async hash(token: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  public static prefixOf(token: string): string {
    return token.slice(0, ApiKeyHasher.PREFIX_LENGTH);
  }

  public static timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }
}
```

**`packages/auth/src/apikey/api-key.resolver.ts`**

```ts
import { Principal } from "@ratchet/application";
import type { UserId } from "@ratchet/contracts";
import { CapabilitySet, PermissionRegistry, type PermissionKey } from "@ratchet/permissions";
import type { CapabilityCache } from "../principal/capability.cache.js";
import { ApiKeyHasher } from "./api-key.hasher.js";

export interface ApiKeyRecord {
  readonly id: string;
  readonly issuerId: string;
  readonly tokenHash: string;
  readonly scopes: readonly string[];
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
}

export abstract class ApiKeyRepository {
  public abstract findByPrefix(prefix: string): Promise<readonly ApiKeyRecord[]>;
  public abstract touch(id: string, at: Date): Promise<void>;
}

export class ApiKeyResolver {
  constructor(
    private readonly repository: ApiKeyRepository,
    private readonly capabilities: CapabilityCache,
  ) {}

  public async resolve(token: string): Promise<Principal | null> {
    const hash = await ApiKeyHasher.hash(token);
    const candidates = await this.repository.findByPrefix(ApiKeyHasher.prefixOf(token));

    const record = candidates.find((c) => ApiKeyHasher.timingSafeEqual(c.tokenHash, hash));
    if (!record) return null;

    const now = new Date();
    if (record.revokedAt) return null;
    if (record.expiresAt && record.expiresAt <= now) return null;

    const registry = PermissionRegistry.instance;
    const scoped = record.scopes.filter((s): s is PermissionKey => registry.isKnown(s));

    const declared = CapabilitySet.from({
      wildcard: false,
      org: { grants: scoped, denies: [] },
      goals: {},
    });

    // Re-intersect with the issuer's LIVE capabilities on every request.
    const issuer = await this.capabilities.forUser(record.issuerId);
    const effective = declared.intersect(issuer);

    await this.repository.touch(record.id, now);
    return Principal.apiKey(record.issuerId as UserId, effective);
  }
}
```

### Why it is built this way

**Store `sha256(token)` with a short lookup prefix, never the token.** A database dump then contains no usable credentials. The prefix is what makes lookup an indexed query rather than a scan-and-compare over every key.

**Re-intersect with the issuer's live capabilities on every resolution**, not only at creation. This is the part that matters. If a key's scopes were frozen at creation, revoking the issuer's `finance.read.global` would leave every key they ever created still able to read finance — and nobody would notice, because the key still works. Re-intersecting means revoking a person's permission immediately narrows every key they issued. That closes the most common way an RBAC model gets quietly defeated.

**Timing-safe comparison** even though the prefix already narrowed the candidate set. It costs nothing and removes a class of question you would otherwise have to answer in a security review.

**`ApiKeyRepository` is declared here as an abstract class** and implemented in `db`. That is a slight break from "ports live in `application`," and it is deliberate: an API key is an authentication artifact, not a domain entity, and nothing in `application` should know keys exist.

---

## Step 15.7 — The four surfaces

**Web** — httpOnly cookie, `sameSite: "lax"`, `secure` in production. JavaScript cannot read the token, so XSS cannot exfiltrate a session.

**Desktop (Tauri)** — the bearer plugin. The token lives in the OS keychain on the Rust side; the webview asks for it through a Tauri command and passes it via `BearerAuthStrategy` ([17](17-api-client-package.md)). The token is never written to `localStorage`, where any injected script could read it.

**Client portal** — the same `user` table and the same login. A portal user is a user whose role resolves to a deliberately tiny capability set. There is no second auth system, which is why the portal cannot develop its own vulnerabilities.

**Integrations** — an API key resolving to a `Principal` with `kind: "api_key"`.

Four surfaces, one `Principal`, one `Authorizer.assert()`.

---

## Step 15.8 — Security checklist

- **Email verification required** before a session grants anything beyond a stub. Otherwise anyone can create an account naming a colleague's address.
- **2FA available, enforceable per role.** Enforce it for anyone holding `rbac.role.manage`; optional otherwise.
- **Revoke all sessions on password change.** `revokeSessionsOnPasswordReset: true` above. This is the difference between "changed my password" and "actually locked them out."
- **`trustedOrigins` explicit.** No wildcards. Add both Tauri origins when the desktop app ships.
- **Auth events go to the audit trail** — sign-in, sign-out, password change, 2FA enrolment, session revocation, API-key creation and revocation.
- **Never log tokens, session IDs, or key material.** Redact at the logger, not at each call site — a rule enforced in one place holds.
- **Invite-only registration** for internal roles. Open sign-up creates unaffiliated users the RBAC model has no place for.
- **Pin Better Auth and watch its advisories.** The catalog floor is 1.3.26 for a reason ([03](03-workspace-and-catalogs.md)).

---

## Step 15.9 — Two things worth deciding now

**Multi-organisation or single?** The RBAC model has an org scope but the schema assumes one organisation. If you will ever run multiple tenants on one deployment, add `organization_id` to `memberships`, `goal_members`, and every domain table **now**. Retrofitting a tenant column across two dozen feature modules is a genuinely large migration, and it is the kind of thing discovered when the first customer asks.

**Session lifetime and refresh.** Pick a policy up front: how long a session lives, whether it slides on activity, and how long a desktop token lasts. Desktop tokens usually want to be longer-lived than web sessions, which means they also want independent revocation — a "sign out all devices" that actually reaches the desktop app.

---

## Step 15.10 — The barrel

**`packages/auth/src/index.ts`**

```ts
import { ServerOnly } from "@ratchet/core";

ServerOnly.assert("@ratchet/auth");

export * from "./apikey/index.js";
export * from "./auth.config.js";
export * from "./auth.factory.js";
export * from "./principal/index.js";
export * from "./session/index.js";
```

---

## ✅ Gate

- `pnpm auth:generate` produced `packages/db/src/rbac/auth.schema.ts` and it is committed.
- `pnpm db:migrate` created `user`, `session`, `account`, `verification`, and `api_keys`.
- The foreign keys from `memberships`, `goal_members`, and `permission_overrides` to `"user"(id)` exist.
- `grep -rn "better-auth" packages --include=*.ts` matches only `packages/auth/` and (later) `packages/api-client/src/auth/`.

Do not proceed until this passes.

---

[← `@ratchet/infrastructure`](14-infrastructure-package.md) · [`@ratchet/composition` →](16-composition-container.md)
