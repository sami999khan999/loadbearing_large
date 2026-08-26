import { afterEach, describe, expect, it } from "vitest";
import { BearerAuthStrategy } from "../../src/auth/bearer-auth.strategy.js";
import { CookieAuthStrategy } from "../../src/auth/cookie-auth.strategy.js";
import { TokenProvider } from "../../src/auth/token.provider.js";
import { ApiClient } from "../../src/client/api-client.js";

class StaticTokenProvider extends TokenProvider {
  public constructor(private readonly token: string | null) {
    super();
  }

  public override get(): Promise<string | null> {
    return Promise.resolve(this.token);
  }

  public override set(): Promise<void> {
    return Promise.resolve();
  }
}

// The contract is empty until the first slice lands, so there is no typed procedure to
// call. The client is a proxy, so any path reaches the link — which is the part under
// test here: what the strategy puts on the wire, not what the server answers.
interface ProbeClient {
  readonly probe: (input: unknown) => Promise<unknown>;
}

interface Captured {
  readonly url: string;
  readonly credentials: unknown;
  readonly authorization: string | null;
}

const realFetch = globalThis.fetch;
let captured: Captured | null = null;

// Captures and then fails, deliberately. Returning a well-formed RPC response would
// mean encoding oRPC's wire format in a spec, which is testing the library.
const capturingFetch = (request: Request, init?: RequestInit): Promise<Response> => {
  captured = {
    url: request.url,
    credentials: init?.credentials,
    authorization: request.headers.get("authorization"),
  };
  return Promise.reject(new Error("captured"));
};

const callThrough = async (client: ApiClient): Promise<void> => {
  const probe = client.raw as unknown as ProbeClient;
  await expect(probe.probe({ ok: true })).rejects.toThrow();
};

afterEach(() => {
  globalThis.fetch = realFetch;
  captured = null;
});

describe("ApiClient.overHttp", () => {
  it("sends the cookie and no authorization header under CookieAuthStrategy", async () => {
    globalThis.fetch = capturingFetch as typeof globalThis.fetch;

    await callThrough(ApiClient.overHttp("https://api.test/rpc", new CookieAuthStrategy()));

    expect(captured?.credentials).toBe("include");
    expect(captured?.authorization).toBeNull();
  });

  it("sends the bearer token and omits the cookie under BearerAuthStrategy", async () => {
    globalThis.fetch = capturingFetch as typeof globalThis.fetch;

    await callThrough(
      ApiClient.overHttp(
        "https://api.test/rpc",
        new BearerAuthStrategy(new StaticTokenProvider("abc123")),
      ),
    );

    expect(captured?.credentials).toBe("omit");
    expect(captured?.authorization).toBe("Bearer abc123");
  });

  it("reaches the configured base url", async () => {
    globalThis.fetch = capturingFetch as typeof globalThis.fetch;

    await callThrough(ApiClient.overHttp("https://api.test/rpc", new CookieAuthStrategy()));

    expect(captured?.url.startsWith("https://api.test/rpc")).toBe(true);
  });
});

describe("ApiClient.inProcess", () => {
  it("hands back the injected client without touching the network", async () => {
    globalThis.fetch = (() => {
      throw new Error("inProcess must not reach fetch.");
    }) as typeof globalThis.fetch;

    const injected = { probe: () => Promise.resolve("from the router") };
    const client = ApiClient.inProcess(injected as never);

    expect(client.raw).toBe(injected);
    await expect((client.raw as unknown as ProbeClient).probe({})).resolves.toBe("from the router");
  });
});
