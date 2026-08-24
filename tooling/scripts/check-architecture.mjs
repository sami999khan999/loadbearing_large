// The rules types cannot express, checked as text.
//
// Every assertion here is deliberately a grep rather than a lint rule: it is
// independent of ESLint config, cannot be silenced by an inline comment, and keeps
// working if someone reorganises the lint setup. See docs/setup/26.
//
// Run: pnpm check:architecture

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
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

const ENV_EXEMPT = [
  /^apps\/[^/]+\/src\/env\.ts$/,
  /\.config\.(ts|mts|js|mjs)$/,
  /^packages\/db\/src\/migrate\.ts$/,
  /^packages\/db\/src\/seed\//,
  /^packages\/[^/]+\/src\/smoke\.ts$/,
];

assert("only `env.ts` reads `process.env`", (failures) => {
  const roots = [join(ROOT, "packages"), join(ROOT, "apps")];

  for (const root of roots) {
    for (const file of walk(root, [".ts", ".tsx"])) {
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
  for (const dir of packageDirs()) {
    const files = [
      ...walk(join(dir, "src"), [".ts", ".tsx"]),
      ...walk(join(dir, "tests"), [".ts", ".tsx"]),
    ];

    for (const file of files) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, index) => {
          if (line.trimStart().startsWith("/*")) {
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
const EMAIL_FINGERPRINTS = ["email.digest."];
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

    for (const print of [...SERVER_FINGERPRINTS, ...EMAIL_FINGERPRINTS]) {
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

// ── report ───────────────────────────────────────────────────────────────────

let failed = 0;

for (const { name, failures, skipped } of results) {
  if (failures.length > 0) {
    failed += 1;
    console.log(`✗ ${name}`);
    for (const detail of failures) console.log(`    ${detail}`);
  } else if (skipped) {
    console.log(`○ ${name} — skipped: ${skipped}`);
  } else {
    console.log(`✓ ${name}`);
  }
}

if (failed > 0) {
  console.log(`\n${failed} of ${results.length} assertions failed.`);
  process.exit(1);
}

console.log(`\n${results.length} assertions passed.`);
