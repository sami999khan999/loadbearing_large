import { describe, expect, it } from "vitest";
import { AesGcmSecretCipher } from "../../src/crypto/aes-gcm-secret.cipher.js";

const KEY = Buffer.alloc(32, 7).toString("base64");

describe("AesGcmSecretCipher", () => {
  it("round-trips, with a fresh nonce each time", () => {
    const cipher = new AesGcmSecretCipher(KEY);
    const a = cipher.encrypt("hunter2");
    const b = cipher.encrypt("hunter2");

    expect(a).not.toBe(b);
    expect(a).not.toContain("hunter2");
    expect(cipher.decrypt(a)).toBe("hunter2");
  });

  it("refuses a ciphertext someone edited, or one another key wrote", () => {
    const cipher = new AesGcmSecretCipher(KEY);
    const sealed = cipher.encrypt("hunter2");
    const parts = sealed.split(".");
    const edited = [...parts.slice(0, 3), Buffer.from("other").toString("base64url")].join(".");

    expect(() => cipher.decrypt(edited)).toThrow();
    expect(() =>
      new AesGcmSecretCipher(Buffer.alloc(32, 9).toString("base64")).decrypt(sealed),
    ).toThrow();
  });

  it("refuses a key that is not 32 bytes at construction", () => {
    expect(() => new AesGcmSecretCipher(Buffer.alloc(16).toString("base64"))).toThrow("32 bytes");
  });
});
