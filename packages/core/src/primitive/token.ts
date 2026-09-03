type WebCrypto = {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
};

// An opaque random string for anything that must be unguessable — invitation tokens
// first. Here rather than beside `ApiKeyHasher` because `application` cannot reach
// `auth`, and the invite use-case is the one that needs it.
export class Token {
  private constructor() {}

  public static random(bytes = 32): string {
    const buffer = (globalThis as unknown as { crypto: WebCrypto }).crypto.getRandomValues(
      new Uint8Array(bytes),
    );
    return [...buffer].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
}
