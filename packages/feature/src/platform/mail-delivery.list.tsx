import { useErrorMessage } from "../error/index.js";
import { useMessages } from "../i18n/index.js";
import {
  Button,
  Callout,
  DataTable,
  DateFormat,
  EmptyState,
  Field,
  Input,
  type MailDeliveryDto,
  type OrganizationId,
  PlatformQueries,
  StatusBadge,
  type TableColumn,
  useApiClient,
  useAppInfiniteQuery,
  useMemo,
  useState,
} from "../import.js";

export interface MailDeliveryListProps {
  // The tenant to search first: the platform organization, whose rows are every
  // sign-in, reset and invitation mail.
  readonly defaultOrganizationId?: string;
  readonly limit?: number;
}

interface DeliveryPage {
  readonly items: readonly MailDeliveryDto[];
  readonly nextCursor: string | null;
}

// "Was this sent?" (`26.10`): one tenant's outcomes, newest first, narrowed by address.
export function MailDeliveryList({
  defaultOrganizationId = "",
  limit = 50,
}: MailDeliveryListProps) {
  const { t } = useMessages("platform");
  const describe = useErrorMessage();
  const client = useApiClient();
  const [organization, setOrganization] = useState(defaultOrganizationId);
  const [recipient, setRecipient] = useState("");

  // A complete id only: a half-typed uuid would be a refused request per keystroke.
  const organizationId = organization.trim();
  const ready = organizationId.length === 36;
  const deliveries = useAppInfiniteQuery({
    ...PlatformQueries.mailDeliveries(client, {
      organizationId: organizationId as OrganizationId,
      limit,
      ...(recipient.trim() ? { recipient: recipient.trim() } : {}),
    }),
    enabled: ready,
  });

  const rows = useMemo<readonly MailDeliveryDto[]>(() => {
    const pages: readonly DeliveryPage[] = deliveries.data?.pages ?? [];
    return pages.flatMap((page) => page.items);
  }, [deliveries.data]);

  const columns = useMemo<readonly TableColumn<MailDeliveryDto>[]>(
    () => [
      {
        key: "at",
        header: t("platform.mail.column.at"),
        cell: (row) => DateFormat.minute(row.createdAt),
      },
      { key: "to", header: t("platform.mail.column.to"), cell: (row) => row.recipient },
      { key: "template", header: t("platform.mail.column.template"), cell: (row) => row.template },
      {
        key: "status",
        header: t("platform.mail.column.status"),
        cell: (row) => (
          <StatusBadge tone={row.status === "sent" ? "success" : "danger"}>
            {row.status === "sent"
              ? t("platform.mail.status.sent")
              : t("platform.mail.status.failed")}
          </StatusBadge>
        ),
      },
      {
        key: "attempts",
        header: t("platform.mail.column.attempts"),
        cell: (row) => String(row.attempts),
      },
      {
        key: "messageId",
        header: t("platform.mail.column.messageId"),
        cell: (row) => (row.messageId ? <code>{row.messageId}</code> : null),
      },
    ],
    [t],
  );

  return (
    <section>
      <h2>{t("platform.mail.deliveries.title")}</h2>
      <p>{t("platform.mail.deliveries.description")}</p>
      <Field label={t("platform.mail.filter.organization")} htmlFor="mail-organization">
        <Input
          id="mail-organization"
          value={organization}
          onChange={(event) => setOrganization(event.target.value)}
        />
      </Field>
      <Field label={t("platform.mail.filter.recipient")} htmlFor="mail-recipient">
        <Input
          id="mail-recipient"
          type="email"
          value={recipient}
          onChange={(event) => setRecipient(event.target.value)}
        />
      </Field>

      {!ready ? <p className="text-fg-muted">{t("platform.mail.filter.hint")}</p> : null}
      {ready && deliveries.isPending ? <DataTable.Skeleton rows={3} columns={6} /> : null}
      {deliveries.isError ? (
        <Callout tone="danger">{describe(deliveries.error)?.message}</Callout>
      ) : null}
      {ready && deliveries.isSuccess && rows.length === 0 ? (
        <EmptyState title={t("platform.mail.deliveries.empty")} />
      ) : null}
      {rows.length > 0 ? (
        <DataTable columns={columns} rows={rows} caption={t("platform.mail.deliveries.title")} />
      ) : null}
      {deliveries.hasNextPage ? (
        <Button variant="secondary" onClick={() => void deliveries.fetchNextPage()}>
          {t("platform.mail.deliveries.more")}
        </Button>
      ) : null}
    </section>
  );
}
