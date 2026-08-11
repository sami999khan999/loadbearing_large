# 22 · `@ratchet/feature`

> Components that fetch and mutate. The auth screens, the message provider, the session guard — and every feature screen that follows.

**Delivers:** Sign-in, two-factor, session gating, and i18n binding, all mountable under any routing shell.

**Prerequisite:** [21 · `@ratchet/ui`](21-ui-package.md)

---

## The two bans that make this package work

**`feature` may not import `@ratchet/api-client`.** Every read goes through a defined query in `@ratchet/query`. Without this rule, someone under deadline pressure writes `await client.task.list()` directly inside a component; it works fine, and now there is an uncached read that no invalidation will ever touch. Banning the import at the lint level makes it unwriteable rather than discouraged.

**`feature` may not import `@tanstack/react-router`.** Navigation arrives as an `onNavigate` prop or an `href`. That is what lets the Tauri app mount these components under a different routing shell.

Both are enforced by the per-package ESLint config from [05](05-lint-and-format.md).

```
packages/feature/src/
├── index.ts
├── i18n/
│   ├── index.ts
│   └── message.context.tsx        → MessageProvider, useMessages
├── auth/
│   ├── index.ts
│   ├── sign-in.form.tsx           → SignInForm
│   ├── two-factor.form.tsx        → TwoFactorForm
│   ├── session.guard.tsx          → SessionGuard
│   └── session.context.tsx        → SessionProvider, useSession, useCapabilities
└── rbac/
    ├── index.ts
    ├── permission-matrix.tsx      → PermissionMatrix
    └── effective-permissions.inspector.tsx
```

```js
// packages/feature/eslint.config.js — see 05, Step 5.4
```

---

## Step 22.1 — The message provider

The React binding for `@ratchet/content`'s `Translator`. It lives here, not in `content`, because `content` must stay React-free for the worker.

**`packages/feature/src/i18n/message.context.tsx`**

```tsx
import type { MessageKey, Translator } from "@ratchet/content";
import { createContext, useCallback, useContext, type ReactNode } from "react";

const MessageContext = createContext<Translator | null>(null);

export function MessageProvider({
  translator,
  children,
}: {
  translator: Translator;
  children: ReactNode;
}) {
  return <MessageContext.Provider value={translator}>{children}</MessageContext.Provider>;
}

export function useMessages() {
  const translator = useContext(MessageContext);
  if (!translator) throw new Error("useMessages must be used inside a MessageProvider.");

  const t = useCallback(
    (key: MessageKey, params?: Readonly<Record<string, string | number>>) =>
      translator.t(key, params),
    [translator],
  );

  return { t };
}
```

**The translator is constructed server-side and passed down**, so the correct locale is present in the first rendered byte. Fetching translations client-side means either a flash of English or a blocking request before anything renders.

---

## Step 22.2 — The session context

Session and capabilities are needed by nearly every component, and threading them through props for twelve levels is not a real option.

**`packages/feature/src/auth/session.context.tsx`**

```tsx
import { CapabilitySet, type CapabilitySetDto } from "@ratchet/permissions";
import { createContext, useContext, useMemo, type ReactNode } from "react";

export interface SessionUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
}

interface SessionValue {
  readonly user: SessionUser | null;
  readonly capabilities: CapabilitySet;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({
  user,
  capabilities,
  children,
}: {
  user: SessionUser | null;
  capabilities: CapabilitySetDto;
  children: ReactNode;
}) {
  const value = useMemo<SessionValue>(
    () => ({ user, capabilities: CapabilitySet.from(capabilities) }),
    [user, capabilities],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside a SessionProvider.");
  return value;
}

export function useCapabilities(): CapabilitySet {
  return useSession().capabilities;
}
```

**The provider takes a `CapabilitySetDto` and reconstructs the class.** The DTO is what crosses the SSR boundary as JSON; `CapabilitySet.from()` on the client produces an object whose `can()` is byte-identical to the server's. This is the round-trip property from [08](08-permissions-package.md) doing its actual job.

**`useMemo` on the reconstruction** so a re-render does not rebuild the internal `Set`s and invalidate every downstream memo.

**`capabilities` defaults to nothing, never to permissive.** A signed-out user gets `CapabilitySet.empty()` from the app, and `empty()` denies everything. There is no "loading" state that grants access.

---

## Step 22.3 — `SessionGuard`

**`packages/feature/src/auth/session.guard.tsx`**

```tsx
import type { PermissionKey } from "@ratchet/permissions";
import type { ReactNode } from "react";
import { useSession } from "./session.context.js";

export interface SessionGuardProps {
  readonly permission?: PermissionKey;
  readonly goalId?: string;
  readonly children: ReactNode;
  readonly onUnauthenticated: () => void;
  readonly onForbidden: () => void;
}

export function SessionGuard({
  permission,
  goalId,
  children,
  onUnauthenticated,
  onForbidden,
}: SessionGuardProps) {
  const { user, capabilities } = useSession();

  if (!user) {
    onUnauthenticated();
    return null;
  }

  if (permission && !capabilities.can(permission, goalId)) {
    onForbidden();
    return null;
  }

  return <>{children}</>;
}
```

**The redirect is a callback, not a `<Navigate>`.** That is the router ban in practice: `apps/web` passes `() => navigate({ to: "/sign-in" })` and the desktop shell passes its own navigation. The component knows *that* it should redirect, never *how*.

**This is the third of four enforcement surfaces**, and the weakest one. The order of authority:

