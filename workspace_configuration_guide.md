# Workspace Configuration & Scripts Guide

This document provides a complete guide to the monorepo configuration files—[`package.json`](./package.json) and [`pnpm-workspace.yaml`](./pnpm-workspace.yaml)—as well as a detailed reference for every script defined in the root workspace.

---

## 1. Overview of Monorepo Files

> [!NOTE]
> This project uses **pnpm 11** with native features like **pnpm Catalogs** for dependency centralization and **`allowBuilds`** for install script security.

### [`package.json`](./package.json)

The root manifest of the workspace. It specifies:

- **Project Scope**: `loadbearing` (private module).
- **Engine Rules**: Forces Node.js `>=24.0.0` and pnpm `>=11.21.0`.
- **Scripts**: Entrypoints for build, dev, lint, test, docker, database, and repository linters.
- **Catalogs Reference**: Uses `"catalog:"` to pull dependency versions from `pnpm-workspace.yaml`.

### [`pnpm-workspace.yaml`](./pnpm-workspace.yaml)

The PNPM workspace configuration file. It specifies:

- **Package Globs**: `apps/*`, `packages/*`, and `tooling/*`.
- **Catalogs**: Shared dependency version specifications (default catalog and `react` catalog).
- **Strict Resolution**: `engineStrict`, `linkWorkspacePackages`, `preferWorkspacePackages`, `saveWorkspaceProtocol`.
- **`allowBuilds`**: Whitelist of third-party packages allowed to execute build/install scripts (e.g., `esbuild`, `sharp`).

---

## 2. Complete Scripts Reference

| Script Name                    | Command                                                            | Description                                                                            |
| :----------------------------- | :----------------------------------------------------------------- | :------------------------------------------------------------------------------------- |
| **Build Scripts**              |                                                                    |                                                                                        |
| `build`                        | `pnpm -r --if-present run build`                                   | Recursively builds all packages and apps across the entire monorepo.                   |
| `build:packages`               | `pnpm --filter "./packages/*" --if-present run build`              | Builds only the shared packages located in `packages/*`.                               |
| `build:changed`                | `pnpm -r --filter "...[origin/main]" --if-present run build`       | Builds only packages modified relative to `origin/main` (and their dependents).        |
| **Development Scripts**        |                                                                    |                                                                                        |
| `dev`                          | `pnpm build:packages && pnpm -r --parallel --if-present run dev`   | Builds shared packages, then runs dev servers in parallel across all apps.             |
| `dev:web`                      | `pnpm build:packages && pnpm --filter @loadbearing/web run dev`    | Builds shared packages, then starts the web frontend (`@loadbearing/web`).             |
| `dev:worker`                   | `pnpm build:packages && pnpm --filter @loadbearing/worker run dev` | Builds shared packages, then starts the background worker app (`@loadbearing/worker`). |
| **Code Quality & Maintenance** |                                                                    |                                                                                        |
| `typecheck`                    | `pnpm -r --if-present run typecheck`                               | Runs TypeScript type checking (`tsc --noEmit`) across all workspace packages.          |
| `lint`                         | `pnpm -r --parallel --if-present run lint`                         | Runs ESLint in parallel across all packages.                                           |
| `test`                         | `pnpm -r --parallel --if-present run test`                         | Executes unit/integration test suites (e.g. Vitest) in parallel across packages.       |
| `clean`                        | `pnpm -r --parallel --if-present run clean`                        | Deletes build outputs (`dist`, `.cache`) across all packages.                          |
| `format`                       | `prettier --write "**/*.{ts,tsx,md,json,yaml,yml}"`                | Formats code, markdown, and config files with Prettier.                                |
| `format:check`                 | `prettier --check "**/*.{ts,tsx,md,json,yaml,yml}"`                | Verifies code formatting in CI without making edits.                                   |
| **Infrastructure (Docker)**    |                                                                    |                                                                                        |
| `infra:up`                     | `docker compose -f infra/docker-compose.yml up -d`                 | Launches infrastructure services (Postgres, Redis) in background daemon mode.          |
| `infra:down`                   | `docker compose -f infra/docker-compose.yml down`                  | Stops running Docker infrastructure containers.                                        |
| `infra:reset`                  | `docker compose -f infra/docker-compose.yml down -v`               | Stops Docker containers and destroys all persistent data volumes (`-v`).               |
| **Database Operations**        |                                                                    |                                                                                        |
| `db:generate`                  | `pnpm --filter @loadbearing/db run db:generate`                    | Generates new SQL migrations from Drizzle ORM schema definitions.                      |
| `db:migrate`                   | `pnpm --filter @loadbearing/db run db:migrate`                     | Applies pending Drizzle migrations to the database.                                    |
| `db:seed`                      | `pnpm --filter @loadbearing/db run db:seed`                        | Fills the database with initial seed/mock data.                                        |
| `db:studio`                    | `pnpm --filter @loadbearing/db run db:studio`                      | Launches Drizzle Studio web GUI for database inspection.                               |
| **Auth Generation**            |                                                                    |                                                                                        |
| `auth:generate`                | `pnpm --filter @loadbearing/auth run auth:generate`                | Generates Better Auth schema / client code artifacts.                                  |
| **Monorepo Auditing**          |                                                                    |                                                                                        |
| `deps:check`                   | `syncpack list-mismatches`                                         | Inspects `package.json` files to flag version mismatches across the monorepo.          |
| `repo:check`                   | `sherif`                                                           | Runs `sherif` to lint monorepo structure, dependencies, and workspace protocols.       |

