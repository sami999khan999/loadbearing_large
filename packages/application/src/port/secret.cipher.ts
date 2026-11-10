// Encrypts a secret the database must hold, such as a tenant's SMTP password (`26.11`).
// Keyed by `MAIL_SECRET_KEY`, never `AUTH_SECRET`: rotating one must not break the other.
export abstract class SecretCipher {
  public abstract encrypt(plaintext: string): string;

  public abstract decrypt(ciphertext: string): string;
}
