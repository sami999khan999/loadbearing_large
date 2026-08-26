import { createRouterClient } from "@orpc/server";
import { container } from "./container.js";
import { appRouter } from "./orpc/app.router.js";

// SSR without a network hop. `"/api/rpc"` resolves to this same server, so an HTTP
// client here would serialise a payload, cross the loopback, and deserialise it again —
// twice per loader, competing with real user requests for the connection pool.
//
// **Pass the real request headers.** `principalMiddleware` resolves the principal from
// them. Skipping them because the code is already on the server either breaks auth or
// invites someone to construct a privileged principal directly. In-process skips
// serialisation and nothing else.
export function createServerRpcClient(request: Request) {
  return createRouterClient(appRouter, {
    context: { container, headers: request.headers },
  });
}
