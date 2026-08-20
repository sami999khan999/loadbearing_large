import { AppError } from "../app.error.js";

/**
 * What anything unrecognised becomes.
 *
 * The original is kept for the logger and **cannot** reach the envelope: it is
 * defined non-enumerable, so `JSON.stringify` skips it and `toJSON()` never names
 * it. That is what stops a Postgres error string — which happily contains your
 * table names — from travelling to a client.
 */
export class InternalError extends AppError {
  public override readonly cause: unknown;

  public constructor(cause?: unknown) {
    super("INTERNAL");
    Object.defineProperty(this, "cause", {
      value: cause,
      enumerable: false,
      writable: false,
      configurable: false,
    });
  }
}
