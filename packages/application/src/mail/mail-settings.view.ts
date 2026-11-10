import type { MailSettingsRecord } from "./mail-settings.repository.js";

// What a client may see of a row: everything but the password, which is only ever set.
export interface MailSettingsView {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly username: string | null;
  readonly hasPassword: boolean;
  readonly fromAddress: string;
  readonly updatedAt: Date;
}

export class MailSettingsViews {
  private constructor() {}

  public static of(record: MailSettingsRecord): MailSettingsView {
    return {
      host: record.host,
      port: record.port,
      secure: record.secure,
      username: record.username,
      hasPassword: record.passwordCiphertext !== null,
      fromAddress: record.fromAddress,
      updatedAt: record.updatedAt,
    };
  }
}
