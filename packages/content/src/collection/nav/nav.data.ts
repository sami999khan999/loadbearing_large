import type { IconName, ModuleKey } from "../../import.js";
import type { NamespaceKeys } from "../../message/index.js";
import { NavContract, type NavItem } from "./nav.schema.js";

// The authoring shape, narrower than `NavItem` on all three string fields. It is what
// makes a menu entry naming a module that does not exist, an icon that is not in the
// sprite, or a label key with no copy behind it a **compile** error — while the file is
// still a literal. `NavItem` stays wide because a database row does not get that.
interface NavRecord {
  readonly module: ModuleKey;
  readonly labelKey: NamespaceKeys["nav"];
  readonly icon: IconName;
  readonly order: number;
}

const ITEMS = [
  { module: "rbac", labelKey: "nav.roles", icon: "check", order: 10 },
  { module: "member", labelKey: "nav.members", icon: "user", order: 20 },
] as const satisfies readonly NavRecord[];

export const navItems: readonly NavItem[] = NavContract.collection.parse(ITEMS);
