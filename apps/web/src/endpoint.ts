// The two HTTP entrypoints, as the browser addresses them.
//
// This file exists because `Env` cannot. `Env` parses the full server schema at module
// load, so importing it from `router.tsx` or a route component drags `DATABASE_URL` and
// `AUTH_SECRET` into the client bundle — where Vite replaces the environment object with
// an empty one and the parse throws before the app can hydrate. Client code needs two
// addresses, so it gets two addresses and no schema.
//
// The desktop app is cross-origin against both and supplies absolute URLs of its own
// through `import.meta.env` (30).
export class Endpoint {
  private constructor() {}

  // Same-origin paths: the app is served by the same process that answers them, so there
  // is no host to configure. Kept in step with `handler.ts`'s `prefix` and with the file
  // routes that mount them, which spell the path again because `createFileRoute()` takes
  // a literal the generator reads without executing anything.
  public static readonly rpc = "/api/rpc";
  public static readonly authPath = "/api/auth";

  // Better Auth's client is the one caller that cannot take a path. It resolves `baseURL`
  // through `new URL()` **in its constructor**, so a relative value throws
  // `BetterAuthError: Invalid base URL` — during SSR, where there is no `location` to
  // resolve against, which blanks the sign-in page behind a failed Suspense boundary.
  //
  // Every `AuthClient` method runs from a browser event, so the server never issues a
  // request through this value — it only has to parse. `.invalid` is reserved by RFC 2606
  // and is guaranteed never to resolve, so a call that does slip into an SSR pass fails
  // loudly and names this line, rather than quietly reaching some other localhost.
  public static get auth(): string {
    const origin = typeof window === "undefined" ? "https://ssr.invalid" : window.location.origin;
    return `${origin}${Endpoint.authPath}`;
  }
}
