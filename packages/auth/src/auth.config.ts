// Every value here comes from the environment through `ContainerConfig` (17). None of
// them are literals in this package: session lifetime is an operational decision that
// differs between a staging box and production, and burying it in a factory makes it a
// deploy rather than a variable.
export interface AuthConfig {
  readonly secret: string;
  readonly baseUrl: string;
  // The CSRF defence, and the same list the CORS allowlist reads (24). Explicit, never a
  // wildcard, and carrying both Tauri origins — the scheme differs by platform, so
  // shipping one of them is half a deployment.
  readonly trustedOrigins: readonly string[];
  readonly sessionMaxAgeSeconds: number;
  // The revocation window, and the reason it is capped rather than tuned: a session is
  // only re-checked when this expires. Sixty seconds is the number this system answers
  // for when someone asks why removed access still works (16.9).
  readonly cookieCacheMaxAgeSeconds: number;
  readonly requireEmailVerification: boolean;
  // What an authenticator app displays beside a TOTP code, and the product name in
  // transactional mail. On the 27.5 rename checklist: changing it after anyone has
  // enrolled leaves their authenticator naming a product that no longer exists.
  readonly appName: string;
  // How a brand-new user acquires the membership without which no session is issued.
  //
  // `personal` — they become the owner of an organization of their own. The default,
  // and the only one that works on an empty database.
  // `bootstrap` — they join the organization named by `bootstrapOrganizationSlug`.
  // `invite` — they acquire none, and their first sign-in is refused.
  //
  // `Container` reads this and binds one of three `MembershipEnroller`s; nothing else
  // in the system branches on it.
  readonly enrolmentMode: "personal" | "bootstrap" | "invite";
  // Undefined switches Google sign-in off entirely rather than half-configuring it: an
  // empty client id reaches Google as a request it rejects at the consent screen, which
  // is a failure the user sees and nobody can diagnose from the logs.
  readonly google?: { readonly clientId: string; readonly clientSecret: string };
  // Read only when `enrolmentMode` is `bootstrap`, and required in that case — the env
  // schema refuses to boot without it rather than leaving a mode that silently enrols
  // nobody. Ignored entirely under `personal` and `invite`. It is the same slug
  // `pnpm db:seed` creates, which is what stops the two drifting.
  readonly bootstrapOrganizationSlug?: string;
}
