---
title: Mutations and invalidation
description: Why useAppMutation invalidates before onSuccess, why sign-out and organization switch declare no invalidation at all, and the rule for deciding what each mutation invalidates.
---

# Mutations and invalidation

Every mutation in this package is a static factory on a class — `SessionMutations.useSignIn(auth)`,
`AccountMutations.useChangePassword(client)`. A class of static hook factories is fine because the
hook rules apply at the **call site**, and each of these is called unconditionally at the top of a
component.

The split between the classes is the one `AuthClient` and `AccountClient` already draw:
`SessionMutations` is everything an anonymous visitor can start, `AccountMutations` is everything a
signed-in person can change about their own account.

## Invalidate before `onSuccess`

`useAppMutation` runs its `invalidates` list **before** the caller's `onSuccess`. That order is the
contract: a caller that navigates in `onSuccess` must be navigating to a cache that has already been
marked stale, or the destination renders the value the mutation just changed.

## The three states of `invalidates`

**A key.** The ordinary case: the mutation changed something a query reads.

| Mutation | Invalidates | Why |
|---|---|---|
| `useUpdateName` | `["session"]` | The rendered name lives on the session snapshot |
| `useVerifyTotpEnrolment` | `["session"]` | The moment two-factor actually becomes true — `user.twoFactorEnabled` is what the security page renders |
| `useChangePassword` | the session **list** | `revokeOtherSessions` is set, so every other device is gone and the list on screen is wrong. This tab's own session survives, which is why `QueryKeys.session` is absent |
| `useInvite`, `useRevokeInvitation` | `member.all()` | A re-invite replaces a pending row and the member list sits beside it, so both refetch together |

**Nothing, because nothing changed yet.** These are not omissions:

| Mutation | Why no invalidation |
|---|---|
| `useSignUp` | No session is issued — verification is required and `autoSignIn` is off — so invalidating `["session"]` refetches a session that is still, correctly, anonymous |
| `useChangeEmail` | A confirmation was sent to the *old* address; the address on the session moves only once that link is followed |
| `useEnableTwoFactor` | Two-factor is not on yet. Invalidating here makes the page claim protection the account does not have |
| `useSignInWithGoogle`, `useLinkGoogle` | The success path is a full-page navigation to Google. Nothing in this cache survives to be invalidated; the settings page refetches when the browser returns |

**Nothing, because the whole cache has to go.** Sign-out and the three organization actions.

## Sign-out and switch clear the cache at the call site

`useSignOut` and every `OrganizationMutations` hook declare no `invalidates`, and that is the point.

After a sign-out or a tenant switch, **every cached row in the client belongs to the tenant just
left**. The only correct invalidation is `queryClient.clear()`, and that is a lifecycle decision the
call site makes rather than something this package can decide: the desktop shell may want to keep an
offline cache across a sign-out.

Invalidating only `["session"]` is the failure mode worth naming. It leaves every other query in
memory, so the next person to sign in on that machine sees a flash of the previous user's data
before the refetch lands.

The call sites do the same four things, in order — clear the query cache, invalidate the session
store, re-run the root loader, navigate — which is why `apps/web` factors that into one helper
rather than repeating it.

## Keys mirror procedure paths, parameters last

`contract.task.list` becomes `["task", "list", params]`. Given a procedure you can write its key
without looking anything up, which is the same derivability the file-naming rules have.

Every namespace has `all()`, because TanStack matches by prefix: one call catches every list and
detail below it, and that is what makes invalidation trustworthy.

`account` is deliberately **not** under `session`. Those rows outlive a single session record — the
linked-account list is a property of the user — and putting them under `session` would refetch three
lists every time a session is refreshed.

## Stale times are backstops, not the mechanism

Every query in this package is invalidated by the mutation that changes it. `staleTime` exists for
the *other* tab, and the numbers say how long a lie is tolerable:

| Query | Stale time | Why |
|---|---|---|
| Linked accounts, roles, members | a minute | Changed only by a mutation on the same page, each of which invalidates |
| Active sessions, invitations | shorter | A session can end, or an invitation be accepted from another device, with this tab doing nothing — and "where you are signed in" showing a minute-old answer is a screen that lies about the thing it exists for |

Retries come from the error catalog rather than from a per-query setting: retryability is a fact
about the code. A `FORBIDDEN` retried twice with backoff turns an instant "you cannot do that" into
a three-second wait for the same answer. A signed-out session query is an answer, not a failure to
retry, so it retries never.
