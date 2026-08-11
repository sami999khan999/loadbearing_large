# 05 · Lint & Format

> Prettier, plus the ESLint rules that mechanically enforce the OOP conventions and the server-only boundary. These are not style preferences — they are the architecture, expressed as errors.

**Delivers:** `@ratchet/prettier-config` and `@ratchet/eslint-config` with `base`, `oop`, and `react` entrypoints.

**Prerequisite:** [04 · TypeScript Configs](04-typescript-configs.md)

---

## Step 5.1 — Prettier

```bash
node -e "require('fs').mkdirSync('tooling/prettier-config', { recursive: true })"
```

**`tooling/prettier-config/package.json`**

```json
{
  "name": "@ratchet/prettier-config",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./index.js",
  "dependencies": {
    "prettier-plugin-organize-imports": "^4.1.0"
  },
  "peerDependencies": {
    "prettier": "catalog:"
  }
}
```

**`tooling/prettier-config/index.js`**

```js
/** @type {import("prettier").Config} */
export default {
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  printWidth: 100,
  endOfLine: "lf",
  plugins: ["prettier-plugin-organize-imports"],
};
```

**`prettier.config.js`** at the root:

```js
export { default } from "@ratchet/prettier-config";
```

```bash
pnpm add -Dw @ratchet/prettier-config@workspace:*
```

**The plugin belongs to the config package, not the root.** Prettier resolves `plugins:` entries relative to the file that declares them, so `prettier-plugin-organize-imports` is a dependency of `@ratchet/prettier-config` (above) rather than a root devDependency. `prettier` itself is a peer: the config describes how to format, the root decides which Prettier runs it.

**The root declares `@ratchet/prettier-config` because the root genuinely imports it.** `prettier.config.js` at the root does `export { default } from "@ratchet/prettier-config"` — that is a real module resolution, so the symlink has to exist, so the dependency has to be declared. Same reasoning for `@ratchet/eslint-config` and the root `eslint.config.js`.

This is not an exception to the rule that the root declares no workspace packages; it is the rule. **Declare what you import.** The root imports the two `tooling/*` configs and nothing else. It must never declare `@ratchet/core`, `@ratchet/db`, or any other `packages/*` member, because the root imports none of them — and a root declaration hoists the package into the root `node_modules`, where every package in the repo can reach it regardless of what it declared.

The distinction that matters is what a leaked import could cost. A formatting config reaching a package that didn't ask for it is harmless. `@ratchet/db` reaching `@ratchet/application` that way would silently dissolve the dependency inversion.

`endOfLine: "lf"` is the third leg of the line-ending fix — Git normalises on commit, `.editorconfig` normalises in the editor, Prettier normalises on format. All three, or a Windows machine and a Linux machine produce byte-different files.

`prettier-plugin-organize-imports` runs TypeScript's own organiser, which drops unused imports and sorts the rest. With `verbatimModuleSyntax` on, this also keeps `import type` statements grouped and visible, which matters when the difference between a type import and a value import is a package boundary.

`printWidth: 100` rather than 80: constructor parameter properties on `Authorizer`, `PrincipalBuilder`, and every use-case are long by nature, and 80 columns wraps every one of them into six lines.

---

## Step 5.2 — ESLint: the base

```bash
node -e "require('fs').mkdirSync('tooling/eslint-config', { recursive: true })"
```

**`tooling/eslint-config/package.json`**

```json
{
  "name": "@ratchet/eslint-config",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./base": "./base.js",
    "./oop": "./oop.js",
    "./react": "./react.js"
  }
}
```

```bash
pnpm add --filter @ratchet/eslint-config -D eslint@catalog: typescript-eslint@catalog: @eslint/js@catalog:
```
> The linter is installed into the config package, so consuming packages inherit it through one `workspace:*` dependency instead of each declaring ESLint.

**`tooling/eslint-config/base.js`**

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export const base = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: { parserOptions: { projectService: true } },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/explicit-member-accessibility": [
        "error",
        { accessibility: "explicit", overrides: { constructors: "no-public" } },
      ],
      "@typescript-eslint/parameter-properties": ["error", { prefer: "parameter-property" }],
      "@typescript-eslint/prefer-readonly": "error",
      "@typescript-eslint/require-await": "error",
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message:
            "No package reads its own configuration. Config is read once in apps/*/src/env.ts and passed down as constructor arguments.",
        },
      ],
    },
  },
  { ignores: ["dist/**", ".output/**", "*.config.*"] },
);

