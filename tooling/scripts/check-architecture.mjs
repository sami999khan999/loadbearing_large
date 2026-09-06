// The rules types cannot express, checked as text.
//
// Every assertion here is deliberately a grep rather than a lint rule: it is
// independent of ESLint config, cannot be silenced by an inline comment, and keeps
// working if someone reorganises the lint setup. See docs/setup/26.
//
// Run: pnpm check:architecture

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const SKIP_DIRS = new Set(["node_modules", "dist", ".output", ".git", "migrations", "src-tauri"]);

const results = [];

// ── helpers ──────────────────────────────────────────────────────────────────

function walk(dir, extensions) {
  if (!existsSync(dir)) return [];
  const out = [];

  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);

    if (statSync(full).isDirectory()) out.push(...walk(full, extensions));
    else if (extensions.some((ext) => entry.endsWith(ext))) out.push(full);
  }

  return out;
}

function packageDirs() {
  const base = join(ROOT, "packages");
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .map((name) => join(base, name))
    .filter((dir) => existsSync(join(dir, "package.json")));
}

// Everything first-party. An assertion about how source is written has no reason to
// stop at `packages/` — an app is source someone reads too.
function sourceDirs() {
  const out = [...packageDirs()];
  const apps = join(ROOT, "apps");

  if (existsSync(apps)) {
    for (const name of readdirSync(apps)) {
      const dir = join(apps, name);
      if (existsSync(join(dir, "package.json"))) out.push(dir);
    }
  }

  return out;
}

// A generated file is not written by anyone, and `route-tree.gen.ts` asks in its own
// header to be excluded from every checker pointed at it.
function sourceFiles(dir) {
  return [
    ...walk(join(dir, "src"), [".ts", ".tsx"]),
    ...walk(join(dir, "tests"), [".ts", ".tsx"]),
  ].filter((file) => !/\.gen\.tsx?$/.test(file));
}

function rel(file) {
  return relative(ROOT, file).replaceAll("\\", "/");
}

// Import specifiers only — static, dynamic, and re-export. A specifier inside a
// comment or a string still counts, which is the correct bias for a boundary grep.
function specifiers(source) {
  const found = [];
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']/g,
    /\bimport\s+["']([^"']+)["']/g,
    /\brequire\s*\(\s*["']([^"']+)["']/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) found.push(match[1]);
  }

  return found;
}

function lineOf(source, needle) {
  const index = source.indexOf(needle);
  if (index === -1) return 1;
  return source.slice(0, index).split("\n").length;
}

function assert(name, run) {
  const failures = [];
  const skipped = run(failures);
  results.push({ name, failures, skipped });
}

// ── 1 — `application` imports no framework ───────────────────────────────────

const FRAMEWORKS = [
  "@orpc/",
  "@tanstack/",
  "@nestjs/",
  "drizzle-orm",
  "ioredis",
  "bullmq",
  "@aws-sdk/",
  "better-auth",
  "pg",
  "express",
  "fastify",
  "hono",
];

assert("`application` imports no framework", (failures) => {
  for (const file of walk(join(ROOT, "packages/application/src"), [".ts", ".tsx"])) {
    const source = readFileSync(file, "utf8");

    for (const specifier of specifiers(source)) {
      const banned = FRAMEWORKS.find((b) => specifier === b || specifier.startsWith(b));
      if (banned) {
        failures.push(`${rel(file)}:${lineOf(source, specifier)} imports ${specifier}`);
      }
    }
  }
});

// ── 2 — `application` does not log ───────────────────────────────────────────

assert("`application` does not log", (failures) => {
  for (const file of walk(join(ROOT, "packages/application/src"), [".ts", ".tsx"])) {
    const source = readFileSync(file, "utf8");

    if (specifiers(source).includes("@loadbearing/observability")) {
      failures.push(`${rel(file)} imports @loadbearing/observability — the domain does not log`);
    }
  }
});

// ── 3 — only `env.ts` reads `process.env` ────────────────────────────────────

