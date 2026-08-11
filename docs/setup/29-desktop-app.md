# 29 · `apps/desktop` — Tauri

> Optional, and deliberately last. A Rust shell around a webview that mounts the same `feature` and `ui` packages the web app does, and reaches the server as a plain HTTP client.

**Delivers:** A desktop application that adds one app directory and zero packages.

**Prerequisite:** [28 · Naming and boundaries](28-naming-and-boundaries.md)

---

## What Tauri changes, and what it doesn't

Every "the desktop app will…" note scattered through the earlier documents assumed exactly one thing: **the desktop client is a remote HTTP client, not a second server.** That holds under Tauri, and Tauri makes it hold *harder* than Electron would have.

| | Electron | Tauri |
|---|---|---|
| Native half | Node main process | Rust crate (`src-tauri/`) |
| JS runtimes | two (main + renderer) | **one** (the webview) |
| Web engine | bundled Chromium | the OS webview |
| Bundle size | ~120 MB | ~5–10 MB |
| Secret storage | whatever you build | OS keychain via a plugin |
| `process.env` at runtime | available | **does not exist** |

**The single-runtime difference is the one with architectural consequences.** Under Electron there was a Node process where `@ratchet/api-client` could run headless — an offline sync queue, a background poller. Under Tauri there is no such place: JavaScript runs in the webview and nowhere else. Anything genuinely background-and-native is Rust, not TypeScript.

That is why the "must load in Electron's main process" justification for keeping `api-client` React-free has been rewritten throughout. The rule survives — scripts, tests, and CLIs still need it — but the desktop app is no longer the reason for it.

**Three rules that do not change:**

- The desktop app imports `feature`, `ui`, `query`, `api-client`, `content`, `permissions`, `contracts`, `asset`. It imports **none** of `db`, `auth`, `infrastructure`, `composition`, `application`.
- `CapabilitySet.can()` is the same class, resolved from the same server, giving the same answers.
- The contract is the contract. A desktop build talking to a newer server fails at the type level, not at runtime.

---

## Step 27.1 — Prerequisites

Only needed by whoever builds the desktop app; the web and worker developers need none of this.

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup default stable
```

Platform toolchains on top:

| Platform | Needs |
|---|---|
| Windows | Microsoft C++ Build Tools; WebView2 (preinstalled on Windows 11) |
| macOS | Xcode Command Line Tools |
| Linux | `webkit2gtk-4.1`, `libayatana-appindicator3`, `librsvg2`, `build-essential` |

> Check the current [Tauri prerequisites page](https://tauri.app/start/prerequisites/) against the version you pin. The Linux package list in particular changes between major versions, and a wrong `webkit2gtk` major produces a link error that reads like a missing crate.

---

## Step 27.2 — Scaffold

```bash
cd apps
pnpm create tauri-app@latest desktop --template react-ts --manager pnpm
cd desktop
node -e "require('fs').rmSync('.git', { recursive: true, force: true })"
cd ../..
```

Set `"name": "@ratchet/desktop"`, then:

```bash
pnpm add --filter @ratchet/desktop \
  @ratchet/contracts@workspace:* @ratchet/permissions@workspace:* \
  @ratchet/api-client@workspace:* @ratchet/query@workspace:* \
  @ratchet/content@workspace:* @ratchet/ui@workspace:* \
  @ratchet/feature@workspace:* @ratchet/asset@workspace:* \
  @tauri-apps/api @tanstack/react-router @tanstack/react-query
