type WebCrypto = {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
};

// An opaque random string for anything unguessable. Here rather than beside
// `ApiKeyHasher` because `application` cannot reach `auth`.
export class Token {
  private constructor() {}

  public static random(bytes = 32): string {
    const buffer = (globalThis as unknown as { crypto: WebCrypto }).crypto.getRandomValues(
      new Uint8Array(bytes),
    );
    return [...buffer].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
}