// Must stay in step with Biome's `noProcessEnv` overrides in
// tooling/biome-config/src/base.json. A path exempted in one and not the other is either
// a gate that passes while the rule is broken, or a build that fails for no reason.
// Kept byte-for-byte in step with the `noProcessEnv` override in
// tooling/biome-config/src/base.json. Doc 26 assertion 3 calls drift between the two
// out by name: a gate that passes while the rule is broken, or a build that fails for
// no reason. Change one, change the other.
const ENV_EXEMPT = [
  /^apps\/[^/]+\/src\/env\.ts$/,
  /\.config\.(ts|mts|js|mjs)$/,
  // Every runnable script sits above `src/`, so a folder barrel can be imported without
  // executing one — see packages/infrastructure/seed.ts for the failure that moved them.
  /^packages\/auth\/tables\.ts$/,
  /^packages\/infrastructure\/(migrate|seed|smoke)\.ts$/,
];

assert("only `env.ts` reads `process.env`", (failures) => {
  const roots = [join(ROOT, "packages"), join(ROOT, "apps")];

  for (const root of roots) {
    // Every extension Biome lints and the exemption list names — walking only
    // `.ts` would leave `*.config.mjs` unchecked here but still checked by Biome.
    for (const file of walk(root, [".ts", ".tsx", ".mts", ".js", ".mjs"])) {
      const path = rel(file);
      if (ENV_EXEMPT.some((pattern) => pattern.test(path))) continue;

      const source = readFileSync(file, "utf8");
      if (/\bprocess\s*\.\s*env\b/.test(source)) {
        failures.push(`${path}:${lineOf(source, "process.env")} reads process.env`);
      }
    }
  }
});

// ── 4 — every `@orpc/*` entry is on one version line ─────────────────────────

assert("every `@orpc/*` entry is on one version line", (failures) => {
  const catalog = readFileSync(join(ROOT, "pnpm-workspace.yaml"), "utf8");
  const seen = new Map();

  for (const line of catalog.split("\n")) {
    if (line.trimStart().startsWith("#")) continue;
    const match = /^\s*"?(@orpc\/[a-z-]+)"?:\s*(\S+)/.exec(line);
    if (match) seen.set(match[1], match[2]);
  }

  const ranges = new Set(seen.values());
  if (seen.size === 0) failures.push("no @orpc/* entries found in pnpm-workspace.yaml");

  if (ranges.size > 1) {
    const detail = [...seen].map(([name, range]) => `${name}@${range}`).join(", ");
    failures.push(`${ranges.size} version lines across ${seen.size} packages — ${detail}`);
  }
});

// ── 5 — no block comments in src/ or tests/ ──────────────────────────────────
//
// docs/opinions/comments.md. A block comment always begins its own line once Biome
// has formatted the file, so anchoring to the line start cannot mistake a glob
// like "**/dist/**" inside a string for a comment.

assert("comments are `//`, never a block", (failures) => {
  for (const dir of sourceDirs()) {
    for (const file of sourceFiles(dir)) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, index) => {
          const trimmed = line.trimStart();
          // `{/*` is the JSX form and reads as an exemption if it is not named.
          if (trimmed.startsWith("/*") || trimmed.startsWith("{/*")) {
            failures.push(`${rel(file)}:${index + 1} block comment — use //`);
          }
        });
    }
  }
});

// ── 6 — no top-level await in a package barrel ───────────────────────────────
//
// A CJS consumer — the default NestJS and Express scaffold — reaches an ESM
// package through `require(esm)`, which is unflagged on Node 22.12+ but refuses
// any module graph containing a top-level await.

assert("no top-level await in a built barrel", (failures) => {
  let checked = 0;

  for (const dir of packageDirs()) {
    const bundle = join(dir, "dist/index.js");
    if (!existsSync(bundle)) continue;
    checked += 1;

    readFileSync(bundle, "utf8")
      .split("\n")
      .forEach((line, index) => {
        if (/^(await |(var|let|const) \w+ = await )/.test(line)) {
          failures.push(`${rel(bundle)}:${index + 1} top-level await breaks require() from CJS`);
        }
      });
  }

  if (checked === 0) return "no dist/ found — run `pnpm build:packages` first";
  return null;
});

