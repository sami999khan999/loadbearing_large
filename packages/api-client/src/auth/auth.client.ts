import { createAuthClient, twoFactorClient } from "../import.js";

export interface AuthClientConfig {
  readonly baseUrl: string;
}

// Not exported, and it exists for its return type. `ReturnType<typeof createAuthClient>`
// is the **unconfigured** client — the two-factor plugin widens the instance, and
// annotating with the unconfigured type erases that, so `client.twoFactor` does not exist.
// The type has to be inferred from these options and read back out, which is the same
// trap `AuthFactory.create` documents on the server side (16).
const createClient = (config: AuthClientConfig) =>
  createAuthClient({
    baseURL: config.baseUrl,
    plugins: [twoFactorClient()],
  });

type BetterAuthClient = ReturnType<typeof createClient>;

// Better Auth's **vanilla** client, never `better-auth/react`. That hook keeps its own
// cache with its own invalidation rules, which would put two caching systems in one app
// — and they disagree on sign-out, showing a signed-in shell around a run of 401s.
export class AuthClient {
  private readonly client: BetterAuthClient;

  public constructor(config: AuthClientConfig) {
    this.client = createClient(config);
  }

  // Throws rather than returning `{ data, error }`. Normalising at the boundary means a
  // `SignInForm` uses the same error handling as every other mutation (23).
  public async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.client.signIn.email({ email, password });
    if (error) throw new Error(error.message ?? "Sign-in failed.");
  }

  public async signOut(): Promise<void> {
    await this.client.signOut();
  }

  // The second leg of a sign-in that answered `TWO_FACTOR_REQUIRED`. Throws on a bad
  // code, like every other method here, so a form uses one error path rather than two.
  public async verifyTwoFactor(code: string): Promise<void> {
    const { error } = await this.client.twoFactor.verifyTotp({ code });
    if (error) throw new Error(error.message ?? "That code did not match.");
  }

  public async session() {
    const { data } = await this.client.getSession();
    return data ?? null;
  }

  public get raw(): BetterAuthClient {
    return this.client;
  }
}
