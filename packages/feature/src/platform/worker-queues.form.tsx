import { useErrorMessage } from "../error/index.js";
import { useMessages } from "../i18n/index.js";
import {
  Button,
  Callout,
  Dialog,
  PlatformMutations,
  useApiClient,
  useState,
  type WorkerProcessDto,
} from "../import.js";

export interface WorkerQueuesFormProps {
  readonly process: WorkerProcessDto;
  // Every queue the deployment runs, so a process can be given one it does not serve yet.
  readonly queues: readonly string[];
  readonly onClose: () => void;
  // What the change left unserved, for the page to warn about after the dialog closes.
  readonly onSaved: (unserved: readonly string[]) => void;
}

export function WorkerQueuesForm({ process, queues, onClose, onSaved }: WorkerQueuesFormProps) {
  const { t } = useMessages("platform");
  const describe = useErrorMessage();
  const client = useApiClient();
  const save = PlatformMutations.useSetWorkerQueues(client);
  const [selected, setSelected] = useState<readonly string[]>(() =>
    process.lanes.map((lane) => lane.queue),
  );

  const toggle = (queue: string): void =>
    setSelected((current) =>
      current.includes(queue) ? current.filter((name) => name !== queue) : [...current, queue],
    );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t("platform.workers.queues.dialog", { process: process.id })}
      description={t("platform.workers.queues.dialogDescription")}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("platform.workers.cancel")}
          </Button>
          <Button
            disabled={save.isPending || selected.length === 0}
            onClick={() =>
              save.mutate(
                { processId: process.id, queues: [...selected] },
                { onSuccess: (result) => onSaved(result.unserved) },
              )
            }
          >
            {t("platform.workers.save")}
          </Button>
        </>
      }
    >
      <ul>
        {queues.map((queue) => (
          <li key={queue}>
            <label>
              <input
                type="checkbox"
                checked={selected.includes(queue)}
                onChange={() => toggle(queue)}
              />{" "}
              <code>{queue}</code>
            </label>
          </li>
        ))}
      </ul>
      {save.isError ? <Callout tone="danger">{describe(save.error)?.message}</Callout> : null}
    </Dialog>
  );
}
