import type { ErrorCode } from "../catalog/index.js";

/**
 * The only place in this package that knows HTTP exists.
 *
 * `@loadbearing/application` may **not** import this — a status code is a
 * transport concern, and the discipline that keeps the transport swappable is
 * that the domain layer has never heard of the number. The ESLint config bans
 * this import name for that package specifically.
 *
 * `Record<ErrorCode, number>` is total, so a new code fails to compile until it
 * has a status.
 */
export const HTTP_STATUS: Readonly<Record<ErrorCode, number>> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  BAD_REQUEST: 400,
  TWO_FACTOR_REQUIRED: 401,
  RATE_LIMITED: 429,
  UNAVAILABLE: 503,
  INTERNAL: 500,
};
