import { ErrorNormalizer, HTTP_STATUS, type Logger, ORPCError } from "../import.js";

export class ErrorInterceptor {
  private constructor() {}

  public static toTransport(thrown: unknown, log: Logger, traceId: string): never {
    // `normalize()` guarantees an `AppError` for anything thrown — a ZodError, a
    // Postgres failure, a rejected string — so there is no fall-through branch to get
    // wrong and no CODE_MAP to keep in step.
    const error = ErrorNormalizer.normalize(thrown);

    // The one place every server-side failure passes through, so the one place that has
    // to log it. `failure` reads the severity for its level and keeps the
    // non-enumerable `cause` that `toJSON()` cannot reach.
    log.failure(error);

    // The body is the envelope, not prose: the client reconstructs the same class and
    // renders it through `content` in its own locale. The trace id is what makes an
    // error page able to show a reference string.
    throw new ORPCError(error.code, {
      status: HTTP_STATUS[error.code],
      data: { ...error.toJSON(), traceId },
    });
  }
}
