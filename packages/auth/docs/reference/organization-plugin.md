---
title: OrganizationPlugin
description: Switch, create, accept — the three actions that end in a session pointing at a different tenant, and why each is a Better Auth endpoint rather than an oRPC procedure.
---

# `OrganizationPlugin`

Three `POST` endpoints mounted on Better Auth:

| Path | Body | Authorization |
|---|---|---|
| `/organization/switch` | `{ organizationId }` | `MembershipReader.isMember` — one indexed lookup |
| `/organization/create` | `{ name }` | a session, plus the rate limit |
| `/invitation/accept` | `{ token }` | `InvitationClaimer.claimByToken` decides |

Every one of them ends the same way, in `rebind()`: the session row is rebound to the new tenant,
the Redis copy with it, `users.last_active_organization_id` is written, and **the session cookie
cache is re-issued**.

## Why these are endpoints and not procedures

Two reasons, both load-bearing.

**Only a handler holding Better Auth's `ctx` can call `setSessionCookie`.** `session.cookieCache` —
sixty seconds — is what most requests resolve the tenant from. A switch that updated the row and not
the cookie would have every RPC for the next minute answering for the tenant just left. See
[`auth-factory.md`](./auth-factory.md) for the cookie cache window itself.

**They are identity-gated, not permission-gated.** "May I switch to a tenant I belong to", "may I
found one", "may I accept an invitation sent to my address" are answered by membership and by the
verified mailbox — never by a role held in some *other* organization. Nothing in
`PROCEDURE_PERMISSIONS` could gate them, and in this repository every procedure must be gated there.

## `rebind()`, in order

```ts
const updated = await ctx.context.internalAdapter.updateSession(token, { activeOrganizationId });
await ctx.context.internalAdapter.updateUser(user.id, { lastActiveOrganizationId: organizationId });
await setSessionCookie(ctx, { session: updated, user });
```

This is what Better Auth's own organization plugin does for `setActiveOrganization`, plus the
last-active preference. The order matters: the row and its Redis copy first, the cookie cache last,
so the very next request — RPC or SSR — resolves the new tenant.

`lastActiveOrganizationId` is where the next sign-in lands.
`MembershipReader.activeOrganizationFor` honours it only while the membership still exists, so
nothing written here needs to be undone when a member is removed.

## Refusals

`switchOrganization` throws `FORBIDDEN` / `NOT_A_MEMBER` when `isMember` says no. That check is the
whole authorization: a session may only be rebound to a tenant this person already holds a
membership in.

`acceptInvitation` throws `NOT_FOUND` / `INVITATION_NOT_CLAIMABLE` on a `null` from the claimer, and
`null` covers every refusal at once — unknown token, expired, revoked, sent to a different address,
unverified account. The claimer decides which, and the landing page has already told the person
which of those it is; the endpoint deliberately does not distinguish them to a caller holding a
token.

`createOrganization` uses the same `OrganizationFounder` the personal enroller uses, so an
organization created here is indistinguishable from one created at a first sign-in. See
[`enrolment.md`](./enrolment.md).

## Rate limits

All three paths carry custom rules rather than the global twenty a minute, declared in
`AuthFactory`: create and accept at 5, switch at 20. Creating a tenant seeds a role set and about
seventeen permission rows, and accepting is a guess against a token — neither is something a person
does five times a minute.

`NAME_MAX` is 80: long enough for any real name, short enough that a pasted paragraph is refused.

## What is not used

Better Auth's own organization plugin. `organizations`, `memberships` and `goal_members` are this
repository's tables and point at its own `roles` table; the plugin would add a parallel
`member.role` string meaning something else, and reconciling the two is worse than not having it.
The one thing it does that nothing else can — rebind a session and re-issue its cookie — is sixty
lines here, against these tables.

The client half is `OrganizationClient` in `packages/api-client`: three thin posts over Better
Auth's own `$fetch`, no client plugin. After any of them the call site does what sign-out does —
clear the query cache, invalidate the session store, re-run the root loader — because every cached
row belongs to the tenant just left.
