# 16 · `@loadbearing/auth`

> Better Auth, self-hosted, in its own server-only package. Authentication only — every authorization decision stays in `CapabilitySet`.

**Delivers:** One identity layer serving the web app, the desktop app, a client portal, and API-key integrations, all collapsing into the single `Principal` the rest of the system already understands.

**Prerequisite:** [15 · `@loadbearing/infrastructure`](15-infrastructure-package.md)

---

## Decisions at a glance

| Question | Answer |
|---|---|
| Library | Better Auth, self-hosted, tables in your own Postgres |
| Package | One — `packages/auth`, server-only. Not two |
| Roles / permissions | **Not** Better Auth's. `PermissionRegistry` and `CapabilitySet` keep that job |
| Organization plugin | No. You own `organizations`, `memberships`, and `goal_members` |
| Session transport | Cookie (web) **and** bearer token (desktop) from day one |
| API keys | Your own implementation, not the plugin's session mocking |
| Session storage | Postgres owns the record; Redis is a read-through cache in front of it |
| Client-side session | Through `@loadbearing/query`, not Better Auth's React hooks |

---

## What Better Auth owns, and what it does not

**It owns** password hashing, session issuance and rotation, email verification, password reset, OAuth account linking, two-factor, and bearer tokens — all the boring, security-critical machinery you do not want to write.

**It does not own authorization.** Better Auth ships an organization plugin with its own `createAccessControl` and role definitions. **Do not use it.** The architecture's strongest claim is that there is no second security model to keep in sync; adopting its roles gives you exactly that — one permission model in `PermissionRegistry`, another in the auth library, drifting apart the first time someone edits only one.

**Skip the organization plugin entirely.** `memberships` and `goal_members` already exist ([13](13-db-package.md)) and point at your own `roles` table. The plugin would add a parallel `member.role` string column meaning something different, and reconciling the two is worse than not having it.

**Do not use the API-key plugin's session mocking.** It mints a session for a key, which means a leaked key impersonates a full user with that user's live permissions. The model in Step 16.6 is strictly better: a key is a principal with its own capability set that cannot exceed its issuer's, re-intersected on every request.

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

The **client** side of auth does not live here. Better Auth's client is a thin fetch wrapper around endpoints, and `@loadbearing/api-client` is the package whose entire job is "how to reach the server." See [18](18-api-client-package.md).

---

## Step 16.1 — Generate the auth schema

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

**Now add the real foreign keys.** Your domain tables reference `user_id` as `text` from [13](13-db-package.md) precisely so this works. Write a hand-authored migration:

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

-- Every foreign key needs a covering index. Postgres does not create one, and
-- without it each ON DELETE CASCADE scans the whole referencing table.
CREATE INDEX IF NOT EXISTS session_user_idx ON "session" (user_id);
CREATE INDEX IF NOT EXISTS session_expires_idx ON "session" (expires_at);
CREATE INDEX IF NOT EXISTS account_user_idx ON account (user_id);
```

> `"user"` is quoted because it is a reserved word in SQL. Better Auth's naming, not a choice you get to make.

Deleting a user now cascades their role assignments, which is what you want. It also means there is exactly one users table — a claim worth being able to make.

**The three indexes above are the point of this migration as much as the constraints are.** The `user_id` columns on `memberships`, `goal_members` and `permission_overrides` are already indexed from [13](13-db-package.md); the tables Better Auth generated are not, and its CLI will not add them. `session_expires_idx` is what makes the expiry sweep below cheap.

> **`session` is not partitioned, and that is deliberate.** It looks like a third append-only table next to `activity_log` and `task_status_history`, and it is not one: Better Auth updates a row on refresh, deletes it on sign-out, and looks rows up by id — a predicate carrying no partition key, so every lookup would scan every partition. Its generated schema will not produce the composite primary key that partitioning requires either.
>
> Sessions are bounded by expiry instead. A nightly `DELETE FROM "session" WHERE expires_at < now()` on the cleanup schedule ([25](25-worker-app.md)) keeps the table small, which is the outcome partitioning would have been for. See [Data and scale](../opinions/data-and-scale.md) §4.2.

---

## Step 16.2 — `AuthConfig` and `AuthFactory`

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
import type { Database } from "@loadbearing/db";
import type { CacheStore } from "@loadbearing/application";
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

      // Redis in FRONT of Postgres, never instead of it. This is the cache
      // instance, so anything here can vanish under memory pressure.
      // Better Auth reads through to the `session` table on a miss.
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

**The bearer plugin is not optional.** The desktop shell is Tauri ([30](30-desktop-app.md)), its webview runs on a custom `tauri://localhost` origin (`http://tauri.localhost` on Windows), and a session cookie is never sent cross-origin. So it needs a token, and enabling the plugin costs one array element here versus touching every endpoint, guard, and test later.

