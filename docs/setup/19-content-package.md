# 19 · `@ratchet/content`

> Every user-visible string, document, and structured record — plus the `ContentSource` seam a CMS will slot into later. React-free.

**Delivers:** `Translator`, `StaticContentSource`, the four content shapes, and a navigation model a content editor can safely change.

**Prerequisite:** [18 · `@ratchet/asset`](18-asset-package.md)

---

## Why content is a package

Two reasons, and the second is the one people miss.

**It is React-free on purpose.** `apps/worker` needs copy for digest and escalation emails and cannot import `feature`. The plain `Translator` class works in Node; the React binding (`useMessages`) lives in `feature` ([22](22-feature-package.md)).

**It ships a `ContentSource` abstract class even though `StaticContentSource` is the only implementation today.** That seam is what makes adding a CMS a one-line change in `Container` rather than a rewrite of every component. If you skip the abstraction now because there is only one implementation, the CMS conversation becomes "we would have to touch every screen."

```
packages/content/src/
├── index.ts
├── content-source.ts             → ContentSource (abstract)
├── static.content-source.ts      → StaticContentSource
├── translator.ts                 → Translator
├── media/
│   ├── index.ts
│   ├── media-ref.ts              → MediaRef
│   └── static.media-resolver.ts  → StaticMediaResolver
├── message/                      ── shape 1: short keyed strings
│   ├── en/
│   │   ├── index.ts
│   │   ├── common.ts
│   │   ├── nav.ts
│   │   ├── auth.ts
│   │   ├── error.ts
│   │   └── email.ts              ← the worker's namespace
│   └── bn/ …                     ← Partial<>, falls back to en
├── document/                     ── shape 2: long-form editorial
│   ├── document.schema.ts        → DocumentContract
│   └── document.entity.ts        → DocumentEntity
└── collection/                   ── shape 3: repeating records
    ├── collection.schema.ts      → CollectionContract
    └── nav/
        ├── nav.schema.ts         → NavContract
        └── nav.data.ts           → navItems
```

```js
// packages/content/eslint.config.js
export { default } from "@ratchet/eslint-config/oop";
```

---

## Step 19.1 — Messages

**`packages/content/src/message/en/common.ts`**

```ts
export const common = {
  "action.save": "Save",
  "action.cancel": "Cancel",
  "action.delete": "Delete",
  "action.confirm": "Confirm",
  "state.loading": "Loading…",
  "state.empty": "Nothing here yet",
  "state.error": "Something went wrong",
} as const;
```

**`packages/content/src/message/en/error.ts`**

```ts
export const error = {
  "error.forbidden": "You do not have permission to do that.",
  "error.notFound": "We could not find what you were looking for.",
  "error.conflict": "Someone else changed this first. Reload and try again.",
  "error.unexpected": "Something went wrong. Please try again.",
  "error.field.required": "{field} is required.",
  "error.field.tooShort": "{field} must be at least {min} characters.",
} as const;
```

**`packages/content/src/message/en/index.ts`**

```ts
import { auth } from "./auth.js";
import { common } from "./common.js";
import { email } from "./email.js";
import { error } from "./error.js";
import { nav } from "./nav.js";

export const en = { ...common, ...nav, ...auth, ...error, ...email } as const;

export type MessageKey = keyof typeof en;
export type MessageCatalog = Record<MessageKey, string>;
```

**`packages/content/src/message/bn/index.ts`**

```ts
import type { MessageKey } from "../en/index.js";

/** Partial by design — anything missing falls back to English. */
export const bn: Partial<Record<MessageKey, string>> = {
  "action.save": "সংরক্ষণ",
  "action.cancel": "বাতিল",
};
```

**Namespaced by concern, merged into one flat catalog.** `MessageKey` is a closed union, so a typo at a call site is a compile error rather than a raw key rendered to a user.

**A locale is `Partial<Record<MessageKey, string>>`.** Translations arrive incrementally; requiring completeness means either blocking a locale until it is finished or filling it with placeholder English that nobody ever notices needs replacing.