1. `Authorizer.assert()` in the use-case — the real gate ([11](11-application-package.md))
2. `principalMiddleware` in the oRPC handler — defence in depth ([23](23-web-app.md))
3. `RouteGuard` in the route loader — stops the page rendering at all ([23](23-web-app.md))
4. `<Can>` and `SessionGuard` — hide affordances that would fail

Removing a permission from a role must remove the nav item **and** return `FORBIDDEN`. Both, every time. If only the UI hides, you have security theatre; if only the API rejects, you have a UI full of buttons that produce errors.

---

## Step 22.4 — `SignInForm`

**`packages/feature/src/auth/sign-in.form.tsx`**

```tsx
import type { AuthClient } from "@ratchet/api-client";
import { SessionMutations } from "@ratchet/query";
import { Button, Field, Input } from "@ratchet/ui";
import { useState, type FormEvent } from "react";
import { useMessages } from "../i18n/message.context.js";

export interface SignInFormProps {
  readonly auth: AuthClient;
  readonly onSuccess: () => void;
  readonly onNeedsTwoFactor?: () => void;
}

export function SignInForm({ auth, onSuccess, onNeedsTwoFactor }: SignInFormProps) {
  const { t } = useMessages();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const signIn = SessionMutations.useSignIn(auth);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    signIn.mutate(
      { email, password },
      {
        onSuccess: () => onSuccess(),
        onError: (error) => {
          if (error.message.includes("two-factor")) onNeedsTwoFactor?.();
        },
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate>
      <Field label={t("auth.email")} htmlFor="email">
        <Input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </Field>

      <Field label={t("auth.password")} htmlFor="password">
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </Field>

      {signIn.isError ? (
        <p role="alert" className="ui-field__error">
          {t("auth.signInFailed")}
        </p>
      ) : null}

      <Button type="submit" disabled={signIn.isPending}>
        {signIn.isPending ? t("auth.signingIn") : t("auth.signIn")}
      </Button>
    </form>
  );
}
```

### Four things worth copying from this

**`AuthClient` arrives as a prop, not from a module import.** Same reason `createQueryClient` is a factory: the instance differs per environment, and a module singleton in an SSR bundle is shared across requests.

**The error message is generic.** `t("auth.signInFailed")` — never "no account with that email" or "incorrect password". Distinguishing them is an account-enumeration oracle: an attacker learns which addresses are registered without needing a password. It is a small copy decision with a real security consequence.

**`autoComplete` on both fields.** `email` and `current-password` are what password managers key on. Omitting them is a real usability cost for a class of users who will not report it.

**Every string comes from `useMessages`.** No literals in this package either. `feature` is where copy meets components, and it meets it through the catalog.

---

## Step 22.5 — What a feature screen looks like

The shape every feature module follows:

```tsx
// packages/feature/src/task/task-board.tsx
import { TaskQueries } from "@ratchet/query";
import { useApiClient } from "@ratchet/query";
import { Can, DataTable, EmptyState } from "@ratchet/ui";
import { useQuery } from "@tanstack/react-query";
import { useCapabilities } from "../auth/session.context.js";
import { useMessages } from "../i18n/message.context.js";

export interface TaskBoardProps {
  readonly goalId: string;
  readonly onOpenTask: (taskId: string) => void;
}

export function TaskBoard({ goalId, onOpenTask }: TaskBoardProps) {
  const client = useApiClient();
  const caps = useCapabilities();
  const { t } = useMessages();

  const { data, isPending } = useQuery(TaskQueries.list(client, { goalId }));

  if (isPending) return <DataTable.Skeleton rows={5} />;
  if (!data || data.items.length === 0) {
    return <EmptyState icon="check" title={t("task.empty.title")} />;
  }

  return (
    <>
      <Can permission="task.create" goalId={goalId} capabilities={caps}>
        <CreateTaskButton goalId={goalId} />
      </Can>
      <DataTable rows={data.items} onRowClick={(row) => onOpenTask(row.id)} />
    </>
  );
}
```

Read through it: data comes from `query`, presentation from `ui`, copy from `content`, permission from the session context, navigation from a prop. It imports no router, no `api-client`, and no server code. That is the whole pattern, and every feature module repeats it.

---

## Step 22.6 — Testing

`feature` components are tested with fakes, never against a running server:

```tsx
function renderWithFakes(ui: ReactNode, caps: CapabilitySetDto) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={fakeApiClient}>
        <MessageProvider translator={new Translator(en)}>
          <SessionProvider user={testUser} capabilities={caps}>
            {ui}
          </SessionProvider>
        </MessageProvider>
      </ApiClientProvider>
    </QueryClientProvider>,
  );
}
```

The test worth writing first: **render the same component with two different `CapabilitySetDto` fixtures and assert the create button appears in one and not the other.** That single test exercises the round-trip property, the `<Can>` gate, and the session context all at once — and it fails loudly if the client and server ever stop agreeing about permissions.

---

## Step 22.7 — The barrel

**`packages/feature/src/index.ts`**

```ts
export * from "./auth/index.js";
export * from "./i18n/index.js";
export * from "./rbac/index.js";
```

---

## ✅ Gate

```bash
grep -rn "@ratchet/api-client" packages/feature/src
```

Returns nothing **except** `import type { AuthClient }` — a type-only import is permitted, since it creates no runtime dependency.

```bash
grep -rn "@tanstack/react-router" packages/feature/src
```

Returns nothing.

- No string literal appears in rendered output — every user-visible string comes from `useMessages`.
- The lint config from [05](05-lint-and-format.md) Step 5.4 is in place and errors on both imports.

Do not proceed until this passes.

---

[← `@ratchet/ui`](21-ui-package.md) · [`apps/web` →](23-web-app.md)
