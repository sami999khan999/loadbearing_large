import { createAuthClient, TwoFactorRequiredError, twoFactorClient } from "../import.js";
import { BetterAuthErrorNormalizer } from "./better-auth-error-normalizer.js";

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

export type BetterAuthClient = ReturnType<typeof createClient>;

// Better Auth's **vanilla** client, never `better-auth/react`. That hook keeps its own
// cache with its own invalidation rules, which would put two caching systems in one app
// — and they disagree on sign-out, showing a signed-in shell around a run of 401s.
//
// Everything an anonymous visitor can do. The signed-in half — two-factor enrolment,
// linked accounts, sessions, profile — is `AccountClient`, which shares this instance.
// The split is the one the route groups already draw: `(shell)` and `_authenticated`.
export class AuthClient {
  private readonly client: BetterAuthClient;

  public constructor(config: AuthClientConfig) {
    this.client = createClient(config);
  }

  // Every method here throws rather than returning `{ data, error }`, and throws an
  // `AppError` rather than a bare `Error`. That second half is not cosmetic:
  // `ErrorNormalizer` recognises an `AppError` structurally and maps everything else to
  // `INTERNAL`, so a plain `Error` here made every branch a caller could write on the
  // code unreachable (23).
  public async signIn(email: string, password: string): Promise<void> {
    const { data, error } = await this.client.signIn.email({ email, password });
    if (error) throw BetterAuthErrorNormalizer.normalize(error);

    // **The fork is a success, not a failure.** With a second factor enrolled, Better
    // Auth answers `200 { twoFactorRedirect: true }` and no `error` — so a client that
    // only inspects `error` resolves, `onSuccess` fires, and the app navigates away from
    // a sign-in that never completed. Turning it into a throw is what puts both legs of
    // the flow on one path: the caller branches on the code, exactly once.
    if ((data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect === true) {
      throw new TwoFactorRequiredError();
    }
  }

  // `callbackURL` is where the verification link lands once the token is spent, and it
  // is the caller's to choose because only the app knows its own routes. No session is
  // issued here: `autoSignIn` is off and verification is required, so a successful
  // sign-up means "go and read your email", not "you are in".
  public async signUp(
    name: string,
    email: string,
    password: string,
    callbackURL: string,
  ): Promise<void> {
    const { error } = await this.client.signUp.email({ name, email, password, callbackURL });
    if (error) throw BetterAuthErrorNormalizer.normalize(error);
  }

  // Returns nothing and resolves only if the redirect never happened: Better Auth
  // navigates the browser to Google, so the normal path is that this call is still
  // pending when the page unloads. An error here is a misconfiguration — a client id
  // Google rejects — and not a user mistake.
  public async signInWithGoogle(callbackURL: string, errorCallbackURL: string): Promise<void> {
    const { error } = await this.client.signIn.social({
      provider: "google",
      callbackURL,
      errorCallbackURL,
    });
    if (error) throw BetterAuthErrorNormalizer.normalize(error);
  }

  public async signOut(): Promise<void> {
    await this.client.signOut();
  }

  // `redirectTo` is where Better Auth sends the browser *after* it has consumed the
  // token, carrying the token on the query string for the form there to submit.
  //
  // Deliberately resolves on a rejection too. The caller renders one message either
  // way, because an error distinguishable from success is an oracle for which addresses
  // are registered — and this is the one endpoint anonymous callers can ask about any
  // address at all.
  public async requestPasswordReset(email: string, redirectTo: string): Promise<void> {
    await this.client.requestPasswordReset({ email, redirectTo });
  }

  public async resetPassword(token: string, newPassword: string): Promise<void> {
    const { error } = await this.client.resetPassword({ token, newPassword });
    if (error) throw BetterAuthErrorNormalizer.normalize(error);
  }

  // The resend behind "did not get it?". Rate-limited to three a minute on the server,
  // because it is an unauthenticated endpoint that makes this deployment send mail.
  public async sendVerificationEmail(email: string, callbackURL: string): Promise<void> {
    const { error } = await this.client.sendVerificationEmail({ email, callbackURL });
    if (error) throw BetterAuthErrorNormalizer.normalize(error);
  }

  // ── the second leg of a sign-in that answered TWO_FACTOR_REQUIRED ──
  //
  // Three ways to finish it, and they are alternatives rather than a sequence: the
  // authenticator app, a backup code for the phone that is gone, or a mailed code for
  // the phone that is merely elsewhere. All three throw on a bad code, so a form uses
  // one error path rather than three.

  public async verifyTwoFactor(code: string): Promise<void> {
    const { error } = await this.client.twoFactor.verifyTotp({ code });
    if (error) throw BetterAuthErrorNormalizer.normalize(error);
  }

  public async verifyBackupCode(code: string): Promise<void> {
    const { error } = await this.client.twoFactor.verifyBackupCode({ code });
    if (error) throw BetterAuthErrorNormalizer.normalize(error);
  }

  public async sendTwoFactorOtp(): Promise<void> {
    const { error } = await this.client.twoFactor.sendOtp();
    if (error) throw BetterAuthErrorNormalizer.normalize(error);
  }

  public async verifyTwoFactorOtp(code: string): Promise<void> {
    const { error } = await this.client.twoFactor.verifyOtp({ code });
    if (error) throw BetterAuthErrorNormalizer.normalize(error);
  }

  public async session() {
    const { data } = await this.client.getSession();
    return data ?? null;
  }

  public get raw(): BetterAuthClient {
    return this.client;
  }
}
