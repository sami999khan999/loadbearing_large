// The UTC hour a digest goes out when a tenant has not chosen one: the single hour every
// tenant shared before `26.7`, so nothing moves for a tenant that never opens the setting.
export class DigestHour {
  private constructor() {}

  public static readonly DEFAULT = 7;
}
