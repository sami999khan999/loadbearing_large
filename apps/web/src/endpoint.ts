// The two HTTP entrypoints as the browser addresses them. This file exists because `Env`
// cannot reach the client bundle — see docs/reference/env.md.
export class Endpoint {
  private constructor() {}

  // Same-origin, so there is no host to configure. Kept in step with the handler's
  // `prefix` and with the file routes, which spell the path again.
  public static readonly rpc = "/api/rpc";
  public static readonly authPath = "/api/auth";

  // Better Auth resolves `baseURL` through `new URL()` in its constructor, so a relative
  // value throws during SSR. `.invalid` never resolves — see docs/reference/env.md.
  public static get auth(): string {
    const origin = typeof window === "undefined" ? "https://ssr.invalid" : window.location.origin;
    return `${origin}${Endpoint.authPath}`;
  }
}
