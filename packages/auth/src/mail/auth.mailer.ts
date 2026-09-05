// The messages authentication cannot work without, as a port. Narrower than
// `EmailSender`: the implementation owns the copy, so this package holds no user words.
export abstract class AuthMailer {
  // `url` is Better Auth's own callback link, carrying the single-use token. Trimming or
  // re-encoding it produces a link that fails with no error on either side.
  public abstract sendVerification(to: string, url: string): Promise<void>;
  public abstract sendPasswordReset(to: string, url: string): Promise<void>;
  // The one payload that is not a URL: this is for the person who lost the authenticator
  // app, so it must not need a browser the sign-in is not happening in.
  public abstract sendTwoFactorOtp(to: string, code: string): Promise<void>;
  // To the address being moved *away from*, never the new one: confirming at the
  // destination lets a hijacked session walk the account out of reach.
  public abstract sendEmailChangeConfirmation(to: string, url: string): Promise<void>;
}
