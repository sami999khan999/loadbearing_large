import { container } from "../container.js";
import { Cors } from "../cors.js";
import { RPCHandler } from "../import.js";
import { appRouter } from "./app.router.js";

// One handler for the process, like the container. Building it per request would
// rebuild the router's match table on every call.
//
// No context annotation: the router is no longer empty, so oRPC infers the initial
// context from the procedures it holds. Restating it here would let the two drift.
const handler = new RPCHandler(appRouter, {});

// Error shaping is **not** here. `errorMiddleware` in `base.ts` does it, inside the
// chain, because an adapter-level interceptor sees only the initial context — it has
// no `traceId` and no request-scoped logger to hand `ErrorInterceptor`.
export async function handleRpc(request: Request): Promise<Response> {
  const preflight = Cors.preflight(request);
  if (preflight) return preflight;

  const { matched, response } = await handler.handle(request, {
    prefix: "/api/rpc",
    context: { container, headers: request.headers },
  });

  return Cors.apply(request, matched ? response : new Response(null, { status: 404 }));
}
