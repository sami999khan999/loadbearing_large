// `pnpm assistant:load [--base url] [--users n] [--questions n] [--concurrency n,n]`:
// questions asked and streamed through web, worker and realtime, against `ASSISTANT_PROVIDER=fake`.
// ──
// Users are `load-<n>@example.test`, signed up and verified through Mailpit the first
// time. Several, because one person may send 20 a minute and run two answers at once.

import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const flags = Object.fromEntries(
  process.argv
    .slice(2)
    .join(" ")
    .split("--")
    .filter(Boolean)
    .map((pair) => pair.trim().split(/\s+/)),
);
const base = flags.base ?? "http://localhost:13000";
const mailpit = flags.mailpit ?? "http://localhost:18025";
const USERS = Number(flags.users ?? 40);
const QUESTIONS = Number(flags.questions ?? 200);
const LEVELS = (flags.concurrency ?? "10,40").split(",").map(Number);
const PASSWORD = "Correct-Horse-9";
const HEADERS = { "content-type": "application/json", origin: base };

// Sessions kept between runs: Better Auth allows ten sign-ins and five sign-ups a minute
// from one address, so signing sixty users in again every run costs six minutes.
const SESSIONS = join(tmpdir(), "loadbearing-assistant-load.json");
const sessions = (() => {
  try {
    return JSON.parse(readFileSync(SESSIONS, "utf8"));
  } catch {
    return {};
  }
})();

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A 429 waits out the auth limiter rather than failing the run.
async function auth(path, body) {
  for (;;) {
    const response = await fetch(`${base}/api/auth/${path}`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(body),
    });
    if (response.status !== 429) return response;
    const wait = Number(
      response.headers.get("x-retry-after") ?? response.headers.get("retry-after"),
    );
    await sleep((Number.isFinite(wait) && wait > 0 ? wait : 10) * 1000);
  }
}

// Node's `fetch` keeps no cookie jar, so each user carries its own session cookie.
async function signIn(email) {
  const response = await auth("sign-in/email", { email, password: PASSWORD });
  if (!response.ok) return null;
  const cookie = response.headers
    .getSetCookie()
    .map((line) => line.split(";")[0])
    .join("; ");
  // The first page founds the person's own organization under `personal` enrolment.
  await fetch(`${base}/`, { headers: { cookie } }).then((page) => page.arrayBuffer());
  return cookie;
}

// Mailpit's text part ends each line in `\r`, which a link copied out of it keeps.
async function verify(email) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const search = Object(
      await fetch(`${mailpit}/api/v1/search?query=to:${email}`).then((r) => r.json()),
    );
    const id = search.messages?.[0]?.ID;
    if (id) {
      const message = Object(await fetch(`${mailpit}/api/v1/message/${id}`).then((r) => r.json()));
      const link = /https?:\/\/\S+verify\S+/.exec(message.Text ?? "")?.[0]?.trim();
      if (link) {
        await fetch(link, { redirect: "manual" });
        return;
      }
    }
    await sleep(500);
  }
  throw new Error(`No verification mail for ${email}: is the worker running?`);
}

async function live(cookie) {
  const response = await fetch(`${base}/api/auth/get-session`, { headers: { cookie } });
  return response.ok && (await response.json()) !== null;
}

async function user(index) {
  const email = `load-${index}@example.test`;
  if (sessions[email] && (await live(sessions[email]))) return sessions[email];

  let cookie = await signIn(email);
  if (!cookie) {
    await auth("sign-up/email", { email, password: PASSWORD, name: `Load ${index}` });
    await verify(email);
    cookie = await signIn(email);
  }
  if (!cookie) throw new Error(`${email} could not sign in after verifying`);
  sessions[email] = cookie;
  writeFileSync(SESSIONS, JSON.stringify(sessions));
  return cookie;
}

