// Boots a built app, waits for the line that says it is up, then asks it to stop.
//
// The hole this closes: every check in CI runs against source. Nothing ever started a
// process, so a missing environment variable — `env.ts` parses at module load — was
// invisible until a deploy. See docs/setup/26.
//
// Run: node tooling/scripts/boot-smoke.mjs worker | web

// @ts-check

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// One entry per app that can be booted headlessly. `started` is the literal text in the
// process's own output that means the socket is open, not a shape this script imposes.
const APPS = {
  worker: {
    entry: "apps/worker/dist/main.js",
    build: "pnpm --filter @loadbearing/worker build",
    started: '"event":"process.started"',
    stopped: '"event":"process.stopped"',
  },
  web: {
    entry: "apps/web/.output/server/index.mjs",
    build: "pnpm --filter @loadbearing/web build",
    // Nitro's own line, and it means a module loaded — which is exactly what `T-032`
    // also meant while every page answered 500. The probe below is the real assertion.
    started: "Listening on:",
    // `/`, not `/api/health`. The health route renders no JSX and reports its
    // dependencies, so it answers 200 through the bug this exists to catch and 503
    // through a ClickHouse nobody started. See docs/setup/26-hygiene-and-ci.md, step 26.4d.
    probe: "/",
  },
};

const TIMEOUT_MS = 60_000;

const name = process.argv[2] ?? "";
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

// A port the kernel just handed out and nothing else holds, rather than a constant that
// collides with the dev server a developer left running.
function freePort() {
  return new Promise((keep, drop) => {
    const socket = createServer();
    socket.on("error", drop);
    socket.listen(0, "127.0.0.1", () => {
      const address = socket.address();
      const port = typeof address === "object" && address ? address.port : 0;
      socket.close(() => keep(port));
    });
  });
}

const port = app.probe ? await freePort() : 0;

const child = spawn(process.execPath, [entry], {
  cwd: ROOT,
  stdio: ["ignore", "pipe", "pipe"],
  env: app.probe ? { ...process.env, PORT: String(port) } : process.env,
});

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

// A request that completes, with a body, from the built bundle. `T-032` was a server
// that imported cleanly, listened, and answered 500 on every page.
async function serves() {
  const url = `http://127.0.0.1:${port}${app.probe}`;
  const response = await fetch(url);
  const body = await response.text();

  if (response.status !== 200) fail(`${app.probe} answered ${response.status}`);
  if (body.trim().length === 0) fail(`${app.probe} answered 200 with an empty body`);

  console.log(`✓ ${name}: ${app.probe} answered 200, ${body.length} bytes`);
}

const read = (chunk) => {
  output += chunk;

  // On the *first* sighting only: the line is printed once, but a consumer could log
  // something containing it and a second SIGTERM would race the drain.
  if (!signalled && output.includes(app.started)) {
    signalled = true;
    console.log(`✓ ${name}: booted`);

    if (!app.probe) return child.kill("SIGTERM");
    serves().then(
      () => child.kill("SIGTERM"),
      (error) => fail(`${app.probe} could not be reached — ${error.message}`),
    );
  }
};

child.stdout.on("data", read);
child.stderr.on("data", read);

child.on("error", (error) => fail(`could not spawn — ${error.message}`));

child.on("exit", (code, signal) => {
  clearTimeout(timer);

  if (!signalled) return fail(`exited during boot (code ${code}, signal ${signal})`);

  // Only an app with a drain has a clean exit to assert. The web server holds no queue,
  // and on Windows SIGTERM is a terminate rather than a signal a process can catch.
  if (!app.stopped) return console.log(`✓ ${name}: served, then stopped`);

  // A drain that ends on the signal rather than on its own is a drain that did not
  // finish — the whole reason to send SIGTERM rather than kill the process.
  if (code !== 0) return fail(`did not exit cleanly on SIGTERM (code ${code}, signal ${signal})`);
  if (!output.includes(app.stopped)) return fail(`no \`${app.stopped}\` on shutdown`);

  console.log(`✓ ${name}: drained and exited cleanly`);
});
