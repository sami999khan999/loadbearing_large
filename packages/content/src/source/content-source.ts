import type { NavItem } from "../collection/index.js";
import type { ImageKey } from "../import.js";
import type { ResolvedMedia } from "../media/index.js";
import { type Namespace, SHELL_NAMESPACES } from "../message/index.js";
import type { Locale } from "../primitive/index.js";
import type { MessageSnapshot, Translator } from "../translator/index.js";

// The seam a CMS slots into — adding `DbContentSource` is one line in `Container`.
// All four shapes are declared: keyed strings, media references, repeating records,
// and long-form documents.
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

  // Shape 2: a media reference. Async in the seam even though the static implementation
  // answers from memory — a CMS resolves this over the network, and a signature that
  // changed for it would change every call site.
  public abstract media(key: ImageKey): Promise<ResolvedMedia>;

  // Shape 3: repeating records. An editor may reorder the menu, rename items and change
  // icons; `module` is what they cannot repoint, because `ModuleRegistry` owns the gate.
  public abstract nav(): Promise<readonly NavItem[]>;

  // Shape 4: long-form editorial, by slug. `null` for a slug this source has no document
  // for — a missing terms page is a 404, not an exception.
  public abstract document(slug: string): Promise<string | null>;
}
