import {
  type ModeKey,
  type ModePreference,
  ModeRegistry,
  type ThemeKey,
  ThemeRegistry,
} from "~/import.js";

// What crosses the SSR boundary. `preference` is what the user chose and `mode` is what
// renders — they differ only while the choice is "system", which nothing can style.
export interface AppearanceSnapshot {
  readonly theme: ThemeKey;
  readonly mode: ModeKey;
  readonly preference: ModePreference;
}

const THEME_COOKIE = "theme";
const MODE_COOKIE = "mode";
// A year. The cost of getting this wrong is one wrong-coloured first paint, and the
// cookie is rewritten on every change anyway.
const MAX_AGE = 31_536_000;

const DEFAULT: AppearanceSnapshot = {
  theme: ThemeRegistry.DEFAULT,
  mode: ModeRegistry.DEFAULT,
  preference: "system",
};

// One place, so the rule below is suppressed once. The Cookie Store API it points at is
// in neither Safari nor Firefox stable, and this write has to be readable next request.
function write(name: string, value: string): void {
  // biome-ignore lint/suspicious/noDocumentCookie: the portable write, and the only one
  document.cookie = `${name}=${value}; path=/; max-age=${MAX_AGE}; samesite=lax`;
}

function read(header: string, name: string): string | null {
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

// The appearance half of the per-request state, shaped exactly like `SessionStore` and
// for the same reason: resolve on the server, ride the SSR payload, be complete before
// the first client render. Read it client-side instead and every load starts in the
// wrong palette and corrects itself in front of the user.
export class AppearanceStore {
  private snapshot: AppearanceSnapshot = DEFAULT;
  private resolved = false;
  private inFlight: Promise<void> | undefined;

  // Both guards run before either value is trusted: a cookie is a string a user can
  // edit, and an unknown theme key renders a page with every colour undefined.
  public static fromCookieHeader(header: string | null, prefersDark: boolean): AppearanceSnapshot {
    const rawTheme = header ? read(header, THEME_COOKIE) : null;
    const rawMode = header ? read(header, MODE_COOKIE) : null;

    const theme = rawTheme && ThemeRegistry.isKnown(rawTheme) ? rawTheme : DEFAULT.theme;
    const preference = rawMode && ModeRegistry.isPreference(rawMode) ? rawMode : DEFAULT.preference;

    // `resolveMode` last: a dark-only palette outranks both the preference and the OS,
    // because the alternative is a selector that matches nothing.
    return {
      theme,
      preference,
      mode: ThemeRegistry.resolveMode(theme, ModeRegistry.resolve(preference, prefersDark)),
    };
  }

  public async ensure(load: () => Promise<AppearanceSnapshot>): Promise<void> {
    if (this.resolved) return;
    this.inFlight ??= load()
      .then((snapshot) => {
        this.snapshot = snapshot;
        this.resolved = true;
      })
      .finally(() => {
        this.inFlight = undefined;
      });

    return this.inFlight;
  }

  public get current(): AppearanceSnapshot {
    return this.snapshot;
  }

  // Two attribute writes, then a cookie. The attributes are what the user sees, and they
  // land in the same frame; the cookie is only what the *next* server render reads.
  public choose(theme: ThemeKey, preference: ModePreference, prefersDark: boolean): void {
    const mode = ThemeRegistry.resolveMode(theme, ModeRegistry.resolve(preference, prefersDark));
    const root = document.documentElement;

    // Held for one frame, or every transitioned property animates at once and the swap
    // reads as a stall. `token.css` carries the rule this attribute turns on.
    root.dataset.themeSwitching = "";
    ThemeRegistry.apply(root, theme);
    ModeRegistry.apply(root, mode);
    requestAnimationFrame(() => {
      delete root.dataset.themeSwitching;
    });

    write(THEME_COOKIE, theme);
    write(MODE_COOKIE, preference);
    this.snapshot = { theme, mode, preference };
  }

  public dehydrate(): AppearanceSnapshot {
    return this.snapshot;
  }

  public restore(snapshot: AppearanceSnapshot): void {
    this.snapshot = snapshot;
    this.resolved = true;
  }
}
