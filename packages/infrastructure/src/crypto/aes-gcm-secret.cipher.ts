import { createCipheriv, createDecipheriv, randomBytes, SecretCipher } from "../import.js";

// AES-256-GCM: a fresh nonce per secret, and a tag that refuses a ciphertext someone
// edited. The stored form is `v1.<nonce>.<tag>.<ciphertext>`, each part base64url.
export class AesGcmSecretCipher extends SecretCipher {
  private static readonly VERSION = "v1";
  private readonly key: Buffer;

  // `MAIL_SECRET_KEY`: 32 bytes, base64. Refused at construction rather than at the first
  // save, so a short key is a boot failure and not a tenant's broken mail.
  public constructor(base64Key: string) {
    super();
    this.key = Buffer.from(base64Key, "base64");
    if (this.key.length !== 32) throw new Error("MAIL_SECRET_KEY must be 32 bytes, base64.");
  }

  public override encrypt(plaintext: string): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, nonce);
    const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return [AesGcmSecretCipher.VERSION, nonce, cipher.getAuthTag(), body]
      .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
      .join(".");
  }

  public override decrypt(ciphertext: string): string {
    const [version, nonce, tag, body, ...rest] = ciphertext.split(".");
    if (
      version !== AesGcmSecretCipher.VERSION ||
      !nonce ||
      !tag ||
      body === undefined ||
      rest.length
    ) {
      throw new Error("Not a secret this cipher wrote.");
    }
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(nonce, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(body, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  }
}
