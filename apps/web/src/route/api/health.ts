import { createFileRoute } from "@tanstack/react-router";
import { container } from "~/server/container.js";

// The readiness probe, and the only caller `Container.health()` has ever had. A
// container that can ping every dependency it holds and nothing that asks it to is a
// check that exists on paper.
//
// **Readiness, not liveness.** A 503 here means "do not send me traffic yet", which is
// the honest answer while Postgres is unreachable — the process is fine and restarting
// it fixes nothing. Point a liveness probe at something that only fails when the
// process is wedged, or at nothing at all.
//
// Deliberately unauthenticated and deliberately dull: it names the dependencies this
// deployment holds and whether each answered, and it carries no version, no hostname,
// and no configuration. An orchestrator has to reach it before any credential exists.
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const report = await container.health();

        return new Response(JSON.stringify(report), {
          status: report.healthy ? 200 : 503,
          headers: {
            "content-type": "application/json",
            // A cached readiness answer is worse than none: it keeps reporting healthy
            // for as long as the TTL after the thing it describes has stopped.
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
