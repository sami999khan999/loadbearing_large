import { createFileRoute } from "@tanstack/react-router";
import {
  Can,
  type ClientNamespace,
  DeleteTenantPanel,
  TenantStorageList,
  useCapabilities,
  useMessages,
} from "~/import.js";
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
  const capabilities = useCapabilities();

  return (
    <main>
      <h1>{t("platform.storage.title")}</h1>
      <TenantStorageList />
      {
        // Here rather than on a shard map, which does not exist yet: this is the one
        // screen that lists tenants, and a delete belongs beside what it removes.
        <Can permission="platform.tenant.manage" capabilities={capabilities}>
          <DeleteTenantPanel />
        </Can>
      }
    </main>
  );
}
