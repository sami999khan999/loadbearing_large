import { type NavItem, navItems } from "../collection/index.js";
import type { ImageKey } from "../import.js";
import type { ResolvedMedia } from "../media/index.js";
import { StaticMediaResolver } from "../media/index.js";
import type { MessageBundle, Namespace } from "../message/index.js";
import { type BundleLoader, CLIENT_CATALOG, type MessageCatalog } from "../message/index.js";
import type { Locale } from "../primitive/index.js";
import { type MessageSnapshot, Translator } from "../translator/index.js";
import { ContentSource } from "./content-source.js";

export class StaticContentSource extends ContentSource {
  private readonly mediaResolver = new StaticMediaResolver();

  // Defaults to the client catalog. The server passes its own catalog explicitly.
  public constructor(private readonly catalog: MessageCatalog = CLIENT_CATALOG) {
    super();
  }

  // English loads alongside the target locale, per namespace. That is the fallback
  // layer, and it is what makes a `Partial<>` locale safe.
  public override async messages(
    locale: Locale,
    namespaces: readonly Namespace[],
  ): Promise<MessageSnapshot> {
    const wanted = ContentSource.resolve(namespaces);

    const [base, overrides] = await Promise.all([
      StaticContentSource.load(this.catalog.en, wanted),
      locale === "en"
        ? Promise.resolve<MessageBundle>({})
        : StaticContentSource.load(this.catalog[locale], wanted),
    ]);

    return { locale, namespaces: wanted, base, overrides };
  }

  public override async translator(
    locale: Locale,
    namespaces: readonly Namespace[],
  ): Promise<Translator> {
    return new Translator(await this.messages(locale, namespaces));
  }

  // The next three are genuinely synchronous work, so they return `Promise.resolve`
  // rather than being `async` with no `await` — which `require-await` rejects, and
  // which would claim an asynchrony these do not have. Only the two above really wait.
  public override media(key: ImageKey): Promise<ResolvedMedia> {
    return Promise.resolve(this.mediaResolver.resolve(key));
  }

  public override nav(): Promise<readonly NavItem[]> {
    return Promise.resolve(navItems);
  }

  // Always `null`. There are no static documents — long-form editorial is the shape
  // that exists to come from a database, and a `DbContentSource` is where it lands.
  public override document(_slug: string): Promise<string | null> {
    return Promise.resolve(null);
  }

  // A catalog that cannot serve a namespace is skipped, never thrown on — that is how
  // a client catalog structurally cannot obtain server-only copy.
  private static async load(
    loaders: Partial<Record<Namespace, BundleLoader>>,
    namespaces: readonly Namespace[],
  ): Promise<MessageBundle> {
    const present = namespaces
      .map((namespace) => loaders[namespace])
      .filter((loader): loader is BundleLoader => loader !== undefined);

    const bundles = await Promise.all(present.map((loader) => loader()));
    return Object.assign({}, ...bundles) as MessageBundle;
  }
}
