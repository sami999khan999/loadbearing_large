---
title: Realtime
description: One stream per tab, a total routing table, why every frame refetches rather than patches, how a burst is coalesced, and how a stream reopens — including the short replay and the resync past it.
---

# Realtime

`RealtimeProvider` opens one server-sent stream per tab and routes each frame to a cache invalidation —
the whole client half.

## Refetch, never patch from a payload

A frame says *what changed*, not what it changed to. `RealtimeRoutes` maps an event name to the
query keys to refetch and nothing else. A frame's `payload` carries ids, and ids only narrow
**which** keys: `conversationId` turns "every conversation" into "the lists and this one", and
`messageId` lets the client drop the second copy of a send.

A patching frame carries a copy of the server's shaping rules (fields, sort, omissions) that drifts
silently — a patched cache looks right until the next refetch.

**Splicing a server-returned page is not patching:** a send answers with
`MessagingQueries.refreshNewest` — fetch the newest page once, splice into page 0 replacing the
optimistic row by `clientId`; no overlap means more than a page arrived, so restart from it. **At most
once a second** (single flight, one trailing run): in two tabs (`CP1.9`) twenty sends 110 ms apart cost
twenty `message.list` calls without the floor, two with it, and the first still appears at once.

No permission check on arrival: the refetch goes through the normal procedure and permission.

## A burst is two refetches, not twenty

`RealtimeRefetch`: single-flight per key, one trailing run, a second apart, only for shown queries — the
first frame refetches now, the rest collapse into one more. One instance per stream.

Each send arrives twice (fast path and outbox); `useConversationStream` keeps the last 256
`name:messageId` keys to drop the second.

## The table is total, and the resync sweep is derived from it

`RouteTable` is `Record<RealtimeEventName, …>`, so a new contract name fails the build here;
`RealtimeRoutes.resync` walks the same table. **A `resync` refetches everything, with no ids** — lost
frames could have been any name.

## The replay is short, and the resync is what lies past it

Reconnecting with `Last-Event-ID` replays missed frames if the log still holds the last seen — about two
hundred per channel, an hour (`26.5`) — else `resync`. Replays route like live frames. A wire variant keeps
it honest: a promised full replay fails the first overnight laptop lid. A lost frame is safe — at worst,
data as stale as with no stream.

## One stream per tab, opened in the layout

In the `_authenticated` layout, not `__root` — sessionless, it 401s forever. **Not per component**
(HTTP/1.1's six connections); `useRealtimeEvent(name, handler)` listens to the open stream. **Not during
SSR** — the effect returns without `window`.

## Reconnecting is `RealtimeStream`'s, not the retry plugin's

`ClientRetryPlugin` has **no default** (`retry` 0 — a self-retrying mutation submits twice) and only
reconnects on a throw, while max age ends a stream **cleanly** — so idle tabs once went silent at thirty
minutes.

`RealtimeStream.run` is the one loop both streams use:

- **A clean end** (max age, shutdown drain) reopens within a second with `lastEventId` (none seen → a
  correct `resync`).
- **An expected, non-retryable error** (signed out, forbidden, gone) stops — retrying costs a principal
  resolution for the same answer.
- **Anything else** backs off with full jitter, 1 s doubling to 30 s (never under 30 s after
  `RATE_LIMITED`), resetting after a minute up — else a deploy's dropped tabs return in one instant.

An unopenable stream is no rendered error: `connected` goes false and the tab runs on `staleTime`.

## The streams are held by their own process

Both streams are `realtime.*` procedures, and `ApiClient` sends that namespace to `/api/realtime`
(`apps/realtime`, behind the web origin); this package only calls `client.realtime.stream` and
`client.realtime.conversation` ([realtime app](../../../../apps/realtime/docs/index.md)).
