---
title: Shutdown
description: Why a stop ends every stream cleanly at a random point in a window, rather than cutting them all at once.
---

# Shutdown

**The problem.** A deploy stops every replica of this process in turn. Each holds thousands of open
streams. Cut them all at once and every tab reconnects in the same second — each reconnect a full
principal resolution, a Postgres read and a replay of what the tab missed. The next
replica takes the whole herd at once.

**So a stop hands streams on rather than dropping them.** `RealtimeBootstrap.stop`:

1. Stops accepting — no new connections, idle ones closed.
2. Calls `RealtimeSubscriber.drain(budget / 2)`. Every open stream's deadline moves to a random
   point inside that window, and each ends **cleanly** there, the way it does at its maximum age.
3. Emits `realtime.stream.drained { streams, durationMs }` — `streams` is `-1` if the budget ran
   out first.
4. Cuts whatever is left, disposes the container, emits `process.stopped`.

A clean end is the part that matters. The browser's `RealtimeStream` reopens a stream that ended
cleanly within a second, with a `lastEventId`, and the next replica replays from the log both
share. Through the proxy that
reopen lands on another replica. A cut connection is an error instead, and the client backs off —
which is right for an outage and wrong for a deploy.

A second signal joins the stop already running. Redis refuses to reopen a connection once
`dispose()` has closed it, so a stream's `finally` running late cannot hold the process open.
