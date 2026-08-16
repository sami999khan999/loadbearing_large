export * from "./clock.js";
export * from "./result.js";
export * from "./server-only.js";
export * from "./uuid.js";

/**
 * Placeholder kept only until doc 23, where apps/web imports it once to prove the
 * workspace → bundler chain end to end. Delete it after that step, not before.
 */
export class CorePackage {
  public static readonly id = "@loadbearing/core";
}
