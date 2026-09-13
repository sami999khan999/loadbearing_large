import { createFileRoute } from "@tanstack/react-router";
import {
  type ClientNamespace,
  MessageComposer,
  MessageList,
  TypingNotice,
  useApiClient,
  useConversationStream,
  useMessages,
} from "~/import.js";
import { RouteGuard } from "~/route/-guard.js";

const MESSAGES = ["messaging"] as const satisfies readonly ClientNamespace[];

// Membership is checked again in every procedure this page calls. The permission gets
// you to the page; it does not get you into the room.
export const Route = createFileRoute("/(app)/_authenticated/messages/$conversationId")({
  beforeLoad: RouteGuard.requirePermission("messaging.conversation.read"),
  staticData: { messages: MESSAGES },
  loader: ({ context }) => context.messages.ensure(MESSAGES),
  component: Conversation,
});

function Conversation() {
  const { conversationId } = Route.useParams();
  const { t } = useMessages("messaging");
  const client = useApiClient();

  // The second stream, open only while this page is. It owns the typing map and
  // invalidates this conversation's pages; the user stream keeps the inbox in order.
  const { typing } = useConversationStream(client, conversationId);

  return (
    <main>
      <h1>{t("messaging.inbox.title")}</h1>
      <MessageList conversationId={conversationId} />
      <TypingNotice typing={typing} />
      <MessageComposer conversationId={conversationId} />
    </main>
  );
}
