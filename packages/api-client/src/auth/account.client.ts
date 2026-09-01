import type { AuthClient, BetterAuthClient } from "./auth.client.js";
import { BetterAuthErrorNormalizer } from "./better-auth-error-normalizer.js";

// What two-factor enrolment hands back, once, at the moment it is turned on. The
// backup codes are not readable again afterwards — Better Auth stores them encrypted
// and `viewBackupCodes` is a server-only endpoint deliberately not reachable from here.
export interface TwoFactorEnrolment {
  readonly totpUri: string;
  readonly backupCodes: readonly string[];
}

// One of the ways this account can be signed into. `providerId` is `credential` for
// email and password, or the provider's own id for a social account.
export interface LinkedAccount {
  readonly id: string;
  readonly providerId: string;
  readonly accountId: string;
  readonly createdAt: string;
}

// A live session, as the "where you are signed in" list renders it. `token` is what
// revoking one takes, which is why it is here and why this type never leaves the
// browser tab that fetched it.
export interface ActiveSession {
  readonly id: string;
  readonly token: string;
  readonly createdAt: string;
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
}

// Everything a signed-in person can do to their own account. Separate from `AuthClient`
// rather than bolted onto it, because the two are reached from different halves of the
// app and only one of them is ever rendered to an anonymous visitor.
//
// Takes the `AuthClient` rather than a config: one Better Auth instance per component
// tree, so a fetch here and a `getSession()` there share the same cookie handling and
// the same plugin set.
export class AccountClient {
  private readonly client: BetterAuthClient;

  public constructor(auth: AuthClient) {
    this.client = auth.raw;
  }

  // ── credentials ──

  // `revokeOtherSessions` is not optional in practice. Changing a password because it
  // may be known to someone else, and leaving their session alive, is the failure this
  // whole flow exists to prevent — `revokeSessionsOnPasswordReset` makes the same call
  // on the reset path.
  public async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const { error } = await this.client.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
    if (error) throw BetterAuthErrorNormalizer.normalize(error);
  }

  // Sends a confirmation to the address being moved *away from* — the server decides
  // that, not this call. Nothing changes until the link in that message is followed.
  public async changeEmail(newEmail: string, callbackURL: string): Promise<void> {
    const { error } = await this.client.changeEmail({ newEmail, callbackURL });
    if (error) throw BetterAuthErrorNormalizer.normalize(error);
  }

  public async updateName(name: string): Promise<void> {
    const { error } = await this.client.updateUser({ name });
    if (error) throw BetterAuthErrorNormalizer.normalize(error);
  }

  // ── two-factor ──

  // The password is required and is not ceremony: without it, anyone holding a stolen
  // session could enrol their own authenticator and lock the owner out of their account
  // permanently. The same argument applies to every method below that asks for it.
  //
  // Two-factor is not on when this resolves. Better Auth waits for `verifyTotpEnrolment`
  // to prove the secret actually reached an authenticator app — enabling it on the
  // strength of a QR nobody scanned is how a user locks themselves out at the next
  // sign-in.
  public async enableTwoFactor(password: string): Promise<TwoFactorEnrolment> {
    const { data, error } = await this.client.twoFactor.enable({ password });
    if (error || !data) throw BetterAuthErrorNormalizer.normalize(error);
    return { totpUri: data.totpURI, backupCodes: data.backupCodes };
  }

  public async verifyTotpEnrolment(code: string): Promise<void> {
    const { error } = await this.client.twoFactor.verifyTotp({ code });
    if (error) throw BetterAuthErrorNormalizer.normalize(error);
  }

  public async disableTwoFactor(password: string): Promise<void> {
    const { error } = await this.client.twoFactor.disable({ password });
    if (error) throw BetterAuthErrorNormalizer.normalize(error);
  }

  // Invalidates every previously issued code. The point of the flow, not a side effect:
  // codes that have been printed, screenshotted or pasted somewhere are the reason to
  // ask for new ones.
  public async regenerateBackupCodes(password: string): Promise<readonly string[]> {
    const { data, error } = await this.client.twoFactor.generateBackupCodes({ password });
    if (error || !data) throw BetterAuthErrorNormalizer.normalize(error);
    return data.backupCodes;
  }

  // ── linked accounts ──

  public async listAccounts(): Promise<readonly LinkedAccount[]> {
    const { data, error } = await this.client.listAccounts();
    if (error || !data) throw BetterAuthErrorNormalizer.normalize(error);
    return data.map((account) => ({
      id: account.id,
      providerId: account.providerId,
      accountId: account.accountId,
      // Serialised so the whole list survives a TanStack Query cache round trip. A
      // `Date` here dehydrates to a string and rehydrates as one, so the type would be
      // a lie on the second render.
      createdAt: new Date(account.createdAt).toISOString(),
    }));
  }

  // Redirects to Google, like `signInWithGoogle`, and for the same reason resolves only
  // when it did not.
  public async linkGoogle(callbackURL: string): Promise<void> {
    const { error } = await this.client.linkSocial({ provider: "google", callbackURL });
    if (error) throw BetterAuthErrorNormalizer.normalize(error);
  }

  // The caller decides whether this is allowed — the last credential on an account must
  // not be removable, and only the caller can see the whole list. Better Auth's own
  // `allowUnlinkingAll` is left at its default `false` as the backstop.
  public async unlinkAccount(providerId: string, accountId: string): Promise<void> {
    const { error } = await this.client.unlinkAccount({ providerId, accountId });
    if (error) throw BetterAuthErrorNormalizer.normalize(error);
  }

  // ── sessions ──

  public async listSessions(): Promise<readonly ActiveSession[]> {
    const { data, error } = await this.client.listSessions();
    if (error || !data) throw BetterAuthErrorNormalizer.normalize(error);
    return data.map((session) => ({
      id: session.id,
      token: session.token,
      createdAt: new Date(session.createdAt).toISOString(),
      userAgent: session.userAgent ?? null,
      ipAddress: session.ipAddress ?? null,
    }));
  }

  public async revokeSession(token: string): Promise<void> {
    const { error } = await this.client.revokeSession({ token });
    if (error) throw BetterAuthErrorNormalizer.normalize(error);
  }

  // Every session but this one. The tab that calls it stays signed in, which is what
  // makes it usable from a settings page — `signOut` is the other button.
  public async revokeOtherSessions(): Promise<void> {
    const { error } = await this.client.revokeOtherSessions();
    if (error) throw BetterAuthErrorNormalizer.normalize(error);
  }
}
