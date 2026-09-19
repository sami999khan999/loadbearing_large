import { createFileRoute } from "@tanstack/react-router";
import {
  Can,
  type ClientNamespace,
  PlatformQueries,
  ProjectionPolicyForm,
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
    ]),
  component: PlatformAnalytics,
});

function PlatformAnalytics() {
  const { t } = useMessages("platform");
  const capabilities = useCapabilities();

  return (
    <main>
      <h1>{t("platform.projection.title")}</h1>
      <Can permission="platform.analytics.manage" capabilities={capabilities}>
        <ProjectionPolicyForm />
      </Can>
    </main>
  );
}