pnpm add --filter @ratchet/desktop -D @tauri-apps/cli vite @vitejs/plugin-react
```

**Note what is absent.** No `composition`, no `application`, no `db`, no `auth`, no `@orpc/server`. The desktop app has no container and constructs no adapters — it is a client. The ESLint server-only boundary from [05](05-lint-and-format.md) applies here with no escape hatch at all, because unlike `apps/web` there is no `src/server/**` to exempt.

```
apps/desktop/
├── package.json
├── vite.config.ts
├── src-tauri/                  ← the Rust half
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs
│       └── token.rs            ← keychain commands
└── src/
    ├── config.ts               → Config  (import.meta.env, NOT process.env)
    ├── token-provider.ts       → TauriTokenProvider
    ├── api.ts                  → the ApiClient + QueryClient singletons
    ├── router.tsx              ← memory or hash history
    └── route/
```

---

## Step 27.3 — Configuration without `process.env`

There is no Node runtime in the webview, so `process.env` does not exist. This is a feature: the "exactly two `process.env` readers" assertion in [25](25-hygiene-and-ci.md) needs no new exemption, and the desktop app cannot accidentally read a server secret because it has no mechanism to.

```ts
// apps/desktop/src/config.ts
export class Config {
  private constructor() {}

  public static get apiUrl(): string {
    const url = import.meta.env.VITE_API_URL;
    if (!url) throw new Error("VITE_API_URL is not set");
    return url;
  }
}
```

**Anything in `import.meta.env` is baked into the shipped bundle and readable by anyone who unzips the app.** API base URLs and feature flags are fine. Never a secret. If the desktop app needs a value that must stay hidden, it belongs on the Rust side or, better, behind an API call.

---

## Step 27.4 — The token provider

This is the whole integration, and `TokenProvider` from [17](17-api-client-package.md) was made abstract for exactly this.

```ts
// apps/desktop/src/token-provider.ts
import { invoke } from "@tauri-apps/api/core";
import { TokenProvider } from "@ratchet/api-client";

export class TauriTokenProvider extends TokenProvider {
  public override async token(): Promise<string | null> {
    return invoke<string | null>("get_session_token");
  }

  public override async store(token: string): Promise<void> {
    await invoke("set_session_token", { token });
  }

  public override async clear(): Promise<void> {
    await invoke("clear_session_token");
  }
}
```

The Rust side implements those three commands against the OS keychain (`keyring` crate, or `tauri-plugin-stronghold` if you want an encrypted vault rather than the system store).

**The token never touches `localStorage` and never sits in a JS variable longer than one request.** A webview is still a browser: anything reachable from JavaScript is reachable by injected JavaScript. Keeping the token behind an `invoke` boundary means an XSS in a rendered field cannot enumerate it — it can only ask for it once, which is a smaller blast radius and a loggable event.

Then, at startup:

```ts
const client = ApiClient.overHttp(
  Config.apiUrl,
  new BearerAuthStrategy(new TauriTokenProvider()),
);
```

That is the entire difference between the desktop client and the browser client. `query`, `feature`, and `ui` are byte-identical.

---

## Step 27.5 — Server-side changes

Two, both in `apps/web`'s environment rather than in any package:

**`AUTH_TRUSTED_ORIGINS` gains the Tauri origins.** The webview's origin is `tauri://localhost` on macOS and Linux, and `http://tauri.localhost` on Windows. Add **both** — the scheme genuinely differs by platform, and omitting one produces an app that works for half your team.

**CORS must allow those origins for `/api/rpc` and `/api/auth`.** Same list, same reasoning. This is the point at which the bearer plugin from [15](15-auth-package.md) earns the "enable it on day one" advice: had the API been cookie-only, every endpoint would need revisiting now.

---

## Step 27.6 — Routing and the CSP

**Use memory or hash history, not browser history.** The webview serves from a custom protocol with no server behind it, so a path-based route on a cold start has nothing to resolve. This is the "routing is the one thing the desktop shell replaces" note from [20](20-query-package.md) becoming concrete: `apps/desktop` owns its own `@tanstack/react-router` instance and its own route tree, and mounts the same `feature` components underneath.

**Tauri ships a restrictive CSP by default and you should keep it.** Add your API origin to `connect-src` in `tauri.conf.json` and nothing else. Widening it to `*` to make a fetch work discards the main security advantage of the platform.

---

## Step 27.7 — CI

Desktop builds do **not** belong in the `verify` job — they need three runners and several minutes each. Give them a separate workflow, triggered on tags:

```yaml
strategy:
  matrix:
    platform: [macos-latest, ubuntu-22.04, windows-latest]
```

Use `tauri-apps/tauri-action` for the build and release, `Swatinem/rust-cache` for the Cargo cache, and pin `ubuntu-22.04` rather than `ubuntu-latest` — glibc in the build image sets the floor for which Linux distributions can run your binary, and `latest` silently raising it is a support ticket you will not enjoy.

The `verify` job still covers everything that matters here: the desktop app's TypeScript is typechecked and linted by the same `pnpm typecheck` and `pnpm lint` as everything else.

---

## What this cost

One app directory. No new packages, no changed packages, no changed contracts, no changed permissions, and one line added to a server-side allowlist.

That is the return on every "no `@tanstack/react-router` here" and "navigation arrives as a prop" rule you followed in Phase D. Those rules looked like ceremony while writing them. This is the step where they pay.

---

## ✅ Gate

- `pnpm --filter @ratchet/desktop tauri dev` opens a window rendering the same sign-in screen as the web app.
- Signing in stores a token in the OS keychain and **not** in `localStorage` (check devtools).
- A gated feature is hidden in the desktop UI and returns `FORBIDDEN` from the API, from the same role change — no desktop-specific permission code.
- The built bundle contains no Drizzle, no ioredis, no AWS SDK.
- Removing the Tauri origins from `AUTH_TRUSTED_ORIGINS` breaks sign-in, proving the allowlist is actually enforced.

---

[← Naming & Boundaries](28-naming-and-boundaries.md) · [Back to the index](00-README.md)
