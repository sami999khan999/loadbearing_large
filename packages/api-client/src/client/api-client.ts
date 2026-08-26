import type { AuthStrategy } from "../auth/index.js";
import type { AppContract } from "../import.js";
import { type ContractRouterClient, createORPCClient, RPCLink } from "../import.js";

// The typed client every caller holds. It is derived from the contract, so a procedure
// added in `contracts` appears here with no edit in this package.
export type AppClient = ContractRouterClient<AppContract>;

// `lib.dom`'s `fetch`, reached off `globalThis` — the same trick `Uuid` uses for
// `crypto`. Node 18+ and every browser have it; `lib: ["ES2024"]` declares neither.
// `unknown` in and `never` out on purpose: naming `Request` or `Response` here would
// need the DOM lib. Both flow through untouched, so neither has to be named.
type FetchLike = (input: unknown, init?: Record<string, unknown>) => Promise<never>;

const platformFetch = (): FetchLike => (globalThis as unknown as { fetch: FetchLike }).fetch;

export class ApiClient {
  private constructor(private readonly rpc: AppClient) {}

  // Browser, Tauri webview, and any cross-process caller.
  public static overHttp(baseUrl: string, auth: AuthStrategy): ApiClient {
    const link = new RPCLink({
      url: baseUrl,
      headers: () => auth.headers(),
      // The override exists only to attach `credentials`, which is what decides
      // whether the cookie rides along — and it is per-strategy, not per-call.
      fetch: (request, init) =>
        platformFetch()(request, { ...init, credentials: auth.credentials }),
    });

    return new ApiClient(createORPCClient<AppClient>(link));
  }

  // SSR — no network. `"/api/rpc"` resolves to this same server, so an HTTP client here
  // would serialise a payload, cross the loopback, and deserialise it again, twice per
  // loader. The router client is built by `apps/web` and injected (24).
  public static inProcess(rpc: AppClient): ApiClient {
    return new ApiClient(rpc);
  }

  // One accessor per contract namespace joins here as slices arrive — `get task()`
  // returning `this.rpc.task`. `raw` is what a caller uses until then.
  public get raw(): AppClient {
    return this.rpc;
  }
}
