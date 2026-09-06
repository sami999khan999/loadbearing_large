import type { ContentSource, Locale } from "../import.js";

// The only reader of the `email` namespace, and it reads copy through `ContentSource`
// like everything else, so a subject and a button label share one `Translator`.
export class DigestComposer {
  public constructor(private readonly content: ContentSource) {}

  public async subject(locale: Locale, count: number): Promise<string> {
    const t = await this.content.translator(locale, ["email"]);
    return count === 0 ? t.t("email.digest.subjectEmpty") : t.t("email.digest.subject", { count });
  }

  // The recipient's locale is a parameter, so a per-recipient subject line is a second
  // call rather than a second system.
  public async greeting(locale: Locale, name: string): Promise<string> {
    const t = await this.content.translator(locale, ["email"]);
    return t.t("email.digest.greeting", { name });
  }

  // Rendering per recipient is cheap and resolving permissions per recipient is not, so
  // the caller groups by capability shape.
  public async body(locale: Locale, organization: string, count: number): Promise<string> {
    const t = await this.content.translator(locale, ["email"]);

    return [
      count === 0 ? t.t("email.digest.empty") : t.t("email.digest.intro"),
      t.t("email.digest.viewAll"),
      t.t("email.digest.footer", { organization }),
    ].join("\n\n");
  }
}
