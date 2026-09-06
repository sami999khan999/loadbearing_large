import { useErrorMessage } from "../error/index.js";
import { useMessages } from "../i18n/index.js";
import {
  Callout,
  DataTable,
  DateFormat,
  EmptyState,
  type MemberDto,
  MemberQueries,
  StatusBadge,
  type TableColumn,
  useApiClient,
  useAppQuery,
  useMemo,
} from "../import.js";

export interface MemberListProps {
  // Paged rather than unbounded: `Pagination.query` caps `limit` at 100 in the schema.
  readonly limit?: number;
}

// A row needs a stable `id` for `DataTable`; the member's user id is that.
interface MemberRow extends MemberDto {
  readonly id: string;
}

export function MemberList({ limit = 25 }: MemberListProps) {
  const { t } = useMessages("member");
  // Renders the code the server sent rather than one generic sentence: a 403 and a
  // 409 are different things to be told.
  const describe = useErrorMessage();
  const client = useApiClient();
  const members = useAppQuery(MemberQueries.list(client, { limit, offset: 0 }));

  const rows = useMemo<readonly MemberRow[]>(() => {
    // Annotated rather than inferred: the client's procedure types are reconstructed
    // through two packages, and a break anywhere degrades to `any` silently.
    const items: readonly MemberDto[] = members.data?.items ?? [];
    return items.map((member) => ({ ...member, id: member.userId }));
  }, [members.data]);

  const columns = useMemo<readonly TableColumn<MemberRow>[]>(
    () => [
      {
        key: "name",
        header: t("member.column.name"),
        cell: (row) => (
          <>
            {row.name}{" "}
            {row.roleKey === "owner" ? (
              <StatusBadge tone="neutral">{t("member.badge.owner")}</StatusBadge>
            ) : null}{" "}
            {row.deactivated ? (
              <StatusBadge tone="warning">{t("member.badge.deactivated")}</StatusBadge>
            ) : null}
          </>
        ),
      },
      { key: "email", header: t("member.column.email"), cell: (row) => row.email },
      { key: "role", header: t("member.column.role"), cell: (row) => row.roleName },
      {
        key: "joined",
        header: t("member.column.joined"),
        cell: (row) => DateFormat.day(row.joinedAt),
      },
    ],
    [t],
  );

  if (members.isPending) return <DataTable.Skeleton rows={3} columns={4} />;
  // A failed list rendered as "no members yet", which is the one answer a members page
  // must not give when it does not know.
  if (members.isError) return <Callout tone="danger">{describe(members.error)?.message}</Callout>;
  if (rows.length === 0) return <EmptyState title={t("member.empty")} />;

  return <DataTable columns={columns} rows={rows} caption={t("member.title")} />;
}
