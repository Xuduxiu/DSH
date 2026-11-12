# 视觉协议 · 罗德岛、终末地与 xLab 控制台

`@local/dsh-arknights-ui` is a persistent DSH Web Client plugin that restyles the
**entire Harness interface**, including the Oxford measurement workbench. It
does not move or regroup existing buttons and menus: every treatment is a token
remap plus a handful of purely decorative HUD layers, and the quick switcher
lives in the frame-wide overlay at the right edge.

## Four protocols

| Protocol | Palette | Character |
|---|---|---|
| **罗德岛 · 白昼** (`day`) | warm archive paper, ink, brass | pale blueprint grid, paper grain, brass rules, light glass surfaces |
| **罗德岛 · 黑夜** (`night`) | deep ink, bone, amber | tactical scanlines, amber signal accents, dark frosted panels |
| **终末地 · 协议玻璃** (`glass`) | cold cyan, sea-green, brass | heavy backdrop blur, translucent nested surfaces, refracted light |
| **xLab 控制台** (`xlab`) | Oxford Console Dark graphite, light violet, steel grey | opaque instrument panels, straight dividers, 03 CORE identity; orange is a warning colour |

The default follows the operating-system color scheme on first use. A choice is
saved in `localStorage` (`arknights-ui:theme`) for this browser. Updating preserves existing `day`, `night` and `glass` choices; it does not force the new theme. Selecting a
protocol also aligns the stock Appearance preference to `light` or `dark`, so the
Host-managed palette and the plugin's layer cannot drift apart.

## What it covers

- every `--dsw-*` alias token: surfaces, layers, borders, labels, brand, states,
  bubbles, code, menus, scrollbars, settings cards, toasts, tooltips;
- the neutral / accent / semantic static ramps that components read directly;
- document background art (grid, glow, diagonal calibration line, scanlines);
- sidebar glass, active-row markers, brand lettering, version tag;
- conversation hero, composer card with cut-corner brackets, send action,
  user bubbles, code blocks, tables, blockquotes, inline code;
- menus, dialogs, tooltips, focus rings, text selection, scrollbars;
- an original frame-wide theme dock and an additional **Visual Protocol** row in
  Settings → General.

## Quick switcher

The vertical **主题** tab sits at the frame's right edge, vertically centered.
Clicking it opens a 306px protocol card with four live previews. The switcher is
registered in `shell.overlay`, which is click-through by default; only the tab and
the panel opt back into pointer events. It never displaces an existing control.
The same four choices appear in **Settings → General → 视觉协议**, including when multiview hides the floating dock. Keyboard users can Tab to each choice and use Enter or Space. Escape closes the dock and returns focus to its tab.

## A shared theme for plugin workspaces

The document element carries `data-arknights-theme="day|night|glass|xlab"`. All descendants inherit the active palette; consumers need no setting or persistence of their own. For example, use `var(--ark-ink, var(--dsw-alias-label-primary))` for text. Other shared roles include `--ark-base`, `--ark-layer1`, `--ark-layer2`, `--ark-ink2`, `--ark-line3`, `--ark-accent`, `--ark-brand-ink`, `--ark-warn` and `--ark-danger`. A component that draws onto a canvas can observe that root attribute with `MutationObserver`. Unloading the theme bundle removes it; retain a DSH/native fallback.

The xLab appearance uses the existing Oxford 03 CORE vector and the xLab R1 Console Dark palette. It uses installed font fallbacks; it does not install fonts or require network assets.

## Install

Preferred:

```text
plugin_manager({ action: "install_bundle", target: "<this directory>" })
```

After installing into an already-running app, refresh the Web page once so the
new Client module generation and its stylesheet load.

The Host half has no services, routes, or tools. The Client half is declared by
`dsh.client` in `package.json`, injects `@deepseek-ai/dsh-client-ui-theme` for
boot order, and registers two additive slots:

| Slot | Registration | Purpose |
|---|---|---|
| `shell.overlay` | `id: arknights-ui` | floating protocol switcher |
| `settings.general.item` | `id: arknights-ui`, `order: 10.5` | Settings row after Appearance |

## Notes

- The sidebar and right column use translucent fills without `backdrop-filter`.
  A filter there creates a containing block for `position: fixed` descendants,
  which traps the Windows/macOS titlebar sidebar toggle inside a 0-width
  sidebar and makes it overlap the brand row while open. The themed columns
  therefore fake the frost with layered translucency; menus, dialogs and the
  composer still carry real blur.
- The floating protocol panel includes a **Toggle sidebar** fallback, so the
  sidebar can always be reopened even if a shell-specific titlebar control is
  missing.
- Pure CSS + one small React component tree; no external assets, network calls,
  fonts, or third-party artwork. The bundled Montserrat face already shipped by
  the stock theme is used for Latin display text.
- `clip-path` corner cuts and HUD brackets are decorative and `pointer-events:
  none`; focus rings, hit targets, and control geometry are untouched.
- `prefers-reduced-motion` disables the panel transition and tab pulse.
- The stylesheet is owned by `ctx.effect`, so unloading or HMR removes it.