export default base;
```

### Why each rule is here

**`recommendedTypeChecked`, not `recommended`.** Type-aware linting is slower and it is the only way `no-floating-promises` and `no-misused-promises` work. In a codebase where every use-case is `async` and every repository call returns a promise, a forgotten `await` in a `.save()` is a data-loss bug that no unit test catches.

**`consistent-type-imports`** pairs with `verbatimModuleSyntax`. It is what keeps `@ratchet/ui`'s import of `PermissionKey` type-only, which is the whole reason `ui` can reference the permission vocabulary without depending on `permissions` at runtime.

**`explicit-member-accessibility`** with `constructors: "no-public"`. Every method reads `public` or `private`. In an OOP codebase the public surface of a class *is* its contract, and making it explicit means a reviewer can see the contract without inferring it from what's exported.

**`parameter-properties`** forces the constructor-injection style the whole system uses:

```ts
// ✗ rejected
class ReactivateTaskUseCase {
  private readonly tasks: TaskRepository;
  constructor(tasks: TaskRepository) {
    this.tasks = tasks;
  }
}

// ✓ required
class ReactivateTaskUseCase {
  constructor(private readonly tasks: TaskRepository) {}
}
```

**`no-restricted-properties` on `process.env`** is the mechanical version of "a package never reads its own configuration." It is overridden in `apps/*/src/env.ts` and nowhere else — see Step 5.5.

---

## Step 5.3 — ESLint: the OOP rules

For `packages/{core,permissions,contracts,application,db,infrastructure,auth,composition,api-client,asset,content}` — every non-React package.

**`tooling/eslint-config/oop.js`**

```js
import tseslint from "typescript-eslint";
import { base } from "./base.js";

export default tseslint.config(...base, {
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector: "ExportNamedDeclaration > FunctionDeclaration",
        message: "No exported free functions. Put behaviour on a class (static if stateless).",
      },
      {
        selector:
          "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > ArrowFunctionExpression",
        message: "No exported arrow functions. Put behaviour on a class (static if stateless).",
      },
      {
        selector: "ExportDefaultDeclaration > FunctionDeclaration",
        message: "No exported free functions. Put behaviour on a class (static if stateless).",
      },
      {
        selector: "ClassBody > PropertyDefinition[static=true][readonly!=true]",
        message: "Static mutable state is banned — it leaks across requests and tests.",
      },
    ],
    "@typescript-eslint/no-extraneous-class": "off",
  },
});
```

### What this buys

The rule the architecture actually depends on:

```ts
// ✗ wrong — behaviour floating free of the data it operates on
export function canReactivate(caps: CapabilitySet, taskId: string) { ... }

// ✓ right — behaviour belongs to the thing that has the data
class CapabilitySet {
  public can(permission: PermissionKey, goalId?: string): boolean { ... }
}
```

Free functions are how a codebase loses its shape. `canReactivate` in a utils file gets copied, then diverges, and now there are two answers to the same permission question. A method on `CapabilitySet` cannot be copied without copying the class.

**`no-extraneous-class` is turned off on purpose.** It would flag `Uuid`, `Identifiers`, `ProcedurePermissions`, and `PermissionRegistry` — every static-only namespacing class. Those are the intended pattern here, not a smell.

**The static-mutable-state ban** is the one that catches a real production bug. A `static cache = new Map()` on a repository looks fine locally and serves user A's rows to user B under concurrency. `static readonly` is fine; `static` alone is not.

**Two exemptions the rules already handle:** Zod schemas and Drizzle tables are *data shapes*, not behaviour, and are declared as `static readonly` class members (Zod) or module-level `pgTable` consts (Drizzle). Neither trips the selectors above.

---

## Step 5.4 — ESLint: React and the server-only boundary

For `packages/{ui,feature,query}` and `apps/web`. Extends `base`, **not** `oop` — React components and hooks are functions by contract with the framework.

**`tooling/eslint-config/react.js`**

```js
import tseslint from "typescript-eslint";
import { base } from "./base.js";

export default tseslint.config(
  ...base,
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@ratchet/db",
                "@ratchet/db/*",
                "@ratchet/infrastructure",
                "@ratchet/infrastructure/*",
                "@ratchet/auth",
                "@ratchet/auth/*",
                "@ratchet/composition",
                "@ratchet/composition/*",
                "@ratchet/application",
                "@ratchet/application/*",
              ],
              message:
                "Server-only. Reachable from src/server/**, src/route/api/**, and *.server.ts only. Cross the boundary via @ratchet/contracts.",
            },
            {
              group: ["drizzle-orm", "drizzle-orm/*", "pg", "ioredis", "bullmq", "better-auth"],
              message: "Server-only dependency. It must never appear in a client bundle.",
            },
          ],
        },
      ],
    },
  },
  {
    // The server-only escape hatch — exactly two directories and one filename suffix.
    files: ["src/server/**", "src/route/api/**", "**/*.server.ts"],
    rules: {
      "no-restricted-imports": "off",
      "no-restricted-properties": "off",
    },
  },
);
```

That override block is the whole design: server-only packages are importable from **exactly two directories and one filename suffix**, and nowhere else in the web app. Everything else crosses the boundary through `@ratchet/contracts`, which is isomorphic by construction.

This is defence number one of three. The other two:

- **`ServerOnly.assert()`** at the top of every server-only barrel ([07](07-core-package.md)) — a runtime tripwire that throws if the module somehow loads in a browser.
- **The CI bundle grep** ([25](25-hygiene-and-ci.md)) — asserts a known Drizzle export string is absent from the built client output.

Three defences sounds excessive until you remember what a leak costs here. In a fullstack app, a Drizzle import reaching the client is a security event — connection strings and full table shapes in a public bundle — not a bundle-size regression.

### Two more restrictions for `packages/feature`

Add these in `packages/feature/eslint.config.js` specifically, on top of `react`:

```js
import react from "@ratchet/eslint-config/react";
import tseslint from "typescript-eslint";

