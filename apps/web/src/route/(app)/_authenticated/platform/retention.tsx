import { createFileRoute } from "@tanstack/react-router";
import {
  Can,
  type ClientNamespace,
  PlatformQueries,
  RetentionPolicyForm,
  useCapabilities,
  useMessages,
} from "~/import.js";
import { RouteGuard } from "~/route/-guard.js";

const MESSAGES = ["platform"] as const satisfies readonly ClientNamespace[];

// Read on the route, manage around the editor: seeing how long data is kept is an
// operational question, and shortening it destroys rows on the next run.
export const Route = createFileRoute("/(app)/_authenticated/platform/retention")({
  beforeLoad: RouteGuard.requirePermission("platform.retention.read"),
  staticData: { messages: MESSAGES },
  loader: ({ context }) =>
    Promise.all([
      context.messages.ensure(MESSAGES),
      context.queryClient.ensureQueryData(PlatformQueries.retention(context.api)),
    ]),
  component: PlatformRetention,
});

function PlatformRetention() {
  const { t } = useMessages("platform");
  const capabilities = useCapabilities();

  return (
    <main>
      <h1>{t("platform.retention.title")}</h1>
      <Can permission="platform.retention.manage" capabilities={capabilities}>
        <RetentionPolicyForm />
      </Can>
    </main>
  );
}
