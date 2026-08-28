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
      },

      // Paired with `requireEmailVerification`, which defaults to `true` in
      // `.env.example`. With the flag on and no sender, a fresh clone could complete a
      // sign-up and then never sign in — the account existed and the only thing that
      // could unlock it was never sent.
      emailVerification: {
        sendVerificationEmail: async ({ user, url }) => mailer.sendVerification(user.email, url),
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
        },
      },

      account: { modelName: "accounts" },

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
      plugins: [bearer(), twoFactor({ schema: { twoFactor: { modelName: "twoFactors" } } })],
    } satisfies BetterAuthOptions;

    return betterAuth(options);
  }
}

// What every consumer names: `BetterAuthSessionResolver` takes one, `Container` holds one.
export type AuthInstance = ReturnType<typeof AuthFactory.create>;
