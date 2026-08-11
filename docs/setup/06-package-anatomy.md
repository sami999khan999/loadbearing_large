# 06 · Package Anatomy

> The five files every package has, why the `development` export condition exists, and a one-shot script that creates all fourteen.

**Delivers:** Fourteen structurally identical packages with placeholder classes, wired into a real dependency graph and building in topological order.

**Prerequisite:** [05 · Lint & Format](05-lint-and-format.md)

---

## The anatomy

Every package in `packages/` has exactly these five files at its root, plus `src/`:

```
packages/<name>/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── eslint.config.js
└── src/
    └── index.ts        ← the only public entrypoint
```

### `package.json` — the shape

```json
{
  "name": "@ratchet/core",
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
    "lint": "eslint src",
    "test": "vitest run",
    "clean": "rimraf dist *.tsbuildinfo"
  },
  "devDependencies": {
    "@ratchet/tsconfig": "workspace:*",
    "@ratchet/eslint-config": "workspace:*",
    "rimraf": "catalog:",
    "tsup": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

**The `development` export condition is the one non-obvious line.** With it, and with `resolve.conditions: ["development"]` in `apps/web/vite.config.ts` ([23](23-web-app.md)), Vite resolves `@ratchet/core` straight to `src/index.ts`. Editing a package hot-reloads the browser with no rebuild step. Without it you consume `dist/` and every package edit needs `pnpm build:packages` before the change appears.

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

One entry point per package. A package with multiple entrypoints is a package that wants splitting — the two exceptions (`@ratchet/asset`'s CSS and SVG side-effect exports) are handled in [18](18-asset-package.md) and are not JavaScript.

### `tsconfig.json`

```json
{
  "extends": "@ratchet/tsconfig/library.json",
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

### `eslint.config.js`

```js
export { default } from "@ratchet/eslint-config/base";
```
> Switch to `/oop` or `/react` when the package gets its first real file. See the note at the end of [05](05-lint-and-format.md).

### `src/index.ts` — the barrel

Every package has exactly one public entrypoint. Consumers write `import { Clock } from "@ratchet/core"` and never `from "@ratchet/core/dist/clock.js"`. The barrel is what makes internal reorganisation free: moving `clock.ts` into `time/clock.ts` is a one-line edit in `index.ts` and nobody downstream notices.

Subject folders get their own `index.ts` that the root barrel re-exports:

```ts
// packages/contracts/src/index.ts
export * from "./primitive/index.js";
export * from "./task/index.js";
export * from "./contract-router.js";
export * from "./procedure-permissions.js";
```

Note the `.js` extensions on relative imports throughout. `moduleResolution: "Bundler"` doesn't require them, but `NodeNext` in `apps/worker` does, and writing them everywhere means code moves between the two without an edit.

---

## Step 6.1 — The scaffold script

Fourteen structurally identical packages. Scripting it avoids fourteen chances to make a typo.

Create **`scaffold.mjs`** at the repo root:

```js
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// name → [PlaceholderClass, entry extension, extra devDependencies]
const PACKAGES = {
  core: ["Core", "ts", {}],
  permissions: ["Permissions", "ts", {}],
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

  const pkg = {
    name: `@ratchet/${name}`,
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
      lint: "eslint src",
      test: "vitest run --passWithNoTests",
      clean: "rimraf dist *.tsbuildinfo",
    },
    devDependencies: {
      "@ratchet/tsconfig": "workspace:*",
      "@ratchet/eslint-config": "workspace:*",
      rimraf: "catalog:",
      tsup: "catalog:",
      typescript: "catalog:",
      vitest: "catalog:",
      ...extraDev,
    },
    ...(ext === "tsx" ? { peerDependencies: { react: "^19", "react-dom": "^19" } } : {}),
  };

  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");

  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify(
      {
        extends: ext === "tsx" ? "@ratchet/tsconfig/react.json" : "@ratchet/tsconfig/library.json",
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
  target: "es2023",
});
`,
  );

  writeFileSync(
    join(dir, "eslint.config.js"),
    `export { default } from "@ratchet/eslint-config/base";\n`,
  );

  writeFileSync(
    join(dir, `src/index.${ext}`),
    `/** Placeholder so the package has a real export. Replaced in the feature steps. */
export class ${cls}Package {
  public static readonly id = "@ratchet/${name}";
}
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

---

## Step 6.2 — Wire the dependency graph

**One command per package, in this order.** `db` depends on `application`, so `application` must be declared first for the graph to resolve cleanly on the first pass.

### `@ratchet/core`
No runtime dependencies. It is the root of the graph and depends on nothing at all — not even other `@ratchet/*` packages — so it loads in a browser, a Node worker, a Tauri webview, or a test file.

### `@ratchet/permissions`
```bash
pnpm add --filter @ratchet/permissions @ratchet/core@workspace:*
```
> The registry and `CapabilitySet` need only primitives. Deliberately no database and no HTTP: this package must run identically on the server, in the browser, in the worker, and later in the Tauri webview. That identity is what makes "one permission model" true rather than aspirational.

### `@ratchet/contracts`
```bash
pnpm add --filter @ratchet/contracts @ratchet/core@workspace:* @ratchet/permissions@workspace:* zod@catalog: @orpc/contract@catalog:
```
> `zod` for schemas, `@orpc/contract` for the contract router. It depends on `permissions` because entity methods like `canBeEditedBy()` take a `CapabilitySet`.

### `@ratchet/application`
```bash
pnpm add --filter @ratchet/application @ratchet/core@workspace:* @ratchet/contracts@workspace:* @ratchet/permissions@workspace:*
```
> Three workspace dependencies and **zero third-party ones**. That is the point of this package. It talks to everything outside itself through abstract `port/` classes.
>
> If a third-party runtime dependency ever needs adding here, stop and look hard — it almost always means infrastructure leaked into the domain.

### `@ratchet/db`
```bash
pnpm add --filter @ratchet/db @ratchet/core@workspace:* @ratchet/contracts@workspace:* @ratchet/permissions@workspace:* @ratchet/application@workspace:* drizzle-orm@catalog: pg@catalog:
```
> **Why `db` depends on `application`:** the ports are abstract classes living in `application`, and this package's concrete classes extend them. Adapters depend inward on the domain; the domain depends on nothing. `application` never imports `db`, so there is no cycle.
>
> `drizzle-kit`, `tsx`, and `@types/pg` arrived as devDependencies from the scaffold — build-time only, they must not ship. Server-only package.

### `@ratchet/infrastructure`
```bash
pnpm add --filter @ratchet/infrastructure @ratchet/core@workspace:* @ratchet/application@workspace:* ioredis@catalog: bullmq@catalog: @aws-sdk/client-s3@catalog: @aws-sdk/s3-request-presigner@catalog:
```
> The non-Postgres adapters: Redis cache, S3 storage gateway, BullMQ queue publisher. Same inward dependency as `db` — it implements ports declared in `application`. Server-only.
>
> This is the fourteenth package and a departure from the architecture docs; see the note in [00](00-README.md) and the rationale in [14](14-infrastructure-package.md).

### `@ratchet/auth`
```bash
pnpm add --filter @ratchet/auth @ratchet/core@workspace:* @ratchet/contracts@workspace:* @ratchet/permissions@workspace:* @ratchet/application@workspace:* @ratchet/db@workspace:* @ratchet/infrastructure@workspace:* better-auth@catalog:
```
> Better Auth's instance, the session resolver, `PrincipalBuilder`, the capability cache, and API keys. It needs `db` for the Drizzle adapter and `infrastructure` for the Redis cache. Server-only, and never imported by `apps/web`'s component tree.

### `@ratchet/composition`
```bash
pnpm add --filter @ratchet/composition @ratchet/core@workspace:* @ratchet/application@workspace:* @ratchet/db@workspace:* @ratchet/infrastructure@workspace:* @ratchet/auth@workspace:* @ratchet/content@workspace:*
```
> The DI root. It is the only package that knows both the abstract ports and every concrete implementation, because wiring them together is its entire job. Server-only.

### `@ratchet/asset`
```bash
pnpm add --filter @ratchet/asset zod@catalog:
```
> Every binary the product ships. **No React here** — icons are SVG files compiled into a sprite at build time, not components — so this package stays importable by React-free consumers like `content`.

### `@ratchet/content`
```bash
pnpm add --filter @ratchet/content @ratchet/core@workspace:* @ratchet/asset@workspace:* zod@catalog:
```
> React-free on purpose: `apps/worker` needs copy for digest and escalation emails and cannot import `feature`.

### `@ratchet/api-client`
```bash
pnpm add --filter @ratchet/api-client @ratchet/core@workspace:* @ratchet/contracts@workspace:* @orpc/client@catalog: better-auth@catalog:
```
> Depends on `contracts` but **not** on `db` or `application` — the client knows the shape of the API, never its implementation. `better-auth` is here for its *vanilla* client only (`better-auth/client`), never `better-auth/react`.
>
> **No `@tanstack/*` and no `react` here, ever.** This package must load in plain Node scripts, integration tests, and any non-React host.

### `@ratchet/query`
```bash
pnpm add --filter @ratchet/query @ratchet/core@workspace:* @ratchet/contracts@workspace:* @ratchet/api-client@workspace:* @tanstack/react-query @orpc/tanstack-query@catalog:
```
> **The only package that may import `@tanstack/*`.** It must not import `@tanstack/react-router` — routing stays in `apps/web`, which is what lets the Tauri app reuse everything above it.

### `@ratchet/ui`
```bash
pnpm add --filter @ratchet/ui @ratchet/asset@workspace:*
```
> Its only runtime workspace dependency, and an acceptable one: `asset` is a leaf with no domain knowledge, so `ui` stays independently testable and extractable. No `contracts`, no `query`, no `content` — everything else arrives as props.

### `@ratchet/feature`
```bash
pnpm add --filter @ratchet/feature @ratchet/ui@workspace:* @ratchet/query@workspace:* @ratchet/content@workspace:* @ratchet/contracts@workspace:* @ratchet/permissions@workspace:*
```
> Fetches and mutates through `@ratchet/query`, never through `@ratchet/api-client` directly.

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

`packages/` contains fourteen directories. Every `packages/*/dist/` holds `index.js` and `index.d.ts`. The build log shows topological ordering.

```bash
pnpm typecheck && pnpm lint
```

Both pass. Commit:

```bash
git add -A
git commit -m "chore(repo): scaffold fourteen packages and wire the dependency graph"
```

Do not proceed until this passes.

---

[← Lint & Format](05-lint-and-format.md) · [`@ratchet/core` →](07-core-package.md)