**Cookie cache on, with a short TTL.** Better Auth can store signed session data in the cookie itself, so most requests skip the session lookup entirely. This is the single biggest performance win available here and it costs one config block. **Sixty seconds, and no longer** — revocation only takes effect when the cookie cache expires, so this value *is* the revocation window, and it is capped by the same rule that caps the capability cache below. Anything longer and "remove this person's access" quietly means "in a few minutes".

**Secondary storage is a cache, not the session record.** It sits on the Redis instance that runs `allkeys-lru` ([15](15-infrastructure-package.md)), which means an entry can disappear at any moment under memory pressure. That is fine — and only fine — because Postgres still holds the `session` row and Better Auth reads through to it on a miss. Point this at the queue instance to "make sessions durable" and you have made a `FLUSHALL` on a full queue sign everyone out; treat the Redis entry as authoritative and an ordinary eviction becomes a random sign-out. Rate-limit counters have the same property, and there the failure is benign: a lost counter means someone gets a few extra attempts, not a lockout.

**`trustedOrigins` is your CSRF defence**, and it must be explicit. It carries **both** Tauri origins from day one — `tauri://localhost` and `http://tauri.localhost` — because the scheme genuinely differs by platform, and shipping one produces an app that works for half your team. The value lives in `AUTH_TRUSTED_ORIGINS` and the same list drives the CORS allowlist ([24](24-web-app.md)); one origin list, two consumers. A wildcard here is not a shortcut; it is the vulnerability.

---

## Step 16.3 — `BetterAuthSessionResolver`

**`packages/auth/src/session/better-auth.session-resolver.ts`**

```ts
import type { UserId } from "@loadbearing/contracts";
import { SessionResolver, type ResolvedSession } from "@loadbearing/application";
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

## Step 16.4 — `CapabilityCache`

`PgCapabilityRepository.resolveFor()` is three queries across role permissions, goal memberships, and overrides. It runs on essentially every request. Fine at ten users, not at five hundred.

**`packages/auth/src/principal/capability.cache.ts`**

```ts
import type { CacheStore } from "@loadbearing/application";
import type { CapabilityRepository } from "@loadbearing/application";
import { CapabilitySet, type CapabilitySetDto } from "@loadbearing/permissions";

export class CapabilityCache {
  private static readonly PREFIX = "capability:user:";
  private static readonly TTL_SECONDS = 60;

  constructor(
    private readonly repository: CapabilityRepository,
    private readonly cache: CacheStore,
  ) {}

  public async forUser(
    organizationId: OrganizationId,
    userId: string,
  ): Promise<CapabilitySet> {
    const key = `${CapabilityCache.PREFIX}${organizationId}:${userId}`;

    const cached = await this.cache.get<CapabilitySetDto>(key);
    if (cached) return CapabilitySet.from(cached);

    const resolved = await this.repository.resolveFor(organizationId, userId);
    await this.cache.set(key, resolved.toJSON(), CapabilityCache.TTL_SECONDS);
    return resolved;
  }

  // Call on every RBAC write. See the invalidation list below.
  public async invalidate(organizationId: OrganizationId, userId: string): Promise<void> {
    await this.cache.delete(`${CapabilityCache.PREFIX}${organizationId}:${userId}`);
  }