export default tseslint.config(...react, {
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@ratchet/api-client", "@ratchet/api-client/*"],
            message:
              "Every read goes through a defined query in @ratchet/query. A raw client call inside a component is an uncached read that no invalidation touches.",
          },
          {
            group: ["@tanstack/react-router", "@tanstack/react-router/*"],
            message:
              "Routing lives in apps/web. Pass navigation in as an onNavigate prop or an href string.",
          },
        ],
      },
    ],
  },
});
```

Both bans are load-bearing. The first stops `await client.task.list()` appearing inside a component during a deadline — it works fine and becomes a read that no invalidation will ever touch. The second is what lets the Tauri webview mount `@ratchet/feature` under a different routing shell without changing a line.

---

## Step 5.5 — The `env.ts` exemption

`apps/web/eslint.config.js` and `apps/worker/eslint.config.js` each add:

```js
{
  files: ["src/env.ts"],
  rules: { "no-restricted-properties": "off" },
}
```

Two files in the entire repository may read `process.env`. That is what makes "config arrives through `ContainerConfig`" a checkable claim rather than a convention.

---

## Step 5.6 — Root config

**`eslint.config.js`** at the root:

```js
export { default } from "@ratchet/eslint-config/base";
```

Each package then has its own four-line `eslint.config.js` selecting the right variant:

```js
// packages/application/eslint.config.js
export { default } from "@ratchet/eslint-config/oop";
```

```js
// packages/ui/eslint.config.js
export { default } from "@ratchet/eslint-config/react";
```

And declares the dependency:

```json
"devDependencies": { "@ratchet/eslint-config": "workspace:*" }
```

---

## A note on turning these on

**Do not enable `oop.js` and `react.js` before there is real code.** During [06](06-package-anatomy.md) the packages hold placeholder classes and nothing else; the rules would only fight scaffolding. Scaffold with `base` everywhere, then switch each package to `oop` or `react` as you write its first real file — which is what the per-package `eslint.config.js` makes cheap.

---

## ✅ Gate

```bash
pnpm exec eslint --version
pnpm format:check
```

Both run without crashing. There is nothing to lint yet; the real check arrives in [07](07-core-package.md).

Do not proceed until this passes.

---

[← TypeScript Configs](04-typescript-configs.md) · [Package Anatomy →](06-package-anatomy.md)
