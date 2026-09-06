import type { IconName, ModuleKey } from "../../import.js";
import type { NamespaceKeys } from "../../message/index.js";
import { NavContract, type NavItem } from "./nav.schema.js";

// Narrower than `NavItem` on all three string fields, so an unknown module, icon or
// label key is a **compile** error while this file is still a literal.
interface NavRecord {
  readonly module: ModuleKey;
  readonly labelKey: NamespaceKeys["nav"];
  readonly icon: IconName;
  readonly order: number;
}

const ITEMS = [
  { module: "rbac", labelKey: "nav.roles", icon: "check", order: 10 },
  { module: "member", labelKey: "nav.members", icon: "user", order: 20 },
  { module: "apikey", labelKey: "nav.apiKeys", icon: "key", order: 30 },
] as const satisfies readonly NavRecord[];

export const navItems: readonly NavItem[] = NavContract.collection.parse(ITEMS);
