import { useCapabilities } from "../auth/index.js";
import { useErrorMessage } from "../error/index.js";
import { useMessages } from "../i18n/index.js";
import {
  Button,
  Callout,
  DataTable,
  PlatformMutations,
  PlatformQueries,
  StatusBadge,
  type TableColumn,
  useApiClient,
  useAppQuery,
  useMemo,
  useState,
  type WorkerQueueDto,
} from "../import.js";
import { QueueAutoscaleForm } from "./queue-autoscale.form.js";

interface QueueRow extends WorkerQueueDto {
  readonly id: string;
}

// Every queue the deployment runs, cluster-wide: depth, who serves it, and the global
// pause. A queue no live process serves is the row this table exists to surface.
export function WorkerQueueList() {
  const { t } = useMessages("platform");
  const describe = useErrorMessage();
  const client = useApiClient();
  const canManage = useCapabilities().can("platform.worker.manage");
  const fleet = useAppQuery(PlatformQueries.workerFleet(client));
  const pause = PlatformMutations.usePauseQueue(client);
  const [editing, setEditing] = useState<WorkerQueueDto | null>(null);

  const rows = useMemo<readonly QueueRow[]>(
    () => (fleet.data?.queues ?? []).map((queue) => ({ ...queue, id: queue.queue })),
    [fleet.data],
  );

  const columns = useMemo<readonly TableColumn<QueueRow>[]>(
    () => [
      {
        key: "queue",
        header: t("platform.workers.column.queue"),
        cell: (row) => <code>{row.queue}</code>,
      },
      {
        key: "waiting",
        header: t("platform.workers.column.waiting"),
        cell: (row) => String(row.counts.waiting),
      },
      {
        key: "active",
        header: t("platform.workers.column.active"),
        cell: (row) => String(row.counts.active),
      },
      {
        key: "delayed",
        header: t("platform.workers.column.delayed"),
        cell: (row) => String(row.counts.delayed),
      },
      {
        key: "failed",
        header: t("platform.workers.column.failed"),
        cell: (row) => String(row.counts.failed),
      },
      {
        key: "served",
        header: t("platform.workers.column.served"),
        cell: (row) =>
          t("platform.workers.served", {
            processes: row.servedBy,
            concurrency: row.concurrency,
          }),
      },
      {
        key: "autoscale",
        header: t("platform.workers.column.autoscale"),
        cell: (row) =>
          row.settings?.autoscaleEnabled
            ? t("platform.workers.autoscale.on", {
                min: row.settings.concurrencyMin,
                max: row.settings.concurrencyMax,
                step: row.settings.step,
                waiting: row.settings.scaleUpWaiting,
              })
            : t("platform.workers.autoscale.off"),
      },
      {
        key: "state",
        header: t("platform.workers.column.state"),
        cell: (row) =>
          row.counts.paused ? (
            <StatusBadge tone="warning">{t("platform.workers.state.paused")}</StatusBadge>
          ) : row.unserved ? (
            <StatusBadge tone="danger">{t("platform.workers.state.unserved")}</StatusBadge>
          ) : (
            <StatusBadge tone="success">{t("platform.workers.state.running")}</StatusBadge>
          ),
      },
      ...(canManage
        ? [
            {
              key: "actions",
              header: t("platform.workers.column.actions"),
              cell: (row: QueueRow) => (
                <>
                  <Button
                    variant="secondary"
                    disabled={pause.isPending}
                    onClick={() => pause.mutate({ queue: row.queue, paused: !row.counts.paused })}
                  >
                    {row.counts.paused ? t("platform.workers.resume") : t("platform.workers.pause")}
                  </Button>{" "}
                  <Button variant="ghost" onClick={() => setEditing(row)}>
                    {t("platform.workers.autoscale.edit")}
                  </Button>
                </>
              ),
            },
          ]
        : []),
    ],
    [t, canManage, pause],
  );

  return (
    <section>
      <h2>{t("platform.workers.queues.title")}</h2>
      {fleet.isPending ? <DataTable.Skeleton rows={5} columns={8} /> : null}
      {fleet.isError ? <Callout tone="danger">{describe(fleet.error)?.message}</Callout> : null}
      {fleet.isSuccess ? (
        <DataTable columns={columns} rows={rows} caption={t("platform.workers.queues.title")} />
      ) : null}
      {pause.isError ? <Callout tone="danger">{describe(pause.error)?.message}</Callout> : null}
      {editing ? <QueueAutoscaleForm queue={editing} onClose={() => setEditing(null)} /> : null}
    </section>
  );
}
