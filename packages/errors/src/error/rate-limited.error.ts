import { AppError } from "./app.error.js";

// `RATE_LIMITED` has been in the catalog since 09 — retryable, expected, with
// `error.rateLimited` copy already written — and had no class, so nothing could throw
// it. Better Auth answers 429 on the credential endpoints its rate limiter guards, and
// that is the first caller in the repository able to produce one.
export class RateLimitedError extends AppError {
  // The endpoint that refused, not the identity that was refused. A rate-limit context
  // carrying a user id or an IP address is a high-cardinality value one hop from a log
  // label, and the limiter's job is not to describe who was throttled.
  public constructor(scope = "request") {
    super("RATE_LIMITED", { scope });
  }
}
