import { createFileRoute } from "@tanstack/react-router";
import { container } from "~/server/container.js";
import { Cors } from "~/server/cors.js";

// Better Auth speaks the Fetch API, so it drops into any Fetch-based router — the four
// lines below are the whole binding, and they are what a Nest controller replaces.
//
// The CORS layer is not optional on either entrypoint: a Tauri webview is cross-origin
// against both, on every call (30).
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const preflight = Cors.preflight(request);
        if (preflight) return preflight;

        return Cors.apply(request, await container.auth.handler(request));
      },
    },
  },
});
