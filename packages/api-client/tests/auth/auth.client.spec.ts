import { describe, expect, it, vi } from "vitest";
import { AccountClient } from "../../src/auth/account.client.js";
import { AuthClient } from "../../src/auth/auth.client.js";

// Better Auth's client is driven entirely by `fetch`, so a stub of that is the whole
// double — no library internals are reached into, and the specs below stay true across
// a patch upgrade. Each entry answers one request.
type Reply = { status?: number; body?: unknown };

function clientOver(replies: readonly Reply[]) {
  const calls: { url: string; body: unknown }[] = [];
  let index = 0;

  const fetchStub = vi.fn(async (input: unknown, init?: { body?: string }) => {
    const reply = replies[index++] ?? { status: 200, body: {} };
    calls.push({
      url: String(input),
      body: init?.body ? JSON.parse(init.body) : undefined,
    });

    return new Response(JSON.stringify(reply.body ?? {}), {
      status: reply.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  });

  vi.stubGlobal("fetch", fetchStub);

  return { auth: new AuthClient({ baseUrl: "https://example.test/api/auth" }), calls };
}

describe("AuthClient.signIn", () => {
  // **The fork is a success, not a failure.** With a second factor enrolled Better Auth
  // answers `200 { twoFactorRedirect: true }` and no `error`, so a client that inspects
  // only `error` resolves, `onSuccess` fires, and the app navigates away from a sign-in
  // that never completed. This is the regression T-005 closed, pinned.
  it("throws TWO_FACTOR_REQUIRED on a 200 that only redirects", async () => {
    const { auth } = clientOver([{ status: 200, body: { twoFactorRedirect: true } }]);

    await expect(auth.signIn("a@example.test", "password")).rejects.toMatchObject({
      code: "TWO_FACTOR_REQUIRED",
    });
  });

  it("resolves on a 200 that carries a session", async () => {
    const { auth } = clientOver([{ status: 200, body: { user: { id: "u1" } } }]);

    await expect(auth.signIn("a@example.test", "password")).resolves.toBeUndefined();
  });

  // An `AppError`, never a bare `Error` — that is what keeps `ErrorNormalizer` from
  // flattening the whole flow to INTERNAL and making the branch above unreachable.
  it("throws a typed error on a rejection", async () => {
    const { auth } = clientOver([{ status: 401, body: { code: "INVALID_CREDENTIALS" } }]);

    await expect(auth.signIn("a@example.test", "wrong")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("AuthClient — the endpoints anyone can reach", () => {
  // Resolves on a rejection too, and deliberately. A failure a visitor can tell apart
  // from a success is an oracle for which addresses are registered, and this is the one
  // endpoint an anonymous caller can point at any address at all.
  it("reports the same outcome for a reset of an address that does not exist", async () => {
    const { auth } = clientOver([{ status: 400, body: { code: "USER_NOT_FOUND" } }]);

    await expect(
      auth.requestPasswordReset("nobody@example.test", "/reset-password"),
    ).resolves.toBeUndefined();
  });

  it("sends the redirect target the reset form will be served from", async () => {
    const { auth, calls } = clientOver([{ status: 200 }]);

    await auth.requestPasswordReset("a@example.test", "/reset-password");

    expect(calls[0]?.url).toContain("/request-password-reset");
    expect(calls[0]?.body).toMatchObject({ redirectTo: "/reset-password" });
  });

  // Sign-up is the one flow that cannot hide it, so the code has to survive the trip —
  // the form branches on CONFLICT to say "try signing in" rather than "that failed".
  it("surfaces an already-registered address as CONFLICT", async () => {
    const { auth } = clientOver([{ status: 422, body: { code: "USER_ALREADY_EXISTS" } }]);

    await expect(
      auth.signUp("A", "a@example.test", "a-long-enough-password", "/verify-email"),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("AuthClient — the three second factors", () => {
  // Alternatives rather than a sequence, and each one hits its own endpoint. A form
  // that sent a backup code to the TOTP verifier would fail in a way that looks like a
  // wrong code, which is the least debuggable outcome available.
  it("verifies each factor against its own endpoint", async () => {
    const { auth, calls } = clientOver([{ status: 200 }, { status: 200 }, { status: 200 }]);

    await auth.verifyTwoFactor("123456");
    await auth.verifyBackupCode("abcd-efgh");
    await auth.verifyTwoFactorOtp("123456");

    expect(calls.map((call) => call.url.replace(/^.*\/api\/auth/, ""))).toEqual([
      "/two-factor/verify-totp",
      "/two-factor/verify-backup-code",
      "/two-factor/verify-otp",
    ]);
  });

  it("throws rather than resolving on a bad code, so one error path serves all three", async () => {
    const { auth } = clientOver([{ status: 401, body: { code: "INVALID_CODE" } }]);

    await expect(auth.verifyBackupCode("nope")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("AccountClient", () => {
  // `revokeOtherSessions` is not optional in practice: changing a password because it
  // may be known to someone else, and leaving their session alive, is the failure the
  // whole flow exists to prevent.
  it("signs other devices out whenever a password changes", async () => {
    const { auth, calls } = clientOver([{ status: 200 }]);

    await new AccountClient(auth).changePassword("old-password", "a-new-long-password");

    expect(calls[0]?.body).toMatchObject({ revokeOtherSessions: true });
  });

  // The enrolment is handed back once and never again — Better Auth stores the codes
  // encrypted and the endpoint that reads them back is server-only on purpose.
  it("returns the URI and the backup codes from enabling two-factor", async () => {
    const { auth } = clientOver([
      { status: 200, body: { totpURI: "otpauth://totp/x", backupCodes: ["a", "b"] } },
    ]);

    expect(await new AccountClient(auth).enableTwoFactor("password")).toEqual({
      totpUri: "otpauth://totp/x",
      backupCodes: ["a", "b"],
    });
  });

  // Serialised, so the list survives a TanStack Query cache round trip. A `Date` here
  // dehydrates to a string and rehydrates as one, which makes the type a lie on the
  // second render rather than the first.
  it("hands back timestamps a cache can round-trip", async () => {
    const { auth } = clientOver([
      {
        status: 200,
        body: [{ id: "a1", providerId: "google", accountId: "g1", createdAt: 1_700_000_000_000 }],
      },
    ]);

    const [account] = await new AccountClient(auth).listAccounts();

    expect(typeof account?.createdAt).toBe("string");
    expect(account?.providerId).toBe("google");
  });
});