**`email` is a namespace, not a separate system.** The worker's digest subject lines come from the same catalog the UI uses, through the same `Translator`. Two copy systems means two places to fix a typo and one of them gets missed.

---

## Step 19.2 — `Translator`

**`packages/content/src/translator.ts`**

```ts
import type { MessageKey } from "./message/en/index.js";

export class Translator {
  constructor(
    private readonly base: Record<MessageKey, string>,
    private readonly overrides: Partial<Record<MessageKey, string>> = {},
  ) {}

  public t(key: MessageKey, params?: Readonly<Record<string, string | number>>): string {
    const template = this.overrides[key] ?? this.base[key];
    if (!params) return template;

    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match,
    );
  }

  public has(key: MessageKey): boolean {
    return key in this.overrides || key in this.base;
  }

  public with(overrides: Partial<Record<MessageKey, string>>): Translator {
    return new Translator(this.base, { ...this.overrides, ...overrides });
  }
}
```

**`{name}` interpolation, no library.** ICU MessageFormat handles plurals and gender properly and is the right answer when you need it. Until you do, a twelve-line replace has no dependency, no bundle cost, and no learning curve. Swapping later is a change inside this one class because every call site goes through `t()`.

**An unknown placeholder is left as-is**, not replaced with `undefined`. `"Hello {nmae}"` in the UI is obviously a bug; `"Hello undefined"` reads like a data problem and gets investigated in the wrong place.

**Immutable `with()`.** Per-request locale overrides in the worker compose without mutating a shared instance.

---

## Step 19.3 — Media references

**`packages/content/src/media/media-ref.ts`**

```ts
import type { ImageKey } from "@ratchet/asset";

export interface ResolvedMedia {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
}

export abstract class MediaResolver {
  public abstract resolve(key: ImageKey): ResolvedMedia;
}
```

**`packages/content/src/media/static.media-resolver.ts`**

```ts
import { ImageManifest, type ImageKey } from "@ratchet/asset";
import { MediaResolver, type ResolvedMedia } from "./media-ref.js";

export class StaticMediaResolver extends MediaResolver {
  public override resolve(key: ImageKey): ResolvedMedia {
    return ImageManifest.get(key);
  }
}
```

Content records hold `"home.hero"`, never a path. Today that resolves through `ImageManifest`; tomorrow a `CdnMediaResolver` returns a CDN URL for the same key and nothing above changes.

**`ImageKey` is imported as a type only.** `content` may depend on `asset`'s vocabulary without pulling its binaries into the worker's bundle.

---

## Step 19.4 — Navigation, and the line content must not cross

**`packages/content/src/collection/nav/nav.schema.ts`**

```ts
import { z } from "zod";

export class NavContract {
  private constructor() {}

  public static readonly item = z.object({
    /** A ModuleKey from @ratchet/permissions. NEVER a PermissionKey. */
    module: z.string(),
    labelKey: z.string(),
    icon: z.string(),
    order: z.number().int(),
  });

  public static readonly collection = z.array(NavContract.item);
}

export type NavItem = z.infer<typeof NavContract.item>;
```

**`packages/content/src/collection/nav/nav.data.ts`**

```ts
import { NavContract, type NavItem } from "./nav.schema.js";

export const navItems: readonly NavItem[] = NavContract.collection.parse([
  { module: "rbac", labelKey: "nav.roles", icon: "shield", order: 10 },
  { module: "member", labelKey: "nav.members", icon: "user", order: 20 },
]);
```

### The rule, stated plainly

**Content references the security surface; it never defines it.**

`nav.data.ts` carries `module: "rbac"`, not `permission: "rbac.role.read"`. `ModuleRegistry` in `permissions` ([08](08-permissions-package.md)) maps that key to its gate and its route.

An editor can reorder the menu, rename items, and change icons. An editor **cannot** change what gates a module or point a label at a different route. If `permission` were a content field, a CMS edit would be a privilege escalation — and that is exactly the kind of vulnerability that gets found by accident, years later.

