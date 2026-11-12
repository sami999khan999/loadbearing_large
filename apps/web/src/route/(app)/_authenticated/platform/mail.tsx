import { createFileRoute } from "@tanstack/react-router";
import {
  Can,
  type ClientNamespace,
  MailDeliveryList,
  MailSettingsForm,
  PLATFORM_ROUTE_PERMISSION,
  useCapabilities,
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
  const capabilities = useCapabilities();

  return (
    <main>
      <h1>{t("platform.mail.title")}</h1>
      <p>{t("platform.mail.description")}</p>
      <Can permission="platform.mail.manage" capabilities={capabilities}>
        <MailSettingsForm defaultOrganizationId={user?.activeOrganizationId ?? ""} />
      </Can>
      <MailDeliveryList defaultOrganizationId={user?.activeOrganizationId ?? ""} />
    </main>
  );
}
