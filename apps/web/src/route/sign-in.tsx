import { AuthClient } from "@loadbearing/api-client";
import type { ClientNamespace } from "@loadbearing/content";
import { SignInForm } from "@loadbearing/feature";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { Endpoint } from "~/endpoint.js";

// One local const, referenced twice: `staticData` is what a prefetcher or a coverage
// test can read without executing anything, and the loader is what resolves it.
// Deriving one from the other means reaching into `ctx.route.options`, which is
// version-sensitive in exactly the way this document keeps warning about.
const MESSAGES = ["auth"] as const satisfies readonly ClientNamespace[];

export const Route = createFileRoute("/sign-in")({
  staticData: { messages: MESSAGES },
  loader: ({ context }) => context.messages.ensure(MESSAGES),
  component: SignInPage,
});

function SignInPage() {
  const navigate = useNavigate();
  // A prop, not a module singleton — the instance differs per environment (23). Memoised
  // because a bare `new` in the body builds a fresh Better Auth client, and a fresh
  // `SessionMutations` identity, on every keystroke in the form.
  const auth = useMemo(() => new AuthClient({ baseUrl: Endpoint.auth }), []);

  return (
    <main>
      <SignInForm auth={auth} onSuccess={() => void navigate({ to: "/" })} />
    </main>
  );
}