Mechanically: **`content` must never import `PermissionKey`.** Add it to the package's own ESLint config:

```js
// packages/content/eslint.config.js
import oop from "@ratchet/eslint-config/oop";
import tseslint from "typescript-eslint";

export default tseslint.config(...oop, {
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "@ratchet/permissions",
            importNames: ["PermissionKey", "PermissionRegistry"],
            message:
              "Content names a module. ModuleRegistry owns which permission gates it. Import ModuleKey as a type instead.",
          },
        ],
      },
    ],
  },
});
```

**Zod parses the data at module load.** A malformed record is a startup error with a field path, not `undefined.map is not a function` in production — and once content arrives from a database instead of a file, the same schema is the validation boundary with no extra work.

---

## Step 19.5 — `ContentSource`

**`packages/content/src/content-source.ts`**

```ts
import type { ImageKey } from "@ratchet/asset";
import type { ResolvedMedia } from "./media/media-ref.js";
import type { MessageKey } from "./message/en/index.js";
import type { NavItem } from "./collection/nav/nav.schema.js";
import type { Translator } from "./translator.js";

export type Locale = "en" | "bn";

export abstract class ContentSource {
  public abstract translator(locale: Locale): Promise<Translator>;
  public abstract media(key: ImageKey): Promise<ResolvedMedia>;
  public abstract nav(): Promise<readonly NavItem[]>;
  public abstract document(slug: string): Promise<string | null>;

  public abstract messages(locale: Locale): Promise<Partial<Record<MessageKey, string>>>;
}
```

**`packages/content/src/static.content-source.ts`**

```ts
import type { ImageKey } from "@ratchet/asset";
import { navItems } from "./collection/nav/nav.data.js";
import { ContentSource, type Locale } from "./content-source.js";
import { StaticMediaResolver } from "./media/static.media-resolver.js";
import type { ResolvedMedia } from "./media/media-ref.js";
import { bn } from "./message/bn/index.js";
import { en, type MessageKey } from "./message/en/index.js";
import type { NavItem } from "./collection/nav/nav.schema.js";
import { Translator } from "./translator.js";

export class StaticContentSource extends ContentSource {
  private readonly media_ = new StaticMediaResolver();

  public override async translator(locale: Locale): Promise<Translator> {
    return new Translator(en, await this.messages(locale));
  }

  public override async messages(
    locale: Locale,
  ): Promise<Partial<Record<MessageKey, string>>> {
    return locale === "bn" ? bn : {};
  }

  public override async media(key: ImageKey): Promise<ResolvedMedia> {
    return this.media_.resolve(key);
  }

  public override async nav(): Promise<readonly NavItem[]> {
    return navItems;
  }

  public override async document(_slug: string): Promise<string | null> {
    return null;
  }
}
```

**Every method is async even though nothing awaits.** That is deliberate: a `DbContentSource` will be async, and if the abstract signatures were synchronous, adding a CMS would change the return type of every method and every caller. The cost today is a handful of `await`s that resolve immediately.

**`Container` constructs it** ([16](16-composition-container.md)):

```ts
this.content = new StaticContentSource();
// later:
// this.content = new DbContentSource(this.database, this.cache);
```

One line. That is the whole point of the seam.

---

## Step 19.6 — The barrel

**`packages/content/src/index.ts`**

```ts
export * from "./collection/nav/nav.schema.js";
export * from "./content-source.js";
export * from "./media/index.js";
export * from "./message/en/index.js";
export * from "./static.content-source.js";
export * from "./translator.js";
```

---

## ✅ Gate

- `new Translator(en).t("error.field.required", { field: "Email" })` returns `"Email is required."`
- A misspelled `MessageKey` is a compile error.
- `grep -rn "PermissionKey" packages/content/src` returns nothing.
- `pnpm --filter @ratchet/content build` succeeds with no React in the output.

Do not proceed until this passes.

---

[← `@ratchet/asset`](18-asset-package.md) · [`@ratchet/query` →](20-query-package.md)