  // Role edits affect everyone holding it — cheaper to flush than to enumerate.
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

**The cache key carries the organization, and that is not decoration.** A key of `capability:user:<id>` means a user who belongs to two organizations gets whichever capability set was cached first — a cross-tenant privilege bug with a one-minute fuse and no error anywhere. The prefix scheme still supports `deletePrefix`, because the organization segment sits between the fixed prefix and the user id.

**This is the read path the whole system's throughput rests on.** At scale it is fronted by signed capability data in the session cookie and an in-process LRU, so most requests never reach Redis at all — Step 16.9 has the chain and the TTL ceiling. Build it as written first; the two tiers above it are the [Data and scale](../opinions/data-and-scale.md) §6 answer to a load test, not something to add speculatively.

**Sixty seconds, and no longer.** The TTL is a backstop for an invalidation you forgot, not the primary mechanism. Raising it to an hour because the cache hit rate looks better is trading a security window for a metric.

**`CapabilitySetDto` round-trips through JSON**, which is why this cache works at all — the same property that lets the browser reconstruct a `CapabilitySet` from an SSR payload ([08](08-permissions-package.md)).

---

## Step 16.5 — `PrincipalBuilder`

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
import { Principal, type SessionResolver } from "@loadbearing/application";
import type { UserId } from "@loadbearing/contracts";
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

    const caps = await this.capabilities.forUser(session.organizationId, session.userId);
    return new Principal(session.userId as UserId, caps, "user");
  }
}
```

**The oRPC middleware calls this, never Better Auth directly** ([24](24-web-app.md)). That is what keeps the transport layer ignorant of the auth library, and it is why moving to NestJS later means rewriting a guard rather than rewriting authentication.

**API key is checked first.** A request carrying both a session cookie and an `x-api-key` header is an integration calling through a browser context, and the key is the more specific credential. Checking the session first would silently upgrade a scoped key to full user permissions.

---

## Step 16.6 — API keys

**`packages/db/src/rbac/api-key.schema.ts`**

```ts
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    name: text("name").notNull(),
    issuerId: text("issuer_id").notNull(),

    // First 8 chars of the token — indexed lookup without storing the secret.
    prefix: text("prefix").notNull(),
    // sha256(token). The token itself is never stored, anywhere, ever.
    tokenHash: text("token_hash").notNull(),

    // Scopes at creation, already intersected with the issuer's capabilities.
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),

    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("api_keys_hash_uq").on(t.tokenHash),
    index("api_keys_prefix_idx").on(t.prefix),
    index("api_keys_issuer_idx").on(t.organizationId, t.issuerId),
  ],
);
```

**`packages/auth/src/apikey/api-key.hasher.ts`**

```ts
import { Uuid } from "@loadbearing/core";

