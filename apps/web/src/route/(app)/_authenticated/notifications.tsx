import { createFileRoute } from "@tanstack/react-router";
import {
  ArchivedNotificationList,
  Can,
  type ClientNamespace,
  NotificationList,
  useCapabilities,
  useMessages,
} from "~/import.js";
import { RouteGuard } from "~/route/-guard.js";

const MESSAGES = ["notification"] as const satisfies readonly ClientNamespace[];

// The same key `notification.list` is gated on: removing it has to hide the nav entry
// *and* refuse the call, which is what makes the two halves one decision.
export const Route = createFileRoute("/(app)/_authenticated/notifications")({
  beforeLoad: RouteGuard.requirePermission("notification.inbox.read"),
  staticData: { messages: MESSAGES },
  loader: ({ context }) => context.messages.ensure(MESSAGES),
  component: Notifications,
});

function Notifications() {
  const { t } = useMessages("notification");
  const capabilities = useCapabilities();

  return (
    <main>
      <h1>{t("notification.inbox.title")}</h1>
      <NotificationList />
      {
        // Its own key, because its cost is its own: an archived page pulls a whole
        // tenant-month out of S3, and an organization may grant one and not the other.
        <Can permission="notification.archive.read" capabilities={capabilities}>
          <ArchivedNotificationList />
        </Can>
      }
    </main>
  );
}
