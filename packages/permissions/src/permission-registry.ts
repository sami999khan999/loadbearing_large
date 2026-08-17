import { CATALOG } from "./catalog/index.js";

export type PermissionScope = "org" | "goal";

export interface PermissionMeta {
  readonly scope: PermissionScope;
  readonly module: string;
  readonly label: string;
}

export type PermissionKey = keyof typeof CATALOG;

export class PermissionRegistry {
  public static readonly instance = new PermissionRegistry();

  private constructor() {}

  public all(): readonly PermissionKey[] {
    return Object.keys(CATALOG) as PermissionKey[];
  }

  public meta(key: PermissionKey): PermissionMeta {
    return CATALOG[key];
  }

  public scopeOf(key: PermissionKey): PermissionScope {
    return CATALOG[key].scope;
  }

  public byModule(module: string): readonly PermissionKey[] {
    return this.all().filter((k) => CATALOG[k].module === module);
  }

  /**
   * Permission strings from the database must pass this before they are trusted.
   *
   * `Object.hasOwn`, not `value in CATALOG`: `in` walks the prototype chain, so a
   * stored row reading `constructor` or `toString` would pass and then resolve to
   * a `PermissionMeta` of `undefined`, whose `scope` check falls through to the
   * org branch and grants a permission that does not exist.
   */
  public isKnown(value: string): value is PermissionKey {
    return Object.hasOwn(CATALOG, value);
  }

  public modules(): readonly string[] {
    return [...new Set(this.all().map((k) => CATALOG[k].module))];
  }
}
