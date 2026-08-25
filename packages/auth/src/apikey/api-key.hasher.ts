export interface GeneratedApiKey {
  // Shown to the user exactly once, at creation. Never stored, anywhere, ever.
  readonly token: string;
  readonly prefix: string;
  readonly hash: string;
}

export class ApiKeyHasher {
  private static readonly PREFIX_LENGTH = 8;
  private static readonly TOKEN_BYTES = 32;

  private constructor() {}

  public static async generate(): Promise<GeneratedApiKey> {
    const bytes = crypto.getRandomValues(new Uint8Array(ApiKeyHasher.TOKEN_BYTES));
    const token = `rk_${ApiKeyHasher.hex(bytes)}`;

    return {
      token,
      prefix: ApiKeyHasher.prefixOf(token),
      hash: await ApiKeyHasher.hash(token),
    };
  }

  // Only the digest is stored, so a database dump contains no usable credential.
  public static async hash(token: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    return ApiKeyHasher.hex(new Uint8Array(digest));
  }

  // The indexed lookup column. Without it, authenticating a key is a scan-and-compare
  // over every key ever issued.
  public static prefixOf(token: string): string {
    return token.slice(0, ApiKeyHasher.PREFIX_LENGTH);
  }

  // Constant time in the length of the compared strings. The prefix already narrowed the
  // candidate set, so this costs nothing — and it removes a class of question that would
  // otherwise have to be answered in a security review.
  public static timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  private static hex(bytes: Uint8Array): string {
    return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
}
