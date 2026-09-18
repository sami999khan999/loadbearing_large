import { createFileRoute } from "@tanstack/react-router";
import { type ClientNamespace, TenantStorageList, useMessages } from "~/import.js";
import { RouteGuard } from "~/route/-guard.js";

const MESSAGES = ["platform"] as const satisfies readonly ClientNamespace[];

// No loader prefetch: the list takes a filter the route does not know, so a loader
// would warm a page the first render replaces.
export const Route = createFileRoute("/(app)/_authenticated/platform/storage")({
  beforeLoad: RouteGuard.requirePermission("platform.storage.read"),
  staticData: { messages: MESSAGES },
  loader: ({ context }) => context.messages.ensure(MESSAGES),
  component: PlatformStorage,
});

function PlatformStorage() {
  const { t } = useMessages("platform");

  return (
    <main>
      <h1>{t("platform.storage.title")}</h1>
      <TenantStorageList />
    </main>
  );
}
