import { ERROR_CATALOG, type ErrorCode } from "./catalog/index.js";

/**
 * `Error.captureStackTrace` is a V8 extension, not standard, so `lib: ["ES2024"]`
 * does not declare it — the same situation as `crypto` in `@loadbearing/core`.
 * Naming the one method keeps the type independent of whether `@types/node` ever
 * lands in the program, and the optional call keeps it correct where V8 is absent.
 */
type StackTraceCapture = {
  captureStackTrace?: (target: object, constructorOpt?: unknown) => void;
};

/** Structured, JSON-safe, and interpolated into copy by `content`. Never prose. */
export type ErrorContext = Readonly<Record<string, string | number | boolean>>;

export interface FieldViolation {
  readonly field: string;
  /** A rule name, never a sentence. `content` maps it to a message key. */
  readonly rule: string;
  readonly params?: Readonly<Record<string, string | number>>;
}

export interface ErrorEnvelope {
  readonly code: ErrorCode;
  readonly context: ErrorContext;
  readonly fields?: readonly FieldViolation[];
  readonly traceId?: string;
}

/**
 * The one failure shape, thrown on the server and reconstructed on the client.
 *
 * **It carries no message.** `Error.message` is the code, because every word a
 * user reads lives in `@loadbearing/content`, keyed by code and translated. That
 * is the strongest form of "no built-in error messages" available: there is no
 * message to leak, to forget to translate, or to match on. Callers branch on
 * `code` and render from `context`.
 */
export abstract class AppError extends Error {
  public constructor(
    public readonly code: ErrorCode,
    public readonly context: ErrorContext = {},
    public readonly fields?: readonly FieldViolation[],
  ) {
    // The code *is* the message. Nothing else is ever assigned here.
    super(code);
    this.name = new.target.name;
    (Error as StackTraceCapture).captureStackTrace?.(this, new.target);
  }

  /**
   * Untrusted input, so this is the boundary — an envelope arrives from the wire,
   * a cache, or a queue payload.
   *
   * `Object.hasOwn`, not `value in ERROR_CATALOG`: `in` walks the prototype chain,
   * so `"constructor"` and `"toString"` would both pass and then resolve to a
   * `retryable` of `undefined`.
   */
  public static isKnownCode(value: string): value is ErrorCode {
    return Object.hasOwn(ERROR_CATALOG, value);
  }

  /**
   * Rebuild from the wire. Returns `null` for an unrecognised code rather than
   * trusting it — the same boundary `CapabilitySet.from()` enforces.
   */
  public static from(envelope: ErrorEnvelope): AppError | null {
    if (!AppError.isKnownCode(envelope.code)) return null;
    return new TransportError(envelope.code, envelope.context, envelope.fields);
  }

  public get retryable(): boolean {
    return ERROR_CATALOG[this.code].retryable;
  }

  public toJSON(): ErrorEnvelope {
    return {
      code: this.code,
      context: this.context,
      ...(this.fields ? { fields: this.fields } : {}),
    };
  }
}

/**
 * What `AppError.from()` produces. A reconstructed error keeps its code and its
 * context but not the original class, and that is fine: callers only ever read
 * `code`, which is why the adapter switches on a closed vocabulary rather than
 * on `instanceof`.
 */
export class TransportError extends AppError {}
