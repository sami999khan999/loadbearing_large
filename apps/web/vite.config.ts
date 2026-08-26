import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defaultClientConditions, defaultServerConditions, defineConfig } from "vite";

// A function config, because one line of it has to differ between `vite dev` and
// `vite build` and there is no condition token that expresses it.
export default defineConfig(({ command }) => {
  // The `development` export condition resolves workspace packages to their `src/`
  // instead of `dist/`, so editing a package hot-reloads the browser with no rebuild.
  //
  // **Dev only, and prepended rather than assigned.** Two separate traps:
  //
  // 1. Vite's own default lists end with `development|production` — a token Vite expands
  //    to `production` in a build. A literal `"development"` in the array has no such
  //    behaviour, so leaving it in `vite build` picks the *development* entry of any
  //    dependency that publishes one. `@tanstack/react-router` does, and that is how its
  //    dev build came to ship in the production client bundle.
  // 2. Assigning the array replaces the defaults instead of extending them, dropping
  //    `browser` on the client and `node` on the server.
  //
  // If resolution ever misbehaves, drop `devCondition` entirely: you fall back to
  // consuming `dist/`, which still works with a rebuild between edit and reload.
  const devCondition = command === "serve" ? ["development"] : [];

  return {
    resolve: { tsconfigPaths: true, conditions: [...devCondition, ...defaultClientConditions] },
    ssr: {
      resolve: {
        conditions: [...devCondition, ...defaultServerConditions],
        externalConditions: [...devCondition, ...defaultServerConditions],
      },
      // Vite treats workspace packages as external Node modules otherwise, which
      // defeats the `src/` resolution above and the `"use client"` handling below it.
      noExternal: [/^@loadbearing\//],
    },
    plugins: [
      // The Start plugin owns route generation and must come before `viteReact()`. Two
      // things about this block are easy to get wrong and cost a confusing build failure:
      //
      // 1. It does **not** read `tsr.config.json` — pointing only that at a custom
      //    directory leaves the plugin looking in `src/routes/` and it dies with "Cannot
      //    convert undefined or null to object" while building the route manifest,
      //    naming neither the file nor the directory.
      // 2. These paths are relative to `srcDirectory` (`src`), not to the project root.
      //    Writing `src/route` here produces `ENOENT … apps/web/src/src/route`.
      tanstackStart({
        router: {
          routesDirectory: "route",
          generatedRouteTree: "route-tree.gen.ts",
        },
      }),
      // Deployment target only — it is what turns `vite build` into a `.output/` a Node
      // host can run. Deliberately unconfigured: the `/api/*` endpoints are Start server
      // routes under `src/route/api/`, so nothing here depends on Nitro's own file
      // scanning, and swapping this line for the Cloudflare or Netlify plugin changes the
      // host and nothing else.
      nitro(),
      viteReact(),
    ],
  };
});
