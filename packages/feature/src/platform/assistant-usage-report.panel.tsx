import { useErrorMessage } from "../error/index.js";
import { useMessages } from "../i18n/index.js";
import {
  type AssistantUsageReportDto,
  Button,
  Callout,
  DataTable,
  EmptyState,
  PlatformQueries,
  type TableColumn,
  useApiClient,
  useAppQuery,
  useMemo,
  useState,
} from "../import.js";

type UsageRow = AssistantUsageReportDto["rows"][number] & { readonly id: string };

const WINDOWS = [7, 30, 90] as const;

// Assistant spend across tenants: tokens by organization, model and day, from the
// analytics store. Tokens only; a price per model is a deployment's own table.
export function AssistantUsageReportPanel() {
  const { t } = useMessages("platform");
  const describe = useErrorMessage();
  const client = useApiClient();
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(30);
  const report = useAppQuery(PlatformQueries.assistantUsage(client, days));

  const rows = useMemo<readonly UsageRow[]>(
    () =>
      (report.data?.rows ?? []).map((row) => ({
        ...row,
        id: `${row.organizationId}:${row.model}:${row.day}`,
      })),
    [report.data],
  );

  const columns = useMemo<readonly TableColumn<UsageRow>[]>(
    () => [
      { key: "day", header: t("platform.assistantUsage.column.day"), cell: (row) => row.day },
      {
        key: "organization",
        header: t("platform.assistantUsage.column.organization"),
        // The id when the tenant is gone: the derived copy outlives a delete until purge.
        cell: (row) => row.organizationName ?? <code>{row.organizationId}</code>,
      },
      { key: "model", header: t("platform.assistantUsage.column.model"), cell: (row) => row.model },
      {
        key: "input",
        header: t("platform.assistantUsage.column.input"),
        cell: (row) => String(row.inputTokens),
      },
      {
        key: "output",
        header: t("platform.assistantUsage.column.output"),
        cell: (row) => String(row.outputTokens),
      },
      {
        key: "answers",
        header: t("platform.assistantUsage.column.answers"),
        cell: (row) => String(row.answers),
      },
    ],
    [t],
  );

  return (
    <section>
      <h2>{t("platform.assistantUsage.title")}</h2>
      <div className="flex gap-2">
        {WINDOWS.map((window) => (
          <Button
            key={window}
            variant={window === days ? "primary" : "secondary"}
            aria-pressed={window === days}
            onClick={() => setDays(window)}
          >
            {t("platform.assistantUsage.window", { days: window })}
          </Button>
        ))}
      </div>

      {report.isPending ? <DataTable.Skeleton rows={3} columns={6} /> : null}
      {report.isError ? <Callout tone="danger">{describe(report.error)?.message}</Callout> : null}
      {report.isSuccess && !report.data.configured ? (
        <Callout tone="warning">{t("platform.assistantUsage.notConfigured")}</Callout>
      ) : null}
      {report.isSuccess && report.data.configured && rows.length === 0 ? (
        <EmptyState title={t("platform.assistantUsage.empty")} />
      ) : null}
      {rows.length > 0 ? (
        <DataTable columns={columns} rows={rows} caption={t("platform.assistantUsage.title")} />
      ) : null}
      {report.data?.truncated ? (
        <p className="text-fg-muted">{t("platform.assistantUsage.truncated")}</p>
      ) : null}
    </section>
  );
}
