import { CATALOG } from "../catalog/index.js";

// `platform` is above the tenant, and it is never reached by accident: a tenant's
// wildcard does not grant it and the `core` exception does not apply to it.
export type PermissionScope = "org" | "goal" | "platform";

export interface PermissionMeta {
  readonly scope: PermissionScope;
  readonly module: string;
  readonly label: string;
}

export type PermissionKey = keyof typeof CATALOG;

// `CATALOG` is a compile-time constant, so its derived views are built once at module
// load. Module-level and frozen, not `static` — the ESLint rules ban static mutable state.
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

const BY_SCOPE: ReadonlyMap<PermissionScope, readonly PermissionKey[]> = ((): ReadonlyMap<
  PermissionScope,
  readonly PermissionKey[]
> => {
  const grouped = new Map<PermissionScope, PermissionKey[]>();
  for (const key of ALL_KEYS) {
    const scope = CATALOG[key].scope;
    const bucket = grouped.get(scope);
    if (bucket) bucket.push(key);
    else grouped.set(scope, [key]);
  }
  return new Map([...grouped].map(([scope, keys]) => [scope, Object.freeze(keys)]));
})();

const MODULES: readonly string[] = Object.freeze([...BY_MODULE.keys()]);

const NO_KEYS: readonly PermissionKey[] = Object.freeze([]);

export class PermissionRegistry {
  public static readonly instance = new PermissionRegistry();

  private constructor() {}

  public all(): readonly PermissionKey[] {
    return ALL_KEYS;
  }

  // `undefined`, not a throw — a stale cached key must be a 403, never a 500.
  public meta(key: PermissionKey): PermissionMeta | undefined {
    return Object.hasOwn(CATALOG, key) ? CATALOG[key] : undefined;
  }

  public scopeOf(key: PermissionKey): PermissionScope | undefined {
    return this.meta(key)?.scope;
  }

  public byModule(module: string): readonly PermissionKey[] {
    return BY_MODULE.get(module) ?? NO_KEYS;
  }

  // Beside `byModule`, because the seed and the role editor exclude by *scope*: a module
  // name is a label, and "not a tenant's to hold" is a property of the scope.
  public byScope(scope: PermissionScope): readonly PermissionKey[] {
    return BY_SCOPE.get(scope) ?? NO_KEYS;
  }

  // Permission strings from the database pass this before they are trusted.
  // `Object.hasOwn`, not `in` — `in` walks the prototype chain and admits `constructor`.
  public isKnown(value: string): value is PermissionKey {
    return Object.hasOwn(CATALOG, value);
  }

  public modules(): readonly string[] {
    return MODULES;
  }
}
