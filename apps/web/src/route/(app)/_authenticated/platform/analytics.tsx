import { createFileRoute } from "@tanstack/react-router";
import {
  Can,
  type ClientNamespace,
  PlatformQueries,
  ProjectionGapsPanel,
  ProjectionPolicyForm,
  ProjectionSwitchPanel,
  useApiClient,
  useAppQuery,
  useCapabilities,
  useMessages,
} from "~/import.js";
import { RouteGuard } from "~/route/-guard.js";

const MESSAGES = ["platform"] as const satisfies readonly ClientNamespace[];

// Read on the route, manage around the editor: seeing which actions reach the analytics
// store is an operational question, and excluding one stops rows arriving from now on.
export const Route = createFileRoute("/(app)/_authenticated/platform/analytics")({
  beforeLoad: RouteGuard.requirePermission("platform.analytics.read"),
  staticData: { messages: MESSAGES },
  loader: ({ context }) =>
    Promise.all([
      context.messages.ensure(MESSAGES),
      context.queryClient.ensureQueryData(PlatformQueries.projection(context.api)),
      context.queryClient.ensureQueryData(PlatformQueries.policy(context.api)),
      context.queryClient.ensureQueryData(PlatformQueries.retention(context.api)),
    ]),
  component: PlatformAnalytics,
});

function PlatformAnalytics() {
  const { t } = useMessages("platform");
  const capabilities = useCapabilities();
  const client = useApiClient();

  // The audit table's hot window, read from the retention rows rather than restated:
  // the deadline the switch quotes is exactly the one the retention screen shows.
  const retention = useAppQuery(PlatformQueries.retention(client));
  const auditMonths =
    retention.data?.postgres.find((table) => table.tableName === "activity_log")?.hotMonths ?? null;

  return (
    <main>
      <h1>{t("platform.projection.title")}</h1>
      <Can permission="platform.analytics.read" capabilities={capabilities}>
        <ProjectionSwitchPanel auditMonths={auditMonths} />
      </Can>
      <Can permission="platform.analytics.manage" capabilities={capabilities}>
        <ProjectionGapsPanel />
        <ProjectionPolicyForm />
      </Can>
    </main>
  );
}
