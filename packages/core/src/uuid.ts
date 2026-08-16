/**
 * The one Web Crypto method this package uses.
 *
 * `library.json` sets `lib: ["ES2024"]` with no DOM, so `crypto` is not a declared
 * identifier in this package. It happens to resolve today because `clock.spec.ts`
 * imports vitest, which pulls vite's `/// <reference types="node" />` and with it
 * the `@types/node` globals into the program — so deleting the tests would stop
 * `Uuid` from compiling. Naming the method and reaching it off `globalThis` makes
 * the type independent of whatever else lands in the program.
 */
type WebCrypto = {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
};

export class Uuid {
  private constructor() {}

  private static webCrypto(): WebCrypto {
    return (globalThis as unknown as { crypto: WebCrypto }).crypto;
  }

  /**
   * UUIDv7 — time-ordered. Sequential inserts stay on the right-hand side of the
   * B-tree instead of scattering across it, which is worth a lot on a table
   * that only ever grows.
   */
  public static v7(): string {
    const ts = BigInt(Date.now());
    const bytes = Uuid.webCrypto().getRandomValues(new Uint8Array(16));
    for (let i = 0; i < 6; i++) {
      bytes[i] = Number((ts >> BigInt(40 - i * 8)) & 0xffn);
    }
    // Version 7 into the high nibble of byte 6, RFC 9562 variant into the top two
    // bits of byte 8. The `?? 0` can never fire — a Uint8Array(16) always has both
    // indices — but `noUncheckedIndexedAccess` types the read as possibly-undefined
    // and this discharges it without a non-null assertion.
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const h = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  public static isValid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }
}
