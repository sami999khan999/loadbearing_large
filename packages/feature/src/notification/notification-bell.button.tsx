import { useMessages } from "../i18n/index.js";
import { Icon, NotificationQueries, StatusBadge, useApiClient, useAppQuery } from "../import.js";

export interface NotificationBellProps {
  // An `href` rather than a router: `feature` may not import routing, so the shell
  // passes the destination it declared.
  readonly href: string;
}

// Past the repository's cap the count comes back as exactly 100, which the badge renders
// as "99+" — counting further is work nobody reads.
const CAP = 100;

export function NotificationBell({ href }: NotificationBellProps) {
  const { t } = useMessages("notification");
  const client = useApiClient();
  const unread = useAppQuery(NotificationQueries.unreadCount(client));

  const count = unread.data?.count ?? 0;

  return (
    <a className="ui-button ui-button--ghost" href={href} aria-label={t("notification.inbox.open")}>
      <Icon name="bell" />
      {
        // Absent rather than a zero badge: an empty bell is the quiet state, and a "0"
        // reads as a number worth looking at.
        count > 0 ? (
          <StatusBadge tone="danger">{count >= CAP ? "99+" : String(count)}</StatusBadge>
        ) : null
      }
    </a>
  );
}
