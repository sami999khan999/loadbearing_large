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
  // The organization a brand-new user is enrolled into on their first session, by slug.
  // Undefined switches enrolment off, which is the default and the right production
  // posture: open sign-up then produces unaffiliated users whose sign-in is refused,
  // and membership becomes something an invitation grants. `.env.example` sets it to
  // the slug `pnpm db:seed` creates, so a fresh clone can sign up and get in.
  readonly bootstrapOrganizationSlug?: string;
}
