---
title: The API-key model
description: Shown once, stored as a digest, looked up by prefix, compared in constant time — and re-intersected with the issuer's live capabilities on every request rather than frozen at creation.
---

# The API-key model

Two classes: `ApiKeyHasher` mints and compares, `ApiKeyResolver` turns a token into a `Principal`.
`ApiKeyRepository` is the port between them and Postgres, declared here rather than in `application`
because no use-case should learn that API keys exist.

## The token is shown once and never stored

```ts
const bytes = crypto.getRandomValues(new Uint8Array(32));
const token = `rk_${hex(bytes)}`;
return { token, prefix: token.slice(0, 8), hash: await sha256(token) };
```

`token` is returned to the caller at creation and never written anywhere. The row holds `prefix` and
`tokenHash`, so a database dump contains no usable credential — and "I lost it" is answered by
issuing a new key, not by looking the old one up.

256 bits from a CSPRNG. `crypto` is reached off `globalThis` rather than imported, the same way
`ServerOnly` reaches `window`, because `lib: ["ES2024"]` declares neither.

## The prefix is an index, not an identifier

Eight characters, stored in an indexed column. Without it, authenticating a key is a scan-and-compare
over every key ever issued.

**Several keys share a prefix, and that is fine** — the repository returns *candidates* and the hash
comparison picks one. A resolver that returned the first candidate would authenticate one integration
as another; `tests/apikey/api-key.resolver.spec.ts` pins that it does not.

## `timingSafeEqual` costs nothing here and closes a question

```ts
if (a.length !== b.length) return false;
let diff = 0;
for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
return diff === 0;
```

The prefix already narrowed the candidate set to a handful, so this runs a few times per request over
64-character digests. The length short-circuit is the one leak it accepts, and it never fires: the
values compared are always SHA-256 hex.

It is here less for the attack than for the review — it removes a class of question that would
otherwise have to be answered every time someone reads this file.

## Re-intersection is the part that matters

```ts
const declared = CapabilitySet.from({ wildcard: false, org: { grants: scoped, denies: [] }, goals: {} });
const issuer   = await this.capabilities.forUser(record.organizationId, record.issuerId);
const effective = declared.intersect(issuer);
```

**A key's scopes are re-intersected with the issuer's *live* capabilities on every request, not
frozen at creation.**

With frozen scopes, revoking the issuer's `rbac.role.manage` leaves every key they ever issued still
managing roles — and nobody notices, because the key still works. Re-intersecting means revoking a
person narrows their keys with them, in the same request, through the same
[`CapabilityCache`](capability-cache.md) that gates their browser session.

The scopes are also filtered through `PermissionRegistry.isKnown()` first. A row written before a
permission was renamed is a stale string, not a grant — and it must not throw either, because a stale
key is a 401, never a 500.

## Revocation and expiry are checked before the key is recorded as used

```ts
if (record.revokedAt) return null;
if (record.expiresAt && record.expiresAt <= now) return null;
…
await this.repository.touch(record.id, now);
```

`touch` records a *successful* use. Recording a refused one would put a last-used timestamp on a
revoked key, which is the field an operator reads when deciding whether a leaked key was ever used.

## What is missing on purpose

**No rate limit per key, and no scope hierarchy.** Better Auth's own rate limiter covers the auth
endpoints; a per-key budget belongs with whatever meters usage, which this kit does not ship. A scope
hierarchy (`rbac.*`) would make the intersection above ambiguous, and the permission catalog is
deliberately flat for the same reason.
