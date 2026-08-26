# 22 · `@loadbearing/ui`

> The design system. Tokens, themes, primitives, `<Icon>`, and `<Can>`. No domain nouns anywhere.

**Delivers:** A component library with no knowledge of contracts, queries, or the router — testable with props alone and reusable under any routing shell.

**Prerequisite:** [21 · `@loadbearing/query`](21-query-package.md)

---

## The two rules that define this package

**A domain noun in an export name means the component is in the wrong package.** `StatusBadge` is `ui`; `TaskStatusBadge` is `feature`. `DataTable` is `ui`; `TaskTable` is `feature`. The moment a component knows what a task is, it cannot be restyled without understanding the domain and cannot be tested without domain fixtures.

**If a component imports `@tanstack/react-router`, it belongs in `apps/web`.** Navigation arrives as an `onNavigate` prop or an `href` string. This is what lets the Tauri webview mount the same components under a different routing shell.

|  | `@loadbearing/ui` | `@loadbearing/feature` |
|---|---|---|
| May import | React, headless primitives, `@loadbearing/asset` | `ui`, `query`, `content`, `contracts`, `permissions` |
| May **not** import | `@tanstack/*`, `@loadbearing/query`, `@loadbearing/contracts` at runtime | `@loadbearing/api-client`, `@tanstack/react-router`, `db`, `application` |
| Example | `DataTable`, `Dialog`, `StatusBadge`, `EmptyState` | `TaskBoard`, `ReactivateTaskDialog`, `PermissionMatrix` |
| Test with | Storybook / props | Fake `ApiClient` + `CapabilitySet` fixtures |

```
packages/ui/
├── ui.d.ts                    ← declare module "*.svg"; named in tsconfig `include`
├── vitest.setup.ts            ← afterEach(cleanup)
└── src/
    ├── index.tsx              ← "use client" on line 1
    ├── import.ts              ← every external symbol. Two workspace entries, both type-only
    ├── token/
    │   └── token.css          ← imports @loadbearing/asset/font.css. No index.ts: no modules
    ├── theme/
    │   ├── index.ts
    │   ├── theme.css          ← [data-theme="…"] custom properties
    │   ├── theme-registry.ts  → ThemeRegistry, ThemeKey, ThemeMeta
    │   └── font-registry.ts   → FontRegistry, FontKey, FontMeta
    ├── icon/
    │   ├── index.ts
    │   └── icon.tsx           → Icon
    ├── can/
    │   ├── index.ts
    │   └── can.tsx            → Can
    ├── data-table/
    │   ├── index.ts
    │   └── data-table.tsx     → DataTable, DataTable.Skeleton
    ├── empty-state/ …         → EmptyState
    ├── status-badge/ …        → StatusBadge, BadgeTone
    ├── button/ …              → Button, ButtonVariant
    ├── field/ …               → Field
    ├── input/ …               → Input
    └── dialog/ …              ☐ needs a headless library — see Step 22.5
```

**`token/` has no `index.ts`.** It holds one stylesheet and no modules, so there is nothing for a
barrel to name — the same exemption the binary directories in `asset` have
([Folders](../opinions/folders.md)).

---