export interface GeneratedApiKey {
  // Shown to the user exactly once, at creation. Never stored.
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
import { Principal } from "@loadbearing/application";
import type { UserId } from "@loadbearing/contracts";
import { CapabilitySet, PermissionRegistry, type PermissionKey } from "@loadbearing/permissions";
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
    const issuer = await this.capabilities.forUser(record.organizationId, record.issuerId);
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

## Step 16.7 — The four surfaces

**Web** — httpOnly cookie, `sameSite: "lax"`, `secure` in production. JavaScript cannot read the token, so XSS cannot exfiltrate a session.

**Desktop (Tauri)** — the bearer plugin. The token lives in the OS keychain on the Rust side; the webview asks for it through a Tauri command and passes it via `BearerAuthStrategy` ([18](18-api-client-package.md)). The token is never written to `localStorage`, where any injected script could read it.

**Client portal** — the same `user` table and the same login. A portal user is a user whose role resolves to a deliberately tiny capability set. There is no second auth system, which is why the portal cannot develop its own vulnerabilities.

**Integrations** — an API key resolving to a `Principal` with `kind: "api_key"`.

Four surfaces, one `Principal`, one `Authorizer.assert()`.

---

## Step 16.8 — Security checklist

- **Email verification required** before a session grants anything beyond a stub. Otherwise anyone can create an account naming a colleague's address.
- **2FA available, enforceable per role.** Enforce it for anyone holding `rbac.role.manage`; optional otherwise.
- **Revoke all sessions on password change.** `revokeSessionsOnPasswordReset: true` above. This is the difference between "changed my password" and "actually locked them out."
- **`trustedOrigins` explicit.** No wildcards, and **both** Tauri origins present — the scheme differs by platform, so one of them is half a deployment.
- **Auth events go to the audit trail** — sign-in, sign-out, password change, 2FA enrolment, session revocation, API-key creation and revocation.
- **Never log tokens, session IDs, or key material.** Redact at the logger, not at each call site — a rule enforced in one place holds.
- **Invite-only registration** for internal roles. Open sign-up creates unaffiliated users the RBAC model has no place for.
- **Pin Better Auth and watch its advisories.** The catalog floor is 1.3.26 for a reason ([03](03-workspace-and-catalogs.md)).

---

## Step 16.9 — Session lifetime, and the revocation chain

**Multi-organisation was the other open question here, and it is now decided.** `organization_id` is on every domain table from the first migration, and it is the sharding key ([13](13-db-package.md), [Data and scale](../opinions/data-and-scale.md) §4.1). The reasoning is unchanged — retrofitting a tenant column across two dozen feature modules is a genuinely large migration discovered when the first customer asks — but it is no longer conditional on whether you expect a second tenant. It costs a column now and it is the one thing on this page that cannot be added cheaply later.

What that leaves for this step is session lifetime, which interacts with something the scale work made concrete: **there are three caches between a permission change and a request seeing it.**

```
signed cookie cache   ← 60s max
  → in-process LRU    ← 10s, per app instance
    → Redis           ← 60s TTL
      → Postgres      ← the truth
```

**The revocation window is the longest TTL in that chain, not the shortest cache.** Every tier has to be bounded by the number you are willing to answer for when someone says "I removed their access, why does it still work?" Sixty seconds is that number here. Explicit invalidation on a grant change is the mechanism; the TTLs are the backstop for an invalidation somebody forgot.

An in-process LRU is the tier that surprises people, because a Redis `DEL` cannot reach it — twenty app instances hold twenty copies. Keep its TTL short enough that correctness never depends on invalidating it, which is why it is seconds rather than minutes.

**Three values, and with the desktop shell settled they are answerable now rather than later.** Record them here so the answer lives somewhere:

| Value | Chosen | Note |
| --- | --- | --- |
| Web session lifetime | *decide* | |
| Slides on activity? | *decide* | A sliding window and a short cookie-cache TTL interact — the cache delays revocation regardless |
| Desktop token lifetime | *decide* | Usually longer than a web session |

A longer-lived desktop token is the normal choice and it has a consequence: it needs **independent revocation**, because "sign out all devices" has to actually reach a machine that may be offline. Decide that mechanism at the same time, not when someone loses a laptop.

**The desktop path has no cookie**, so the first tier of that chain does not exist for it ([30](30-desktop-app.md)). A bearer-token client pays a full capability resolution on every cache miss, and the in-process LRU is the only thing absorbing it. Worth knowing before the load test, because desktop traffic and web traffic have genuinely different cost profiles per request.

---

## Step 16.10 — The barrel

**`packages/auth/src/index.ts`**

```ts
import { ServerOnly } from "@loadbearing/core";

ServerOnly.assert("@loadbearing/auth");

export {
  ApiKeyHasher,
  type ApiKeyRecord,
  ApiKeyRepository,
  ApiKeyResolver,
  type GeneratedApiKey,
} from "./apikey/index.js";
export type { AuthConfig } from "./auth.config.js";
export { AuthFactory, type AuthInstance } from "./auth.factory.js";
export { CapabilityCache, PrincipalBuilder } from "./principal/index.js";
export { BetterAuthSessionResolver } from "./session/index.js";
```

**`auth.config.ts` contributes only a type, so its line is `export type { … }`, not `export { type … }`.** Biome's `useExportType` rewrites the second form into the first automatically when every specifier is a type; run `biome check --write` and stop thinking about it.

---

## ✅ Gate

- `pnpm auth:generate` produced `packages/db/src/rbac/auth.schema.ts` and it is committed.
- `pnpm db:migrate` created `user`, `session`, `account`, `verification`, and `api_keys`.
- `api_keys` carries `organization_id`, and `api_keys_issuer_idx` covers the `issuer_id` foreign key.
- The foreign keys from `memberships`, `goal_members`, and `permission_overrides` to `"user"(id)` exist.
- `grep -rn "better-auth" packages --include=*.ts` matches only `packages/auth/` and (later) `packages/api-client/src/auth/`.

Do not proceed until this passes.

---

[← `@loadbearing/infrastructure`](15-infrastructure-package.md) · [`@loadbearing/composition` →](17-composition-container.md)
