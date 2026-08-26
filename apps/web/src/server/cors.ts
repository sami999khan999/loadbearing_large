import { Env } from "~/env.js";

// A Tauri webview is served from a custom protocol, so **every** call it makes to
// `/api/rpc` and `/api/auth` is cross-origin — there is no configuration that makes it
// same-origin. Both handlers need this, and it reads the same allowlist as the CSRF
// check (24.2).
export class Cors {
  private constructor() {}

  private static headersFor(origin: string | null): Headers {
    const headers = new Headers();
    // Echo the origin, never reflect it blindly. Reflecting whatever arrived, with
    // `Allow-Credentials: true`, is a hole large enough to drive a CSRF through — and
    // the two headers are specified never to be combined with `*` for that reason.
    if (!origin || !Env.trustedOrigins.includes(origin)) return headers;

    headers.set("Access-Control-Allow-Origin", origin);
    // Required: the web client authenticates with a cookie and the desktop client with
    // a bearer token, against the same two routes (16, 18).
    headers.set("Access-Control-Allow-Credentials", "true");
    // `x-api-key` is here because `PrincipalBuilder` checks it first (16). Omitting it
    // means integrations calling from a browser context fail preflight with a message
    // that does not mention the header.
    headers.set("Access-Control-Allow-Headers", "content-type,authorization,x-api-key");
    headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    // Not optional. Without it any cache in front of this — a CDN, a reverse proxy —
    // can serve one origin's CORS response to another, and the failure looks random.
    headers.set("Vary", "Origin");
    return headers;
  }

  // Returns null when the request is not a preflight.
  public static preflight(request: Request): Response | null {
    if (request.method !== "OPTIONS") return null;
    return new Response(null, {
      status: 204,
      headers: Cors.headersFor(request.headers.get("origin")),
    });
  }

  public static apply(request: Request, response: Response): Response {
    for (const [key, value] of Cors.headersFor(request.headers.get("origin"))) {
      response.headers.set(key, value);
    }
    return response;
  }
}
