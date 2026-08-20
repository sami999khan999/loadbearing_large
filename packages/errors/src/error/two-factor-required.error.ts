import { AppError } from "../app.error.js";

/**
 * Not a failure so much as a fork in the flow — the sign-in form branches on this
 * code to show the second factor. It exists as a code precisely so no one has to
 * match on the words "two-factor" in a message.
 */
export class TwoFactorRequiredError extends AppError {
  public constructor() {
    super("TWO_FACTOR_REQUIRED");
  }
}