// ── 7 — `"use client"` only where it belongs ─────────────────────────────────
//
// docs/setup/06. Marking an isomorphic package client-only is the failure mode:
// it breaks SSR of translated copy and authorization inside a Server Component.

const CLIENT_PACKAGES = new Set(["ui", "query", "feature"]);

assert('`"use client"` only in ui, query, feature', (failures) => {
  for (const dir of packageDirs()) {
    const name = dir.split(/[\\/]/).pop();
    if (CLIENT_PACKAGES.has(name)) continue;

    for (const file of walk(join(dir, "src"), [".ts", ".tsx"])) {
      const source = readFileSync(file, "utf8");
      if (/^\s*["']use client["']/m.test(source)) {
        failures.push(`${rel(file)} is isomorphic and must not declare a client boundary`);
      }
    }
  }
});

// ── 8 — no server code in the client bundle ──────────────────────────────────

const SERVER_FINGERPRINTS = ["drizzle-orm", "pg-pool", "@aws-sdk/client-s3", "ioredis", "bullmq"];
// One per key group in the `email` namespace, which `SERVER_CATALOG` alone can reach.
// Enumerated rather than the bare prefix `"email."`, which is a common enough substring
// in minified output to make this assertion fail on something unrelated.
const EMAIL_FINGERPRINTS = [
  "email.digest.",
  "email.verify.",
  "email.reset.",
  "email.change.",
  "email.otp.",
];

// Field names from the `env.ts` schemas, which no adapter drags in on its own — they
// arrive only when a route file or `router.tsx` imports `Env` for one accessor. That
// happened, and the grep above did not see it: `Env` imports no server *package*, so the
// bundle carried the whole server configuration surface and a `Schema.parse({})` that
// threw before the first render. These names are the fingerprint of the file itself.
const ENV_FINGERPRINTS = [
  "REDIS_QUEUE_URL",
  "S3_FORCE_PATH_STYLE",
  "AUTH_COOKIE_CACHE_MAX_AGE_SECONDS",
  // The OAuth client secret. It reaches `Env` and nothing else, and the sign-in page
  // deliberately learns whether Google is configured from the session snapshot rather
  // than from this schema — so its name in the bundle means that boundary was crossed.
  "GOOGLE_CLIENT_SECRET",
  "AUTH_ENROLMENT_MODE",
];
const ENTRY_FINGERPRINTS = ["সংরক্ষণ"];

const CLIENT_OUTPUTS = [
  "apps/web/.output/public/_build/assets",
  "apps/web/dist/client/assets",
  "apps/web/.output/public/assets",
];

assert("no server code in the client bundle", (failures) => {
  const dir = CLIENT_OUTPUTS.map((c) => join(ROOT, c)).find((c) => existsSync(c));
  if (!dir) return "apps/web has no client build — run `pnpm --filter @loadbearing/web build`";

  const assets = walk(dir, [".js", ".mjs", ".css"]);

  // A grep over an empty folder passes silently and gives false confidence forever.
  if (assets.length === 0) {
    failures.push(`${rel(dir)} contains no assets — the output path moved, fix this script`);
    return null;
  }

  for (const file of assets) {
    const source = readFileSync(file, "utf8");

    for (const print of [...SERVER_FINGERPRINTS, ...EMAIL_FINGERPRINTS, ...ENV_FINGERPRINTS]) {
      if (source.includes(print)) failures.push(`${rel(file)} contains "${print}"`);
    }
  }

  // A locale string in a lazily-loaded chunk is the split working as designed. It
  // is only a failure in the entry chunk, which is what "not a static import" means.
  const entry = assets.find((f) => /(^|[\\/])(index|entry|main)[.-][^\\/]*\.js$/.test(f));
  if (!entry) {
    failures.push("could not identify an entry chunk — fix this script rather than skipping");
    return null;
  }

  const entrySource = readFileSync(entry, "utf8");
  for (const print of ENTRY_FINGERPRINTS) {
    if (entrySource.includes(print)) {
      failures.push(`${rel(entry)} statically includes a non-English locale ("${print}")`);
    }
  }

  return null;
});

// ── 9 — every domain table declares organization_id ──────────────────────────
//
// The tenant column is the sharding key and the boundary every repository query
// narrows by. Drizzle tables are data, so no type can express this. See
// docs/opinions/data-and-scale.md.

const TENANT_EXEMPT = new Set([
  // It is the tenant.
  "organizations",
  // Better Auth owns these, and they are global by nature: one person has one login
  // and may belong to several organizations, so the tenant lives on `memberships`
  // rather than here. The names are the `modelName` values doc 16 chose — Better
  // Auth's own defaults are singular, and this list read `user`/`session`/`account`
  // for a while after the rename, which made the whole assertion vacuous for them.
  "users",
  "accounts",
  "verifications",
  "two_factors",
  "__drizzle_migrations",
  // `activity_log` is partitioned by time, not by tenant, so one monthly partition
  // holds every organization's rows and the archive object recording it is global.
  // A tenant column here would have no value to carry.
  "activity_archive",
]);

assert("every domain table declares `organization_id`", (failures) => {
  const dir = join(ROOT, "packages/infrastructure/src");
  if (!existsSync(dir)) return "packages/infrastructure has no src/ yet";

  const files = walk(dir, [".ts"]).filter((f) => f.endsWith(".schema.ts"));
  if (files.length === 0) return "no *.schema.ts files yet";

  for (const file of files) {
    const source = readFileSync(file, "utf8");

    // Both call shapes Biome produces: `pgTable("x", {...});` closes on `\n});`,
    // and the three-argument form with an index callback closes on `\n);`.
    // Matching only the latter is how this check silently passes on half the tables.
    for (const match of source.matchAll(/pgTable\(\s*["'`]([^"'`]+)["'`]([\s\S]*?)\n\}?\);/g)) {
      const [, table, body] = match;
      if (TENANT_EXEMPT.has(table)) continue;
      if (body.includes("organization_id")) continue;

      failures.push(`${rel(file)}: table "${table}" has no organization_id`);
    }
  }

  return null;
});

// ── 10 — the audit port is ActivityLogger, never AuditTrail ──────────────────
//
// The name drifted once already: the observability docs said AuditTrail while
// eleven other files said ActivityLogger. Two names for the audit port reads as
// two things, which is the exact confusion the audit/diagnostic split prevents.

assert("the audit port is `ActivityLogger`, never `AuditTrail`", (failures) => {
  for (const base of ["packages", "apps"]) {
    const dir = join(ROOT, base);
    if (!existsSync(dir)) continue;

    for (const file of walk(dir, [".ts", ".tsx", ".md"])) {
      const source = readFileSync(file, "utf8");
      if (source.includes("AuditTrail")) {
        failures.push(`${rel(file)}:${lineOf(source, "AuditTrail")} names AuditTrail`);
      }
    }
  }

  return null;
});

// ── 11 — the schema barrel names every *.schema.ts ───────────────────────
//
// An empty or incomplete barrel passes typecheck, lint, build, and every test:
// `import * as schema` from an empty module is legal and yields `{}`. The only tool
// that notices is drizzle-kit, and it notices by generating DROP TABLE for every
// table it can no longer see. That happened once. This is the guard.

assert("the schema barrel names every `*.schema.ts`", (failures) => {
  const dir = join(ROOT, "packages/infrastructure/src/pg/schema");
  if (!existsSync(dir)) return "packages/infrastructure has no schema/ yet";

  const barrel = join(dir, "index.ts");
  if (!existsSync(barrel)) {
    failures.push("packages/infrastructure/src/pg/schema/index.ts is missing");
    return null;
  }

  const source = readFileSync(barrel, "utf8");
  const files = walk(dir, [".ts"]).filter((file) => file.endsWith(".schema.ts"));

  if (files.length === 0) {
    failures.push("packages/infrastructure/src/pg/schema holds no *.schema.ts files");
    return null;
  }

  for (const file of files) {
    const specifier = `./${basename(file, ".ts")}.js`;
    if (!source.includes(specifier)) {
      failures.push(`${rel(barrel)} does not re-export ${specifier}`);
    }
  }

  return null;
});

// ── 12 — the rule files route to every opinions page ────────────────────────
//
// docs/ai/rules/*.md is a digest of docs/opinions/, and a digest is a second copy of
// every rule it states. The failure is not that it is wrong on the day it is written —
// it is that a tenth opinions page lands months later, no rule file mentions it, and
// every agent works from a rulebook missing a chapter while nothing says so.
//
// Three links, all checked. A page nothing cites is the missing chapter. A rule file
// nothing routes to is the same failure from the other end — it exists, it is correct,
// and no agent will ever open it. And a route to a renamed page sends a reader nowhere.

const RULES_DIR = "docs/ai/rules";

assert("the rule files route to every opinions page", (failures) => {
  const brief = join(ROOT, "AGENTS.md");
  const rulesDir = join(ROOT, RULES_DIR);

  if (!existsSync(brief)) {
    failures.push("AGENTS.md is missing — it is the router every agent reads first");
    return null;
  }
  if (!existsSync(rulesDir)) {
    failures.push(`${RULES_DIR} is missing — AGENTS.md is a router with nothing to route to`);
    return null;
  }

  const ruleFiles = readdirSync(rulesDir).filter((f) => f.endsWith(".md"));
  if (ruleFiles.length === 0) {
    failures.push(`${RULES_DIR} holds no rule files`);
    return null;
  }

  // Three files may route to a rule file: the root brief, the docs/ai task router, and
  // the rulebook's own contents page. A file reachable from none of them exists, is
  // correct, and will never be opened.
  const briefSource = readFileSync(brief, "utf8");
  const routerPaths = [join(ROOT, "docs/ai/index.md"), join(rulesDir, "index.md")];
  const routers = [
    briefSource,
    ...routerPaths.filter(existsSync).map((f) => readFileSync(f, "utf8")),
  ].join(" ");

  // Every rule file is reachable. `index.md` is a router itself, so it is exempt from
  // needing a route into it beyond AGENTS.md, which is checked immediately after.
  for (const file of ruleFiles) {
    if (file === "index.md") continue;
    if (!routers.includes(file)) {
      failures.push(
        `${RULES_DIR}/${file} is routed to from none of AGENTS.md, docs/ai/index.md, or ${RULES_DIR}/index.md`,
      );
    }
  }

  if (!briefSource.includes("docs/ai/index.md") && !briefSource.includes(`${RULES_DIR}/index.md`)) {
    failures.push("AGENTS.md points at neither docs/ai/index.md nor the rulebook contents");
  }

  // CLAUDE.md `@`-imports every rule file, which is what makes the rulebook load at the
  // start of a session instead of when an agent thinks to go looking. A rule nobody
  // imports is the failure this whole assertion exists for, one layer up: it is routed
  // to, it is correct, and it silently stops being loaded. Skipped when CLAUDE.md is
  // absent — it is Claude Code's file, and deleting it is a supported choice that leaves
  // the routers above as the only path in.
  const claudeMd = join(ROOT, "CLAUDE.md");

  if (existsSync(claudeMd)) {
    const claudeSource = readFileSync(claudeMd, "utf8");
    const imported = new Set(
      [...claudeSource.matchAll(/^@(\S+\.md)\s*$/gm)].map((match) => match[1]),
    );

    for (const file of ruleFiles) {
      if (file === "index.md") continue;
      if (!imported.has(`${RULES_DIR}/${file}`)) {
        failures.push(`CLAUDE.md does not @-import ${RULES_DIR}/${file}, so it never loads`);
      }
    }

    // An import naming a moved or deleted file fails silently — Claude Code inlines
    // nothing and says nothing, which is the same missing chapter from the other side.
    for (const target of imported) {
      if (!existsSync(join(ROOT, target))) {
        failures.push(`CLAUDE.md @-imports ${target}, which does not exist`);
      }
    }
  }

  // Every opinions page is cited by at least one rule file — the drift guard.
  const opinions = join(ROOT, "docs/opinions");
  if (!existsSync(opinions)) return "docs/opinions does not exist";

  // `index.md` is the human reading order, not a rule page — the digest replaces it
  // rather than pointing at it, so requiring a citation would be noise.
  const pages = readdirSync(opinions).filter((f) => f.endsWith(".md") && f !== "index.md");
  if (pages.length === 0) return "docs/opinions holds no pages";

  const digest = ruleFiles.map((f) => readFileSync(join(rulesDir, f), "utf8")).join("\n");

  for (const page of pages) {
    if (!digest.includes(`docs/opinions/${page}`)) {
      failures.push(`no file in ${RULES_DIR} cites docs/opinions/${page}`);
    }
  }

  // A route to a page that has been moved or renamed sends a reader somewhere that does
  // not exist, which is worse than no route at all. Both forms count: a backticked path
  // and a Markdown link target. Matching only the first is how deleting a rule file used
  // to pass — AGENTS.md links it as `](docs/ai/rules/folders.md)`, which the backtick
  // pattern never saw, and a second file citing the same opinions page hid the gap.
  const sources = [
    [rel(brief), briefSource, dirname(brief)],
    ...routerPaths.filter(existsSync).map((f) => [rel(f), readFileSync(f, "utf8"), dirname(f)]),
    ...ruleFiles.map((f) => [
      `${RULES_DIR}/${f}`,
      readFileSync(join(rulesDir, f), "utf8"),
      rulesDir,
    ]),
  ];

  for (const [name, text, base] of sources) {
    const routed = new Set();

    for (const match of text.matchAll(/`(docs\/[A-Za-z0-9._/-]+\.md)`/g)) {
      routed.add(join(ROOT, match[1]));
    }
    for (const match of text.matchAll(/\]\(([^)]+\.md)\)/g)) {
      const target = match[1];
      if (target.startsWith("http")) continue;
      routed.add(target.startsWith("docs/") ? join(ROOT, target) : resolve(base, target));
    }

    for (const path of routed) {
      if (!existsSync(path)) {
        failures.push(`${name} routes to ${rel(path)}, which does not exist`);
      }
    }
  }

  return null;
});

// ── 13 — every folder under docs/ has an index.md ───────────────────────────
//
// A folder with no index is a folder you can only navigate by listing it, and a reader
// who lands in one has to guess which file is the entry point. The same reasoning as
// the index.ts rule one level down: the index is what lets a page move within a folder
// without every link to the folder breaking.
//
// `reference/` folders are exempt by name. Their parent index.md names every page and
// meta.json carries the ordering, so an index inside would restate the parent and rot
// the first time a page landed in one and not the other. The exemption is by name
// rather than by location because docs/infra/reference/ now sits inside docs/ — the
// same folder role, and the same reason.

assert("every folder under `docs/` has an `index.md`", (failures) => {
  const root = join(ROOT, "docs");
  if (!existsSync(root)) return "docs/ does not exist";

  const folders = [root];

  for (let i = 0; i < folders.length; i += 1) {
    for (const entry of readdirSync(folders[i])) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(folders[i], entry);
      if (statSync(full).isDirectory()) folders.push(full);
    }
  }

  for (const folder of folders) {
    if (basename(folder) === "reference") continue;

    // A folder holding no Markdown holds nothing an index could name.
    const pages = readdirSync(folder).filter((f) => f.endsWith(".md"));
    if (pages.length === 0) continue;

    if (!existsSync(join(folder, "index.md"))) {
      failures.push(`${rel(folder)} has ${pages.length} page(s) and no index.md`);
    }
  }

  return null;
});

// ── 14 — no comment block over two lines ─────────────────────────────────────
//
// docs/opinions/comments.md. A third consecutive line is an argument, and an
// argument belongs in the package's docs/reference/ where it gets reviewed as prose.

// A separator carries no prose and a pragma is instruction to a tool, so neither is
// a line a reader has to hold. Both end a run rather than extending it.
const COMMENT_EXEMPT = /^\/\/\s*(──|biome-ignore|eslint-disable|eslint-enable|@ts-)/;

const COMMENT_CEILING = 2;

assert("no comment block over two lines", (failures) => {
  for (const dir of sourceDirs()) {
    for (const file of sourceFiles(dir)) {
      const lines = readFileSync(file, "utf8").split("\n");
      let start = 0;
      let run = 0;

      const close = () => {
        if (run > COMMENT_CEILING) {
          failures.push(`${rel(file)}:${start} ${run}-line comment block — ceiling is two`);
        }
        run = 0;
      };

      lines.forEach((line, index) => {
        const trimmed = line.trim();

        if (!trimmed.startsWith("//") || COMMENT_EXEMPT.test(trimmed)) {
          close();
          return;
        }

        if (run === 0) start = index + 1;
        run += 1;
      });

      close();
    }
  }
});

// ── 15 — every backticked path in the docs exists ───────────────────────────
//
// The cheapest class of documentation rot, and the one a reader trusts most: a path
// in backticks reads as a fact about the tree. `docs/setup/15` sent readers to
// `src/cache/` for two months, which is not a folder this repository has ever had.
//
// Only paths are checked, and a path is recognised conservatively — see PATH_SHAPE.
// A false positive here is worse than a miss: it teaches people to add exemptions.

const DOC_ROOTS = ["docs", "README.md", "AGENTS.md", "CLAUDE.md"];

// A backticked span that names a file or folder in this repository. It must contain a
// `/` or end in a known source extension, so `useState` and `owner` are not paths.
const PATH_SHAPE =
  /^(?:packages|apps|docs|tooling|infra|tasks|\.github|\.husky)\/[\w./@{},*$()[\]-]+$|^[\w.-]+\.(?:ts|tsx|mjs|mts|js|json|jsonc|md|css|sql|yml|yaml)$/;

// Written as a shape rather than a real path: a brace set, a glob, a route parameter,
// or an ellipsis is a description of several files and cannot be resolved to one.
const PATH_PLACEHOLDER = /[{}*<>]|\.\.\.|…|\$\{/;

// Real, and deliberately not on disk.
const PATH_EXEMPT = [
  // Both are named only as things that do not exist: the desktop shell doc 30
  // describes, and the Nest app `src/server/` would move to "if NestJS ever arrives".
  /^apps\/desktop/,
  /^apps\/api/,
  // A generated artefact, present only after a build.
  /^apps\/web\/src\/route-tree\.gen\.ts$/,
  /^apps\/web\/\.output\//,
  /\/dist\//,
  // Untracked by design.
  /^\.env$/,
  /\/\.env$/,
];

// A trailing `:12` or `:12-40` is a line reference, not part of the filename.
const stripLines = (path) => path.replace(/:\d+(?:[-,]\d+)*$/, "");

function docFiles() {
  const out = [];

  for (const entry of DOC_ROOTS) {
    const full = join(ROOT, entry);
    if (!existsSync(full)) continue;
    if (statSync(full).isDirectory()) out.push(...walk(full, [".md"]));
    else out.push(full);
  }

  for (const dir of sourceDirs()) {
    out.push(...walk(join(dir, "docs"), [".md"]));
  }

  return out;
}

// The package or app a doc belongs to, so `docs/reference/x.md` inside it resolves the
// way its reader does. `null` for the repository's own docs/, which have no owner.
function ownerOf(file) {
  for (const dir of sourceDirs()) {
    if (file.startsWith(`${dir}/`)) return dir;
  }
  return null;
}

// A path the page already tells its reader is not on disk: a slice the setup docs teach
// by building but do not ship, or a file a step deleted. Marking one is the author's
// job — say so on the line that names it — and honouring the marker is this one's.
const UNBUILT = /illustrative|not written yet|does not exist|removed|deleted|☐/i;

// Fenced blocks are code and diagrams: an ASCII tree is full of names that are not
// paths, and a snippet's imports resolve against the file it would live in, not here.
// A collapsed `<details>` block is a historical listing kept for comparison, which is
// the one place a page is deliberately describing a tree that is gone.
function outsideFences(source) {
  const kept = [];
  let fenced = false;
  let collapsed = false;
  // A heading can carry the marker for the list under it — "What this removed" is a
  // section of paths that are gone, and repeating the word per bullet reads worse.
  let section = false;

  for (const line of source.split("\n")) {
    const trimmed = line.trimStart();

    if (trimmed.startsWith("```")) {
      fenced = !fenced;
      kept.push("");
      continue;
    }
    if (trimmed.startsWith("<details")) collapsed = true;
    if (trimmed.startsWith("#")) section = UNBUILT.test(line);

    kept.push(fenced || collapsed || section || UNBUILT.test(line) ? "" : line);

    if (trimmed.startsWith("</details>")) collapsed = false;
  }

  return kept;
}

assert("every backticked path in the docs exists", (failures) => {
  for (const file of docFiles()) {
    const lines = outsideFences(readFileSync(file, "utf8"));

    lines.forEach((line, index) => {
      for (const [, span] of line.matchAll(/`([^`\n]+)`/g)) {
        const candidate = stripLines(span.trim());

        if (PATH_PLACEHOLDER.test(candidate)) continue;
        if (!PATH_SHAPE.test(candidate)) continue;
        if (PATH_EXEMPT.some((pattern) => pattern.test(candidate))) continue;

        // A bare filename names a file whose folder the sentence around it supplies.
        if (!candidate.includes("/")) continue;

        // `docs/reference/x.md` means the page beside the doc that writes it, and the
        // opinions pages write it generically — "the package's `docs/reference/`".
        // So a `docs/…` span resolves against any package that has one, and only then
        // against the repository root.
        const owner = ownerOf(file);
        const roots = candidate.startsWith("docs/")
          ? [...(owner ? [owner] : []), ...sourceDirs(), ROOT]
          : [ROOT];

        if (!roots.some((base) => existsSync(join(base, candidate)))) {
          failures.push(`${rel(file)}:${index + 1} \`${candidate}\` does not exist`);
        }
      }
    });
  }
});

// ── 16 — the two pnpm version declarations agree ─────────────────────────────
//
// `pnpm/action-setup` reads `packageManager` and nothing else; pnpm 11 reads
// `devEngines.packageManager`. Both have to exist and say the same thing. See
// docs/setup/26-hygiene-and-ci.md.

assert("both pnpm version declarations agree", (failures) => {
  const manifest = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const modern = manifest.devEngines?.packageManager;
  const legacy = manifest.packageManager;

  // Declaring only the modern one is what left CI red on every branch for weeks: the
  // action fails in seconds with "No pnpm version is specified" and nothing runs.
  if (!legacy) {
    failures.push("package.json has no `packageManager` — `pnpm/action-setup` reads only that");
    return null;
  }
  if (!modern) {
    failures.push("package.json has no `devEngines.packageManager` — pnpm 11 reads only that");
    return null;
  }

  const expected = `${modern.name}@${modern.version}`;
  if (legacy !== expected) {
    failures.push(`packageManager is \`${legacy}\`, devEngines says \`${expected}\``);
  }

  return null;
});

// ── report ───────────────────────────────────────────────────────────────────

let failed = 0;
let skippedCount = 0;

for (const { name, failures, skipped } of results) {
  if (failures.length > 0) {
    failed += 1;
    console.log(`✗ ${name}`);
    for (const detail of failures) console.log(`    ${detail}`);
  } else if (skipped) {
    skippedCount += 1;
    console.log(`○ ${name} — skipped: ${skipped}`);
  } else {
    console.log(`✓ ${name}`);
  }
}

if (failed > 0) {
  console.log(`\n${failed} of ${results.length} assertions failed.`);
  process.exit(1);
}

const passed = results.length - skippedCount;

if (skippedCount === 0) {
  console.log(`\n${passed} assertions passed.`);
  process.exit(0);
}

// Counted apart, never summed: a skip is an assertion that did not run, and printing
// "16 assertions passed" over two `○` lines is how an unbuilt artefact reads as green.
console.log(`\n${passed} passed, ${skippedCount} skipped, of ${results.length}.`);

// Locally a skip is a fast loop; in CI it is a check nobody ran and nobody will.
if (process.env.CI === "true") {
  console.log("A skipped assertion is unverified. Build the artefacts it needs first.");
  process.exit(1);
}
