// The messages authentication cannot work without, as a port.
//
// Declared here rather than in `application` for the same reason `MembershipReader` is:
// it exists to serve an authentication artifact, and no use-case should learn that a
// password reset is an email rather than, say, a code read out over the phone.
//
// Deliberately narrower than `EmailSender`. These methods take an address and one
// payload and owe nothing about subjects, locales or layout — the implementation owns
// the copy, which is what keeps `packages/auth` free of `@loadbearing/content` and free
// of every word a user reads.
export abstract class AuthMailer {
  // `url` is Better Auth's own callback link, already carrying the single-use token.
  // No method here may modify it: a trimmed or re-encoded URL is a verification link
  // that fails with no error on either side.
  public abstract sendVerification(to: string, url: string): Promise<void>;
  public abstract sendPasswordReset(to: string, url: string): Promise<void>;
  // The one payload here that is not a URL. A second factor delivered by mail is for
  // the person who has lost the authenticator app, so it must not require a link that
  // opens in a browser the sign-in is not happening in.
  public abstract sendTwoFactorOtp(to: string, code: string): Promise<void>;
  // Sent to the address being moved *away from*, never the new one — the current owner
  // approves the change. Confirming at the destination lets a hijacked session walk the
  // account somewhere its owner cannot follow.
  public abstract sendEmailChangeConfirmation(to: string, url: string): Promise<void>;
}
