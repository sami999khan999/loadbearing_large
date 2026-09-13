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

## Streams: one procedure that is not a request

`realtime.stream` is an oRPC event iterator — an `async function*` handler whose output contract is
`eventIterator(RealtimeContract.message)` — and `RPCHandler` serves it as `text/event-stream` on the
existing `/api/rpc` route. There is no second route and no second handler.

**It is a POST, whatever the contract's `route` says.** Every procedure in `contracts` carries a
`.route({ method, path })` for consistency and for an OpenAPI handler that may exist one day.
`RPCHandler` reads none of it: it dispatches on the procedure path, so the stream is a POST to
`/api/rpc/realtime/stream` whose response body happens to stream. Trying to `curl -N` the `GET` in
the contract will find nothing, and the `StrictGetMethodPlugin` — on by default — is a second
reason not to reach for one.

**The channel comes from the principal and from nowhere else.** `principalMiddleware` runs before
this handler like every other, and the handler builds
`RealtimeChannels.user(principal.organizationId, principal.userId)`. There is no input, so there is
nothing to ask for. That is the entire authorization argument, and it is why the permission is
`core.realtime.subscribe` — held by every resolved principal, because each frame on the stream was
authorised where it was produced. Gating the pipe again would gate the wrong thing.

**A resume is a `resync`.** When `lastEventId` is set, the handler yields a `resync` frame before
anything live. Redis pub/sub cannot replay, so a gap-fill would be a lie; the client refetches what
it subscribes to. Every frame goes out through `withEventMeta({ id, retry })` — the `id` is what
comes back as `Last-Event-ID`, and the `retry` is what `ClientRetryPlugin` reads for its delay.

**Keep-alive is set, not enabled.** `RPCHandler` sends a comment every 5 s by default; the handler
here sets 15 s, inside every proxy idle timeout worth worrying about and a third of the traffic. It
also sends an initial comment on stream open by default, which flushes headers before the first
frame — the reason a dev-server proxy establishes the connection immediately rather than appearing
to hang.

**`http.request.completed` fires at stream *start* for this procedure.** `errorMiddleware` wraps the
call that returns the iterator, not each frame, so a stream open is one line and its `durationMs` is
the time to open. Per-frame logging would be the volume mistake the event catalog warns about — this
is already the highest-cardinality line in the system. What a stream costs is on
`realtime.stream.closed` instead: a duration and a frame count, once, at the end.

> [!IMPORTANT]
> **`apps/web/src/server/import.ts` must never re-export oRPC's `EventPublisher`.** It is their
> in-process fan-out, and it works — on one replica. Reaching for it puts a second realtime path
> beside the Redis one that silently delivers to a fraction of the tabs.

> [!NOTE]
> **Six connections per origin, on HTTP/1.1.** A browser holds at most six, and a stream holds one
> for as long as the tab is open — so five other requests in flight is the ceiling and the sixth
> queues. That is why there is exactly **one** stream per tab, opened in the `_authenticated`
> layout, rather than one per component that wants a frame. HTTP/2 multiplexes and the limit goes
> away, which is a deployment property and not something to design around.
