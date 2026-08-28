import type { Principal } from "@loadbearing/application";
import type { Container } from "@loadbearing/composition";
import { contract, ProcedurePermissions } from "@loadbearing/contracts";
import { ForbiddenError, UnauthorizedError } from "@loadbearing/errors";
import { Correlation, type Logger, type TraceId } from "@loadbearing/observability";
import { implement, os } from "@orpc/server";
import { ErrorInterceptor } from "./error.interceptor.js";

// Initial context: environment-shaped, injected once by the adapter.
export const base = os.$context<{ container: Container; headers: Headers }>();

// Before `principalMiddleware`, so a failure to resolve a principal is already
// correlated. `Correlation.fromHeaders` adopts an upstream `x-request-id` where a proxy
// set one — sanitised first, because it arrives from the network and then rides every
// line of the request — and mints a `Uuid.v7()` otherwise.
export const correlationMiddleware = base.middleware(({ context, next }) => {
  const traceId = Correlation.fromHeaders(context.headers);
  return next({ context: { traceId, log: context.container.logger.child({ traceId }) } });
});

// Execution context: per-request, resolved here rather than by each handler.
export const principalMiddleware = base.middleware(async ({ context, next, path }) => {
  // `PrincipalBuilder`, never Better Auth directly. That is what keeps the transport
  // layer ignorant of the auth library, and why a NestJS migration rewrites a guard
  // rather than rewriting authentication.
  const principal: Principal | null = await context.container.principals.fromHeaders(
    context.headers,
  );

  if (!principal) throw new UnauthorizedError();

  // Defence in depth, and it fails **closed**: a procedure with no permission mapping
  // is denied, not allowed. Paired with the coverage test in 10, forgetting to map a
  // new procedure is caught at test time and, failing that, here — never by shipping
  // an ungated endpoint.
  const required = ProcedurePermissions.required(path.join("."));
  if (!required) throw new ForbiddenError(path.join("."));

  return next({ context: { principal } });
});

// The one place every server-side failure becomes a transport error, and it sits
// *inside* the middleware chain rather than at the adapter — which is the whole reason
// it is a middleware. An adapter-level interceptor sees only the initial context, so it
// has no `traceId` and no request-scoped logger to hand `ErrorInterceptor`.
//
// It wraps `principalMiddleware` too, so an unauthenticated call is logged and shaped
// like every other failure rather than short-circuiting past the one place that logs.
// Declared against what it *requires* rather than derived from the chain above:
// `BuilderWithMiddlewares` has no `.middleware()`, so a middleware that depends on an
// earlier one states its own context and oRPC checks the chain supplies it.
export const errorMiddleware = os
  .$context<{ traceId: TraceId; log: Logger }>()
  .middleware(async ({ context, next }) => {
    try {
      return await next();
    } catch (thrown) {
      ErrorInterceptor.toTransport(thrown, context.log, context.traceId);
    }
  });

// Protected procedures build on this, so they cannot forget the middleware. Anything
// built on `base` instead is unauthenticated on purpose and obvious in review.
//
// This is not the real gate — `Authorizer.assert()` inside the use-case is. The worker
// bypasses this entirely, and so does any SSR call that skipped the adapter.
//
// Built from `implement(contract)` rather than from `base`, so it carries the contract's
// own shape: a router writes `authed.role.list.handler(…)` and gets the procedure's
// input and output types with no annotation. `implement(contract.role.list).use(authed)`
// looks like the same thing and is not — `.use()` takes a *middleware*, and a builder
// passed there fails with several hundred characters of inference rather than a sentence.
export const authed = implement(contract)
  .$context<{ container: Container; headers: Headers }>()
  .use(correlationMiddleware)
  .use(errorMiddleware)
  .use(principalMiddleware);
