import { useErrorMessage } from "../error/index.js";
import { useMessages } from "../i18n/index.js";
import {
  Button,
  Callout,
  Dialog,
  Field,
  Input,
  PlatformMutations,
  useApiClient,
  useState,
  type WorkerQueueDto,
} from "../import.js";

export interface QueueAutoscaleFormProps {
  readonly queue: WorkerQueueDto;
  readonly onClose: () => void;
}

// What a queue nobody has saved starts from: off, and the shipped thresholds. The server
// enforces the limit; the form starts below it so the first save is a valid one.
function initial(queue: WorkerQueueDto) {
  const saved = queue.settings;
  return {
    autoscaleEnabled: saved?.autoscaleEnabled ?? false,
    concurrencyMin: saved?.concurrencyMin ?? 1,
    concurrencyMax: saved?.concurrencyMax ?? Math.min(queue.limit, 8),
    scaleUpWaiting: saved?.scaleUpWaiting ?? 50,
    step: saved?.step ?? 1,
    scaleDownAfterSeconds: saved?.scaleDownAfterSeconds ?? 60,
  };
}

type NumberField =
  | "concurrencyMin"
  | "concurrencyMax"
  | "scaleUpWaiting"
  | "step"
  | "scaleDownAfterSeconds";

type FieldLabel =
  | "platform.workers.autoscale.min"
  | "platform.workers.autoscale.max"
  | "platform.workers.autoscale.waiting"
  | "platform.workers.autoscale.step"
  | "platform.workers.autoscale.scaleDown";

const FIELDS: readonly { readonly key: NumberField; readonly label: FieldLabel }[] = Object.freeze([
  { key: "concurrencyMin", label: "platform.workers.autoscale.min" },
  { key: "concurrencyMax", label: "platform.workers.autoscale.max" },
  { key: "scaleUpWaiting", label: "platform.workers.autoscale.waiting" },
  { key: "step", label: "platform.workers.autoscale.step" },
  { key: "scaleDownAfterSeconds", label: "platform.workers.autoscale.scaleDown" },
]);

// One queue's autoscale row, replaced whole on save. Changes reach every process on the
// control signal, so the queue table shows the new concurrency within a poll.
export function QueueAutoscaleForm({ queue, onClose }: QueueAutoscaleFormProps) {
  const { t } = useMessages("platform");
  const describe = useErrorMessage();
  const client = useApiClient();
  const save = PlatformMutations.useSaveQueueAutoscale(client);
  const [values, setValues] = useState(() => initial(queue));

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t("platform.workers.autoscale.title", { queue: queue.queue })}
      description={t("platform.workers.autoscale.description", { limit: queue.limit })}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("platform.workers.cancel")}
          </Button>
          <Button
            disabled={save.isPending}
            onClick={() =>
              save.mutate({ queue: queue.queue, ...values }, { onSuccess: () => onClose() })
            }
          >
            {t("platform.workers.save")}
          </Button>
        </>
      }
    >
      <label>
        <input
          type="checkbox"
          checked={values.autoscaleEnabled}
          onChange={(event) =>
            setValues((current) => ({ ...current, autoscaleEnabled: event.target.checked }))
          }
        />{" "}
        {t("platform.workers.autoscale.enabled")}
      </label>
      {FIELDS.map((field) => (
        <Field key={field.key} label={t(field.label)} htmlFor={`autoscale-${field.key}`}>
          <Input
            id={`autoscale-${field.key}`}
            type="number"
            min={1}
            value={String(values[field.key])}
            disabled={!values.autoscaleEnabled}
            onChange={(event) =>
              setValues((current) => ({ ...current, [field.key]: Number(event.target.value) }))
            }
          />
        </Field>
      ))}
      {save.isError ? <Callout tone="danger">{describe(save.error)?.message}</Callout> : null}
    </Dialog>
  );
}
