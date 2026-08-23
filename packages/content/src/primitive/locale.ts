export type Locale = "en" | "bn";

export class Locales {
  private constructor() {}

  public static readonly ALL: readonly Locale[] = ["en", "bn"];
  public static readonly DEFAULT: Locale = "en";

  // The boundary that narrows an untrusted string before it can index a catalog.
  public static is(value: string | null | undefined): value is Locale {
    return value !== null && value !== undefined && Locales.ALL.includes(value as Locale);
  }

  // `override` wins — a cookie or a settings screen — else the first matching tag.
  // Takes strings, never a `Request`, so this package stays DOM-free.
  public static negotiate(acceptLanguage: string | null, override: string | null): Locale {
    if (Locales.is(override)) return override;

    for (const part of (acceptLanguage ?? "").split(",")) {
      const tag = part.split(";")[0]?.trim().split("-")[0] ?? "";
      if (Locales.is(tag)) return tag;
    }

    return Locales.DEFAULT;
  }
}
