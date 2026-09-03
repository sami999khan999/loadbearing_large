import type { AuthConfig } from "./auth.config.js";
import {
  type BetterAuthOptions,
  bearer,
  betterAuth,
  type CacheStore,
  type Database,
  drizzleAdapter,
  twoFactor,
  type UserId,
  Uuid,
} from "./import.js";
import type { AuthMailer } from "./mail/auth.mailer.js";
import type { MembershipEnroller } from "./session/membership.enroller.js";
import type { MembershipReader } from "./session/membership.reader.js";

// The webview origins the Tauri shell serves from — `tauri://localhost` on macOS and
// Linux, `http://tauri.localhost` on Windows. Both, because the scheme genuinely differs
// by platform and shipping one produces an app that works for half your team (30).
const DESKTOP_ORIGINS = ["tauri://localhost", "http://tauri.localhost"] as const;

const surfaceOf = (origin: string | null | undefined): "web" | "desktop" =>
  origin && DESKTOP_ORIGINS.some((allowed) => origin.startsWith(allowed)) ? "desktop" : "web";

// The one place in the repository that configures Better Auth. Every option below is
// either a security boundary or the reason a whole surface works; none of it is taste.
export class AuthFactory {
  private constructor() {}

  // The one method here with no return annotation, and it has to stay that way.
  // `ReturnType<typeof betterAuth>` is `Auth<BetterAuthOptions>` — the *unconfigured*
  // instance — and the two-factor plugin widens the user type, so annotating with it
  // fails to assign. The type has to be inferred from these options and read back out.
  public static create(
    config: AuthConfig,
    database: Database,
    cache: CacheStore,
    memberships: MembershipReader,
    enroller: MembershipEnroller,
    mailer: AuthMailer,
  ) {
    const options = {
      secret: config.secret,
      baseURL: config.baseUrl,
      trustedOrigins: [...config.trustedOrigins],
      // Read by the two-factor plugin as the TOTP issuer, which is the label an
      // authenticator app shows beside the code. On the 27.5 rename checklist.
      appName: config.appName,

      database: drizzleAdapter(database.client, { provider: "pg" }),

      emailAndPassword: {
        enabled: true,
        requireEmailVerification: config.requireEmailVerification,
        // The difference between "changed my password" and "actually locked them out".
        revokeSessionsOnPasswordReset: true,
        // Without this, `revokeSessionsOnPasswordReset` above guards a flow no user can
        // start: Better Auth's reset endpoint mints a token and has nowhere to send it,
        // so "forgot password" is a dead end that returns 200.
        sendResetPassword: async ({ user, url }) => mailer.sendPasswordReset(user.email, url),
        // Better Auth defaults to 8. Twelve, because the only defence a password rule
        // actually buys is length — and this is the one place the number can be stated.
        minPasswordLength: 12,
        // A ceiling, not a policy. Hashing is deliberately slow, so an unbounded input
        // is a CPU exhaustion vector on an unauthenticated endpoint.
        maxPasswordLength: 128,
        // No session from the sign-up response. With verification required the account
        // cannot be used yet anyway, and issuing one would hand a session to an address
        // nobody has proved they can read.
        autoSignIn: false,
        // One hour. A reset link is a bearer credential for the account; the default
        // leaves it live far longer than the person who asked for it needs.
        resetPasswordTokenExpiresIn: 3600,
      },

      // Paired with `requireEmailVerification`, which defaults to `true` in
      // `.env.example`. With the flag on and no sender, a fresh clone could complete a
      // sign-up and then never sign in — the account existed and the only thing that
      // could unlock it was never sent.
      emailVerification: {
        sendVerificationEmail: async ({ user, url }) => mailer.sendVerification(user.email, url),
        // The sign-up endpoint sends it. Without this the account exists, the flag is
        // false, and the only thing that could clear it is never dispatched.
        sendOnSignUp: true,
        // Verifying an address proves the mailbox was reachable, not that the person
        // reading it is at that browser. A link followed from a shared inbox must not
        // put a session in whatever client opened it.
        autoSignInAfterVerification: false,
        expiresIn: 3600,
      },

      // ── model naming ───────────────────────────────────────────────────────
      // `modelName` is what the Drizzle adapter looks up in the schema object, so these
      // five names *are* the export names in `packages/infrastructure/src/schema/auth.schema.ts`.
      // Renamed to the repository's plural convention — `users` beside `organizations`,
      // `roles`, `memberships` — rather than Better Auth's singular defaults. Field names
      // need no mapping: Better Auth's are already camelCase, which is the convention
      // here too (camelCase property, snake_case column).

      user: {
        modelName: "users",
        additionalFields: {
          // The locale content is rendered in (20). On the user rather than a preferences
          // table because it is read on the first server render of every request, before
          // anything else about the user is needed.
          locale: { type: "string", required: false, defaultValue: "en" },
          timezone: { type: "string", required: false },
          // Deactivation is a state, not a delete: the activity log still points at this
          // row and always will. `input: false` keeps it off every registration payload.
          deactivatedAt: { type: "date", required: false, input: false },
          // Where the last organization switch left this person. Written by the
          // organization plugin through `internalAdapter.updateUser`, which is why it
          // must be declared here and not only in the Drizzle schema.
          lastActiveOrganizationId: { type: "string", required: false, input: false },
        },

        changeEmail: {
          enabled: true,
          // Delivered to `user.email` — the address being moved *away from*. Better
          // Auth hands us the new one in the same payload and it is deliberately not
          // used: confirming at the destination means a session someone else is holding
          // can move the account to an address its owner cannot reach.
          sendChangeEmailConfirmation: async ({ user, url }) =>
            mailer.sendEmailChangeConfirmation(user.email, url),
        },
      },

      account: {
        modelName: "accounts",
        accountLinking: {
          enabled: true,
          // Google asserts a verified address, so a Google sign-in matching an existing
          // account is the same person and linking is the right answer — the
          // alternative is a dead end where a real user is told the email is taken by
          // themselves. Untrusted providers still require an explicit link from the
          // settings page.
          //
          // `requireLocalEmailVerified` defaults to true and is deliberately left
          // alone: it is what stops someone pre-registering an unverified account at a
          // victim's address and having the victim's Google identity linked into it.
          trustedProviders: ["google"],
        },
      },

      // Absent rather than half-configured when no credentials were supplied. An empty
      // client id is rejected at Google's consent screen, which is a failure the user
      // sees and nobody can diagnose from a log line here. It is also what lets the
      // sign-in page decide whether to render the button at all.
      socialProviders: config.google
        ? {
            google: {
              clientId: config.google.clientId,
              clientSecret: config.google.clientSecret,
              // Without this Google silently reuses whichever account the browser is
              // already signed into, which makes "sign in as someone else" impossible
              // on a shared machine and looks like a bug in this application.
              prompt: "select_account",
            },
          }
        : {},

      session: {
        modelName: "sessions",
        expiresIn: config.sessionMaxAgeSeconds,
        updateAge: Math.floor(config.sessionMaxAgeSeconds / 4),

        // Not a default. With secondary storage configured, Better Auth stops writing
        // the `sessions` row entirely — which would put the authoritative session on the
        // `allkeys-lru` Redis instance, where an ordinary eviction is a random sign-out.
        // Postgres owns the record; Redis is the read-through in front of it.
        storeSessionInDatabase: true,

        // Most requests skip the session lookup altogether. The single largest
        // performance win available here, and it costs one block.
        cookieCache: {
          enabled: true,
          maxAge: config.cookieCacheMaxAgeSeconds,
        },

        // Both pinned at sign-in and never accepted from the client — `input: false` is
        // what stops a sign-up body from naming its own tenant or claiming a surface.
        additionalFields: {
          activeOrganizationId: { type: "string", required: true, input: false },
          // Which shell this session was opened from. Recorded rather than inferred later
          // because desktop sessions are longer-lived and have to be revocable on their
          // own — "sign out all devices" has to reach a machine that may be offline
          // (16.9), and a user-agent string is not a durable answer to which is which.
          surface: { type: "string", required: true, input: false },
        },
      },

      // The same trap as `storeSessionInDatabase`, one table over: with secondary storage
      // configured, Better Auth stops creating the verification table at all and keeps
      // email-verification and password-reset tokens in Redis only. An eviction there is a
      // reset link that stops working with no error on either side.
      verification: {
        modelName: "verifications",
        storeInDatabase: true,
      },

      advanced: {
        // User-visible in the browser, so it is on the 27.5 rename checklist. Kept
        // generic rather than named after the project for exactly that reason —
        // changing it later invalidates every cookie already issued.
        cookiePrefix: "app",
        // Time-ordered uuids, so `user.id` is the same shape as every other primary key
        // here and `UserId` — declared `z.uuid().brand<"UserId">()` in contracts — is
        // finally true rather than aspirational. Better Auth's default is an opaque
        // string, which is what forced `user_id` to be `text` on the domain tables.
        database: { generateId: (): string => Uuid.v7() },
        defaultCookieAttributes: {
          httpOnly: true,
          sameSite: "lax",
          secure: config.baseUrl.startsWith("https://"),
        },
      },

      rateLimit: {
        enabled: true,
        window: 60,
        max: 20,
        // Same Redis instance as the cache. A lost counter means a few extra attempts,
        // never a lockout — which is why eviction is acceptable here and not for sessions.
        storage: "secondary-storage",

        // Twenty a minute is right for the endpoints nobody attacks. It is far too
        // loose for the five below, each of which is either a guess against a
        // credential or an email this server pays to send. Paths are Better Auth's
        // own, relative to `basePath` — verified against the pinned runtime, because a
        // rule keyed on a path that does not exist silently rate-limits nothing.
        customRules: {
          "/sign-in/email": { window: 60, max: 10 },
          "/sign-up/email": { window: 60, max: 5 },
          "/request-password-reset": { window: 60, max: 3 },
          "/send-verification-email": { window: 60, max: 3 },
          "/two-factor/send-otp": { window: 60, max: 3 },
        },
      },

      // Redis in FRONT of Postgres, never instead of it. Anything here can vanish under
      // memory pressure; Better Auth reads through to the `sessions` table on a miss.
      secondaryStorage: {
        get: async (key) => cache.get<string>(`auth:${key}`),
        set: async (key, value, ttl) => cache.set(`auth:${key}`, value, ttl ?? 300),
        delete: async (key) => cache.delete(`auth:${key}`),
      },

      databaseHooks: {
        session: {
          create: {
            // Resolves the tenant once, at sign-in, so every later request reads it off
            // a session Better Auth was going to load anyway. Returning `false` aborts
            // the session: a user with no membership gets a failed sign-in, not an
            // unscoped principal.
            before: async (session, context) => {
              const userId = session.userId as UserId;

              // The reader first, and it answers on every session after the first —
              // enrolment is not on the sign-in path. Deliberately *not* a
              // `user.create.after` hook: Better Auth queues those until the whole
              // sign-up endpoint has finished, which is after this hook has already
              // run and refused the session. This is the first moment a membership
              // can exist and still be seen by the code that needs it.
              const organizationId =
                (await memberships.activeOrganizationFor(userId)) ?? (await enroller.enrol(userId));

              if (!organizationId) return false;

              const origin = context?.request?.headers.get("origin") ?? null;
              return {
                data: {
                  ...session,
                  activeOrganizationId: organizationId,
                  surface: surfaceOf(origin),
                },
              };
            },
          },
        },
      },

      // Bearer is not optional: the Tauri webview runs on `tauri://localhost`
      // (`http://tauri.localhost` on Windows) and a session cookie is never sent
      // cross-origin. One array element here, versus every endpoint and guard later.
      plugins: [
        bearer(),
        twoFactor({
          schema: { twoFactor: { modelName: "twoFactors" } },
          // Defaults to `appName` already; stated so the coupling is visible at the
          // line that depends on it rather than forty lines up.
          issuer: config.appName,
          // Ten codes of ten characters, each single-use. The recovery path for a lost
          // phone, and the reason enabling 2FA here cannot lock someone out.
          backupCodeOptions: { amount: 10, length: 10 },
          otpOptions: {
            // **Minutes, not seconds** — Better Auth's default is 3. Five is a
            // compromise with mail delivery latency; anything much longer widens the
            // window in which a forwarded message is still a valid second factor.
            period: 5,
            sendOTP: async ({ user, otp }) => mailer.sendTwoFactorOtp(user.email, otp),
          },
        }),
      ],
    } satisfies BetterAuthOptions;

    return betterAuth(options);
  }
}

// What every consumer names: `BetterAuthSessionResolver` takes one, `Container` holds one.
export type AuthInstance = ReturnType<typeof AuthFactory.create>;
