---
title: Theming
description: Why a theme is an attribute rather than a provider, what colorScheme actually fixes, and why font choice is a token override instead of a second theme axis.
---

# `ThemeRegistry`, `FontRegistry`

A theme here is **one attribute on `<html>`**. Not a context provider, not a class-name strategy, not
a set of styled-component variants.

```ts
root.dataset.theme = key;
root.style.colorScheme = THEMES[key].colorScheme;
```

Everything downstream is CSS custom properties resolving differently. No component subscribes to
anything, nothing re-renders, and adding a theme is one block in `theme.css` plus one entry in the
registry.

## What the alternatives cost

**A React context** makes every themed component a consumer, so a theme switch re-renders the tree.
It also means a component cannot be styled before hydration, which is the flash problem below.

**Class names** (`.theme-dark .button`) work, but every rule doubles per theme and the specificity
grows with the theme count. Custom properties invert that: the rule is written once and the *value*
varies.

**Per-theme component variants** are the expensive version of the same mistake — a new theme becomes
a pass over every component instead of one CSS block.

## `colorScheme` is the line people leave out

```ts
root.style.colorScheme = "dark";
```

`data-theme` styles *your* markup. `colorScheme` tells the browser to restyle **its** markup — native
scrollbars, `<input type="date">` pickers, form control chrome, the canvas behind a `<dialog>`. Without
it a dark theme has light scrollbars and a white date picker, which reads as a half-finished theme and
is genuinely hard to attribute if you do not know this property exists.

It goes in the registry rather than at the call site because it is a *property of the theme*, not of
the moment it is applied — which is why `ThemeMeta` carries it.

## Apply it before hydration

The standard fix is a small synchronous script in `<head>` that reads the stored preference and sets
the attribute. `ThemeRegistry.apply` is written to be callable from there: it takes an `HTMLElement`
and touches nothing else, so it has no React dependency and no module-init side effects.

Skip it and a dark-theme user gets a white flash on every page load, because the server rendered the
default and the client corrected it after first paint.

## Font choice is a token override, not a second theme

```ts
public static apply(root: HTMLElement, key: FontKey): void {
  root.style.setProperty("--font-sans", FONTS[key].stack);
}
```

The tempting design is a second axis on the theme — `light-serif`, `dark-serif` — and it multiplies:
*n* themes × *m* faces CSS blocks, all of which have to agree about colour.

Overriding the custom property keeps the two independent. A reader can pick a serif face without
also picking a colour scheme, and the two registries never have to know about each other.

**Each face carries its whole stack, fallbacks included** — `'"Inter", system-ui, sans-serif'` rather
than a family plus a separate fallback list. A stack is one decision; splitting it invites a
component to reassemble it differently, and the failure is a font that silently falls back on one
platform.

> [!NOTE]
> `FontRegistry` is named in doc 22's tree and barrel and specified nowhere in it. The shape here
> mirrors `ThemeRegistry` deliberately — same members, same guard, same `apply(root, key)` signature —
> so that knowing one teaches the other. If a font *preference* ever needs to persist per user, it is
> the same column as the locale ([`content`](../../../content/docs/index.md)), for the same reason:
> it is read on the first server render of every request.

## Both guards use `Object.hasOwn`

```ts
public static isKnown(value: string): value is ThemeKey {
  return Object.hasOwn(THEMES, value);
}
```

Not `in`. `in` walks the prototype chain, so `isKnown("toString")` returns `true`, narrows to
`ThemeKey`, and `meta("toString")` hands back a function — which then fails somewhere else entirely.

These two guards are exactly where an untrusted string arrives: a `localStorage` value, a cookie, a
query parameter. That makes this the same defect class the permission catalog had
([`permissions`](../../../permissions/docs/index.md)), in the same position, and both specs pin it
with `"toString"` and `"constructor"`.

## What is deliberately not here

**No `prefers-color-scheme` default.** `ThemeRegistry.DEFAULT` is `"light"`, and reading the OS
preference is the app's job — it is the same layer that reads the stored override and decides which
wins. Baking the media query in here would make the registry the arbiter of a precedence rule it
cannot see all the inputs to. Compare `Locales.negotiate`, which takes strings and never touches
`navigator` for the same reason.

**No persistence.** The registry applies a theme; it does not remember one. Where a preference lives
— cookie, `localStorage`, a user row — differs per host, and the desktop shell has no cookie at all.
