---
title: "@loadbearing/auth"
description: Identity, and the wall Better Auth stops at. Four credential types collapse into one Principal here, so a single Authorizer.assert() serves the browser, the desktop shell, an integration's API key, and the worker.
---

# `@loadbearing/auth`

**This package answers one question: who is asking?** Everything downstream answers *may they*, and
it answers that against a `Principal` — a tenant, a user id, and a resolved `CapabilitySet` — with no
idea which credential produced it.

That collapse is the deliverable. A browser cookie, a Tauri bearer token, an integration's API key
and the worker's scheduled run are four different things at the edge and one object one layer in, so
`Authorizer.assert(actor, "rbac.role.read")` is written once and serves all four.

```bash
grep -rn "better-auth" packages apps --include=*.ts | grep -v packages/auth
```

Returns hits in `packages/api-client` (the *client* half, a different library entrypoint) and
nowhere else. **Swapping the auth library rewrites this package and nothing else** — which is the
whole reason it is a package rather than a folder in `apps/web/src/server/`.

| | |
| --- | --- |
| **Package** | `@loadbearing/auth` (private, never published) |
| **Entrypoint** | `src/index.ts` |
| **Depends on** | `@loadbearing/application`, `@loadbearing/contracts`, `@loadbearing/core`, `@loadbearing/infrastructure`, `@loadbearing/permissions`, plus `better-auth` |
| **Used by** | `packages/composition` only. Nothing else may name it — Biome bans the import from `packages/ui/**`, `packages/feature/**`, `packages/query/**` and `apps/web/src/**` |
| **Environment** | server-only; `ServerOnly.assert()` in `src/index.ts` is the runtime tripwire |
| **Setup doc** | [16 · `@loadbearing/auth`](../../../docs/setup/16-auth-package.md) |

```
packages/auth/
├── vitest.config.ts
├── src/
│   ├── index.ts                          ← ServerOnly.assert() first among the statements
│   ├── import.ts                         ← every external symbol, better-auth included
│   ├── auth.config.ts                    → AuthConfig
│   ├── auth.factory.ts                   → AuthFactory, AuthInstance
│   ├── apikey/
│   │   ├── api-key.hasher.ts             → ApiKeyHasher, GeneratedApiKey
│   │   └── api-key.resolver.ts           → ApiKeyResolver, ApiKeyRepository, ApiKeyRecord
│   ├── mail/
│   │   └── auth.mailer.ts                → AuthMailer                        (port)
│   ├── principal/
│   │   ├── principal.builder.ts          → PrincipalBuilder
│   │   └── capability.cache.ts           → CapabilityCache
│   ├── session/
│   │   ├── better-auth.session-resolver.ts → BetterAuthSessionResolver
│   │   ├── membership.reader.ts          → MembershipReader                  (port)
│   │   └── membership.enroller.ts        → MembershipEnroller                (port)
│   └── tables/
│       └── index.ts                      ← a script. Never exported, never built
└── tests/
    ├── support/doubles.ts
    ├── apikey/{api-key.hasher,api-key.resolver}.spec.ts
    ├── principal/{capability.cache,principal.builder}.spec.ts
    └── session/better-auth.session-resolver.spec.ts
```

---

## The three ports declared here, not in `application`

`MembershipReader`, `MembershipEnroller` and `AuthMailer` are abstract classes in this package, and
`ApiKeyRepository` is a fourth. They break the usual rule — ports live in
`packages/application/src/port/` — and the reason is the same for all four: **they exist to populate
an authentication artifact, and no use-case should learn that any of them exists.** A use-case must
not know that sessions have an organization column, that a password reset is an email rather than a
code read over the phone, or that API keys exist at all.

Their implementations live in `packages/infrastructure` and `packages/composition`, neither of which
can import this package's types — `auth` already depends on `infrastructure`, and `composition`
depends on both. So the binding is **structural**, and it is checked exactly where the two meet:

```ts
// packages/composition/src/container/container.ts
const membershipReader: MembershipReader = new PgMembershipReader(…);
```

A signature drift fails `composition`'s typecheck, on that line, rather than at runtime.

