import { describe, expect, it } from "vitest";
import type { AuthConfig } from "../src/auth.config.js";
import { AuthFactory } from "../src/auth.factory.js";
import type { CacheStore, Database, OrganizationId } from "../src/import.js";
import { AuthMailer } from "../src/mail/auth.mailer.js";
import { MembershipEnroller } from "../src/session/membership.enroller.js";
import { MembershipReader, type OrganizationSummary } from "../src/session/membership.reader.js";

// Nothing here connects. No option below is exercised — this spec reads `auth.options`
// back, which is what `src/tables/` already does and the only way to assert on
// configuration that has no behaviour until a request arrives.
const unreachable = (): never => {
  throw new Error("auth.factory.spec.ts inspects configuration only.");
};

const cache: CacheStore = {
  get: unreachable,
  set: unreachable,
  delete: unreachable,
  deletePrefix: unreachable,
};

class StubMembershipReader extends MembershipReader {
  public override activeOrganizationFor(): Promise<OrganizationId | null> {
    return unreachable();
  }

  public override isMember(): Promise<boolean> {
    return unreachable();
  }

  public override organizationsFor(): Promise<readonly OrganizationSummary[]> {
    return unreachable();
  }
}

class StubMembershipEnroller extends MembershipEnroller {
  public override enrol(): Promise<OrganizationId | null> {
    return unreachable();
  }
}

class StubAuthMailer extends AuthMailer {
  public override sendVerification(): Promise<void> {
    return unreachable();
  }

  public override sendPasswordReset(): Promise<void> {
    return unreachable();
  }

  public override sendTwoFactorOtp(): Promise<void> {
    return unreachable();
  }

  public override sendEmailChangeConfirmation(): Promise<void> {
    return unreachable();
  }
}

const BASE: AuthConfig = {
  secret: "inspect-only-inspect-only-inspect-only",
  baseUrl: "http://localhost:3000",
  trustedOrigins: ["http://localhost:3000"],
  sessionMaxAgeSeconds: 604_800,
  cookieCacheMaxAgeSeconds: 60,
  requireEmailVerification: true,
  appName: "Loadbearing",
  enrolmentMode: "personal",
};

const optionsFor = (config: AuthConfig = BASE, mailer: AuthMailer = new StubAuthMailer()) =>
  AuthFactory.create(
    config,
    { client: {} } as unknown as Database,
    cache,
    new StubMembershipReader(),
    new StubMembershipEnroller(),
    mailer,
  ).options;

describe("AuthFactory — social providers", () => {
  // Absent rather than half-configured. An empty client id reaches Google as a request
  // it rejects at the consent screen, which is a failure the user sees and nobody can
  // diagnose from a log line here.
  it("configures no provider when no credentials were supplied", () => {
    expect(optionsFor().socialProviders).toEqual({});
  });

  it("configures Google when both halves are present", () => {
    const options = optionsFor({
      ...BASE,
      google: { clientId: "id.apps.googleusercontent.com", clientSecret: "secret" },
    });

    expect(options.socialProviders?.google?.clientId).toBe("id.apps.googleusercontent.com");
  });

  // Without it Google silently reuses whichever account the browser is already signed
  // into, which makes signing in as somebody else impossible on a shared machine and
  // reads as a bug in this application rather than in the consent screen.
  it("always asks Google which account to use", () => {
    const options = optionsFor({ ...BASE, google: { clientId: "id", clientSecret: "secret" } });

    expect(options.socialProviders?.google?.prompt).toBe("select_account");
  });
});

describe("AuthFactory — account linking", () => {
  // Google asserts a verified address, so a Google sign-in matching an existing account
  // is the same person. The alternative is a dead end where a real user is told their
  // email is taken by themselves.
  it("trusts Google and nothing else", () => {
    expect(optionsFor().account?.accountLinking?.trustedProviders).toEqual(["google"]);
  });

  // `requireLocalEmailVerified` defaults to true and is deliberately never set here.
  // Setting it false is what would let someone pre-register an unverified account at a
  // victim's address and have the victim's Google identity linked into it.
  it("leaves the local-verification gate at its safe default", () => {
    expect(optionsFor().account?.accountLinking?.requireLocalEmailVerified).toBeUndefined();
  });
});

