import { useErrorMessage } from "../error/index.js";
import { useMessages } from "../i18n/index.js";
import {
  Callout,
  Field,
  NotificationMutations,
  NotificationQueries,
  Select,
  useApiClient,
  useAppQuery,
} from "../import.js";

export interface DigestHourFormProps {
  // Whether the reader may change it. Everyone with an inbox may see it.
  readonly canManage: boolean;
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

// When the organization's daily digest goes out, in UTC (`26.7`). Saved as it is picked.
export function DigestHourForm({ canManage }: DigestHourFormProps) {
  const { t } = useMessages("notification");
  const describe = useErrorMessage();
  const client = useApiClient();
  const current = useAppQuery(NotificationQueries.digestHour(client));
  const update = NotificationMutations.useUpdateDigestHour(client);

  if (!current.isSuccess) return null;
  const label = (hour: number) => `${String(hour).padStart(2, "0")}:00 UTC`;

  return (
    <section>
      <h2>{t("notification.digestHour.title")}</h2>
      {canManage ? (
        <Field
          label={t("notification.digestHour.label")}
          htmlFor="digest-hour"
          hint={t("notification.digestHour.hint")}
        >
          <Select
            id="digest-hour"
            label={t("notification.digestHour.label")}
            value={String(current.data.hour)}
            onValueChange={(value) => update.mutate({ hour: Number(value) })}
            options={HOURS.map((hour) => ({ value: String(hour), label: label(hour) }))}
          />
        </Field>
      ) : (
        <p>{t("notification.digestHour.readOnly", { time: label(current.data.hour) })}</p>
      )}
      {update.isError ? <Callout tone="danger">{describe(update.error)?.message}</Callout> : null}
    </section>
  );
}
