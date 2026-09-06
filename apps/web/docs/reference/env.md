---
title: Env and Endpoint
description: Why the schema parses eagerly, the two cross-field rules that earn their exception, why Endpoint is a separate file, and why the auth base URL ends in .invalid.
---

# `Env` and `Endpoint`

## `Env` is server-only, and the marker is what enforces it

`env.ts` opens with Start's server-only marker. Its import-protection plugin fails the build when a
module carrying it is reachable from the client graph — **the one guarantee a naming convention
cannot give.** Before it was there, `Env` shipped in the browser bundle as `Schema.parse({})` and
threw on `DATABASE_URL` before the first render.

That marker is a side-effect import, which cannot be re-exported, which is why this file keeps its
own imports rather than reading `~/import.ts`.

It is one of exactly two `process.env` readers in the repository; the other is
`apps/worker/src/env.ts`. Everything else receives configuration.

## Parsed at module load, not on first access

A missing `AUTH_SECRET` should crash the process at boot with a field path, not produce a 500 on the
first sign-in an hour later.

## The two cross-field rules

`bootstrap` with no `AUTH_BOOTSTRAP_ORGANIZATION_SLUG` is a mode that **silently enrols nobody**:
every sign-up succeeds, every first sign-in is refused, and nothing in either log says why. Failing
at boot with a field path is the whole reason this file parses eagerly, and it is why the schema
carries a refinement at all.

There is deliberately no default for the slug. Unset means no enrolment, which is the production
posture.

**`CLICKHOUSE_URL` with the credential defaults left alone** is the second, and it is the same shape
of failure one layer down. The compose container is `ratchet/ratchet`; the defaults below are
ClickHouse's own `default/default`, which cannot authenticate against it. Without the rule the
projection fails on its first run with a vendor auth error, five minutes after boot, in the worker's
log rather than the one someone is watching.

## Values whose absence is the decision

| Variable | Absent means |
|---|---|
| `GOOGLE_CLIENT_ID` / `_SECRET` | Google sign-in is off. A half-filled pair would be rejected at Google's consent screen, which no log line here can explain — so the container builds a provider only when both are present |
| `CLICKHOUSE_URL` | ClickHouse stays stopped. Present, the projection runs and the reconciliation reports — and nothing reads the store back, because there is no analytics reader; see [12](../../../../docs/setup/12-application-package.md). Setting it makes `CLICKHOUSE_DATABASE` and `CLICKHOUSE_USER` required |
| `LOKI_URL` | No `LogReader`. Logs are still written to stdout and still shipped by Alloy; reading them is `docker compose logs`, which stays the break-glass path regardless |

The ClickHouse credentials default to ClickHouse's own out-of-the-box database and user. A default
naming the project would be a credential baked into shipped code, and would keep pointing at the old
name after a rename — which is why the cross-field rule above refuses those defaults when
`CLICKHOUSE_URL` is set, rather than the defaults being changed to match compose.

## Values with a cap rather than a default

`AUTH_COOKIE_CACHE_MAX_AGE_SECONDS` is capped in the schema, not by convention. A deploy that raises
it "to improve cache hit rate" fails at boot instead of quietly widening the gap between removing
access and access stopping. See
[`auth/docs/reference/capability-cache.md`](../../../packages/auth/docs/reference/capability-cache.md).

`AUTH_SECRET` has a length floor: a short secret is a real weakness, and this schema is the only
place anyone will ever check.

`EMAIL_FROM` is never defaulted. An address the sending domain does not authorise bounces or lands in
spam, and a wrong default fails that way silently on the first real deploy.

## `trustedOrigins` has one home

Better Auth's CSRF check reads it through `containerConfig()`; the CORS layer reads it directly. Two
consumers, one list — a second hardcoded copy is how one of them goes stale.

## `Endpoint` exists because `Env` cannot

`Env` parses the full server schema at module load, so importing it from `router.tsx` or a route
component drags `DATABASE_URL` and `AUTH_SECRET` into the client bundle — where Vite replaces the
environment object with an empty one and the parse throws before the app can hydrate.

Client code needs two addresses, so it gets **two addresses and no schema**.

The RPC and auth paths are same-origin: the app is served by the same process that answers them, so
there is no host to configure. They are kept in step with the handler's `prefix` and with the file
routes that mount them, which spell the path again because `createFileRoute()` takes a literal the
generator reads without executing anything.

### Why the auth base URL ends in `.invalid`

Better Auth's client is the one caller that cannot take a path. It resolves `baseURL` through
`new URL()` **in its constructor**, so a relative value throws `BetterAuthError: Invalid base URL` —
during SSR, where there is no `location` to resolve against, which blanks the sign-in page behind a
failed Suspense boundary.

Every `AuthClient` method runs from a browser event, so the server never issues a request through
this value; it only has to parse. `.invalid` is reserved by RFC 2606 and is guaranteed never to
resolve, so a call that does slip into an SSR pass fails loudly and names that line rather than
quietly reaching some other localhost.

The desktop shell is cross-origin against both and supplies absolute URLs of its own through
`import.meta.env`.
