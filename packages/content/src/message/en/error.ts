export const error = {
  "error.unauthorized": "Please sign in to continue.",
  "error.forbidden": "You do not have permission to do that.",
  "error.notFound": "We could not find what you were looking for.",
  "error.conflict": "Someone else changed this first. Reload and try again.",
  "error.rateLimited": "Too many attempts. Please wait a moment and try again.",
  "error.unexpected": "Something went wrong. Please try again.",
  "error.twoFactorRequired": "Enter the code from your authenticator app to continue.",
  // The developer-facing sentence `ServerOnly.assert` used to carry inline. It is
  // copy like any other now — keyed, interpolated, and translatable — which is why
  // `@loadbearing/errors` has no message field at all.
  "error.serverOnly":
    "{package} was imported into a client bundle. This is a leak, not a bundle-size problem — it means database or credential code is reachable from the browser.",
  "error.field.required": "{field} is required.",
  "error.field.tooShort": "{field} must be at least {min} characters.",
  "error.field.tooLong": "{field} must be at most {max} characters.",
  "error.field.invalidFormat": "{field} is not in the expected format.",
  "error.field.invalid": "{field} is not valid.",
} as const;
