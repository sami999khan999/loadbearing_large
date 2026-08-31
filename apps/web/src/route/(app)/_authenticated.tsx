import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RouteGuard } from "~/route/-guard.js";

// Every page under `(app)` needs a session, and this is the one place that says so. A
// leaf below states only the capability it needs — repeating `requireSession()` in each
// one is how the fourth page forgets it.
//
// Pathless: the leading underscore keeps `_authenticated` out of the URL, so the guard
// nests without `/settings/roles` becoming `/_authenticated/settings/roles`.
export const Route = createFileRoute("/(app)/_authenticated")({
  beforeLoad: RouteGuard.requireSession(),
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return <Outlet />;
}
