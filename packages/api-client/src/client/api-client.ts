import type { AuthStrategy } from "../auth/index.js";
import type { AppContract } from "../import.js";
import { type ContractRouterClient, createORPCClient, RPCLink } from "../import.js";

// The typed client every caller holds. It is derived from the contract, so a procedure
// added in `contracts` appears here with no edit in this package.
export type AppClient = ContractRouterClient<AppContract>;

// `fetch` off `globalThis`, since `lib: ["ES2024"]` declares neither it nor `Request`.
// `unknown` in and `never` out: both flow through untouched, so neither is named.
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

  // SSR — no network. An HTTP client here would serialise, cross the loopback and
  // deserialise again, twice per loader.
  public static inProcess(rpc: AppClient): ApiClient {
    return new ApiClient(rpc);
  }

  // One accessor per contract namespace, so the day a namespace needs a wrapper the call
  // sites already go through a method rather than through `raw`.
  public get role(): AppClient["role"] {
    return this.rpc.role;
  }

  public get member(): AppClient["member"] {
    return this.rpc.member;
  }

  // The escape hatch for a namespace with no accessor yet.
  public get raw(): AppClient {
    return this.rpc;
  }
}
