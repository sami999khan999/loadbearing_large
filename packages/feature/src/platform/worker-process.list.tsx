import { useCapabilities } from "../auth/index.js";
import { useErrorMessage } from "../error/index.js";
import { useMessages } from "../i18n/index.js";
import {
  Button,
  Callout,
  DataTable,
  EmptyState,
  PlatformMutations,
  PlatformQueries,
  StatusBadge,
  type TableColumn,
  useApiClient,
  useAppQuery,
  useMemo,
  useState,
  type WorkerProcessDto,
} from "../import.js";
import { WorkerQueuesForm } from "./worker-queues.form.js";

// Whole seconds, measured against the browser's clock. A skew of a few seconds between it
// and the worker's is noise on a page polled every three.
const secondsSince = (date: Date): number =>
  Math.max(0, Math.round((Date.now() - date.getTime()) / 1_000));

// Every live process and its lanes. Actions here act on one process and last until it
// restarts or is reset; queue-wide settings live in the table above.
export function WorkerProcessList() {
  const { t } = useMessages("platform");
  const describe = useErrorMessage();
  const client = useApiClient();
  const canManage = useCapabilities().can("platform.worker.manage");
  const fleet = useAppQuery(PlatformQueries.workerFleet(client));
  const pause = PlatformMutations.usePauseWorker(client);
  const reset = PlatformMutations.useResetWorker(client);
  const [editing, setEditing] = useState<WorkerProcessDto | null>(null);
  const [unserved, setUnserved] = useState<readonly string[]>([]);

  const queues = useMemo(
    () => (fleet.data?.queues ?? []).map((queue) => queue.queue),
    [fleet.data],
  );

  const columns = useMemo<readonly TableColumn<WorkerProcessDto>[]>(
    () => [
      {
        key: "process",
        header: t("platform.workers.column.process"),
        cell: (row) => (
          <>
            <code>{row.id}</code>
            {row.overridden ? (
              <>
                {" "}
                <StatusBadge tone="warning">{t("platform.workers.overridden")}</StatusBadge>
              </>
            ) : null}
          </>
        ),
      },
      {
        key: "state",
        header: t("platform.workers.column.state"),
        cell: (row) => (
          <StatusBadge tone={row.paused ? "warning" : "success"}>
            {row.paused ? t("platform.workers.state.paused") : t("platform.workers.state.running")}
          </StatusBadge>
        ),
      },
      {
        key: "uptime",
        header: t("platform.workers.column.uptime"),
        cell: (row) =>
          t("platform.workers.uptime", { minutes: Math.floor(secondsSince(row.startedAt) / 60) }),
      },
      {
        key: "heartbeat",
        header: t("platform.workers.column.heartbeat"),
        cell: (row) => t("platform.workers.ago", { seconds: secondsSince(row.heartbeatAt) }),
      },
      {
        key: "lanes",
        header: t("platform.workers.column.lanes"),
        cell: (row) => (
          <ul>
            {row.lanes.map((lane) => (
              <li key={lane.queue}>
                {lane.paused
                  ? t("platform.workers.lane.paused", { queue: lane.queue })
                  : t("platform.workers.lane", {
                      queue: lane.queue,
                      concurrency: lane.concurrency,
                      active: lane.active,
                    })}
                {canManage && !row.paused ? (
                  <>
                    {" "}
                    <Button
                      variant="ghost"
                      disabled={pause.isPending}
                      onClick={() =>
                        pause.mutate({ processId: row.id, queue: lane.queue, paused: !lane.paused })
                      }
                    >
                      {lane.paused ? t("platform.workers.resume") : t("platform.workers.pause")}
                    </Button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        ),
      },
      ...(canManage
        ? [
            {
              key: "actions",
              header: t("platform.workers.column.actions"),
              cell: (row: WorkerProcessDto) => (
                <>
                  <Button
                    variant="secondary"
                    disabled={pause.isPending}
                    onClick={() => pause.mutate({ processId: row.id, paused: !row.paused })}
                  >
                    {row.paused ? t("platform.workers.resume") : t("platform.workers.pause")}
                  </Button>{" "}
                  <Button variant="ghost" onClick={() => setEditing(row)}>
                    {t("platform.workers.queues.edit")}
                  </Button>{" "}
                  <Button
                    variant="ghost"
                    disabled={reset.isPending}
                    onClick={() => reset.mutate({ processId: row.id })}
                  >
                    {t("platform.workers.reset")}
                  </Button>
                </>
              ),
            },
          ]
        : []),
    ],
    [t, canManage, pause, reset],
  );

  const processes = fleet.data?.processes ?? [];
  const failed = pause.error ?? reset.error;

  return (
    <section>
      <h2>{t("platform.workers.processes.title")}</h2>
      {unserved.length > 0 ? (
        <Callout tone="warning">
          {t("platform.workers.unserved", { queues: unserved.join(", ") })}
        </Callout>
      ) : null}
      {fleet.isPending ? <DataTable.Skeleton rows={2} columns={5} /> : null}
      {fleet.isSuccess && processes.length === 0 ? (
        <EmptyState title={t("platform.workers.processes.empty")} />
      ) : null}
      {processes.length > 0 ? (
        <DataTable
          columns={columns}
          rows={processes}
          caption={t("platform.workers.processes.title")}
        />
      ) : null}
      {failed ? <Callout tone="danger">{describe(failed)?.message}</Callout> : null}
      {editing ? (
        <WorkerQueuesForm
          process={editing}
          queues={queues}
          onClose={() => setEditing(null)}
          onSaved={(left) => {
            setUnserved(left);
            setEditing(null);
          }}
        />
      ) : null}
    </section>
  );
}
