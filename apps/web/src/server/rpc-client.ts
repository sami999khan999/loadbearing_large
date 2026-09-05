import { container } from "./container.js";
import { createRouterClient } from "./import.js";
import { appRouter } from "./orpc/app.router.js";

// SSR without a network hop. **Pass the real request headers** — in-process skips
// serialisation and nothing else. See docs/reference/server-functions.md.
export function createServerRpcClient(request: Request) {
  return createRouterClient(appRouter, {
    context: { container, headers: request.headers },
  });
}
