---
title: Router
description: The authed chain's order, why a stream is wrapped once for the shard scope and once for errors, and why every stream lives under one namespace.
---

# The router half

## `authed`, in order

`implement(contract)` with four middlewares, and the order is the design:

1. **Correlation** first, so a failure to resolve a principal is already correlated.
2. **Errors** second, so every failure after it — including the principal's — is logged once and
   leaves as the wire envelope, with a `traceId` and a request-scoped logger to hand.
3. **Principal** third. It fails **closed**: a procedure with no permission mapping is denied.
4. **Shard** last, because the key comes off the principal.

A router builds on `authed` and cannot forget any of them.

## A stream is wrapped twice

A streaming handler's body runs after `next()` has already resolved — the generator exists, and
nothing in it has run. So two things a unary call gets for free have to be carried frame by frame:

- **The shard scope.** `shardMiddleware` snapshots its `AsyncLocalStorage` inside the scope and
  calls every `next`, `return` and `throw` through it. Without that, every frame after the first
  runs with no key and a repository refuses to pick a pool.
- **The error envelope.** `errorMiddleware` wraps the same three methods so a throw mid-stream goes
  through `ErrorInterceptor` like a unary failure does.

## One namespace is one process

Both streams are under `realtime`: `realtime.stream` for the user's channel and
`realtime.conversation` for one room. That is what lets the browser's client send every
`realtime.*` path to the stream process and everything else to the web app — a routing rule on the
first path segment, with no list to keep in step.
