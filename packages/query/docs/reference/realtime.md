---
title: Realtime
description: One stream per tab, a total routing table, and why every frame invalidates rather than patches — including what a resync is and why there is no replay.
---

# Realtime

`RealtimeProvider` opens one server-sent stream per tab and routes each frame to a cache
invalidation. That is the whole of the client half, and each of the three nouns in it is a decision.

## Invalidate, never patch

A frame says *what changed*, not what it changed to. `RealtimeRoutes` maps an event name to an
`invalidateQueries` call and nothing else — no `setQueryData`, no payload read.

The alternative is tempting and wrong. A frame carrying enough to patch the cache carries a copy of
the server's shaping rules: which fields the list returns, how it sorts, what the DTO omits. That
copy drifts, and it drifts silently, because a patched cache looks right until the next refetch
replaces it with something different. Invalidating costs one request and cannot be wrong.

It also means a frame needs no permission check on arrival. The refetch it triggers goes through the
same procedure, the same `principalMiddleware` and the same permission as any other read, so a frame
about something you may not see produces a request that returns what you may see.

## The table is total, and the resync sweep is derived from it

`RouteTable` is `Record<RealtimeEventName, …>`, so a name added to `RealtimeContract` fails the build
here rather than arriving at runtime and doing nothing. `RealtimeRoutes.resync` walks the same table
rather than a second list, which is what stops the two drifting the first time somebody adds a route
and forgets the sweep.

**A `resync` invalidates everything the table names.** The frame carries no name — that is the point
of it: it means frames were lost, and any of them could have been any name.

## Why there is no replay

Redis pub/sub does not have one. A client that reconnects with `Last-Event-ID` gets a `resync` and
refetches; it never gets the frames it missed. Saying so in the contract, as a wire variant, is what
keeps every reader honest — a transport that pretended to replay would be a lie the first time a
laptop lid closed.

That is also why a frame is safe to lose. Everything the stream carries is an invalidation of
something the client can fetch, so the worst case of a dropped frame is data as stale as it would
have been with no stream at all.

## One stream per tab, opened in the layout

`RealtimeProvider` is mounted in the `_authenticated` layout, not in `__root`. It needs a session,
and a stream opened before there is one is a request that resolves to a 401 and retries forever.

**Not one per component.** On HTTP/1.1 a browser holds six connections per origin and a stream holds
one for as long as the tab is open, so two streams would leave four for everything else. A component
that wants the raw frame uses `useRealtimeEvent(name, handler)`, which listens to the one stream that
is already open.

**Not during SSR.** The effect returns early when there is no `window`. A stream opened on the server
holds a request open for the life of a render that has already finished.

## Retry is opted into, once

`ClientRetryPlugin` is on the link with **no default**, so `retry` is 0 for every call — a mutation
that retried itself would submit twice, and a `FORBIDDEN` retried with backoff turns an instant
answer into a three-second wait for the same one.

The stream opts in at its call site with `context: { retry: Number.POSITIVE_INFINITY }`. Its delay
comes from the plugin's own default, `lastEventRetry ?? 2000`, which reads the `retry` the server
wrote with `withEventMeta` — so the reconnect interval is the server's to change.

A stream that cannot open is not a rendered error. `connected` goes false, the plugin keeps trying,
and the tab keeps working on `staleTime` and refetch-on-focus, which is exactly how it worked before
any of this existed.