> [!IMPORTANT]
> **This package's barrel opens with `"use client"`.** It is React components and hooks end to end,
> and Next's App Router treats every module as a Server Component until told otherwise — without the
> directive, a Next page importing from here fails the build. A Vite SPA and TanStack Start ignore
> it. The rule, and the list of packages that must **not** carry it, is in
> [06](06-package-anatomy.md#use-client--the-boundary-that-makes-next-work).

## Step 22.1 — Tokens

**`packages/ui/src/token/token.css`**

```css
@import "@loadbearing/asset/font.css";

:root {
  /* ── type ─────────────────────────────────────────── */
  --font-sans: "Inter", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;

  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.375rem;
  --text-2xl: 1.75rem;

  /* ── spacing — a 4px scale, no arbitrary values ────── */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-12: 3rem;

  /* ── shape ─────────────────────────────────────────── */
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;

  --border-width: 1px;
  --focus-ring: 0 0 0 2px var(--color-surface), 0 0 0 4px var(--color-accent);

  /* ── motion ────────────────────────────────────────── */
  --duration-fast: 120ms;
  --duration-base: 200ms;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --duration-fast: 0ms;
    --duration-base: 0ms;
  }
}
```

**Colours are not here.** They live in `theme.css` under `[data-theme]` selectors, because they are the thing that varies. Type scale, spacing, and radii are structural and stay constant across themes — a dark theme is not a different spacing system.

**The reduced-motion override sets the duration variables to zero** rather than each component checking the media query. One block, and every transition in the system respects it.

---

## Step 22.2 — Themes

**`packages/ui/src/theme/theme.css`**

```css
[data-theme="light"] {
  --color-surface: #ffffff;
  --color-surface-raised: #f7f7f8;
  --color-border: #e4e4e7;
  --color-text: #18181b;
  --color-text-muted: #71717a;
  --color-accent: #2563eb;
  --color-accent-text: #ffffff;
  --color-danger: #dc2626;
  --color-success: #16a34a;
  --color-warning: #d97706;
}

[data-theme="dark"] {
  --color-surface: #18181b;
  --color-surface-raised: #27272a;
  --color-border: #3f3f46;
  --color-text: #fafafa;
  --color-text-muted: #a1a1aa;
  --color-accent: #60a5fa;
  --color-accent-text: #0b1120;
  --color-danger: #f87171;
  --color-success: #4ade80;
  --color-warning: #fbbf24;
}
```

**`packages/ui/src/theme/theme-registry.ts`**

```ts
export interface ThemeMeta {
  readonly label: string;
  readonly colorScheme: "light" | "dark";
}

const THEMES = {
  light: { label: "Light", colorScheme: "light" },
  dark: { label: "Dark", colorScheme: "dark" },
} as const satisfies Record<string, ThemeMeta>;

export type ThemeKey = keyof typeof THEMES;

export class ThemeRegistry {
  private constructor() {}

  public static readonly DEFAULT: ThemeKey = "light";

  public static all(): readonly ThemeKey[] {
    return Object.keys(THEMES) as ThemeKey[];
  }

  public static meta(key: ThemeKey): ThemeMeta {
    return THEMES[key];
  }

  // `Object.hasOwn`, not `in` — `in` walks the prototype chain, so `"toString"` would
  // pass this guard and `meta()` would hand back a function. This is the boundary an
  // untrusted stored preference crosses, which is exactly where that matters. Same bug
  // the permission catalog had ([08](08-permissions-package.md)).
  public static isKnown(value: string): value is ThemeKey {
    return Object.hasOwn(THEMES, value);
  }

  // Apply to <html>. Safe to call before hydration to avoid a flash.
  public static apply(root: HTMLElement, key: ThemeKey): void {
    root.dataset.theme = key;
    root.style.colorScheme = THEMES[key].colorScheme;
  }
}
```

**Every colour is a custom property, applied by a `data-theme` attribute on `<html>`.** Adding a theme is one CSS block and one registry entry. No JavaScript re-render, no context provider, no class-name churn.

**`colorScheme` on the root element** is what makes native scrollbars, form controls, and the browser's own UI match. Without it, a dark theme has light scrollbars and light date pickers.

**Because every icon uses `currentColor`** ([19](19-asset-package.md)), themes recolour the entire icon set with no per-theme variants.

**Apply the theme before hydration.** The standard fix is a tiny inline script in `<head>` that reads the stored preference and sets `data-theme` synchronously. Otherwise a dark-theme user gets a white flash on every page load.

---

## Step 22.3 — `<Icon>`

**`packages/ui/src/icon/icon.tsx`**

> [!IMPORTANT]
> **`import spriteUrl from "…/sprite.svg"` needs an ambient declaration in *this* package.**
> `packages/asset/asset.d.ts` declares `*.svg` for asset's own compilation; ambient module
> declarations are per-program, so they do not travel to a consumer. Add a `ui.d.ts` above `src/` with
> the same `declare module "*.svg"` block and name it in this package's tsconfig `include`
> ([19](19-asset-package.md)). `apps/web` needs the same, for the same reason.

```tsx
import type { IconName } from "@loadbearing/asset";
import spriteUrl from "@loadbearing/asset/sprite.svg";

export interface IconProps {
  readonly name: IconName;
  readonly size?: number;
  readonly label?: string;
  readonly className?: string;
}

export function Icon({ name, size = 20, label, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      fill="currentColor"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <use href={`${spriteUrl}#${name}`} />
    </svg>
  );
}
```

Four lines of real content, and it is the entire icon system.

**`aria-hidden` unless a `label` is given.** Most icons sit next to text that already says what they mean; announcing them again is noise. An icon-only button passes `label` and becomes the accessible name.

**`focusable="false"`** because older Edge and IE-era engines put SVGs in the tab order. Cheap insurance.

**`IconName` is a type-only import**, so `ui` gets the closed union without a runtime dependency on `asset`'s data. A misspelled icon name is a compile error.

---

## Step 22.4 — `<Can>`

The permission-gating component. It lives in `ui` rather than `feature` because it is a pure conditional with no domain knowledge — it takes a `CapabilitySet` as a prop.

**`packages/ui/src/can/can.tsx`**

```tsx
import type { CapabilitySet, PermissionKey } from "@loadbearing/permissions";
import type { ReactNode } from "react";

