---
title: Server functions
description: Why a *.fn.ts is half client, what that means for what it may import, and why the three shipped ones resolve state and decide nothing.
---

# Server functions

Three files: `session.fn.ts`, `appearance.fn.ts`, `invitation.fn.ts`. Plus `rpc-client.ts` and
`container.ts` beside them, which are not server functions but share their constraints.

## A server function is half client

**The stub ships to the browser and only the handler body is stripped.** That single fact decides
everything below.

`session.fn.ts` is therefore a live edge in the client graph. Importing `src/server/import.ts` from
it put `@tanstack/react-start/server` one hop from `__root.tsx`, and Start's import protection denied
the build, naming the whole chain.

So the three `*.fn.ts` files take:

- `~/import.ts` — the **client** surface;
- `@tanstack/react-start` and `@tanstack/react-start/server` **directly**, because a re-exported
  `/server` entry is exactly the edge that gets denied;
- `./container.js` as a **relative import inside the handler body**, where the compiler removes it.

That is the discipline, and it is the reason the server surface exists but is not read here. See
[`import-surfaces.md`](./import-surfaces.md).

## They resolve state and decide nothing

This is what a server function is *for* in this app: carrying no business logic and making no
authorization decision, so the first rendered byte is already correct.

**`fetchSession`** resolves who is asking and what they may do. It is deliberately **not** routed
through `PrincipalBuilder`: that is the authorization path, it accepts an `x-api-key` ahead of the
cookie, and an integration key has no name or email to render. This is the render path, and it reads
a browser session or nothing at all.

It reads the same `CapabilityCache` `PrincipalBuilder` reads, keyed on `organization:user`, so the
client's `can()` and the server's `assert()` answer off one set. The membership list rides along for
the switcher — one indexed query, once per tab, rather than a second round trip after first paint.

A session with no `activeOrganizationId` is treated as no session at all, agreeing with
`BetterAuthSessionResolver` on purpose: **a shell that renders a user the server would refuse is
worse than one that renders nobody.**

**`fetchAppearance`** is why the first painted byte is already the right colour: a cookie the server
can read beats a preference only the client knows. `Sec-CH-Prefers-Color-Scheme` is sent only when
the document opted in with `Accept-CH`, so its absence means light rather than dark, and the inline
script in `__root.tsx` covers what it misses.

**`fetchInvitation`** takes no principal at all — the person holding the link may have no account
yet. It returns the same three fields `InvitationClaimer.preview` does, restated so the route depends
on this file and never on the server graph behind it. The claim itself happens through the auth
endpoint, against a session, where the claimer decides.

## `container.ts`: one per process, at module scope

> [!CAUTION]
> Never construct the container per request. That opens a connection pool per request, which
> exhausts Postgres in about four seconds under load.

Count pools **across replicas**, not per process: forty instances at ten connections each is four
hundred against a default `max_connections` of a hundred.

## `rpc-client.ts`: in-process, with the real headers

`"/api/rpc"` resolves to this same server, so an HTTP client during SSR would serialise a payload,
cross the loopback and deserialise it again — twice per loader, competing with real user requests for
the connection pool.

> [!IMPORTANT]
> **Pass the real request headers.** `principalMiddleware` resolves the principal from them.
> Skipping them because the code is already on the server either breaks auth or invites someone to
> construct a privileged principal directly. In-process skips serialisation and nothing else.