---

## 3. Detailed Command Breakdown

### 🏗️ Build Commands

- **`build`**

  ```bash
  pnpm -r run build
  ```

  _`-r` (recursive)_: Traverses every package defined in `apps/*`, `packages/*`, and `tooling/*` and runs its individual `build` script in topological dependency order.

- **`build:packages`**

  ```bash
  pnpm --filter "./packages/*" run build
  ```

  _`--filter`_: Limits target execution specifically to internal shared libraries under `./packages/` (e.g., `@loadbearing/db`, `@loadbearing/auth`, `@loadbearing/ui`).

- **`build:changed`**
  ```bash
  pnpm -r --filter "...[origin/main]" run build
  ```
  _`...[origin/main]`_: Git diff-aware filter. It identifies packages changed since `origin/main` and includes any downstream packages that depend on them (`...`).

---

### 🚀 Development Commands

- **`dev`**

  ```bash
  pnpm build:packages && pnpm -r --parallel run dev
  ```

  Pre-builds internal package dependencies first, then uses `--parallel` to stream logs simultaneously from all app dev servers without blocking each other.

- **`dev:web`**

  ```bash
  pnpm build:packages && pnpm --filter @loadbearing/web run dev
  ```

  Pre-builds shared packages and starts only the web client app.

- **`dev:worker`**
  ```bash
  pnpm build:packages && pnpm --filter @loadbearing/worker run dev
  ```
  Pre-builds shared packages and starts only the async background worker process.

---

### 🧹 Quality & Formatting

- **`typecheck`**

  ```bash
  pnpm -r run typecheck
  ```

  Validates TypeScript types across all sub-packages to catch type errors before bundling.

- **`lint` & `test`**

  ```bash
  pnpm -r --parallel run lint
  pnpm -r --parallel run test
  ```

  Runs linting (ESLint) and testing (Vitest) in parallel across all workspace packages for maximum speed.

- **`clean`**

  ```bash
  pnpm -r --parallel run clean
  ```

  Cleans build artifacts (`dist`, build caches) across packages.

- **`format` & `format:check`**
  ```bash
  prettier --write "**/*.{ts,tsx,md,json,yaml,yml}"
  prettier --check "**/*.{ts,tsx,md,json,yaml,yml}"
  ```
  Uses Prettier to either auto-fix formatting (`format`) or check formatting in CI (`format:check`).

---

### 🐳 Infrastructure & Services

- **`infra:up`** / **`infra:down`** / **`infra:reset`**
  ```bash
  docker compose -f infra/docker-compose.yml up -d
  docker compose -f infra/docker-compose.yml down
  docker compose -f infra/docker-compose.yml down -v
  ```
  Manages Docker container lifecycle for local development dependencies (e.g. Postgres database, Redis cache). Use `infra:reset` when you need to clear all persistent database volumes.

---

### 🗄️ Database & Auth Operations

- **`db:generate` / `db:migrate` / `db:seed` / `db:studio`**

  ```bash
  pnpm --filter @loadbearing/db run db:generate
  pnpm --filter @loadbearing/db run db:migrate
  pnpm --filter @loadbearing/db run db:seed
  pnpm --filter @loadbearing/db run db:studio
  ```

  Executes Drizzle ORM commands scoped specifically to `@loadbearing/db`.

- **`auth:generate`**
  ```bash
  pnpm --filter @loadbearing/auth run auth:generate
  ```
  Executes authentication code generation scoped to `@loadbearing/auth`.

---

### 🔍 Monorepo Linters

- **`deps:check`** (`syncpack list-mismatches`)
  Ensures that if multiple packages depend on the same external dependency, they require matching versions across `package.json` files.

- **`repo:check`** (`sherif`)
  Fast Rust-based monorepo linter that checks for unused dependencies, missing workspace protocols (`workspace:*`), and duplicate packages.
