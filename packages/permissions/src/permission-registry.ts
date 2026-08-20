import { CATALOG } from "./catalog/index.js";

export type PermissionScope = "org" | "goal";

export interface PermissionMeta {
  readonly scope: PermissionScope;
  readonly module: string;
  readonly label: string;
}

export type PermissionKey = keyof typeof CATALOG;

/**
 * `CATALOG` is a compile-time constant, so every derived view of it can be built
 * once at module load rather than on each call. `visibleModules()` and an admin
 * permission matrix both call into these per render.
 *
 * Module-level and frozen rather than `static` members: the ESLint architecture
 * rules ban static mutable state, and `static readonly` holding a mutable `Map`
 * is the shape that ban exists to catch.
 */
const ALL_KEYS: readonly PermissionKey[] = Object.freeze(Object.keys(CATALOG) as PermissionKey[]);

const BY_MODULE: ReadonlyMap<string, readonly PermissionKey[]> = ((): ReadonlyMap<
  string,
  readonly PermissionKey[]
> => {
  const grouped = new Map<string, PermissionKey[]>();
  for (const key of ALL_KEYS) {
    const module = CATALOG[key].module;
    const bucket = grouped.get(module);
    if (bucket) bucket.push(key);
    else grouped.set(module, [key]);
  }
  return new Map([...grouped].map(([module, keys]) => [module, Object.freeze(keys)]));
})();

const MODULES: readonly string[] = Object.freeze([...BY_MODULE.keys()]);

const NO_KEYS: readonly PermissionKey[] = Object.freeze([]);

export class PermissionRegistry {
  public static readonly instance = new PermissionRegistry();

  private constructor() {}

  public all(): readonly PermissionKey[] {
    return ALL_KEYS;
  }

  /**
   * `undefined` rather than a throw for a key the catalog does not define.
   *
   * The type says this cannot happen, and at compile time it cannot. At runtime a
   * key can still arrive from a cast or from a `CapabilitySetDto` that outlived
   * the permission it names — a stale Redis entry written before the key was
   * deleted. Indexing blind made `can()` throw a `TypeError` on exactly that
   * input, which turned a 403 into a 500.
   */
  public meta(key: PermissionKey): PermissionMeta | undefined {
    return Object.hasOwn(CATALOG, key) ? CATALOG[key] : undefined;
  }

  public scopeOf(key: PermissionKey): PermissionScope | undefined {
    return this.meta(key)?.scope;
  }

  public byModule(module: string): readonly PermissionKey[] {
    return BY_MODULE.get(module) ?? NO_KEYS;
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
    return MODULES;
  }
}
