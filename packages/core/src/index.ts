export { Clock, FixedClock, SystemClock } from "./clock.js";
export { Err, Ok, type Result, Results } from "./result.js";
export { ServerOnly } from "./server-only.js";
export { Uuid } from "./uuid.js";

/**
 * Placeholder kept only until doc 23, where apps/web imports it once to prove the
 * workspace → bundler chain end to end. Delete it after that step, not before.
 */
export class CorePackage {
  public static readonly id = "@loadbearing/core";
}
