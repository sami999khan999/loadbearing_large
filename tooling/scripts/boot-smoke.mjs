// Boots a built app, waits for the line that says it is up, then asks it to stop.
//
// The hole this closes: every check in CI runs against source. Nothing ever started a
// process, so a missing environment variable — `env.ts` parses at module load — was
// invisible until a deploy. See docs/setup/26.
//
// Run: node tooling/scripts/boot-smoke.mjs worker

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// One entry per app that can be booted headlessly. `web` is absent on purpose: its
// server bundle throws `jsxDEV is not a function` — `T-034` in tasks/TODO.md.
const APPS = {
  worker: {
    entry: "apps/worker/dist/main.js",
    build: "pnpm --filter @loadbearing/worker build",
    started: "process.started",
    stopped: "process.stopped",
  },
};

const TIMEOUT_MS = 60_000;

const name = process.argv[2];
const app = Object.hasOwn(APPS, name) ? APPS[name] : undefined;

if (!app) {
  console.error(`usage: boot-smoke.mjs <${Object.keys(APPS).join("|")}>`);
  process.exit(2);
}

const entry = join(ROOT, app.entry);

if (!existsSync(entry)) {
  console.error(`✗ ${name}: ${app.entry} does not exist — run \`${app.build}\` first`);
  process.exit(1);
}

const child = spawn(process.execPath, [entry], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });

let output = "";
let signalled = false;

const fail = (why) => {
  console.error(`✗ ${name}: ${why}`);
  if (output.trim()) console.error(output.trim());
  if (child.exitCode === null) child.kill("SIGKILL");
  process.exit(1);
};

const timer = setTimeout(
  () => fail(`no \`${app.started}\` within ${TIMEOUT_MS / 1000}s`),
  TIMEOUT_MS,
);

const read = (chunk) => {
  output += chunk;

  // On the *first* sighting only: `process.started` is emitted once, but a consumer
  // could log something containing it and a second SIGTERM would race the drain.
  if (!signalled && output.includes(`"event":"${app.started}"`)) {
    signalled = true;
    console.log(`✓ ${name}: booted`);
    child.kill("SIGTERM");
  }
};

child.stdout.on("data", read);
child.stderr.on("data", read);

child.on("error", (error) => fail(`could not spawn — ${error.message}`));

child.on("exit", (code, signal) => {
  clearTimeout(timer);

  if (!signalled) return fail(`exited during boot (code ${code}, signal ${signal})`);
  // A drain that ends on the signal rather than on its own is a drain that did not
  // finish — the whole reason to send SIGTERM rather than kill the process.
  if (code !== 0) return fail(`did not exit cleanly on SIGTERM (code ${code}, signal ${signal})`);
  if (!output.includes(`"event":"${app.stopped}"`))
    return fail(`no \`${app.stopped}\` on shutdown`);

  console.log(`✓ ${name}: drained and exited cleanly`);
});
