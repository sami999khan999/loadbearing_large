import { createFileRoute } from "@tanstack/react-router";
import {
  type ClientNamespace,
  PLATFORM_ROUTE_PERMISSION,
  useMessages,
  WorkerProcessList,
  WorkerQueueList,
} from "~/import.js";
import { RouteGuard } from "~/route/-guard.js";

const MESSAGES = ["platform"] as const satisfies readonly ClientNamespace[];

// No loader prefetch: the read is polled every three seconds once mounted, and a
// prefetched copy would be stale before the first paint mattered.
export const Route = createFileRoute("/(app)/_authenticated/platform/workers")({
  beforeLoad: RouteGuard.requirePermission(PLATFORM_ROUTE_PERMISSION.workers),
  staticData: { messages: MESSAGES },
  loader: ({ context }) => context.messages.ensure(MESSAGES),
  component: PlatformWorkers,
});

function PlatformWorkers() {
  const { t } = useMessages("platform");

  return (
    <main>
      <h1>{t("platform.workers.title")}</h1>
      <p>{t("platform.workers.description")}</p>
      <WorkerQueueList />
      <WorkerProcessList />
    </main>
  );
}
