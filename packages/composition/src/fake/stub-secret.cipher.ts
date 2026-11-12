import { SecretCipher } from "../import.js";

// Reversible and visibly so: a spec can read what was "encrypted" and see it never leaked.
export class StubSecretCipher extends SecretCipher {
  public override encrypt(plaintext: string): string {
    return `sealed:${plaintext}`;
  }

  public override decrypt(ciphertext: string): string {
    return ciphertext.replace(/^sealed:/, "");
  }
}
