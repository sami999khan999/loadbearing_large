import { createFileRoute } from "@tanstack/react-router";
import { handleRpc } from "~/server/orpc/handler.js";

// A Start server route, not a Nitro one. Both work under the Nitro deployment target;
// only this one survives a swap to the Cloudflare or Netlify plugin, which never scan
// Nitro's `serverDir` and would drop `/api/*` without an error.
//
// `ANY` because oRPC's fetch adapter answers POST and the preflight OPTIONS itself, and
// `handleRpc` already returns a 404 for anything it does not match.
//
// The path is a literal because the route generator reads it without executing the file;
// `Endpoint.rpc` is the same string for the callers that can use a value.
export const Route = createFileRoute("/api/rpc/$")({
  server: { handlers: { ANY: ({ request }) => handleRpc(request) } },
});
