import {
  type Container,
  Correlation,
  contract,
  ErrorNormalizer,
  ForbiddenError,
  HTTP_STATUS,
  implement,
  type Logger,
  os,
  type Principal,
  ProcedurePermissions,
  type TraceId,
  UnauthorizedError,
} from "../import.js";
import { ErrorInterceptor } from "./error.interceptor.js";

// Initial context: environment-shaped, injected once by the adapter.
export const base = os.$context<{ container: Container; headers: Headers }>();

// Before `principalMiddleware`, so a failure to resolve a principal is already
// correlated. An upstream `x-request-id` is adopted, sanitised first.
export const correlationMiddleware = base.middleware(({ context, next }) => {
  const traceId = Correlation.fromHeaders(context.headers);
  return next({ context: { traceId, log: context.container.logger.child({ traceId }) } });
});

// Execution context: per-request, resolved here rather than by each handler.
export const principalMiddleware = base.middleware(async ({ context, next, path }) => {
  // `PrincipalBuilder`, never Better Auth directly, which is what keeps the transport
  // layer ignorant of the auth library.
  const principal: Principal | null = await context.container.principals.fromHeaders(
    context.headers,
  );

  if (!principal) throw new UnauthorizedError();

  // Defence in depth, failing **closed**: a procedure with no permission mapping is
  // denied. See docs/reference/enforcement-surfaces.md.
  const required = ProcedurePermissions.required(path.join("."));
  if (!required) throw new ForbiddenError(path.join("."));

  return next({ context: { principal } });
});

// Inside the chain rather than at the adapter, because an adapter-level interceptor has
// no `traceId` and no request-scoped logger. See docs/reference/enforcement-surfaces.md.
export const errorMiddleware = os
  .$context<{ traceId: TraceId; log: Logger }>()
  .middleware(async ({ context, next, path }) => {
    // The procedure path, not the URL: `/api/rpc` is one route and would make every
    // line indistinguishable. It is the same string `ProcedurePermissions` is keyed on.
    const procedure = path.join(".");
    const startedAt = Date.now();

    try {
      const result = await next();

      // Sampled at 10 % by the catalog — this is the highest-volume line the system
      // emits, and the failure below is never sampled.
      context.log.emit("http.request.completed", {
        path: procedure,
        status: 200,
        durationMs: Date.now() - startedAt,
      });

      return result;
    } catch (thrown) {
      // Before the interceptor, because `toTransport` never returns: it logs the
      // failure and throws the envelope.
      context.log.emit("http.request.failed", {
        path: procedure,
        status: HTTP_STATUS[ErrorNormalizer.normalize(thrown).code],
        durationMs: Date.now() - startedAt,
      });

      ErrorInterceptor.toTransport(thrown, context.log, context.traceId);
    }
  });

// Protected procedures build on this, so they cannot forget the middleware — and it is
// built from `implement(contract)` so a router needs no annotations. Not the real gate.
export const authed = implement(contract)
  .$context<{ container: Container; headers: Headers }>()
  .use(correlationMiddleware)
  .use(errorMiddleware)
  .use(principalMiddleware);