export interface CanProps {
  readonly permission: PermissionKey;
  readonly capabilities: CapabilitySet;
  readonly goalId?: string;
  readonly children: ReactNode;
  readonly fallback?: ReactNode;
}

export function Can({
  permission,
  capabilities,
  goalId,
  children,
  fallback = null,
}: CanProps): ReactNode {
  // Returned bare rather than wrapped in a fragment: both branches are already
  // `ReactNode`, and Biome's `noUselessFragments` objects to the wrapper.
  return capabilities.can(permission, goalId) ? children : fallback;
}
```

**Same `CapabilitySet.can()` the server calls.** That identity is the entire point of the permissions package — not two implementations that agree today, one implementation used by both.

**`CapabilitySet` and `PermissionKey` are type-only imports.** The instance arrives as a prop, so `ui` has no runtime dependency on `permissions`. `verbatimModuleSyntax` ([04](04-typescript-configs.md)) guarantees the emitted JavaScript contains no import at all.

**`<Can>` is a convenience, never the gate.** Hiding a button is a UX affordance. The real check is `Authorizer.assert()` in the use-case ([12](12-application-package.md)), and it runs whether or not the button was rendered.

---

## Step 22.5 — Primitives

The starter kit ships `EmptyState`, `StatusBadge`, `DataTable`, and the three form primitives
`SignInForm` needs in [23](23-feature-package.md) — `Button`, `Field` and `Input`. None needs a
library or an interaction model beyond a click. Each follows the four rules below.

Two of those carry a decision worth naming. **`Button` defaults `type` to `"button"`**, because the
DOM's default inside a form is `submit` — so every icon button in a form submits it, and that is
remembered at the call site or not at all. **`Field.htmlFor` is required, not optional**: a label not
tied to a control is decoration — a screen reader announces the input as unlabelled and clicking the
text does nothing — and making it mandatory is what stops that shipping.

**`packages/ui/src/empty-state/empty-state.tsx`**

```tsx
import type { IconName } from "@loadbearing/asset";
import type { ReactNode } from "react";
import { Icon } from "../icon/icon.js";

export interface EmptyStateProps {
  readonly icon?: IconName;
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="ui-empty-state">
      {icon ? <Icon name={icon} size={32} /> : null}
      <p className="ui-empty-state__title">{title}</p>
      {description ? <p className="ui-empty-state__description">{description}</p> : null}
      {action}
    </div>
  );
}
```

**Every string arrives as a prop.** No literals in `ui`. Copy lives in `@loadbearing/content` and reaches these components through `feature`, which is what keeps the design system translatable and testable.

That constraint has a design consequence worth stating: an empty state is an invitation to act, so the `action` slot is part of the component rather than something a caller composes around it. `title` and `description` are the caller's job, and `content`'s message catalog is where they should be written — plainly, in active voice, naming what the person can do rather than apologising for the absence of data.

### Four rules for every primitive here

1. **Props in, markup out.** No fetching, no context beyond theme, no global state.
2. **Forward the ref and spread the rest.** `forwardRef` plus `...rest` onto the root element means a caller can attach a tooltip or a test id without you anticipating it.
3. **Keyboard and focus, always.** Visible focus ring using `--focus-ring`, `Escape` closes overlays, focus is trapped in a modal and restored on close. Retrofitting this across thirty components later is a project; doing it per component as you write it is a minute each.
4. **Use headless primitives for anything with complex interaction semantics.** Dialogs, popovers, comboboxes, and menus have genuinely hard focus and ARIA requirements. Radix or Ark handle them correctly. Write your own only for things that are actually simple.

> [!IMPORTANT]
> **`Dialog` is the one component this step does not deliver, and rule 4 is why.** A dialog needs a
> focus trap, an inert background, restored focus on close, `Escape` handling, and correct
> `aria-modal` semantics. Hand-rolling it is exactly what rule 4 forbids, so it waits on a library
> choice this document deliberately leaves open — and that choice is not a file, it is a package that
> lands in the client bundle of every consumer.
>
> Pick one, add it to the **React-scoped** group of the catalog in
> [03](03-workspace-and-catalogs.md), and wrap it here:
>
> ```yaml
> "@radix-ui/react-dialog": ^1.1.0   # or @ark-ui/react
> ```
>
> Until then `packages/ui` exports no `Dialog`, and the barrel below says so. That is better than a
> stub: a dialog that traps focus incorrectly is worse than one that does not exist, because the first
> ships and the second fails a build.

---

## Step 22.6 — Storybook, or not

A design system with no isolated rendering environment stops being reviewable — you end up checking a button by navigating to the one screen that uses it. Colocated `*.stories.tsx` files sit in `src/` when you have Storybook (they are not tests; [Files](../opinions/files.md) keeps them out of `tests/`), and there are none in the layout above because **this is the second decision this step leaves to you.**

Storybook is the default answer and it is a real amount of configuration. A cheaper alternative that works well early: a `/kitchen-sink` route in `apps/web` that renders every primitive in every state. It has no addons and no test integration, and it takes ten minutes.

Pick one deliberately. The failure mode is picking neither and reviewing components through the app.

**What ships instead, for now:** component tests under `tests/`, using `jsdom` and
`@testing-library/react` — both new tier-1 catalog entries, neither of which ever enters a bundle.
That is not a substitute for isolated rendering, and it is not meant to be: it asserts behaviour
(does a clickable row respond to `Enter`, does an unlabelled icon hide itself from assistive tech)
where a story shows appearance. You want both. This is the half that can be automated.

---

## Step 22.7 — The barrel

**`packages/ui/src/index.tsx`**

```tsx
"use client";

