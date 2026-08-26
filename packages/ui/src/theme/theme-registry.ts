export interface ThemeMeta {
  readonly label: string;
  readonly colorScheme: "light" | "dark";
}

const THEMES = {
  light: { label: "Light", colorScheme: "light" },
  dark: { label: "Dark", colorScheme: "dark" },
} as const satisfies Record<string, ThemeMeta>;

export type ThemeKey = keyof typeof THEMES;

export class ThemeRegistry {
  private constructor() {}

  public static readonly DEFAULT: ThemeKey = "light";

  public static all(): readonly ThemeKey[] {
    return Object.keys(THEMES) as ThemeKey[];
  }

  public static meta(key: ThemeKey): ThemeMeta {
    return THEMES[key];
  }

  // `Object.hasOwn`, not `in` — `in` walks the prototype chain, so `"toString"` would
  // pass this guard and `meta()` would hand back a function. This is the boundary an
  // untrusted stored preference crosses, which is exactly where that matters.
  public static isKnown(value: string): value is ThemeKey {
    return Object.hasOwn(THEMES, value);
  }

  // Apply to <html>. Safe to call before hydration, which is the point: a dark-theme
  // user gets a white flash on every load otherwise. `colorScheme` is what makes native
  // scrollbars, form controls and date pickers match — without it a dark theme has
  // light scrollbars.
  public static apply(root: HTMLElement, key: ThemeKey): void {
    root.dataset.theme = key;
    root.style.colorScheme = THEMES[key].colorScheme;
  }
}
