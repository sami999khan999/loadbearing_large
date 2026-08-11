# 02 · Repository Skeleton

> The four top-level folders and the six root files, created by hand. Nothing is installed yet.

**Delivers:** A repository whose shape already encodes the architecture, before a single dependency exists.

**Prerequisite:** [01 · Prerequisites](01-prerequisites.md)

---

## Step 2.1 — Create the root

```bash
mkdir ratchet
cd ratchet
git init
```

```bash
mkdir apps packages tooling infra
```

Four directories, and the split between them is the architecture:

| Directory | Holds | Rule |
|---|---|---|
| `apps/` | Framework code — TanStack Start, the worker's Node entrypoint, a Tauri desktop shell later | The only place `process.env` is read. The only place `@tanstack/react-router` appears. Deliberately thin enough to delete and rewrite in a week. |
| `packages/` | Everything that matters — primitives, permissions, contracts, use-cases, adapters, React components | Knows nothing about which web framework you use. Never reads its own configuration. |
| `tooling/` | Shared `tsconfig`, ESLint, and Prettier configs, published as workspace packages | Changed rarely, by whoever owns the platform. |
| `infra/` | `docker-compose.yml` and anything else that describes running services | No application code. |

`packages/` gets subdirectories in [06](06-package-anatomy.md) — leave it empty for now.

---

## Step 2.2 — Root files

Create these six in your editor.

### `.nvmrc`

```
24
```
> `fnm use` and `nvm use` read it, and CI reads it via `node-version-file` so the pipeline can never drift from your machine.

### `.gitattributes`

```gitattributes
* text=auto eol=lf
*.png binary
*.jpg binary
*.jpeg binary
*.webp binary
*.ico binary
*.woff2 binary
*.svg text eol=lf
pnpm-lock.yaml linguist-generated=true -diff
```
> **Do not skip this on a mixed-OS team.** It forces LF in the repository regardless of any developer's local setting — the other half of `core.autocrlf input`. The binary declarations stop Git attempting line-ending translation on `@ratchet/asset`'s images and fonts, which corrupts them silently. `svg` is text on purpose: the icon sprite is generated and should diff readably. The lockfile line collapses a 4,000-line diff in every dependency PR.

### No `.npmrc`

There is deliberately no `.npmrc` in this repository. **pnpm 11 reads only registry and authentication settings from INI files** — every other setting must live in `pnpm-workspace.yaml`, which is where [03](03-workspace-and-catalogs.md) puts them.

Add one later only if you publish to a private registry, and then it holds credentials and nothing else. Putting `link-workspace-packages` or `engine-strict` in an `.npmrc` today is a silent no-op: pnpm will not read it and will not warn you.

### `.gitignore`

```gitignore
node_modules/
dist/
.output/
.nitro/
.tanstack/
coverage/
*.tsbuildinfo
.env
.env.*
!.env.example
.DS_Store
out/
release/
```
> `.env.*` is ignored and `.env.example` is force-included. That asymmetry is what stops `.env.production` reaching the repo while keeping the template versioned.

### `.env.example`

```ini
# ── Postgres ─────────────────────────────────────────────
DATABASE_URL=postgres://ratchet:ratchet@localhost:5432/ratchet

# ── Redis (cache, sessions, BullMQ) ──────────────────────
REDIS_URL=redis://localhost:6379

# ── S3 / MinIO ───────────────────────────────────────────
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=ratchet
S3_ACCESS_KEY=ratchet
S3_SECRET_KEY=ratchetsecret
S3_FORCE_PATH_STYLE=true

# ── Auth ─────────────────────────────────────────────────
AUTH_SECRET=change-me-generate-with-openssl-rand-base64-32
AUTH_URL=http://localhost:3000
AUTH_TRUSTED_ORIGINS=http://localhost:3000

# ── AI / embeddings ──────────────────────────────────────
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
OPENAI_API_KEY=

# ── App ──────────────────────────────────────────────────
NODE_ENV=development
WEB_PORT=3000
```
> Every variable that will ever be read, present from day one with a working local value. `S3_FORCE_PATH_STYLE` is `true` for MinIO and `false` for real AWS — having the switch here now means the production difference is a value, not a code change. `EMBEDDING_DIMENSIONS` is here because the pgvector column type depends on it, and changing it later is a migration ([13](13-vector-store.md)).

Copy it:

```bash
node -e "require('fs').copyFileSync('.env.example', '.env')"
```
> Cross-platform. `cp` doesn't exist in PowerShell and `copy` doesn't exist in bash; Node does both.

### `.editorconfig`

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```
> The third leg of the line-ending fix, and the one that works in editors that have no Prettier plugin.

### `README.md`

```markdown
# ratchet

pnpm workspaces · TanStack Start + oRPC · standalone worker · Postgres + pgvector · Redis · S3

## Getting started

    pnpm install
    node -e "require('fs').copyFileSync('.env.example', '.env')"
    pnpm infra:up
    pnpm db:migrate && pnpm db:seed
    pnpm dev

Web: http://localhost:3000 · MinIO console: http://localhost:9001

See `docs/` for the architecture and the build order.
```

---

## Step 2.3 — First commit

```bash
git add -A
git commit -m "chore(repo): repository skeleton"
```

Committing now, before `pnpm install`, means `.gitattributes` is already in force when the first thousand files arrive. Doing it in the other order means running `git add --renormalize .` later and explaining an enormous diff.

---

## What the tree looks like now

```
ratchet/
├── .editorconfig
├── .env                 (ignored)
├── .env.example
├── .gitattributes
├── .gitignore
├── .nvmrc
├── README.md
├── apps/                (empty)
├── infra/               (empty)
├── packages/            (empty)
└── tooling/             (empty)
```

---

## ✅ Gate

`git status` is clean. `git log` shows one commit. `cat .env` prints the variables.

Do not proceed until this passes.

---

[← Prerequisites](01-prerequisites.md) · [Workspace & Catalogs →](03-workspace-and-catalogs.md)
