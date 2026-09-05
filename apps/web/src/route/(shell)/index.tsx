import { createFileRoute } from "@tanstack/react-router";
import { EmptyState, useMessages } from "~/import.js";

export const Route = createFileRoute("/(shell)/")({ component: Home });

function Home() {
  // No `staticData`/`loader`: `common` is a shell namespace the root loader ensures.
  // Without that loader this page renders the literal string "state.empty".
  const { t } = useMessages("common");

  return (
    <main>
      <EmptyState title={t("state.empty")} />
    </main>
  );
}
