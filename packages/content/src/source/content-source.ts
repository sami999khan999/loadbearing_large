import { type Namespace, SHELL_NAMESPACES } from "../message/index.js";
import type { Locale } from "../primitive/index.js";
import type { MessageSnapshot, Translator } from "../translator/index.js";

// The seam a CMS slots into — adding `DbContentSource` is one line in `Container`.
// Partial today: `media()`, `nav()` and `document()` join at their own setup steps.
export abstract class ContentSource {
  // In every snapshot, from every implementation. Callers cannot opt out.
  public static readonly SHELL: readonly Namespace[] = SHELL_NAMESPACES;

  // Union of the shell and what was asked for. `protected static` so "`common` and
  // `error` are always there" is a property of the seam, not of each call site.
  protected static resolve(requested: readonly Namespace[]): readonly Namespace[] {
    return [...new Set([...ContentSource.SHELL, ...requested])];
  }

  public abstract messages(
    locale: Locale,
    namespaces: readonly Namespace[],
  ): Promise<MessageSnapshot>;

  public abstract translator(locale: Locale, namespaces: readonly Namespace[]): Promise<Translator>;
}
