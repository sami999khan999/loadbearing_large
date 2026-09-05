import {
  type Container,
  Correlation,
  contract,
  ForbiddenError,
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
  .middleware(async ({ context, next }) => {
    try {
      return await next();
    } catch (thrown) {
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