export { Can, type CanProps } from "./can/index.js";
export {
  DataTable,
  type DataTableProps,
  type DataTableSkeletonProps,
  type TableColumn,
  type TableRow,
} from "./data-table/index.js";
export { Button, type ButtonProps, type ButtonVariant } from "./button/index.js";
export { EmptyState, type EmptyStateProps } from "./empty-state/index.js";
export { Field, type FieldProps } from "./field/index.js";
export { Icon, type IconProps } from "./icon/index.js";
export { Input, type InputProps } from "./input/index.js";
export { type BadgeTone, StatusBadge, type StatusBadgeProps } from "./status-badge/index.js";
export {
  type FontKey,
  type FontMeta,
  FontRegistry,
  type ThemeKey,
  type ThemeMeta,
  ThemeRegistry,
} from "./theme/index.js";
```

**No `Dialog` line yet** — see the note under Step 22.5. Adding it is one export and one wrapper
once the headless library is chosen.

**`token/` is absent on purpose** — it ships CSS, not JavaScript, and reaches the app through the `./token.css` export below rather than through this file.

CSS is imported by the app, not re-exported here:

```ts
// apps/web/src/route/__root.tsx
import "@loadbearing/ui/token.css";
import "@loadbearing/ui/theme.css";
```

Add those two side-effect exports to `packages/ui/package.json` the same way `asset` does
([19](19-asset-package.md)), along with `"sideEffects": ["*.css"]` — the JavaScript here is
tree-shakeable and the stylesheets are not, and a blanket `false` would let a bundler drop them.

> [!NOTE]
> **The two stylesheets are tokens and themes. Component rules are not in this package.** Every
> component carries a `ui-*` class — `ui-empty-state__title`, `ui-data-table__row--clickable` — and
> those are styling *hooks*, deliberately: the class names are the contract, and what they resolve to
> is a design decision this document does not make. Reading the components, the full set is small
> enough to style in an afternoon.
>
> The honest consequence is that a fresh `packages/ui` renders correct, accessible, unstyled markup.
> That is the right order — the token and theme layers are what a design pass builds *on*, and
> shipping a default look here would be a third decision to undo.

---

## ✅ Gate

```bash
grep -rniE "task|goal|invoice|lead" packages/ui/src --include=*.tsx --include=*.ts   | grep -v "src/can/can.tsx"
```

Returns nothing. No domain nouns in the design system.

> [!WARNING]
> **`src/can/can.tsx` is the one exclusion, and it is not a loophole.** `<Can>` forwards a
> permission *scope* id to `CapabilitySet.can(permission, goalId?)`, and `goalId` is that method's
> own parameter name — "goal" is a tier in the authorization model, not a domain entity this
> component knows about. Renaming the prop would hide the pass-through behind a word nobody can grep
> for, which is worse than one documented exclusion.
>
> Note also that this gate matches **comments**, so prose naming the thing it forbids — "`StatusBadge`
> is `ui`, `TaskStatusBadge` is `feature`" — fails it too. Docs [18](18-api-client-package.md),
> [20](20-content-package.md) and [21](21-query-package.md) all have gates with the same trap.

```bash
grep -rn "@tanstack\|@loadbearing/query\|@loadbearing/contracts" packages/ui/src
```

Returns nothing.

- `packages/ui/package.json` lists exactly one runtime workspace dependency: `@loadbearing/asset`.
- Every `@loadbearing/permissions` import in `ui` is `import type`.

Do not proceed until this passes.

---

[← `@loadbearing/query`](21-query-package.md) · [`@loadbearing/feature` →](23-feature-package.md)
