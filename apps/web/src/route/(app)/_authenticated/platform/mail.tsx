import { createFileRoute } from "@tanstack/react-router";
import {
  type ClientNamespace,
  MailDeliveryList,
  PLATFORM_ROUTE_PERMISSION,
  useMessages,
  useSession,
} from "~/import.js";
import { RouteGuard } from "~/route/-guard.js";

const MESSAGES = ["platform"] as const satisfies readonly ClientNamespace[];

// No prefetch: the list waits for an organization id, and the first one is the reader's.
export const Route = createFileRoute("/(app)/_authenticated/platform/mail")({
  beforeLoad: RouteGuard.requirePermission(PLATFORM_ROUTE_PERMISSION.mail),
  staticData: { messages: MESSAGES },
  loader: ({ context }) => context.messages.ensure(MESSAGES),
  component: PlatformMail,
});

function PlatformMail() {
  const { t } = useMessages("platform");
  const { user } = useSession();

  return (
    <main>
      <h1>{t("platform.mail.title")}</h1>
      <p>{t("platform.mail.description")}</p>
      <MailDeliveryList defaultOrganizationId={user?.activeOrganizationId ?? ""} />
    </main>
  );
}
