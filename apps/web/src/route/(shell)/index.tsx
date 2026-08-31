import { createFileRoute } from "@tanstack/react-router";
import { EmptyState, useMessages } from "~/import.js";

export const Route = createFileRoute("/(shell)/")({ component: Home });

function Home() {
  // No `staticData`/`loader` here: `common` is a shell namespace and `__root.tsx` ensures the
  // shell for every route. That root loader is load-bearing — without it this page rendered
  // the literal string "state.empty", because `ensure()` short-circuits on an empty store and
  // a route with no namespaces of its own never triggers a fetch (24.10).
  const { t } = useMessages("common");

  return (
    <main>
      <EmptyState title={t("state.empty")} />
    </main>
  );
}