---

## The wall

```
     cookie ─┐
bearer token ─┼─→ BetterAuthSessionResolver ─┐
             │                               ├─→ PrincipalBuilder ─→ Principal
    x-api-key ──→ ApiKeyResolver ────────────┘
```

`BetterAuthSessionResolver` is the only file in the repository that names Better Auth's session API.
It returns a `ResolvedSession` — the port's shape, declared in `application` — and everything above
it depends on that.

**It refuses a session with no `activeOrganizationId` rather than defaulting one.** A session written
before the create hook existed, or written by hand, has no tenant; guessing one is a cross-tenant read
with nothing downstream positioned to notice. No tenant means no session.

---

## Sign-in, end to end

`AuthFactory` configures Better Auth once, and two of its options are the whole tenancy design.

**`databaseHooks.session.create.before` pins the tenant onto the session row.** Resolved once, at
sign-in, so every later request reads it off a row Better Auth was going to load anyway — rather than
a membership query per call, or a header the client chooses. Returning `false` aborts the session, so
a user with no membership gets a failed sign-in rather than a principal with no tenant.

**`MembershipEnroller` is what puts the first row in `memberships`.** Without it nothing in the
repository ever writes that table, and a fresh database can never produce a session: the hook above
correctly refuses one, forever. Enrolment runs from the same hook rather than from
`user.create.after`, and that is not a preference — Better Auth queues `create.after` hooks until the
whole sign-up endpoint has finished, which is *after* the session hook has already run and refused.

It is off unless `BOOTSTRAP_ORGANIZATION_SLUG` names an organization, which is the right production
posture: with it unset, an unaffiliated sign-up gets no membership and no session, and joining
becomes something an invitation grants. With it set, the first user into that organization is enrolled
as `owner` and everyone after as `member`, behind a Postgres advisory lock — losing that race would
mint a second account holding every permission in the registry.

**A user who belongs to two organizations gets two sessions**, which is also what makes switching
organizations an explicit act rather than an ambient one.

---

## What is deliberately *not* used

| | |
|---|---|
| The organization plugin | No. `organizations`, `memberships` and `goal_members` are yours, and they point at your own `roles` table. The plugin would add a parallel `member.role` string meaning something else, and reconciling the two is worse than not having it. |
| `better-auth/react` | No, and not in `api-client` either. It keeps its own cache with its own invalidation rules, which puts two caching systems in one app — and they disagree on sign-out, showing a signed-in shell around a run of 401s. |
| `@better-auth/cli` | No. It trails the library's release line, and a generator behind the runtime writes a schema that is wrong exactly where it matters. `src/tables/` prints the truth from the pinned runtime instead. |
| Secondary storage for sessions | Redis in **front** of Postgres, never instead of it. `storeSessionInDatabase: true` and `verification.storeInDatabase: true` are both non-default and both load-bearing: without them an ordinary cache eviction is a random sign-out, or a reset link that stops working with no error on either side. |

---

## Reference

- [`PrincipalBuilder`](reference/principal-builder.md) — why the API key is checked before the cookie,
  and why there is no fall-through.
- [`CapabilityCache`](reference/capability-cache.md) — the sixty-second TTL, and why it is a
  revocation window rather than a performance dial.
- [The API-key model](reference/api-key.md) — hash-only storage, prefix lookup, and re-intersection
  with the issuer's live capabilities on every request.

---

## Gate

- `pnpm --filter @loadbearing/auth test` passes.
- `pnpm --filter @loadbearing/auth run auth:tables` runs, and every field it prints has a matching
  property in `packages/infrastructure/src/pg/schema/auth.schema.ts` **under Better Auth's own name** —
  the Drizzle adapter resolves a column by looking up `schema[model][field]`, so the property keys are
  load-bearing and the SQL column names are not.
- `grep -rn "better-auth" packages apps --include=*.ts | grep -v packages/auth | grep -v packages/api-client`
  returns nothing.
- Adding `import { AuthFactory } from "@loadbearing/auth"` to a file in `packages/feature/src/` is a
  Biome error.
