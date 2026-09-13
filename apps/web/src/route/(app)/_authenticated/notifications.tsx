import { createFileRoute } from "@tanstack/react-router";
import { type ClientNamespace, NotificationList, useMessages } from "~/import.js";
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

  return (
    <main>
      <h1>{t("notification.inbox.title")}</h1>
      <NotificationList />
    </main>
  );
}
