// The two messages authentication cannot work without, as a port.
//
// Declared here rather than in `application` for the same reason `MembershipReader` is:
// it exists to serve an authentication artifact, and no use-case should learn that a
// password reset is an email rather than, say, a code read out over the phone.
//
// Deliberately narrower than `EmailSender`. This port takes an address and a URL and
// owes nothing about subjects, locales or layout — the implementation owns the copy,
// which is what keeps `packages/auth` free of `@loadbearing/content` and free of every
// word a user reads.
export abstract class AuthMailer {
  // `url` is Better Auth's own callback link, already carrying the single-use token.
  // Neither method may modify it: a trimmed or re-encoded URL is a verification link
  // that fails with no error on either side.
  public abstract sendVerification(to: string, url: string): Promise<void>;
  public abstract sendPasswordReset(to: string, url: string): Promise<void>;
}