async function rpc(cookie, path, body) {
  const response = await fetch(`${base}/api/rpc/${path}`, {
    method: "POST",
    headers: { ...HEADERS, cookie },
    body: JSON.stringify({ json: body }),
  });
  const payload = Object(await response.json());
  return response.ok ? { ok: payload.json } : { error: payload.json?.code ?? response.status };
}

// Reads the answer's server-sent events until `done`, noting when the first word came.
async function stream(cookie, sent, startedAt) {
  const response = await fetch(`${base}/api/realtime/realtime/assistant`, {
    method: "POST",
    headers: { ...HEADERS, cookie },
    body: JSON.stringify({ json: { threadId: sent.threadId, messageId: sent.messageId } }),
  });
  if (!response.ok || !response.body) return { error: `STREAM_${response.status}` };

  let firstMs = null;
  let status = null;
  let buffered = "";
  const decoder = new TextDecoder();
  for await (const chunk of response.body) {
    buffered += decoder.decode(chunk, { stream: true });
    for (let end = buffered.indexOf("\n\n"); end !== -1; end = buffered.indexOf("\n\n")) {
      const event = buffered.slice(0, end);
      buffered = buffered.slice(end + 2);
      const data = /^data: (.*)$/m.exec(event)?.[1];
      const frame = data ? JSON.parse(data).json : null;
      if (frame?.kind === "text" && firstMs === null) firstMs = performance.now() - startedAt;
      if (frame?.kind === "done") status = frame.status;
    }
    if (status) break;
  }
  return { firstMs, doneMs: performance.now() - startedAt, status };
}

async function run(cookies, concurrency) {
  const results = [];
  let next = 0;
  const started = performance.now();

  await Promise.all(
    Array.from({ length: concurrency }, async (_, lane) => {
      while (next < QUESTIONS) {
        const index = next++;
        // Each lane keeps to its own users, so no one person runs more than two answers.
        const cookie = cookies[(lane + index * concurrency) % cookies.length];
        const askedAt = performance.now();
        const sent = await rpc(cookie, "assistant/send", { question: `Load question ${index}` });
        const sendMs = performance.now() - askedAt;
        if (sent.error) {
          results.push({ sendMs, error: sent.error });
          continue;
        }
        const answer = await stream(cookie, sent.ok, askedAt);
        results.push({ sendMs, ...answer });
      }
    }),
  );

  const seconds = (performance.now() - started) / 1000;
  const done = results.filter((row) => row.status === "complete");
  const sorted = (key) =>
    done
      .map((row) => row[key])
      .filter((value) => value !== null)
      .sort((a, b) => a - b);
  const [send, first, total] = [sorted("sendMs"), sorted("firstMs"), sorted("doneMs")];
  const errors = {};
  for (const row of results.filter((row) => row.status !== "complete")) {
    const key = row.error ?? row.status ?? "unknown";
    errors[key] = (errors[key] ?? 0) + 1;
  }

  return {
    concurrency,
    answers: done.length,
    "answers/s": Number((done.length / seconds).toFixed(1)),
    "send p50": Math.round(quantile(send, 0.5) ?? 0),
    "send p95": Math.round(quantile(send, 0.95) ?? 0),
    "first p50": Math.round(quantile(first, 0.5) ?? 0),
    "first p95": Math.round(quantile(first, 0.95) ?? 0),
    "done p50": Math.round(quantile(total, 0.5) ?? 0),
    "done p95": Math.round(quantile(total, 0.95) ?? 0),
    failed: JSON.stringify(errors),
  };
}

const cookies = [];
for (let index = 0; index < USERS; index += 1) cookies.push(await user(index));
console.log(`${USERS} users signed in; ${QUESTIONS} questions per level, times in ms`);

// One machine runs the generator and every process, so the numbers compare run to run on
// one quiet machine, not across machines. See docs/infra/reference/assistant.md.
const rows = [];
for (const concurrency of LEVELS) rows.push(await run(cookies, concurrency));
console.table(rows);
