# 06 · Package Anatomy

> The three config files every package has, its `src/` and `docs/`, why the `development` export condition exists, and a one-shot script that creates all fifteen.

**Delivers:** Fifteen structurally identical packages with placeholder classes, wired into a real dependency graph and building in topological order.

**Prerequisite:** [05 · Lint & Format](05-lint-and-format.md)

---

## The anatomy

Every package in `packages/` has exactly these three config files at its root, plus `src/` and
`docs/`:

```
packages/<name>/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── src/
│   └── index.ts        ← the only public entrypoint
└── docs/
    ├── meta.json       ← title, description, page order
    ├── index.md        ← what this package is for
    └── reference/      ← every page beyond the overview
        └── meta.json   ← group label and page order
```

**`docs/` is reference material, not build order.** Plain Markdown with YAML frontmatter —
never MDX — so it renders on GitHub today and can be picked up by a documentation site later
without touching the content.

**Only `index.md` and `meta.json` sit at the `docs/` root; everything else goes in
`reference/`.** `index.md` is the page a reader lands on — what the package is for, how it is
consumed, the decisions that shaped it. `reference/` holds the pages they consult afterwards,
with its own `meta.json` giving the group a sidebar label and ordering its pages. A small
package is one `index.md` and an empty `reference/`.

Callouts use GitHub alert syntax (`> [!NOTE]`, `> [!WARNING]`, `> [!CAUTION]`), which renders
natively on GitHub and maps cleanly onto a callout component later.

See `tooling/tsconfig/docs/` and `tooling/eslint-config/docs/` for worked examples of the
convention.

> [!NOTE]
> `docs/` is not in the `files` array and never ships — the published surface is `dist` only.
> It is also currently excluded from `pnpm format`, because `.prettierignore` contains a bare
> `docs/`, which matches at any depth. Narrow that to `/docs/` if you want package docs
> format-managed.

### `package.json` — the shape

```json
{
  "name": "@loadbearing/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "development": "./src/index.ts",
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "clean": "rimraf dist"
  },
  "devDependencies": {
    "@loadbearing/tsconfig": "workspace:*",
    "rimraf": "catalog:",
    "tsup": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

**The `development` export condition is the one non-obvious line.** With it, and with `resolve.conditions: ["development"]` in `apps/web/vite.config.ts` ([24](24-web-app.md)), Vite resolves `@loadbearing/core` straight to `src/index.ts`. Editing a package hot-reloads the browser with no rebuild step. Without it you consume `dist/` and every package edit needs `pnpm build:packages` before the change appears.

The condition order matters: `development` first, then `types`, then `default`. Node and tsup ignore `development` entirely and fall through to `default`, so production builds are unaffected.

**`type: "module"` everywhere.** ESM only. oRPC is ESM-only, TanStack Start is ESM, Node 24 is fine with it. There is no CJS build target anywhere in this repo, which removes an entire class of dual-package-hazard problems.

**`private: true` everywhere.** Nothing here is published. `files: ["dist"]` is belt-and-braces in case that ever changes.

### `tsup.config.ts` — identical in every package

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2024",
});
```

> [!NOTE]
> **`clean` is `rimraf dist` and nothing else.** Two reasons it carries no `*.tsbuildinfo` glob:
>
> - Nothing produces one. `incremental` is deliberately absent from the shared tsconfig base ([04](04-typescript-configs.md)) because it breaks tsup's declaration build, so `tsc --noEmit` writes no build info.
> - **rimraf 6 does not expand globs unless you pass `--glob`.** Handed a literal `*.tsbuildinfo`, it fails on Windows with `Error: Illegal characters in path` (`EINVAL`), because `*` is not a legal filename character there. On Linux the same command silently succeeds while deleting nothing — so the bug is cross-platform and only *visible* on Windows.
>
> If you ever do need a glob in a `clean` script, write `rimraf --glob "dist" "*.tsbuildinfo"`.