describe("AuthFactory — credential endpoints", () => {
  // The global 20/60 is right for the endpoints nobody attacks and far too loose for
  // these five, each of which is either a guess against a credential or an email this
  // deployment pays to send. The paths are Better Auth's own and were read off the
  // pinned runtime — a rule keyed on a path that does not exist limits nothing, and
  // looks identical in review to one that works.
  it("rate-limits every endpoint that guesses a credential or sends mail", () => {
    const rules = optionsFor().rateLimit?.customRules ?? {};

    expect(Object.keys(rules).sort()).toEqual([
      "/request-password-reset",
      "/send-verification-email",
      "/sign-in/email",
      "/sign-up/email",
      "/two-factor/send-otp",
    ]);
  });

  it("requires a password at least twelve characters long", () => {
    expect(optionsFor().emailAndPassword?.minPasswordLength).toBe(12);
  });

  // Hashing is deliberately slow, so an unbounded password is a CPU exhaustion vector
  // on an endpoint anyone can reach.
  it("caps password length", () => {
    expect(optionsFor().emailAndPassword?.maxPasswordLength).toBe(128);
  });

  // Verification is required, so a session from the sign-up response would be a session
  // for an address nobody has proved they can read.
  it("issues no session from sign-up", () => {
    expect(optionsFor().emailAndPassword?.autoSignIn).toBe(false);
  });

  // Proving a mailbox was reachable is not proof that the person reading it is at this
  // browser — a link followed from a shared inbox must not sign anyone in.
  it("issues no session from following a verification link", () => {
    expect(optionsFor().emailVerification?.autoSignInAfterVerification).toBe(false);
  });

  // With this off the account exists, `emailVerified` stays false, and the only thing
  // that could clear it is never dispatched.
  it("sends the verification message on sign-up", () => {
    expect(optionsFor().emailVerification?.sendOnSignUp).toBe(true);
  });

  // The difference between changing a password and actually locking somebody out.
  it("revokes every session when a password is reset", () => {
    expect(optionsFor().emailAndPassword?.revokeSessionsOnPasswordReset).toBe(true);
  });
});

describe("AuthFactory — two-factor", () => {
  // The label an authenticator app shows beside the code, read by the plugin as its
  // issuer. Wrong here means every enrolled device names the wrong product, and
  // re-enrolment is the only fix.
  it("issues TOTP under the configured app name", () => {
    expect(optionsFor().appName).toBe("Loadbearing");
  });

  it("registers the two-factor plugin alongside bearer", () => {
    const ids = (optionsFor().plugins ?? []).map((plugin) => plugin.id);

    expect(ids).toContain("two-factor");
    expect(ids).toContain("bearer");
  });
});

describe("AuthFactory — change of email", () => {
  // The confirmation goes to the address being moved *away from*. Better Auth hands the
  // new address to the same callback, so getting this wrong is one property access —
  // and it would let a hijacked session move the account somewhere its owner cannot
  // follow. Asserts the recipient rather than merely that a sender was configured.
  it("confirms at the current address, never the new one", async () => {
    const sent: string[] = [];

    class RecordingMailer extends StubAuthMailer {
      public override sendEmailChangeConfirmation(to: string): Promise<void> {
        sent.push(to);
        return Promise.resolve();
      }
    }

    const options = optionsFor(BASE, new RecordingMailer());

    await options.user?.changeEmail?.sendChangeEmailConfirmation?.({
      user: { email: "old@example.com" },
      newEmail: "new@example.com",
      url: "https://example.test/callback",
      token: "token",
    } as never);

    expect(sent).toEqual(["old@example.com"]);
  });
});