One entry point per package. A package with multiple entrypoints is a package that wants splitting — the two exceptions (`@loadbearing/asset`'s CSS and SVG side-effect exports) are handled in [19](19-asset-package.md) and are not JavaScript.

### `tsconfig.json`

```json
{
  "extends": "@loadbearing/tsconfig/library.json",
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

> [!NOTE]
> **No lint script and no lint config.** Biome and ESLint each run once over the whole repo from the root ([05](05-lint-and-format.md)), keyed on file globs rather than per-package files. Fifteen fewer config files, and no package can quietly opt itself out of a rule.

### `src/index.ts` — the barrel

Every package has exactly one public entrypoint. Consumers write `import { Clock } from "@loadbearing/core"` and never `from "@loadbearing/core/dist/clock.js"`. The barrel is what makes internal reorganisation free: moving `clock.ts` into `time/clock.ts` is a one-line edit in `index.ts` and nobody downstream notices.

Subject folders get their own `index.ts` that the root barrel re-exports — **naming every symbol, never `export *`** ([29](29-naming-and-boundaries.md#13-barrels-and-imports)):

```ts
// packages/contracts/src/index.ts
export { type AppContract, contract } from "./contract-router.js";
export { Envelope, Identifiers, Pagination, type TaskId } from "./primitive/index.js";
export { ProcedurePermissions } from "./procedure-permissions.js";
export { TaskContract, TaskEntity, TaskProcedures } from "./task/index.js";
```

The named list is what makes the public surface a decision rather than a side effect: `export *` republishes anything a file exports, so widening the API becomes invisible in review. Biome's `noReExportAll` ([05](05-lint-and-format.md)) fails the build on a star, and `biome check --write` sorts the statements and the specifiers for you.

Note the `.js` extensions on relative imports throughout. `moduleResolution: "Bundler"` doesn't require them, but `NodeNext` in `apps/worker` does, and writing them everywhere means code moves between the two without an edit.

---

## Step 6.1 — The scaffold script

Fifteen structurally identical packages. Scripting it avoids fifteen chances to make a typo.

Create **`scaffold.mjs`** at the repo root:

```js
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// name → [PlaceholderClass, entry extension, extra devDependencies]
const PACKAGES = {
  core: ["Core", "ts", {}],
  permissions: ["Permissions", "ts", {}],
  errors: ["Errors", "ts", {}],
  contracts: ["Contracts", "ts", {}],
  application: ["Application", "ts", {}],
  db: ["Db", "ts", { "drizzle-kit": "catalog:", tsx: "catalog:", "@types/pg": "catalog:" }],
  infrastructure: ["Infrastructure", "ts", { "@types/node": "catalog:" }],
  auth: ["Auth", "ts", { "@types/node": "catalog:" }],
  composition: ["Composition", "ts", {}],
  asset: ["Asset", "ts", {}],
  content: ["Content", "ts", {}],
  "api-client": ["ApiClient", "ts", {}],
  query: ["Query", "tsx", { react: "catalog:react", "@types/react": "catalog:react" }],
  ui: ["Ui", "tsx", { react: "catalog:react", "@types/react": "catalog:react" }],
  feature: ["Feature", "tsx", { react: "catalog:react", "@types/react": "catalog:react" }],
};

for (const [name, [cls, ext, extraDev]] of Object.entries(PACKAGES)) {
  const dir = join("packages", name);
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "docs"), { recursive: true });

  const pkg = {
    name: `@loadbearing/${name}`,
    version: "0.0.0",
    private: true,
    type: "module",
    main: "./dist/index.js",
    types: "./dist/index.d.ts",
    exports: {
      ".": {
        development: `./src/index.${ext}`,
        types: "./dist/index.d.ts",
        default: "./dist/index.js",
      },
    },
    files: ["dist"],
    scripts: {
      build: "tsup",
      dev: "tsup --watch",
      typecheck: "tsc --noEmit",
      test: "vitest run --passWithNoTests",
      clean: "rimraf dist",
    },
    devDependencies: {
      "@loadbearing/tsconfig": "workspace:*",
      rimraf: "catalog:",
      tsup: "catalog:",
      typescript: "catalog:",
      vitest: "catalog:",
      ...extraDev,
    },
    ...(ext === "tsx"
      ? { peerDependencies: { react: "catalog:react", "react-dom": "catalog:react" } }
      : {}),
  };

  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");

  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify(
      {
        extends: ext === "tsx" ? "@loadbearing/tsconfig/react.json" : "@loadbearing/tsconfig/library.json",
        include: ["src/**/*.ts", "src/**/*.tsx"],
      },
      null,
      2,
    ) + "\n",
  );

  writeFileSync(
    join(dir, "tsup.config.ts"),
    `import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.${ext}"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2024",
});
`,
  );

  writeFileSync(
    join(dir, `src/index.${ext}`),
    `/** Placeholder so the package has a real export. Replaced in the feature steps. */
export class ${cls}Package {
  public static readonly id = "@loadbearing/${name}";
}
`,
  );

  mkdirSync(join(dir, "docs/reference"), { recursive: true });

  writeFileSync(
    join(dir, "docs/meta.json"),
    JSON.stringify({ title: name, description: "", pages: ["index", "reference"] }, null, 2) +
      "\n",
  );

  writeFileSync(
    join(dir, "docs/reference/meta.json"),
    JSON.stringify({ title: "Reference", description: "", pages: [] }, null, 2) + "\n",
  );

  writeFileSync(
    join(dir, "docs/index.md"),
    `---
title: "@loadbearing/${name}"
description: TODO — one sentence on what this package is for.
---

# \`@loadbearing/${name}\`

> TODO — written when the package gets its first real file.

| | |
| --- | --- |
| **Package** | \`@loadbearing/${name}\` (private, never published) |
| **Entrypoint** | \`src/index.${ext}\` |
| **Depends on** | — |
| **Used by** | — |
`,
  );

  console.log(`scaffolded packages/${name}`);
}
```

```bash
node scaffold.mjs
```

```bash
node -e "require('fs').unlinkSync('scaffold.mjs')"
```
> Delete it. It is a one-shot, and leaving it invites someone to re-run it over real code.

**On React as a peer:** `query`, `ui`, and `feature` get React as a **peerDependency plus a devDependency**, never a plain dependency. Two copies of React in one tree produces "invalid hook call" errors that look like a bug in your components and take a day to trace.

**The peer ranges are `catalog:react`, not `^19`.** pnpm accepts the catalog protocol in `peerDependencies`, and using it means React's version lives in exactly one place — which is the whole point of the catalog, and also what stops two copies appearing. A literal `^19` here is flagged by `syncpack` as drift from the catalog.

---

## Step 6.2 — Wire the dependency graph

**One command per package, in this order.** `db` depends on `application`, so `application` must be declared first for the graph to resolve cleanly on the first pass.

### `@loadbearing/core`
No runtime dependencies. It is the root of the graph and depends on nothing at all — not even other `@loadbearing/*` packages — so it loads in a browser, a Node worker, a Tauri webview, or a test file.

### `@loadbearing/permissions`
```bash
pnpm add --filter @loadbearing/permissions @loadbearing/core@workspace:*
```
> The registry and `CapabilitySet` need only primitives. Deliberately no database and no HTTP: this package must run identically on the server, in the browser, in the worker, and later in the Tauri webview. That identity is what makes "one permission model" true rather than aspirational.

### `@loadbearing/errors`
No runtime dependencies. Like `core` and `permissions` it is a leaf, and for the same reason: a failure has to be constructible and readable in the use-case that throws it, the transport that maps it, the component that renders it, and the worker that logs it. Any dependency would exclude one of those. See [09](09-errors-package.md).

### `@loadbearing/contracts`
```bash
pnpm add --filter @loadbearing/contracts @loadbearing/core@workspace:* @loadbearing/permissions@workspace:* @loadbearing/errors@workspace:* zod@catalog: @orpc/contract@catalog:
```
> `zod` for schemas, `@orpc/contract` for the contract router. It depends on `permissions` because entity methods like `canBeEditedBy()` take a `CapabilitySet`, and on `errors` because a procedure declares the failures it can produce.

### `@loadbearing/application`
```bash
pnpm add --filter @loadbearing/application @loadbearing/core@workspace:* @loadbearing/contracts@workspace:* @loadbearing/permissions@workspace:*
```
> Three workspace dependencies and **zero third-party ones**. That is the point of this package. It talks to everything outside itself through abstract `port/` classes.
>
> If a third-party runtime dependency ever needs adding here, stop and look hard — it almost always means infrastructure leaked into the domain.

### `@loadbearing/db`
```bash
pnpm add --filter @loadbearing/db @loadbearing/core@workspace:* @loadbearing/contracts@workspace:* @loadbearing/permissions@workspace:* @loadbearing/application@workspace:* drizzle-orm@catalog: pg@catalog:
```
> **Why `db` depends on `application`:** the ports are abstract classes living in `application`, and this package's concrete classes extend them. Adapters depend inward on the domain; the domain depends on nothing. `application` never imports `db`, so there is no cycle.
>
> `drizzle-kit`, `tsx`, and `@types/pg` arrived as devDependencies from the scaffold — build-time only, they must not ship. Server-only package.

### `@loadbearing/infrastructure`
```bash
pnpm add --filter @loadbearing/infrastructure @loadbearing/core@workspace:* @loadbearing/application@workspace:* ioredis@catalog: bullmq@catalog: @aws-sdk/client-s3@catalog: @aws-sdk/s3-request-presigner@catalog:
```
> The non-Postgres adapters: Redis cache, S3 storage gateway, BullMQ queue publisher. Same inward dependency as `db` — it implements ports declared in `application`. Server-only.
>
> This is a departure from the architecture docs; see the note in [00](00-README.md) and the rationale in [15](15-infrastructure-package.md).

### `@loadbearing/auth`
```bash
pnpm add --filter @loadbearing/auth @loadbearing/core@workspace:* @loadbearing/contracts@workspace:* @loadbearing/permissions@workspace:* @loadbearing/application@workspace:* @loadbearing/db@workspace:* @loadbearing/infrastructure@workspace:* better-auth@catalog:
```
> Better Auth's instance, the session resolver, `PrincipalBuilder`, the capability cache, and API keys. It needs `db` for the Drizzle adapter and `infrastructure` for the Redis cache. Server-only, and never imported by `apps/web`'s component tree.

### `@loadbearing/composition`
```bash
pnpm add --filter @loadbearing/composition @loadbearing/core@workspace:* @loadbearing/application@workspace:* @loadbearing/db@workspace:* @loadbearing/infrastructure@workspace:* @loadbearing/auth@workspace:* @loadbearing/content@workspace:*
```
> The DI root. It is the only package that knows both the abstract ports and every concrete implementation, because wiring them together is its entire job. Server-only.

### `@loadbearing/asset`
```bash
pnpm add --filter @loadbearing/asset zod@catalog:
```
> Every binary the product ships. **No React here** — icons are SVG files compiled into a sprite at build time, not components — so this package stays importable by React-free consumers like `content`.

### `@loadbearing/content`
```bash
pnpm add --filter @loadbearing/content @loadbearing/core@workspace:* @loadbearing/asset@workspace:* zod@catalog:
```
> React-free on purpose: `apps/worker` needs copy for digest and escalation emails and cannot import `feature`.

### `@loadbearing/api-client`
```bash
pnpm add --filter @loadbearing/api-client @loadbearing/core@workspace:* @loadbearing/contracts@workspace:* @orpc/client@catalog: better-auth@catalog:
```
> Depends on `contracts` but **not** on `db` or `application` — the client knows the shape of the API, never its implementation. `better-auth` is here for its *vanilla* client only (`better-auth/client`), never `better-auth/react`.
>
> **No `@tanstack/*` and no `react` here, ever.** This package must load in plain Node scripts, integration tests, and any non-React host.

### `@loadbearing/query`
```bash
pnpm add --filter @loadbearing/query @loadbearing/core@workspace:* @loadbearing/contracts@workspace:* @loadbearing/api-client@workspace:* @tanstack/react-query@catalog: @orpc/tanstack-query@catalog:
```
> **The only package that may import `@tanstack/*`.** It must not import `@tanstack/react-router` — routing stays in `apps/web`, which is what lets the Tauri app reuse everything above it.

### `@loadbearing/ui`
```bash
pnpm add --filter @loadbearing/ui @loadbearing/asset@workspace:*
```
> Its only runtime workspace dependency, and an acceptable one: `asset` is a leaf with no domain knowledge, so `ui` stays independently testable and extractable. No `contracts`, no `query`, no `content` — everything else arrives as props.

### `@loadbearing/feature`
```bash
pnpm add --filter @loadbearing/feature @loadbearing/ui@workspace:* @loadbearing/query@workspace:* @loadbearing/content@workspace:* @loadbearing/contracts@workspace:* @loadbearing/permissions@workspace:*
```
> Fetches and mutates through `@loadbearing/query`, never through `@loadbearing/api-client` directly.

---

## Step 6.3 — Install and build

```bash
pnpm install
```
> Resolves everything and creates the workspace symlinks.

```bash
pnpm build:packages
```

**Read the build log.** This is the gate that matters. `core` must complete before `permissions`, which completes before `contracts`, which completes before `application`, and so on through `composition`. That ordering is pnpm reading your dependency graph — nothing declares it anywhere — and it is the proof the workspace is wired correctly.

If two packages that should be ordered build in parallel, one of them is missing a `workspace:*` dependency. Fix it now; a missing edge in the graph produces intermittent build failures later that look like flakiness.

---

## The resulting dependency graph

```
core
 ├── permissions ──┐
 │                 ├── contracts ──┐
 │                 │               ├── application ──┬── db ────┐
 │                 │               │                 │          ├── auth ──┐
 │                 │               │                 └── infra ─┘          ├── composition
 │                 │               │                                       │
 │                 │               └── api-client ── query ── feature      │
 │                 │                                    │                  │
 │                 └────────────────────────────────────┘                  │
 │                                                                          │
 asset ── content ─────────────────────────────────────────────────────────┘
   └── ui ── feature
```

Nothing ever points upward. `application` sits at the centre and knows nothing below it.

---

## ✅ Gate

`packages/` contains fifteen directories. Every `packages/*/dist/` holds `index.js` and `index.d.ts`. The build log shows topological ordering.

```bash
pnpm check && pnpm typecheck && pnpm lint && pnpm test
```

All pass. **`pnpm check` comes first on purpose:** the scaffold writes its JSON with `JSON.stringify(…, null, 2)`, which puts short arrays on multiple lines, and Biome formats them inline. Without that step the very next `pnpm lint` reports ~30 formatting diagnostics that are not mistakes.

Commit:

```bash
git add -A
git commit -m "chore(repo): scaffold fifteen packages and wire the dependency graph"
```

Do not proceed until this passes.

---

[← Lint & Format](05-lint-and-format.md) · [`@loadbearing/core` →](07-core-package.md)
