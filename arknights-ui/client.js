/**
 * Arknights UI — Web Client half.
 *
 * Four visual protocols for the Harness Web GUI:
 *
 *   day    Rhodes Island daylight — warm archive paper, brass, blueprint grid.
 *   night  Rhodes Island night    — ink decks, amber signals, tactical scans.
 *   glass  Endfield protocol glass — cold cyan translucency and refracted light.
 *   xlab   xLab Console Dark — graphite panels, violet selection, 03 CORE.
 *
 * The plugin owns a global token layer (so every shipped component follows),
 * a persistent theme store, a frame-wide switcher, and one General-settings
 * row. Existing button and menu positions are untouched: the switcher lives
 * in the click-through `shell.overlay` layer at the frame's right edge.
 */

window.__ModuleLoader__.load({
  id: '@local/dsh-arknights-ui',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useRef, useState } = React

    const NS = 'arknights-ui'
    const PLUGIN_ID = '@local/dsh-arknights-ui'
    const STORAGE_KEY = 'arknights-ui:theme'
    const STYLE_ID = PLUGIN_ID + '/theme.css'

    const THEMES = [
      {
        id: 'day',
        code: 'RHODES / 01',
        nameKey: 'day',
        descKey: 'dayDesc',
        schemeKey: 'schemeLight',
        glyph: '☼',
      },
      {
        id: 'night',
        code: 'RHODES / 02',
        nameKey: 'night',
        descKey: 'nightDesc',
        schemeKey: 'schemeDark',
        glyph: '☾',
      },
      {
        id: 'glass',
        code: 'ENDFIELD / 03',
        nameKey: 'glass',
        descKey: 'glassDesc',
        schemeKey: 'schemeDark',
        glyph: '◇',
      },
      {
        id: 'xlab',
        code: 'XLAB / CORE 03',
        nameKey: 'xlab',
        descKey: 'xlabDesc',
        schemeKey: 'schemeDark',
      },
    ]
    const THEME_IDS = THEMES.map((theme) => theme.id)

    /** Local text with a built-in fallback when the slot does not pass `t`. */
    function localized(t, key) {
      if (typeof t === 'function') {
        try {
          const value = t(key)
          if (typeof value === 'string' && value.length > 0 && value !== key) return value
        } catch {
          // Fall through to the dictionary.
        }
      }
      const navLang = typeof navigator === 'undefined' ? '' : navigator.language
      const lang = typeof document === 'undefined'
        ? String(navLang || '').toLowerCase()
        : String(document.documentElement.lang || navLang || '').toLowerCase()
      const dictionary = lang.startsWith('en') ? en : zh
      return dictionary[key] ?? key
    }

    // ------------------------------------------------------------------
    // Dictionaries
    // ------------------------------------------------------------------
    const zh = {
      dockLabel: '主题',
      dockOpen: '打开视觉协议',
      dockClose: '收起视觉协议',
      panelKicker: 'VISUAL PROTOCOL',
      panelTitle: '视觉协议',
      panelHint: '选择后即时生效，并保存在当前浏览器。',
      current: '当前',
      active: '已启用',
      schemeLight: '浅色',
      schemeDark: '深色',
      day: '罗德岛 · 白昼',
      dayDesc: '暖白档案纸、黄铜刻度与浅色蓝图网格。',
      night: '罗德岛 · 黑夜',
      nightDesc: '深墨甲板、琥珀信号灯与战术扫描线。',
      glass: '终末地 · 协议玻璃',
      glassDesc: '冷青雾面、透视层叠与高光折射。',
      xlab: 'xLab 控制台',
      xlabDesc: '石墨面板、清晰刻度与技术紫选中态。',
      settingsTitle: '视觉协议',
      settingsDesc: '选择 DSH 和测量工作台共同使用的外观。',
      toggleSidebar: '侧边栏开关',
    }
    const en = {
      dockLabel: 'THEME',
      dockOpen: 'Open Visual Protocol',
      dockClose: 'Collapse Visual Protocol',
      panelKicker: 'VISUAL PROTOCOL',
      panelTitle: 'Visual Protocol',
      panelHint: 'Applies instantly and is remembered by this browser.',
      current: 'Current',
      active: 'Active',
      schemeLight: 'Light',
      schemeDark: 'Dark',
      day: 'Rhodes Island · Day',
      dayDesc: 'Warm archive paper, brass ticks, and a pale blueprint grid.',
      night: 'Rhodes Island · Night',
      nightDesc: 'Deep ink decks, amber signal lamps, and tactical scanlines.',
      glass: 'Endfield · Protocol Glass',
      glassDesc: 'Cold cyan haze, layered translucency, and refracted highlights.',
      xlab: 'xLab Console',
      xlabDesc: 'Graphite panels, crisp rules and violet selection.',
      settingsTitle: 'Visual Protocol',
      settingsDesc: 'Choose the appearance shared by DSH and the measurement workbench.',
      toggleSidebar: 'Toggle sidebar',
    }

    // ------------------------------------------------------------------
    // Global stylesheet
    // ------------------------------------------------------------------
    const css = `
/* ==================================================================
   ARKNIGHTS UI / ENDFIELD VISUAL PROTOCOL
   All colors are delivered as token remaps first, then as a small
   number of structural treatments (grid, glass, cut corners, HUD marks).
   Existing geometry is never moved.
   ================================================================== */

:root {
  --ark-font: "Montserrat", "Noto Sans SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif;
  --ark-mono: "JetBrains Mono", "Cascadia Code", "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  --ark-ease: cubic-bezier(.22, .8, .2, 1);
}

/* ---------- RHODES ISLAND / DAY ---------- */
html[data-arknights-theme="day"] {
  color-scheme: light;
  --ark-base: #e8e4d8;
  --ark-veil: rgba(245, 242, 233, .62);
  --ark-sidebar: rgba(233, 229, 217, .74);
  --ark-layer1: rgba(250, 248, 242, .82);
  --ark-layer2: rgba(242, 238, 228, .9);
  --ark-layer3: rgba(255, 253, 247, .95);
  --ark-overlay: rgba(250, 248, 242, .93);
  --ark-module: rgba(35, 48, 46, .065);
  --ark-menu: rgba(250, 248, 242, .86);
  --ark-menu-solid: rgba(247, 244, 236, .97);
  --ark-field: rgba(255, 253, 247, .66);
  --ark-composer: rgba(250, 248, 242, .78);
  --ark-composer-top: rgba(255, 253, 247, .9);
  --ark-dialog: rgba(250, 248, 242, .94);
  --ark-ink: #171d1c;
  --ark-ink2: #45514d;
  --ark-ink3: #6c7772;
  --ark-ink4: #9aa29d;
  --ark-line: rgba(23, 29, 28, .10);
  --ark-line2: rgba(23, 29, 28, .18);
  --ark-line3: rgba(23, 29, 28, .28);
  --ark-accent: #a67a2b;
  --ark-accent2: #c49a45;
  --ark-accent3: #2f7074;
  --ark-accent-soft: rgba(166, 122, 43, .14);
  --ark-accent-glow: rgba(183, 140, 52, .28);
  --ark-danger: #a13d3d;
  --ark-danger-soft: rgba(161, 61, 61, .12);
  --ark-success: #3e7754;
  --ark-success-soft: rgba(62, 119, 84, .12);
  --ark-warn: #a46721;
  --ark-warn-soft: rgba(164, 103, 33, .12);
  --ark-brand: #1b2422;
  --ark-brand-hover: #33403c;
  --ark-brand-ink: #f8f5eb;
  --ark-bubble: rgba(230, 220, 196, .7);
  --ark-bubble2: rgba(211, 192, 151, .7);
  --ark-code: rgba(34, 42, 39, .055);
  --ark-code-banner: rgba(34, 42, 39, .085);
  --ark-inline-code: rgba(166, 122, 43, .12);
  --ark-selection: rgba(47, 112, 116, .22);
  --ark-scroll: rgba(23, 29, 28, .24);
  --ark-highlight: rgba(255, 255, 255, .55);
  --ark-shadow: rgba(48, 40, 24, .2);
  --ark-tooltip: rgba(32, 38, 36, .94);
  --ark-tooltip-ink: #fbf8ee;
  --ark-toast: rgba(28, 35, 33, .94);
  --ark-toast-ink: #fbf8ee;
  --ark-skeleton: rgba(23, 29, 28, .06);
  --ark-grid: rgba(28, 45, 43, .045);
  --ark-grid-major: rgba(28, 45, 43, .075);
  --ark-diag: rgba(47, 112, 116, .05);
  --ark-bg-art:
    radial-gradient(1100px 760px at 84% -8%, rgba(190, 146, 54, .20), transparent 62%),
    radial-gradient(900px 760px at -5% 102%, rgba(47, 111, 115, .14), transparent 60%),
    repeating-linear-gradient(0deg, var(--ark-grid-major) 0 1px, transparent 1px 64px),
    repeating-linear-gradient(90deg, var(--ark-grid-major) 0 1px, transparent 1px 64px),
    repeating-linear-gradient(0deg, var(--ark-grid) 0 1px, transparent 1px 16px),
    repeating-linear-gradient(90deg, var(--ark-grid) 0 1px, transparent 1px 16px),
    linear-gradient(135deg, transparent 0 49.85%, var(--ark-diag) 49.85% 50.15%, transparent 50.15%);
  --ark-bg-size: auto, auto, auto, auto, auto, auto, 220px 220px;
}

/* ---------- RHODES ISLAND / NIGHT ---------- */
html[data-arknights-theme="night"] {
  color-scheme: dark;
  --ark-base: #090c0e;
  --ark-veil: rgba(9, 12, 14, .66);
  --ark-sidebar: rgba(11, 15, 17, .8);
  --ark-layer1: rgba(22, 28, 30, .78);
  --ark-layer2: rgba(28, 35, 37, .86);
  --ark-layer3: rgba(35, 43, 45, .93);
  --ark-overlay: rgba(20, 26, 28, .94);
  --ark-module: rgba(211, 190, 147, .07);
  --ark-menu: rgba(18, 24, 26, .8);
  --ark-menu-solid: rgba(22, 28, 30, .98);
  --ark-field: rgba(7, 11, 13, .56);
  --ark-composer: rgba(15, 21, 23, .8);
  --ark-composer-top: rgba(24, 31, 33, .88);
  --ark-dialog: rgba(16, 22, 24, .96);
  --ark-ink: #e9e3d4;
  --ark-ink2: #b7b9af;
  --ark-ink3: #858e8a;
  --ark-ink4: #5e6866;
  --ark-line: rgba(231, 220, 194, .10);
  --ark-line2: rgba(231, 220, 194, .18);
  --ark-line3: rgba(231, 220, 194, .28);
  --ark-accent: #d4a64a;
  --ark-accent2: #e8c577;
  --ark-accent3: #5bb5b8;
  --ark-accent-soft: rgba(212, 166, 74, .14);
  --ark-accent-glow: rgba(212, 166, 74, .23);
  --ark-danger: #dd6b5b;
  --ark-danger-soft: rgba(221, 107, 91, .13);
  --ark-success: #67b884;
  --ark-success-soft: rgba(103, 184, 132, .12);
  --ark-warn: #d09745;
  --ark-warn-soft: rgba(208, 151, 69, .13);
  --ark-brand: #e7e0cc;
  --ark-brand-hover: #fff7e6;
  --ark-brand-ink: #0a0e10;
  --ark-bubble: rgba(212, 166, 74, .10);
  --ark-bubble2: rgba(91, 181, 184, .14);
  --ark-code: rgba(255, 255, 255, .035);
  --ark-code-banner: rgba(255, 255, 255, .06);
  --ark-inline-code: rgba(212, 166, 74, .12);
  --ark-selection: rgba(212, 166, 74, .26);
  --ark-scroll: rgba(233, 227, 212, .22);
  --ark-highlight: rgba(255, 255, 255, .07);
  --ark-shadow: rgba(0, 0, 0, .55);
  --ark-tooltip: rgba(36, 44, 46, .97);
  --ark-tooltip-ink: #f4efe2;
  --ark-toast: rgba(27, 34, 36, .97);
  --ark-toast-ink: #f4efe2;
  --ark-skeleton: rgba(255, 255, 255, .055);
  --ark-grid: rgba(233, 227, 212, .032);
  --ark-grid-major: rgba(233, 227, 212, .055);
  --ark-diag: rgba(212, 166, 74, .045);
  --ark-bg-art:
    radial-gradient(900px 720px at 86% -6%, rgba(212, 166, 74, .14), transparent 62%),
    radial-gradient(820px 720px at 0% 100%, rgba(64, 145, 150, .12), transparent 60%),
    repeating-linear-gradient(0deg, var(--ark-grid-major) 0 1px, transparent 1px 56px),
    repeating-linear-gradient(90deg, var(--ark-grid-major) 0 1px, transparent 1px 56px),
    repeating-linear-gradient(0deg, var(--ark-grid) 0 1px, transparent 1px 14px),
    repeating-linear-gradient(90deg, var(--ark-grid) 0 1px, transparent 1px 14px),
    linear-gradient(135deg, transparent 0 49.9%, var(--ark-diag) 49.9% 50.1%, transparent 50.1%);
  --ark-bg-size: auto, auto, auto, auto, auto, auto, 220px 220px;
}

/* ---------- ENDFIELD / PROTOCOL GLASS ---------- */
html[data-arknights-theme="glass"] {
  color-scheme: dark;
  --ark-base: #061014;
  --ark-veil: rgba(7, 17, 20, .42);
  --ark-sidebar: rgba(10, 24, 27, .54);
  --ark-layer1: rgba(21, 40, 44, .42);
  --ark-layer2: rgba(28, 50, 54, .54);
  --ark-layer3: rgba(40, 66, 70, .64);
  --ark-overlay: rgba(12, 28, 32, .72);
  --ark-module: rgba(120, 230, 218, .06);
  --ark-menu: rgba(16, 34, 38, .58);
  --ark-menu-solid: rgba(16, 34, 38, .88);
  --ark-field: rgba(7, 18, 21, .36);
  --ark-composer: rgba(14, 31, 35, .5);
  --ark-composer-top: rgba(22, 45, 49, .58);
  --ark-dialog: rgba(12, 28, 32, .74);
  --ark-ink: #e6f7f2;
  --ark-ink2: #a9cac5;
  --ark-ink3: #7fa6a2;
  --ark-ink4: #577d7a;
  --ark-line: rgba(164, 238, 229, .11);
  --ark-line2: rgba(164, 238, 229, .19);
  --ark-line3: rgba(164, 238, 229, .3);
  --ark-accent: #67e0cf;
  --ark-accent2: #a6f3e8;
  --ark-accent3: #d4a64a;
  --ark-accent-soft: rgba(103, 224, 207, .12);
  --ark-accent-glow: rgba(103, 224, 207, .24);
  --ark-danger: #e28173;
  --ark-danger-soft: rgba(226, 129, 115, .12);
  --ark-success: #71d9ac;
  --ark-success-soft: rgba(113, 217, 172, .12);
  --ark-warn: #e0b25d;
  --ark-warn-soft: rgba(224, 178, 93, .12);
  --ark-brand: #67e0cf;
  --ark-brand-hover: #8ef0e2;
  --ark-brand-ink: #04110f;
  --ark-bubble: rgba(103, 224, 207, .10);
  --ark-bubble2: rgba(212, 166, 74, .12);
  --ark-code: rgba(2, 12, 14, .34);
  --ark-code-banner: rgba(2, 12, 14, .46);
  --ark-inline-code: rgba(103, 224, 207, .12);
  --ark-selection: rgba(103, 224, 207, .25);
  --ark-scroll: rgba(164, 238, 229, .24);
  --ark-highlight: rgba(255, 255, 255, .12);
  --ark-shadow: rgba(0, 8, 10, .62);
  --ark-tooltip: rgba(12, 32, 36, .96);
  --ark-tooltip-ink: #e7fbf6;
  --ark-toast: rgba(10, 28, 32, .95);
  --ark-toast-ink: #e7fbf6;
  --ark-skeleton: rgba(164, 238, 229, .065);
  --ark-grid: rgba(164, 238, 229, .035);
  --ark-grid-major: rgba(164, 238, 229, .065);
  --ark-diag: rgba(103, 224, 207, .05);
  --ark-bg-art:
    radial-gradient(760px 700px at 86% 8%, rgba(55, 180, 170, .22), transparent 60%),
    radial-gradient(900px 760px at 4% 92%, rgba(190, 140, 55, .13), transparent 62%),
    radial-gradient(620px 520px at 52% 42%, rgba(62, 124, 126, .12), transparent 72%),
    repeating-linear-gradient(0deg, var(--ark-grid-major) 0 1px, transparent 1px 40px),
    repeating-linear-gradient(90deg, var(--ark-grid-major) 0 1px, transparent 1px 40px),
    repeating-linear-gradient(0deg, var(--ark-grid) 0 1px, transparent 1px 10px),
    repeating-linear-gradient(90deg, var(--ark-grid) 0 1px, transparent 1px 10px),
    linear-gradient(135deg, transparent 0 49.9%, var(--ark-diag) 49.9% 50.1%, transparent 50.1%);
  --ark-bg-size: auto, auto, auto, auto, auto, auto, auto, 220px 220px;
}

/* xLab R1 / Oxford Console Dark. Colours are physical surface roles, not
   simulated instrument state. Other bundles consume them through CSS. */
html[data-arknights-theme="xlab"] {
  color-scheme: dark;
  --ark-font: "Noto Sans SC", "Microsoft YaHei UI", "PingFang SC", "Segoe UI", sans-serif;
  --ark-mono: "Source Code Pro", "Cascadia Mono", Consolas, monospace;
  --ark-base: #0c0e11;
  --ark-veil: #0c0e11;
  --ark-sidebar: #14171c;
  --ark-layer1: #14171c;
  --ark-layer2: #1c2027;
  --ark-layer3: #252b34;
  --ark-overlay: #1c2027;
  --ark-module: #1c2027;
  --ark-menu: #14171c;
  --ark-menu-solid: #14171c;
  --ark-field: #0c0e11;
  --ark-composer: #14171c;
  --ark-composer-top: #14171c;
  --ark-dialog: #14171c;
  --ark-ink: #f5f6f7;
  --ark-ink2: #b7bdc8;
  --ark-ink3: #8c94a3;
  --ark-ink4: #8c94a3;
  --ark-line: #313742;
  --ark-line2: #424955;
  --ark-line3: #788598;
  --ark-accent: #c39bff;
  --ark-accent2: #d2b3ff;
  --ark-accent3: #c39bff;
  --ark-accent-soft: #30233e;
  --ark-accent-glow: transparent;
  --ark-danger: #ff8585;
  --ark-danger-soft: #40282a;
  --ark-success: #66dbc3;
  --ark-success-soft: #173831;
  --ark-warn: #f28c28;
  --ark-warn-soft: #392b20;
  --ark-brand: #c39bff;
  --ark-brand-hover: #d2b3ff;
  --ark-brand-ink: #0c0e11;
  --ark-bubble: #1c2027;
  --ark-bubble2: #30233e;
  --ark-code: #0c0e11;
  --ark-code-banner: #1c2027;
  --ark-inline-code: #30233e;
  --ark-selection: #49345f;
  --ark-scroll: #788598;
  --ark-highlight: transparent;
  --ark-shadow: rgba(0,0,0,.36);
  --ark-tooltip: #252b34;
  --ark-tooltip-ink: #f5f6f7;
  --ark-toast: #1c2027;
  --ark-toast-ink: #f5f6f7;
  --ark-skeleton: #252b34;
  --ark-grid: #1c2027;
  --ark-grid-major: #313742;
  --ark-diag: transparent;
  --ark-bg-art: none;
  --ark-bg-size: auto;
}

/* ==================================================================
   TOKEN REMAP
   ================================================================== */
html[data-arknights-theme] body {
  --dsw-font-family: var(--dsh-font-family-text, "Montserrat", "Noto Sans SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif);
  --ds-font-family-code: var(--dsh-font-family-code, "JetBrains Mono", "Cascadia Code", "SFMono-Regular", Consolas, "Liberation Mono", monospace);  --dsw-radius-xs: 1px;
  --dsw-radius-sm: 2px;
  --dsw-radius-md: 4px;
  --dsw-radius-lg: 6px;
  --dsw-radius-xl: 8px;
  --dsw-radius-panel: 10px;

  --dsw-static-neutral-00: #f8f5eb;
  --dsw-static-neutral-50: var(--ark-layer1);
  --dsw-static-neutral-100: var(--ark-layer2);
  --dsw-static-neutral-150: var(--ark-layer2);
  --dsw-static-neutral-200: var(--ark-line2);
  --dsw-static-neutral-250: var(--ark-line2);
  --dsw-static-neutral-300: var(--ark-ink4);
  --dsw-static-neutral-400: var(--ark-ink4);
  --dsw-static-neutral-500: var(--ark-ink3);
  --dsw-static-neutral-550: var(--ark-ink3);
  --dsw-static-neutral-600: var(--ark-ink2);
  --dsw-static-neutral-700: var(--ark-ink2);
  --dsw-static-neutral-800: var(--ark-ink);
  --dsw-static-neutral-850: var(--ark-layer2);
  --dsw-static-neutral-900: var(--ark-base);
  --dsw-static-neutral-1000: #080d0c;

  --dsw-static-neutral-bluish-00: #f8f5eb;
  --dsw-static-neutral-bluish-50: var(--ark-layer1);
  --dsw-static-neutral-bluish-60: var(--ark-module);
  --dsw-static-neutral-bluish-75: var(--ark-layer2);
  --dsw-static-neutral-bluish-100: var(--ark-layer2);
  --dsw-static-neutral-bluish-150: var(--ark-line2);
  --dsw-static-neutral-bluish-200: var(--ark-line2);
  --dsw-static-neutral-bluish-300: var(--ark-ink4);
  --dsw-static-neutral-bluish-400: var(--ark-ink3);
  --dsw-static-neutral-bluish-500: var(--ark-ink3);
  --dsw-static-neutral-bluish-600: var(--ark-ink3);
  --dsw-static-neutral-bluish-700: var(--ark-ink2);
  --dsw-static-neutral-bluish-750: var(--ark-layer2);
  --dsw-static-neutral-bluish-800: var(--ark-layer2);
  --dsw-static-neutral-bluish-850: var(--ark-layer2);
  --dsw-static-neutral-bluish-875: var(--ark-layer1);
  --dsw-static-neutral-bluish-900: var(--ark-base);
  --dsw-static-neutral-bluish-950: var(--ark-base);
  --dsw-static-neutral-bluish-1000: #080d0c;

  --dsw-static-deepseek-50: var(--ark-accent-soft);
  --dsw-static-deepseek-100: var(--ark-accent-soft);
  --dsw-static-deepseek-200: var(--ark-bubble2);
  --dsw-static-deepseek-300: var(--ark-accent2);
  --dsw-static-deepseek-400: var(--ark-accent);
  --dsw-static-deepseek-450: var(--ark-accent);
  --dsw-static-deepseek-500: var(--ark-accent);
  --dsw-static-deepseek-600: var(--ark-accent2);
  --dsw-static-deepseek-800: var(--ark-accent-soft);
  --dsw-static-deepseek-900: var(--ark-layer2);

  --dsw-static-blue-400: var(--ark-accent3);
  --dsw-static-blue-450: var(--ark-accent3);
  --dsw-static-blue-500: var(--ark-accent3);
  --dsw-static-blue-600: var(--ark-accent2);

  --dsw-static-amber-100: var(--ark-warn-soft);
  --dsw-static-amber-400: var(--ark-warn);
  --dsw-static-amber-500: var(--ark-warn);
  --dsw-static-amber-600: var(--ark-warn);
  --dsw-static-amber-900: var(--ark-layer2);
  --dsw-static-green-100: var(--ark-success-soft);
  --dsw-static-green-400: var(--ark-success);
  --dsw-static-green-500: var(--ark-success);
  --dsw-static-green-500-a08: var(--ark-success-soft);
  --dsw-static-green-500-a12: var(--ark-success-soft);
  --dsw-static-green-900: var(--ark-layer2);
  --dsw-static-red-50: var(--ark-danger-soft);
  --dsw-static-red-100: var(--ark-danger-soft);
  --dsw-static-red-400: var(--ark-danger);
  --dsw-static-red-400-a12: var(--ark-danger-soft);
  --dsw-static-red-500: var(--ark-danger);
  --dsw-static-red-600: var(--ark-danger);
  --dsw-static-red-600-a08: var(--ark-danger-soft);
  --dsw-static-red-900: var(--ark-layer2);

  --dsw-alias-bg-base: var(--ark-veil);
  --dsw-alias-bg-document-preview: var(--ark-layer1);
  --dsw-alias-label-document-preview: var(--ark-ink2);
  --dsw-alias-bg-document-selection: var(--ark-selection);
  --dsw-alias-bg-layer-1: var(--ark-layer1);
  --dsw-alias-bg-layer-2: var(--ark-layer2);
  --dsw-alias-bg-layer-3: var(--ark-layer3);
  --dsw-alias-bg-overlay: var(--ark-overlay);
  --dsw-alias-bg-module-platform: var(--ark-module);
  --dsw-alias-bg-multi-select: var(--ark-accent-soft);
  --dsw-alias-bg-skeleton: var(--ark-skeleton);
  --dsw-alias-bg-mask-1: rgba(0, 0, 0, .5);
  --dsw-alias-bg-mask-2: rgba(0, 0, 0, .28);
  --dsw-alias-bg-mask-3: rgba(0, 0, 0, .8);
  --dsw-alias-bg-mask-photo: rgba(0, 0, 0, .88);
  --dsw-alias-bg-mask-drop: var(--ark-overlay);
  --dsw-alias-border-inverted: transparent;
  --dsw-alias-border-inverted2: transparent;
  --dsw-alias-border-l1: var(--ark-line);
  --dsw-alias-border-l2: var(--ark-line2);
  --dsw-alias-border-l3: var(--ark-line3);
  --dsw-alias-border-l4: var(--ark-line3);
  --dsw-alias-brand-primary: var(--ark-brand);
  --dsw-alias-brand-primary-invert: var(--ark-brand-ink);
  --dsw-alias-brand-text: var(--ark-ink);
  --dsw-alias-brand-primary-new-colorprimary-new-color: var(--ark-accent);
  --dsw-alias-button-contrast-fill: var(--ark-ink);
  --dsw-alias-button-elevated-fill: var(--ark-layer2);
  --dsw-alias-button-floating-fill: var(--ark-layer3);
  --dsw-alias-button-floating-hover: var(--ark-layer2);
  --dsw-alias-button-ghost-active-border: var(--ark-accent);
  --dsw-alias-button-ghost-active-fill: var(--ark-accent-soft);
  --dsw-alias-button-ghost-active-hover: var(--ark-accent-soft);
  --dsw-alias-button-info-fill: var(--ark-accent);
  --dsw-alias-button-info-hover: var(--ark-accent2);
  --dsw-alias-button-primary-dimmed: var(--ark-layer2);
  --dsw-alias-button-primary-fill: var(--ark-brand);
  --dsw-alias-button-primary-hover: var(--ark-brand-hover);
  --dsw-alias-button-tool-bar-fill: var(--ark-menu);
  --dsw-alias-button-tool-bar-fill-invisible: var(--ark-menu);
  --dsw-alias-button-tool-bar-hover: var(--ark-layer3);
  --dsw-alias-interactive-bg-active: var(--ark-line2);
  --dsw-alias-interactive-bg-hover: var(--ark-line);
  --dsw-alias-interactive-bg-hover-accent: var(--ark-accent-soft);
  --dsw-alias-interactive-bg-hover-danger: var(--ark-danger-soft);
  --dsw-alias-interactive-bg-hover-solid: var(--ark-layer2);
  --dsw-alias-label-caption: var(--ark-ink4);
  --dsw-alias-label-deep-diving: var(--ark-accent2);
  --dsw-alias-label-deep-diving-shimmer: var(--ark-accent);
  --dsw-alias-label-dimmed: var(--ark-ink4);
  --dsw-alias-label-primary: var(--ark-ink);
  --dsw-alias-label-primary-bluish: var(--ark-ink);
  --dsw-alias-label-primary-dimmed: var(--ark-ink);
  --dsw-alias-label-primary-foreground: var(--ark-brand-ink);
  --dsw-alias-label-primary-inverted: var(--ark-brand-ink);
  --dsw-alias-label-secondary: var(--ark-ink2);
  --dsw-alias-label-shimmer: var(--ark-highlight);
  --dsw-alias-label-tertiary: var(--ark-ink3);
  --dsw-alias-link: var(--ark-accent);
  --dsw-alias-menu-icon: var(--ark-ink2);
  --dsw-alias-markdown-citation: var(--ark-layer2);
  --dsw-alias-markdown-code-block: var(--ark-code);
  --dsw-alias-markdown-code-block-banner: var(--ark-code-banner);
  --dsw-alias-markdown-code-segment-selected: var(--ark-layer3);
  --dsw-alias-markdown-code-segment-unselected: var(--ark-code);
  --dsw-alias-markdown-inline-code: var(--ark-inline-code);
  --dsw-alias-markdown-placeholder: var(--ark-module);
  --dsw-alias-markdown-tag: var(--ark-accent-soft);
  --dsw-alias-scrollbar-bg-l1: var(--ark-scroll);
  --dsw-alias-scrollbar-bg-l2: var(--ark-scroll);
  --dsw-alias-scrollbar-hover-l1: var(--ark-accent);
  --dsw-alias-scrollbar-hover-l2: var(--ark-accent);
  --dsw-alias-state-business-primary: var(--ark-accent);
  --dsw-alias-state-business-tertiary: var(--ark-accent-soft);
  --dsw-alias-state-error-primary: var(--ark-danger);
  --dsw-alias-state-error-secondary: var(--ark-danger);
  --dsw-alias-state-idle-primary: var(--ark-ink4);
  --dsw-alias-state-success-primary: var(--ark-success);
  --dsw-alias-state-success-secondary: var(--ark-success);
  --dsw-alias-state-success-tertiary: var(--ark-success-soft);
  --dsw-alias-state-warn-label: var(--ark-warn);
  --dsw-alias-state-warn-primary: var(--ark-warn);
  --dsw-alias-state-warn-secondary: var(--ark-warn);
  --dsw-alias-state-warn-tertiary: var(--ark-warn-soft);
  --dsw-alias-switch-thumb: var(--ark-ink);
  --dsw-alias-toast-bg: var(--ark-toast);
  --dsw-alias-toast-label: var(--ark-toast-ink);
  --dsw-alias-tooltip-bg: var(--ark-tooltip);
  --dsw-alias-tooltip-key-bg: var(--ark-layer3);
  --dsw-alias-turn-trigger-bg: var(--ark-code);
  --dsw-alias-turn-trigger-bg-hover: var(--ark-line);
  --dsw-alias-code-diff-added: var(--ark-success-soft);
  --dsw-alias-code-diff-deleted: var(--ark-danger-soft);
  --dsw-alias-file-diff-added-bg: var(--ark-success-soft);
  --dsw-alias-file-diff-added-gutter: var(--ark-success-soft);
  --dsw-alias-file-diff-added-marker: var(--ark-success);
  --dsw-alias-file-diff-deleted-bg: var(--ark-danger-soft);
  --dsw-alias-file-diff-deleted-gutter: var(--ark-danger-soft);
  --dsw-alias-file-diff-deleted-marker: var(--ark-danger);
  --dsw-specific-bubble: var(--ark-bubble);
  --dsw-specific-bubble-highlight: var(--ark-bubble2);
  --dsw-specific-input-major: var(--ark-composer);
  --dsw-specific-login-input: var(--ark-field);
  --dsw-specific-menu: var(--ark-menu);
  --dsw-specific-selector: var(--ark-module);
  --dsw-specific-sidebar-fill: var(--ark-sidebar);
  --dsw-specific-sidebar-nav-item-active: var(--ark-accent-soft);
  --dsw-specific-sidebar-nav-item-active-accent: var(--ark-accent-soft);
  --dsw-specific-sidebar-nav-item-hover: var(--ark-line);
  --dsw-specific-tip: var(--ark-layer2);
  --dsw-menu-surface-fill: var(--ark-menu);
  --dsw-alias-menu-group-header-fill: var(--ark-menu-solid);
  --dsw-alias-settings-card-fill: var(--ark-layer2);
  --dsw-alias-settings-card-stroke: var(--ark-line2);
  --dsw-alias-onboarding-accent: var(--ark-accent);
  --dsw-alias-onboarding-card-fill: var(--ark-layer1);
  --dsw-alias-onboarding-secondary-fill: var(--ark-layer2);
  --dsw-alias-onboarding-checkbox-border: var(--ark-line2);
  --dsw-menu-backdrop-filter: blur(22px) saturate(135%);
  --dsw-focus-ring-color: var(--ark-accent);
  --dsw-focus-ring-width: 1px;
  --dsw-elevation-stroke-color: var(--ark-line2);
  --dsw-elevation-panel: 0 0 0 .5px var(--ark-line2), 0 18px 48px -16px var(--ark-shadow);
  --dsw-elevation-prominent: 0 0 0 .5px var(--ark-line2), 0 28px 72px -20px var(--ark-shadow);
  --dsw-elevation-soft: 0 0 0 .5px var(--ark-line2), 0 18px 46px -24px var(--ark-shadow);
  --dsh-scrollbar-width: 6px;
  --shiki-foreground: var(--ark-ink);
  --shiki-background: var(--ark-code);
  --shiki-token-constant: var(--ark-accent2);
  --shiki-token-string: var(--ark-success);
  --shiki-token-comment: var(--ark-ink4);
  --shiki-token-keyword: var(--ark-danger);
  --shiki-token-parameter: var(--ark-warn);
  --shiki-token-function: var(--ark-accent);
  --shiki-token-string-expression: var(--ark-success);
  --shiki-token-punctuation: var(--ark-ink3);
  --shiki-token-link: var(--ark-accent3);
}

/* macOS menu material carries a higher-specificity stock override. */
html[data-platform="darwin"][data-arknights-theme] body,
html[data-platform="darwin"][data-arknights-theme] body[data-ds-dark-theme] {
  --dsw-specific-menu: var(--ark-menu) !important;
}

/* Protocol Glass deliberately blurs harder than the two flat protocols. */
html[data-arknights-theme="glass"] body {
  --dsw-menu-backdrop-filter: blur(30px) saturate(145%);
}

/* ==================================================================
   DOCUMENT / FRAME
   ================================================================== */
html,
body,
#root {
  height: 100%;
}

html {
  background: var(--ark-base);
}

body {
  background-color: var(--ark-base) !important;
  background-image: var(--ark-bg-art) !important;
  background-attachment: fixed !important;
  background-size: var(--ark-bg-size) !important;
  color: var(--ark-ink);
  font-family: var(--dsw-font-family);
}

body::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(120% 90% at 50% 50%, transparent 28%, color-mix(in srgb, var(--ark-base) 72%, transparent) 100%),
    repeating-linear-gradient(0deg, color-mix(in srgb, var(--ark-ink) 3%, transparent) 0 1px, transparent 1px 3px);
  opacity: .8;
}

html[data-arknights-theme="glass"] body::before {
  opacity: .55;
  background:
    radial-gradient(110% 80% at 50% 42%, transparent 22%, color-mix(in srgb, var(--ark-base) 55%, transparent) 100%),
    repeating-linear-gradient(0deg, rgba(255, 255, 255, .018) 0 1px, transparent 1px 3px);
}

#root {
  position: relative;
  z-index: 1;
}

#root > div {
  background-color: transparent !important;
  background-image: none !important;
}

#root > div::after {
  content: "";
  position: absolute;
  inset: 11px;
  z-index: 40;
  pointer-events: none;
  opacity: .55;
  background:
    linear-gradient(var(--ark-accent), var(--ark-accent)) left top / 28px 1px no-repeat,
    linear-gradient(var(--ark-accent), var(--ark-accent)) left top / 1px 28px no-repeat,
    linear-gradient(var(--ark-accent), var(--ark-accent)) right top / 28px 1px no-repeat,
    linear-gradient(var(--ark-accent), var(--ark-accent)) right top / 1px 28px no-repeat,
    linear-gradient(var(--ark-accent), var(--ark-accent)) left bottom / 28px 1px no-repeat,
    linear-gradient(var(--ark-accent), var(--ark-accent)) left bottom / 1px 28px no-repeat,
    linear-gradient(var(--ark-accent), var(--ark-accent)) right bottom / 28px 1px no-repeat,
    linear-gradient(var(--ark-accent), var(--ark-accent)) right bottom / 1px 28px no-repeat;
}

html[data-windows-titlebar] #root > div::after {
  top: calc(var(--dsh-windows-titlebar-height, 0px) + 11px);
}

html[data-platform="darwin"] #root > div::after {
  top: calc(var(--dsh-frame-top-clearance, 48px) + 11px);
}

[class*="_sidebarCol"] {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--ark-accent) 4%, transparent), transparent 28%),
    var(--ark-sidebar) !important;
  border-right: 1px solid var(--ark-line2) !important;
  box-shadow:
    inset 0 1px 0 var(--ark-accent-soft),
    inset -18px 0 36px -36px var(--ark-accent-glow),
    inset -1px 0 0 var(--ark-line);
}

[class*="_centerCol"] {
  background: transparent !important;
}

[class*="_rightbarCol"] {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--ark-accent) 3%, transparent), transparent 28%),
    var(--ark-sidebar) !important;
  border-left: 1px solid var(--ark-line2) !important;
}

/* The Windows titlebar toggle is fixed inside the sidebar column. Keep the
   collapsed column from clipping it; the stock layout expects the fixed
   element to escape this 0-width grid track. */
html[data-windows-titlebar] #root > div[data-sidebar-collapsed] [class*="_sidebarCol"] {
  overflow: visible !important;
}

/* ==================================================================
   TYPE + CONTROLS
   ================================================================== */
button,
input,
select,
textarea {
  font-family: var(--ark-font);
}

button {
  transition: background-color .16s var(--ark-ease), border-color .16s var(--ark-ease),
    color .16s var(--ark-ease), box-shadow .16s var(--ark-ease), transform .16s var(--ark-ease);
}

button:not(:disabled):active {
  transform: translateY(1px);
}

button[class*="_primary"] {
  background: var(--ark-brand) !important;
  color: var(--ark-brand-ink) !important;
  border-radius: 2px !important;
  letter-spacing: .04em;
  box-shadow: 0 0 0 1px var(--ark-line2), 0 8px 24px -14px var(--ark-shadow);
}

button[class*="_primary"]:hover:not(:disabled) {
  background: var(--ark-brand-hover) !important;
  box-shadow: 0 0 0 1px var(--ark-accent), 0 0 26px -8px var(--ark-accent-glow);
}

input,
textarea,
select {
  color: var(--ark-ink);
  caret-color: var(--ark-accent);
}

input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
textarea,
select {
  background-color: var(--ark-field) !important;
  border: 1px solid var(--ark-line2) !important;
  border-radius: 2px !important;
  box-shadow: inset 0 1px 0 var(--ark-highlight);
}

input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):focus,
textarea:focus,
select:focus {
  border-color: var(--ark-accent) !important;
  box-shadow: 0 0 0 3px var(--ark-accent-soft), inset 0 1px 0 var(--ark-highlight);
  outline: none !important;
}

input::placeholder,
textarea::placeholder {
  color: var(--ark-ink4) !important;
}

input[type="checkbox"],
input[type="radio"],
input[type="range"],
progress {
  accent-color: var(--ark-accent);
}

::selection {
  background: var(--ark-selection);
  color: var(--ark-ink);
}

a {
  color: var(--ark-accent);
  text-decoration-color: var(--ark-accent-soft);
  text-underline-offset: 3px;
}

a:hover {
  color: var(--ark-accent2);
}

kbd {
  border: 1px solid var(--ark-line2) !important;
  border-bottom-width: 2px !important;
  border-radius: 2px !important;
  background: var(--ark-layer2) !important;
  color: var(--ark-ink2) !important;
  font-family: var(--ark-mono) !important;
  letter-spacing: .04em;
}

/* ==================================================================
   SIDEBAR
   ================================================================== */
[class*="_newSession"] {
  background:
    linear-gradient(135deg, var(--ark-accent-soft), transparent 52%),
    var(--ark-layer2) !important;
  border: 1px solid var(--ark-line2) !important;
  border-radius: 2px !important;
  box-shadow: inset 0 1px 0 var(--ark-highlight);
}

[class*="_newSession"]:hover {
  border-color: var(--ark-accent) !important;
  box-shadow: inset 0 1px 0 var(--ark-highlight), 0 0 26px -12px var(--ark-accent-glow);
}

[class*="_newSession"]::after {
  content: "";
  position: absolute;
  top: 0;
  right: 0;
  width: 12px;
  height: 12px;
  border-top: 1px solid var(--ark-accent);
  border-right: 1px solid var(--ark-accent);
  opacity: .6;
  pointer-events: none;
}

[class*="_brandName"],
[class*="_fallbackBrandName"] {
  font-family: var(--ark-font);
  letter-spacing: .12em !important;
  text-transform: uppercase;
}

[class*="_brandMark"] {
  color: var(--ark-accent) !important;
  filter: drop-shadow(0 0 10px var(--ark-accent-glow));
}

[class*="_brandMark"] svg {
  color: inherit;
}

[class*="_buildVersion"] {
  background: var(--ark-accent) !important;
  color: var(--ark-brand-ink) !important;
  font-family: var(--ark-mono);
  letter-spacing: .05em;
}

[class*="_panelRow"] {
  border-radius: 2px !important;
}

[class*="_panelRow"]:hover {
  background: var(--ark-line) !important;
}

[class*="_panelActive"] {
  background: var(--ark-accent-soft) !important;
  box-shadow: inset 2px 0 0 var(--ark-accent) !important;
}

[class*="_panelActive"] [class*="_panelTitle"] {
  color: var(--ark-ink) !important;
}

/* ==================================================================
   HEADER / TABS / HERO
   ================================================================== */
[class*="_header_"],
[class*="_header"]:has(> [data-conversation-tabs]) {
  border-bottom-color: var(--ark-line) !important;
  background: linear-gradient(180deg, color-mix(in srgb, var(--ark-veil) 70%, transparent), transparent) !important;
  box-shadow: inset 0 1px 0 var(--ark-accent-soft);
}

[class*="_tabActive"] {
  color: var(--ark-accent) !important;
}

[class*="_tabActive"]::after {
  background: var(--ark-accent) !important;
  box-shadow: 0 0 10px var(--ark-accent-glow);
}

[class*="_crumbCurrent"] {
  letter-spacing: .03em;
}

[class*="_headline"] {
  font-family: var(--ark-font);
  letter-spacing: .015em;
  text-shadow: 0 0 34px var(--ark-accent-glow);
}

[class*="_composerHero"]::before {
  content: "RHODES ISLAND // OPERATOR TERMINAL";
  display: block;
  text-align: center;
  padding: 0 0 10px;
  color: var(--ark-accent);
  font-family: var(--ark-mono);
  font-size: 9px;
  font-weight: 500;
  letter-spacing: .3em;
  opacity: .82;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

html[data-arknights-theme="glass"] [class*="_composerHero"]::before {
  content: "ENDFIELD INDUSTRIES // PROTOCOL SPACE";
}

/* ==================================================================
   CONVERSATION / COMPOSER
   ================================================================== */
[data-conversation-content] {
  background: transparent !important;
}

[data-composer-seat] {
  background: linear-gradient(180deg, transparent 0, var(--ark-base) 88%) !important;
}

[data-composer-card] {
  background:
    linear-gradient(160deg, var(--ark-accent-soft), transparent 30%),
    linear-gradient(180deg, var(--ark-composer-top), var(--ark-composer)) !important;
  border: 1px solid var(--ark-line2) !important;
  border-radius: var(--dsw-radius-panel) !important;
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--ark-accent) 18%, transparent),
    0 26px 70px -34px var(--ark-shadow),
    inset 0 1px 0 var(--ark-highlight) !important;
  backdrop-filter: var(--dsw-menu-backdrop-filter);
  -webkit-backdrop-filter: var(--dsw-menu-backdrop-filter);
}

[data-composer-card]::before {
  content: "";
  position: absolute;
  top: 9px;
  left: 9px;
  width: 18px;
  height: 18px;
  border-top: 1px solid var(--ark-accent);
  border-left: 1px solid var(--ark-accent);
  opacity: .55;
  pointer-events: none;
}

[data-composer-card]::after {
  content: "";
  position: absolute;
  right: 9px;
  bottom: 9px;
  width: 18px;
  height: 18px;
  border-right: 1px solid var(--ark-accent);
  border-bottom: 1px solid var(--ark-accent);
  opacity: .55;
  pointer-events: none;
}

[data-composer-card][class*="_cardWorkspaceTrigger"]::before,
[data-composer-card][class*="_cardWorkspaceTrigger"]::after {
  display: none;
}

[data-composer-card]:focus-within {
  border-color: var(--ark-accent) !important;
  box-shadow:
    0 0 0 1px var(--ark-accent-soft),
    0 26px 70px -30px var(--ark-shadow),
    0 0 36px -14px var(--ark-accent-glow),
    inset 0 1px 0 var(--ark-highlight) !important;
}

[data-composer-input],
[contenteditable="true"] {
  caret-color: var(--ark-accent) !important;
}

[data-composer-card] button[class*="_primary"] {
  border-radius: 2px !important;
  background: var(--ark-accent) !important;
  color: var(--ark-brand-ink) !important;
  box-shadow: 0 0 20px -5px var(--ark-accent-glow);
}

[data-composer-card] button[class*="_primary"]:hover:not(:disabled) {
  background: var(--ark-accent2) !important;
}

[data-composer-card] [class*="_add"] {
  background: var(--ark-module) !important;
  color: var(--ark-accent) !important;
}

[data-composer-card] [class*="_select"] {
  color: var(--ark-ink2) !important;
  font-family: var(--ark-mono);
  font-size: 11px !important;
  letter-spacing: .03em;
}

/* ==================================================================
   CHAT
   ================================================================== */
[data-chat-flow-kind="user"] [class*="_bubble"] {
  background: var(--ark-bubble) !important;
  border: 1px solid var(--ark-line2) !important;
  border-radius: 2px !important;
  box-shadow: inset 0 1px 0 var(--ark-highlight), 0 8px 24px -22px var(--ark-shadow);
}

[data-chat-flow-kind="turn-process"],
[data-turn-process] {
  --dsw-alias-border-l1: var(--ark-line);
}

[data-chat-flow-kind="user"] [class*="_actions"] {
  color: var(--ark-ink3);
}

[data-chat-flow-kind="turn-trigger"] {
  border-left: 2px solid var(--ark-accent) !important;
  background: linear-gradient(90deg, var(--ark-accent-soft), transparent) !important;
}

[data-chat-turn] {
  scroll-margin-top: 24px;
}

[data-code-block-content] {
  background: var(--ark-code) !important;
  border: 1px solid var(--ark-line2) !important;
  border-radius: 2px !important;
  box-shadow: inset 0 1px 0 var(--ark-highlight);
}

[data-code-block-banner] {
  background: var(--ark-code-banner) !important;
  border-bottom: 1px solid var(--ark-line) !important;
  font-family: var(--ark-mono) !important;
  letter-spacing: .06em;
}

[data-turn-usage-details],
[data-session-stats-details] {
  font-family: var(--ark-mono);
  letter-spacing: .02em;
}

[data-scroll-down],
[data-scroll-up] {
  border: 1px solid var(--ark-line2) !important;
  border-radius: 2px !important;
  box-shadow: 0 12px 30px -16px var(--ark-shadow) !important;
}

/* ==================================================================
   MARKDOWN
   ================================================================== */
h1, h2, h3, h4, h5, h6 {
  font-family: var(--ark-font);
  letter-spacing: .015em;
}

h2 {
  border-bottom: 1px solid var(--ark-line) !important;
  padding-bottom: .3em;
}

hr {
  border: 0 !important;
  height: 1px !important;
  background: linear-gradient(90deg, transparent, var(--ark-line3), transparent) !important;
}

blockquote {
  border-left: 2px solid var(--ark-accent) !important;
  background: linear-gradient(90deg, var(--ark-accent-soft), transparent) !important;
  padding: .2em .9em !important;
}

:not(pre) > code {
  color: var(--ark-accent2) !important;
  background: var(--ark-inline-code) !important;
  border: 1px solid var(--ark-line) !important;
  border-radius: 2px !important;
  padding: .08em .32em !important;
  font-family: var(--ark-mono) !important;
}

pre {
  background: var(--ark-code) !important;
  border: 1px solid var(--ark-line2) !important;
  border-radius: 2px !important;
  box-shadow: inset 0 1px 0 var(--ark-highlight);
}

table {
  border-collapse: collapse;
}

th {
  background: var(--ark-accent-soft) !important;
  border: 1px solid var(--ark-line2) !important;
  color: var(--ark-ink) !important;
  font-family: var(--ark-mono);
  font-size: .9em;
  letter-spacing: .07em;
  text-transform: uppercase;
}

td {
  border: 1px solid var(--ark-line) !important;
}

/* ==================================================================
   MENUS / DIALOGS / TOOLTIPS
   ================================================================== */
[data-menu-material] {
  background: var(--ark-menu) !important;
  border: 1px solid var(--ark-line2) !important;
  border-radius: var(--dsw-radius-lg) !important;
  box-shadow: var(--dsw-elevation-prominent), inset 0 1px 0 var(--ark-highlight) !important;
  backdrop-filter: var(--dsw-menu-backdrop-filter) !important;
  -webkit-backdrop-filter: var(--dsw-menu-backdrop-filter) !important;
}

[role="menu"],
[role="listbox"] {
  border: 1px solid var(--ark-line2) !important;
  box-shadow: var(--dsw-elevation-prominent) !important;
  backdrop-filter: var(--dsw-menu-backdrop-filter) !important;
  -webkit-backdrop-filter: var(--dsw-menu-backdrop-filter) !important;
}

[role="menuitem"]:hover,
[role="menuitemcheckbox"]:hover,
[role="menuitemradio"]:hover,
[role="option"]:hover {
  background: var(--ark-accent-soft) !important;
}

[data-menu-group-heading] {
  color: var(--ark-accent) !important;
  font-family: var(--ark-mono) !important;
  font-size: 10px !important;
  letter-spacing: .18em !important;
  text-transform: uppercase;
}

[role="dialog"],
[role="alertdialog"] {
  background: var(--ark-dialog) !important;
  border: 0 !important;
  border-radius: 2px !important;
  box-shadow:
    inset 0 0 0 1px var(--ark-line2),
    0 36px 100px -34px var(--ark-shadow),
    inset 0 1px 0 var(--ark-highlight) !important;
  backdrop-filter: blur(26px) saturate(140%);
  -webkit-backdrop-filter: blur(26px) saturate(140%);
}

[role="tooltip"] {
  background: var(--ark-tooltip) !important;
  color: var(--ark-tooltip-ink) !important;
  border: 1px solid var(--ark-line2) !important;
  border-radius: 2px !important;
  font-family: var(--ark-mono) !important;
  font-size: 10px !important;
  letter-spacing: .03em;
}

[data-toast] {
  border: 1px solid var(--ark-line2) !important;
  border-radius: 2px !important;
  box-shadow: 0 20px 50px -24px var(--ark-shadow);
}

/* ==================================================================
   SETTINGS / CARDS / MISC
   ================================================================== */
[class*="_group"] {
  border-bottom-color: var(--ark-line) !important;
}

[class*="_themeCube"] {
  background: var(--ark-layer1) !important;
  border: 1px solid var(--ark-line2) !important;
  border-radius: 2px !important;
}

[class*="_themeCube"]:hover {
  border-color: var(--ark-accent) !important;
}

[class*="_themeCube"][class*="_selected"] {
  background: linear-gradient(135deg, var(--ark-accent-soft), var(--ark-layer1) 62%) !important;
  border-color: var(--ark-accent) !important;
  box-shadow: inset 2px 0 0 var(--ark-accent);
}

[class*="_stepper"] {
  background: var(--ark-module) !important;
  border-radius: 2px !important;
  border: 1px solid var(--ark-line);
}

[class*="_settingsCard"] {
  background: var(--ark-layer1) !important;
  border-color: var(--ark-line2) !important;
  box-shadow: inset 0 1px 0 var(--ark-highlight);
}

[class*="_path_"] [class*="_name_"] {
  font-family: var(--ark-mono);
}

[class*="_tag_"] {
  border-radius: 2px !important;
  font-family: var(--ark-mono);
  letter-spacing: .04em;
}

[class*="_switch_"] {
  border-radius: 2px !important;
}

[class*="_switch_"] [class*="_thumb_"] {
  border-radius: 1px !important;
}

[class*="_scroll"] {
  scrollbar-color: var(--ark-scroll) transparent;
}

::-webkit-scrollbar {
  width: var(--dsh-scrollbar-width);
  height: var(--dsh-scrollbar-width);
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, var(--ark-accent), var(--ark-scroll));
  border: none;
  border-radius: 0;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--ark-accent2);
}

::-webkit-scrollbar-corner {
  background: transparent;
}

/* ==================================================================
   THEME SWITCHER / DOCK
   ================================================================== */
.ark-dock {
  position: fixed;
  top: 50%;
  right: 10px;
  z-index: 1400;
  display: flex;
  align-items: flex-start;
  transform: translateY(-50%);
  color: var(--ark-ink);
  font-family: var(--ark-font);
  pointer-events: none;
  transition: opacity .18s var(--ark-ease), visibility .18s var(--ark-ease);
}

body:has([role="dialog"]:not([hidden]), [role="alertdialog"]:not([hidden])) .ark-dock {
  opacity: 0;
  visibility: hidden;
}

.ark-dock > * {
  pointer-events: auto;
}

.ark-dock button {
  font: inherit;
}

.ark-tab {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 9px;
  width: 36px;
  min-height: 144px;
  padding: 10px 0;
  border: 1px solid var(--ark-line2);
  border-right: 0;
  background:
    linear-gradient(180deg, var(--ark-layer2), var(--ark-sidebar));
  color: var(--ark-ink2);
  cursor: pointer;
  letter-spacing: .24em;
  font-family: var(--ark-mono);
  font-size: 9px;
  box-shadow: -12px 0 32px -18px var(--ark-shadow), inset 0 1px 0 var(--ark-highlight);
  clip-path: polygon(0 8px, 8px 0, 100% 0, 100% 100%, 0 100%);
  transition: color .18s var(--ark-ease), border-color .18s var(--ark-ease), background .18s var(--ark-ease);
}

.ark-tab-label {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  line-height: 1;
}

.ark-tab:hover,
.ark-tab[aria-expanded="true"] {
  color: var(--ark-accent);
  border-color: var(--ark-accent);
  background: linear-gradient(180deg, var(--ark-layer3), var(--ark-layer2));
}

.ark-tab-mark {
  width: 13px;
  height: 13px;
  flex: none;
  display: grid;
  place-items: center;
  transform: rotate(45deg);
  border: 1px solid var(--ark-accent);
  box-shadow: 0 0 10px var(--ark-accent-glow), inset 0 0 7px var(--ark-accent-soft);
}

.ark-tab-mark::before {
  content: "";
  width: 4px;
  height: 4px;
  background: var(--ark-accent);
}

.ark-tab-rule {
  width: 1px;
  height: 22px;
  background: linear-gradient(180deg, transparent, var(--ark-line3), transparent);
}

.ark-tab-swatch {
  width: 9px;
  height: 9px;
  flex: none;
  border: 1px solid var(--ark-line2);
  background: var(--ark-accent);
  box-shadow: 0 0 9px var(--ark-accent-glow);
}

.ark-panel {
  position: absolute;
  top: 50%;
  right: 46px;
  translate: 0 -50%;
  width: 306px;
  max-width: calc(100vw - 72px);
  max-height: calc(100vh - 24px);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 15px 15px 12px;
  border: 1px solid var(--ark-line2);
  background:
    linear-gradient(135deg, var(--ark-accent-soft), transparent 34%),
    var(--ark-dialog);
  box-shadow:
    0 34px 100px -24px var(--ark-shadow),
    0 0 0 1px var(--ark-line),
    inset 0 1px 0 var(--ark-highlight);
  backdrop-filter: var(--dsw-menu-backdrop-filter);
  -webkit-backdrop-filter: var(--dsw-menu-backdrop-filter);
  clip-path: polygon(0 11px, 11px 0, calc(100% - 11px) 0, 100% 11px, 100% calc(100% - 11px), calc(100% - 11px) 100%, 11px 100%, 0 calc(100% - 11px));
  animation: ark-panel-in .18s var(--ark-ease) both;
}

.ark-panel::before {
  content: "";
  position: absolute;
  inset: 7px;
  border: 1px solid var(--ark-line);
  border-bottom-color: transparent;
  border-right-color: transparent;
  pointer-events: none;
  opacity: .55;
}

.ark-panel-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding-bottom: 11px;
  border-bottom: 1px solid var(--ark-line);
}

.ark-panel-sigil {
  width: 28px;
  height: 28px;
  flex: none;
  display: grid;
  place-items: center;
  border: 1px solid var(--ark-accent);
  color: var(--ark-accent);
  font-family: var(--ark-mono);
  font-size: 12px;
  line-height: 1;
  box-shadow: inset 0 0 14px var(--ark-accent-soft);
  clip-path: polygon(0 6px, 6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%);
}

.ark-panel-titles {
  min-width: 0;
  flex: 1;
}

.ark-panel-kicker {
  color: var(--ark-accent);
  font-family: var(--ark-mono);
  font-size: 8px;
  font-weight: 500;
  letter-spacing: .26em;
  line-height: 1.4;
}

.ark-panel-title {
  margin-top: 2px;
  color: var(--ark-ink);
  font-size: 17px;
  font-weight: 500;
  letter-spacing: .1em;
  line-height: 1.35;
}

.ark-panel-sub {
  margin-top: 2px;
  color: var(--ark-ink3);
  font-family: var(--ark-mono);
  font-size: 8px;
  letter-spacing: .1em;
  text-transform: uppercase;
}

.ark-close {
  flex: none;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border: 1px solid transparent;
  background: transparent;
  color: var(--ark-ink3);
  cursor: pointer;
  font-family: var(--ark-mono);
  font-size: 14px;
  line-height: 1;
  padding: 0;
}

.ark-close:hover {
  color: var(--ark-accent);
  border-color: var(--ark-line2);
  background: var(--ark-line);
}

.ark-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 0 10px;
}

.ark-card {
  position: relative;
  display: grid;
  grid-template-columns: 66px minmax(0, 1fr) 16px;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 7px;
  border: 1px solid var(--ark-line);
  background: var(--ark-layer1);
  color: var(--ark-ink);
  text-align: left;
  cursor: pointer;
  clip-path: polygon(0 6px, 6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%);
  transition: background .16s var(--ark-ease), border-color .16s var(--ark-ease), transform .16s var(--ark-ease);
}

.ark-card:hover {
  background: var(--ark-layer2);
  border-color: var(--ark-accent);
  transform: translateX(-2px);
}

.ark-tab:focus-visible,
.ark-card:focus-visible,
.ark-setting-option:focus-visible,
.ark-close:focus-visible,
.ark-mode:focus-visible {
  outline: 1px solid var(--ark-accent);
  outline-offset: -2px;
}

.ark-card[aria-pressed="true"] {
  border-color: var(--ark-accent);
  background:
    linear-gradient(90deg, var(--ark-accent-soft), transparent 66%),
    var(--ark-layer2);
  box-shadow: inset 2px 0 0 var(--ark-accent);
}

.ark-thumb {
  position: relative;
  width: 66px;
  height: 44px;
  overflow: hidden;
  border: 1px solid var(--ark-line2);
  background: #0b0f11;
}

.ark-thumb[data-theme="day"] {
  background:
    radial-gradient(80px 60px at 80% 0%, rgba(190, 146, 54, .28), transparent 70%),
    linear-gradient(135deg, #f1ede1, #d8d0bc);
}

.ark-thumb[data-theme="night"] {
  background:
    radial-gradient(70px 60px at 82% 0%, rgba(212, 166, 74, .3), transparent 70%),
    radial-gradient(50px 40px at 0% 100%, rgba(64, 145, 150, .22), transparent 70%),
    #0b0f11;
}

.ark-thumb[data-theme="glass"] {
  background:
    radial-gradient(70px 60px at 80% 10%, rgba(103, 224, 207, .32), transparent 70%),
    radial-gradient(60px 50px at 12% 94%, rgba(190, 140, 55, .2), transparent 70%),
    #071114;
}

.ark-thumb::before {
  content: "";
  position: absolute;
  top: 7px;
  bottom: 7px;
  left: 7px;
  width: 13px;
  border-right: 1px solid rgba(255, 255, 255, .16);
  background:
    repeating-linear-gradient(0deg, rgba(255, 255, 255, .20) 0 1px, transparent 1px 7px);
  opacity: .8;
}

.ark-thumb[data-theme="day"]::before {
  border-right-color: rgba(30, 40, 38, .18);
  background: repeating-linear-gradient(0deg, rgba(30, 40, 38, .24) 0 1px, transparent 1px 7px);
}

.ark-thumb::after {
  content: "";
  position: absolute;
  top: 13px;
  left: 28px;
  right: 9px;
  height: 2px;
  background: #d4a64a;
  box-shadow:
    0 7px 0 rgba(255, 255, 255, .18),
    0 15px 0 rgba(255, 255, 255, .10),
    0 22px 0 rgba(103, 224, 207, .38);
}

.ark-thumb[data-theme="day"]::after {
  background: #a67a2b;
  box-shadow:
    0 7px 0 rgba(35, 48, 46, .18),
    0 15px 0 rgba(35, 48, 46, .10),
    0 22px 0 rgba(47, 112, 116, .3);
}

.ark-thumb[data-theme="glass"]::after {
  background: #67e0cf;
  box-shadow:
    0 7px 0 rgba(164, 238, 229, .22),
    0 15px 0 rgba(164, 238, 229, .12),
    0 22px 0 rgba(212, 166, 74, .45);
}

.ark-card-copy {
  min-width: 0;
}

.ark-card-name {
  display: block;
  color: var(--ark-ink);
  font-size: 11.5px;
  font-weight: 500;
  letter-spacing: .055em;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ark-card-desc {
  display: -webkit-box;
  margin-top: 2px;
  color: var(--ark-ink3);
  font-size: 9.5px;
  line-height: 1.45;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ark-card-code {
  display: block;
  margin-top: 3px;
  color: var(--ark-accent);
  font-family: var(--ark-mono);
  font-size: 7.5px;
  letter-spacing: .14em;
}

.ark-card-check {
  width: 14px;
  height: 14px;
  display: grid;
  place-items: center;
  border: 1px solid var(--ark-line2);
  color: transparent;
  font-size: 9px;
  line-height: 1;
}

.ark-card[aria-pressed="true"] .ark-card-check {
  border-color: var(--ark-accent);
  background: var(--ark-accent);
  color: var(--ark-brand-ink);
}

.ark-panel-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 9px;
  border-top: 1px solid var(--ark-line);
  color: var(--ark-ink4);
  font-family: var(--ark-mono);
  font-size: 7.5px;
  letter-spacing: .13em;
  line-height: 1.5;
  text-transform: uppercase;
}

.ark-panel-foot strong {
  color: var(--ark-accent);
  font-weight: 500;
  letter-spacing: .16em;
}

.ark-sidebar-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100%;
  margin-top: 9px;
  padding: 6px 8px;
  border: 1px solid var(--ark-line2);
  background: transparent;
  color: var(--ark-ink2);
  cursor: pointer;
  font-family: var(--ark-mono);
  font-size: 8px;
  letter-spacing: .14em;
  line-height: 1.4;
  text-transform: uppercase;
}

.ark-sidebar-toggle:hover {
  border-color: var(--ark-accent);
  background: var(--ark-accent-soft);
  color: var(--ark-accent);
}

.ark-sidebar-glyph {
  font-size: 12px;
  line-height: 1;
}

.ark-mode-row {
  display: flex;
  gap: 4px;
  padding-top: 9px;
}

.ark-mode {
  flex: 1;
  padding: 5px 4px;
  border: 1px solid var(--ark-line);
  background: transparent;
  color: var(--ark-ink3);
  cursor: pointer;
  font-family: var(--ark-mono);
  font-size: 7.5px;
  letter-spacing: .1em;
  text-transform: uppercase;
}

.ark-mode:hover,
.ark-mode[data-on="true"] {
  border-color: var(--ark-accent);
  color: var(--ark-accent);
  background: var(--ark-accent-soft);
}

/* ==================================================================
   SETTINGS ROW
   ================================================================== */
.ark-setting {
  display: flex;
  flex-direction: column;
  gap: 11px;
  padding: 16px 0;
  border-bottom: .5px solid var(--ark-line);
}

.ark-setting-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.ark-setting-copy {
  min-width: 0;
  flex: 1;
}

.ark-setting-title {
  color: var(--ark-ink);
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
}

.ark-setting-desc {
  margin-top: 2px;
  color: var(--ark-ink3);
  font-size: 12px;
  line-height: 18px;
}

.ark-setting-badge {
  flex: none;
  margin-top: 2px;
  padding: 1px 7px;
  border: 1px solid var(--ark-accent);
  color: var(--ark-accent);
  font-family: var(--ark-mono);
  font-size: 8px;
  letter-spacing: .14em;
  text-transform: uppercase;
}

.ark-setting-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ark-setting-option {
  position: relative;
  flex: 1 1 150px;
  min-width: 136px;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  align-items: center;
  gap: 9px;
  padding: 8px;
  border: 1px solid var(--ark-line2);
  background: var(--ark-layer1);
  color: var(--ark-ink2);
  text-align: left;
  cursor: pointer;
  clip-path: polygon(0 5px, 5px 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%);
}

.ark-setting-option:hover {
  border-color: var(--ark-accent);
  background: var(--ark-layer2);
}

.ark-setting-option[aria-pressed="true"] {
  border-color: var(--ark-accent);
  color: var(--ark-ink);
  background: linear-gradient(110deg, var(--ark-accent-soft), var(--ark-layer1) 72%);
  box-shadow: inset 2px 0 0 var(--ark-accent);
}

.ark-setting-option-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ark-setting-swatch {
  width: 34px;
  height: 30px;
  border: 1px solid var(--ark-line2);
  background: var(--ark-layer2);
  position: relative;
  overflow: hidden;
}

.ark-setting-swatch[data-theme="day"] {
  background: linear-gradient(135deg, #f1ede1, #d8d0bc);
}

.ark-setting-swatch[data-theme="night"] {
  background:
    radial-gradient(26px 24px at 78% 10%, rgba(212, 166, 74, .36), transparent 70%),
    #0b0f11;
}

.ark-setting-swatch[data-theme="glass"] {
  background:
    radial-gradient(26px 24px at 78% 10%, rgba(103, 224, 207, .40), transparent 70%),
    #071114;
}

.ark-setting-swatch::before {
  content: "";
  position: absolute;
  top: 5px;
  bottom: 5px;
  left: 5px;
  width: 6px;
  border-right: 1px solid var(--ark-line3);
}

.ark-setting-name {
  font-size: 12px;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ark-setting-code {
  display: block;
  margin-top: 2px;
  color: var(--ark-accent);
  font-family: var(--ark-mono);
  font-size: 7px;
  letter-spacing: .13em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ==================================================================
   MOTION / RESPONSIVE
   ================================================================== */
.ark-thumb[data-theme="xlab"], .ark-setting-swatch[data-theme="xlab"] {
  display: grid; place-items: center;
  background: #14171c; color: #c39bff; border-color: #788598;
}
.ark-thumb[data-theme="xlab"]::before, .ark-thumb[data-theme="xlab"]::after,
.ark-setting-swatch[data-theme="xlab"]::before { content: none; }
.ark-core03 { display: block; width: 24px; height: 21px; flex: none; }
.ark-thumb .ark-core03 { width: 32px; height: 28px; }

/* Console Dark is a flat instrument surface. Override the other protocols'
   materials without moving controls or changing the user's DSH layout. */
html[data-arknights-theme="xlab"] body {
  --dsw-font-family: var(--ark-font);
  --ds-font-family-code: var(--ark-mono);
  --dsw-radius-md: 2px; --dsw-radius-lg: 2px;
  --dsw-radius-xl: 2px; --dsw-radius-panel: 2px;
  --dsw-menu-backdrop-filter: none;
}
html[data-arknights-theme="xlab"] body::before,
html[data-arknights-theme="xlab"] #root > div::after,
html[data-arknights-theme="xlab"] [data-composer-card]::before,
html[data-arknights-theme="xlab"] [data-composer-card]::after,
html[data-arknights-theme="xlab"] [class*="_newSession"]::after,
html[data-arknights-theme="xlab"] .ark-panel::before { content: none; }
html[data-arknights-theme="xlab"] :is([class*="_sidebarCol"], [class*="_rightbarCol"]) {
  background: var(--ark-sidebar) !important; box-shadow: none;
}
html[data-arknights-theme="xlab"] [class*="_composerHero"]::before {
  content: "xLab   /   CONSOLE";
  color: var(--ark-ink2); font: 500 12px/1.5 var(--ark-mono);
  letter-spacing: .10em; opacity: 1;
}
html[data-arknights-theme="xlab"] :is([class*="_header_"], [class*="_header"]:has(> [data-conversation-tabs]), [data-composer-card]) {
  background: var(--ark-layer1) !important; box-shadow: none !important;
}
html[data-arknights-theme="xlab"] [role="dialog"],
html[data-arknights-theme="xlab"] [role="alertdialog"],
html[data-arknights-theme="xlab"] .ark-panel {
  backdrop-filter: none; -webkit-backdrop-filter: none;
}
html[data-arknights-theme="xlab"] :is(.ark-panel, .ark-card, .ark-setting-option, .ark-tab, .ark-panel-sigil) {
  background: var(--ark-layer1); border-radius: 2px; clip-path: none;
}
html[data-arknights-theme="xlab"] :is(.ark-card,.ark-setting-option)[aria-pressed="true"] {
  color: var(--ark-accent); background: var(--ark-accent-soft); border-color: var(--ark-accent);
}
html[data-arknights-theme="xlab"] :is(.ark-card,.ark-setting-option):hover {
  background: var(--ark-layer2); border-color: var(--ark-accent); transform: none;
}
html[data-arknights-theme="xlab"] .ark-card-name,
html[data-arknights-theme="xlab"] .ark-setting-name { font-size: 14px; }
html[data-arknights-theme="xlab"] :is(.ark-card-desc,.ark-card-code,.ark-setting-code,.ark-setting-badge,.ark-panel-kicker,.ark-panel-sub) {
  font-size: 12px; line-height: 1.4; letter-spacing: .02em;
}
html[data-arknights-theme="xlab"] :is(.ark-close,.ark-setting-option,.ark-card) { min-height: 40px; }
html[data-arknights-theme="xlab"] .ark-close { min-width: 40px; }
html[data-arknights-theme="xlab"] :is(button,a,input,select,textarea,[tabindex="0"]):focus-visible {
  outline: 2px solid var(--ark-accent) !important; outline-offset: -2px;
}
html[data-arknights-theme="xlab"] .ark-tab-mark { animation: none; }
html[data-arknights-theme="xlab"] [class*="_brandMark"] { filter: none; }
html[data-arknights-theme="xlab"] :is(textarea,select,input:not([type="checkbox"]):not([type="radio"]):not([type="range"])) {
  border-color: var(--ark-line3) !important;
}
html[data-arknights-theme="xlab"] :is([class*="_newSession"],[data-chat-flow-kind="turn-trigger"]) {
  background: var(--ark-layer2) !important;
}
html[data-arknights-theme="xlab"] [class*="_tabActive"]::after { box-shadow: none; }
html[data-arknights-theme="xlab"] ::-webkit-scrollbar-thumb { background: var(--ark-scroll); }
html[data-arknights-theme="xlab"] button:not(:disabled):active { transform: none; }

@keyframes ark-panel-in {
  from { opacity: 0; transform: translateX(8px) scale(.985); }
  to { opacity: 1; transform: translateX(0) scale(1); }
}

@keyframes ark-pulse {
  0%, 100% { box-shadow: 0 0 0 0 var(--ark-accent-glow); }
  50% { box-shadow: 0 0 0 5px transparent; }
}

.ark-tab[aria-expanded="false"] .ark-tab-mark {
  animation: ark-pulse 2.8s var(--ark-ease) infinite;
}

@media (max-width: 760px) {
  .ark-dock {
    top: 42%;
    right: 6px;
    bottom: auto;
    transform: translateY(-50%);
  }

  .ark-tab {
    width: 32px;
    min-height: 104px;
    font-size: 8px;
  }

  .ark-panel {
    right: 40px;
    width: min(306px, calc(100vw - 58px));
  }

  .ark-panel-title {
    font-size: 15px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ark-panel,
  .ark-tab,
  .ark-card,
  .ark-setting-option,
  button {
    animation: none !important;
    transition: none !important;
  }

  .ark-tab[aria-expanded="false"] .ark-tab-mark {
    animation: none;
  }
}
`

    // ------------------------------------------------------------------
    // Theme store
    // ------------------------------------------------------------------
    const listeners = new Set()
    let currentTheme = 'day'
    let themeService = null
    let closed = false

    function isThemeId(value) {
      return typeof value === 'string' && THEME_IDS.includes(value)
    }

    function readStoredTheme() {
      try {
        const value = window.localStorage.getItem(STORAGE_KEY)
        return isThemeId(value) ? value : null
      } catch {
        return null
      }
    }

    function systemTheme() {
      try {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day'
      } catch {
        return 'day'
      }
    }

    function writeStoredTheme(id) {
      try {
        window.localStorage.setItem(STORAGE_KEY, id)
      } catch {
        // Private mode or a blocked storage must not break the switch.
      }
    }

    function applyDocumentTheme(id) {
      if (typeof document === 'undefined') return
      document.documentElement.dataset.arknightsTheme = id
    }

    function notify() {
      for (const listener of listeners) listener(currentTheme)
    }

    /** Switch the visual protocol; optionally keep the stock light/dark service in step. */
    function chooseTheme(id, options) {
      if (!isThemeId(id) || closed) return
      const next = id
      const changed = currentTheme !== next
      currentTheme = next
      applyDocumentTheme(next)
      if (options?.persist !== false) writeStoredTheme(next)
      if (options?.sync !== false && themeService !== null) {
        try {
          themeService.setTheme(next === 'day' ? 'light' : 'dark')
        } catch {
          // A composition without the stock theme service still gets the CSS layer.
        }
      }
      if (changed) notify()
    }

    function useActiveTheme() {
      const [value, setValue] = useState(currentTheme)
      useEffect(() => {
        const listener = (next) => setValue(next)
        listeners.add(listener)
        setValue(currentTheme)
        return () => listeners.delete(listener)
      }, [])
      return value
    }

    // ------------------------------------------------------------------
    // Components
    // ------------------------------------------------------------------
    // The existing, approved 03 CORE vector, with its original negative spaces.
    // Render locally so selecting the protocol never fetches an external asset.
    function core03() {
      return h('svg', { viewBox: '0 0 1000 866.025403784', className: 'ark-core03', focusable: false, 'aria-hidden': true },
        h('path', { fill: 'currentColor', fillRule: 'evenodd',
          d: 'M1000 866.025403784 500 0 0 866.025403784Z M500 24 512 44.784609691 512 332.553755053 718 689.356221412 967.215390309 833.240794094 979.215390309 854.025403784 955.215390309 854.025403784 706 710.140831103 294 710.140831103 44.784609691 854.025403784 20.784609691 854.025403784 32.784609691 833.240794094 282 689.356221412 488 332.553755053 488 44.784609691Z M415 626.425042071 585 626.425042071 500 479.200723427Z' }))
    }
    function swatch(theme, className) {
      return h('span', { className, 'data-theme': theme.id, 'aria-hidden': 'true' }, theme.id === 'xlab' ? core03() : null)
    }

    function ThemeDock({ t, toggleSidebar }) {
      const active = useActiveTheme()
      const [open, setOpen] = useState(false)
      const rootRef = useRef(null)
      const tabRef = useRef(null)
      const closePanel = () => {
        setOpen(false)
        tabRef.current?.focus()
      }
      const tr = useCallback((key) => localized(t, key), [t])
      const current = THEMES.find((theme) => theme.id === active) ?? THEMES[0]

      useEffect(() => {
        if (!open) return undefined
        const onPointerDown = (event) => {
          if (rootRef.current !== null && rootRef.current.contains(event.target)) return
          setOpen(false)
        }
        const onKeyDown = (event) => {
          if (event.key === 'Escape' && !event.defaultPrevented) closePanel()
        }
        document.addEventListener('pointerdown', onPointerDown, true)
        document.addEventListener('keydown', onKeyDown)
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true)
          document.removeEventListener('keydown', onKeyDown)
        }
      }, [open])

      return h(
        'div',
        { className: 'ark-dock', 'data-open': open || undefined, ref: rootRef },
        [
          h(
            'button',
            {
              key: 'tab',
              ref: tabRef,
              type: 'button',
              className: 'ark-tab',
              'aria-expanded': open,
              'aria-label': open ? tr('dockClose') : tr('dockOpen'),
              title: open ? tr('dockClose') : tr('dockOpen'),
              onClick: () => setOpen((value) => !value),
            },
            [
              h('span', { className: 'ark-tab-mark', key: 'mark', 'aria-hidden': 'true' }),
              h('span', { className: 'ark-tab-rule', key: 'rule', 'aria-hidden': 'true' }),
              h('span', { className: 'ark-tab-label', key: 'label' }, tr('dockLabel')),
              h('span', { className: 'ark-tab-rule', key: 'rule2', 'aria-hidden': 'true' }),
              h('span', { className: 'ark-tab-swatch', key: 'swatch', 'aria-hidden': 'true' }),
            ],
          ),
          open
            ? h('div', { key: 'panel', className: 'ark-panel', role: 'group', 'aria-label': tr('panelTitle') }, [
                h('div', { className: 'ark-panel-head', key: 'head' }, [
                  h('span', { className: 'ark-panel-sigil', key: 'sigil', 'aria-hidden': 'true' }, active === 'xlab' ? core03() : 'R'),
                  h('div', { className: 'ark-panel-titles', key: 'titles' }, [
                    h('div', { className: 'ark-panel-kicker', key: 'kicker' }, tr('panelKicker')),
                    h('div', { className: 'ark-panel-title', key: 'title' }, tr('panelTitle')),
                    h(
                      'div',
                      { className: 'ark-panel-sub', key: 'sub' },
                      tr('current') + ' // ' + tr(current.nameKey) + ' // ' + tr(current.schemeKey),
                    ),
                  ]),
                  h(
                    'button',
                    {
                      key: 'close',
                      type: 'button',
                      className: 'ark-close',
                      'aria-label': tr('dockClose'),
                      title: tr('dockClose'),
                      onClick: closePanel,
                    },
                    '×',
                  ),
                ]),
                h(
                  'div',
                  { className: 'ark-list', key: 'list' },
                  THEMES.map((theme) =>
                    h(
                      'button',
                      {
                        key: theme.id,
                        type: 'button',
                        className: 'ark-card',
                        'data-theme': theme.id,
                        'aria-pressed': active === theme.id,
                        onClick: () => chooseTheme(theme.id),
                      },
                      [
                        swatch(theme, 'ark-thumb'),
                        h('span', { className: 'ark-card-copy', key: 'copy' }, [
                          h('span', { className: 'ark-card-name', key: 'name' }, tr(theme.nameKey)),
                          h('span', { className: 'ark-card-desc', key: 'desc' }, tr(theme.descKey)),
                          h('span', { className: 'ark-card-code', key: 'code' }, theme.code),
                        ]),
                        h(
                          'span',
                          { className: 'ark-card-check', key: 'check', 'aria-hidden': 'true' },
                          active === theme.id ? '✓' : '',
                        ),
                      ],
                    ),
                  ),
                ),
                h('div', { className: 'ark-panel-foot', key: 'foot' }, [
                  h('span', { key: 'hint' }, tr('panelHint')),
                  h('strong', { key: 'active' }, tr('active')),
                ]),
                h(
                  'button',
                  {
                    key: 'sidebar',
                    type: 'button',
                    className: 'ark-sidebar-toggle',
                    onClick: () => {
                      try {
                        toggleSidebar?.()
                      } catch {
                        // A composition without the layout service still keeps the theme panel usable.
                      }
                    },
                  },
                  [
                    h('span', { className: 'ark-sidebar-glyph', key: 'glyph', 'aria-hidden': 'true' }, '▤'),
                    h('span', { key: 'label' }, tr('toggleSidebar')),
                  ],
                ),
              ])
            : null,
        ],
      )
    }

    function ThemeSettingsRow({ t }) {
      const active = useActiveTheme()
      const tr = useCallback((key) => localized(t, key), [t])
      return h('div', { className: 'ark-setting' }, [
        h('div', { className: 'ark-setting-head', key: 'head' }, [
          h('div', { className: 'ark-setting-copy', key: 'copy' }, [
            h('div', { className: 'ark-setting-title', key: 'title' }, tr('settingsTitle')),
            h('div', { className: 'ark-setting-desc', key: 'desc' }, tr('settingsDesc')),
          ]),
          h('span', { className: 'ark-setting-badge', key: 'badge' }, (THEMES.find((theme) => theme.id === active) ?? THEMES[0]).code),
        ]),
        h(
          'div',
          { className: 'ark-setting-grid', key: 'grid' },
          THEMES.map((theme) =>
            h(
              'button',
              {
                key: theme.id,
                type: 'button',
                className: 'ark-setting-option',
                'data-theme': theme.id,
                'aria-pressed': active === theme.id,
                onClick: () => chooseTheme(theme.id),
              },
              [
                swatch(theme, 'ark-setting-swatch'),
                h('span', { className: 'ark-setting-option-copy', key: 'copy' }, [
                  h('span', { className: 'ark-setting-name', key: 'name' }, tr(theme.nameKey)),
                  h('span', { className: 'ark-setting-code', key: 'code' }, tr(theme.schemeKey) + ' // ' + theme.code),
                ]),
              ],
            ),
          ),
        ),
      ])
    }

    // ------------------------------------------------------------------
    // Plugin
    // ------------------------------------------------------------------
    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        closed = false
        themeService = ctx.get('theme') ?? null

        ctx.effect(() => {
          const existing = document.querySelector('style[data-plugin-css="' + STYLE_ID + '"]')
          const tag = document.createElement('style')
          tag.dataset.plugin = PLUGIN_ID
          tag.dataset.pluginCss = STYLE_ID
          tag.textContent = css
          if (existing !== null) existing.replaceWith(tag)
          else document.head.appendChild(tag)
          return () => {
            tag.remove()
          }
        }, 'arknights-ui: theme stylesheet')

        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'arknights-ui: dictionaries')

        const stored = readStoredTheme()
        currentTheme = stored ?? systemTheme()
        applyDocumentTheme(currentTheme)
        if (stored !== null && themeService !== null) {
          try {
            themeService.setTheme(stored === 'day' ? 'light' : 'dark')
          } catch {
            // The visual layer remains authoritative even without the stock service.
          }
        }

        ctx.effect(() => {
          const root = document.documentElement
          return () => {
            closed = true
            root.removeAttribute('data-arknights-theme')
          }
        }, 'arknights-ui: document attribute')

        ctx.effect(() => {
          const media = window.matchMedia?.('(prefers-color-scheme: dark)')
          if (media === undefined || media === null) return undefined
          const onChange = () => {
            if (readStoredTheme() !== null) return
            chooseTheme(media.matches ? 'night' : 'day', { persist: false, sync: false })
          }
          media.addEventListener('change', onChange)
          return () => media.removeEventListener('change', onChange)
        }, 'arknights-ui: system scheme')

        ctx.effect(() => {
          const onStorage = (event) => {
            if (event.key !== STORAGE_KEY && event.key !== null) return
            const storedTheme = readStoredTheme()
            chooseTheme(storedTheme ?? systemTheme(), { persist: false })
          }
          window.addEventListener('storage', onStorage)
          return () => window.removeEventListener('storage', onStorage)
        }, 'arknights-ui: other windows')

        ctx.on('theme/change', (snapshot) => {
          const scheme = snapshot?.active?.colorScheme
          if (scheme !== 'light' && scheme !== 'dark') return
          const desired = currentTheme === 'day' ? 'light' : 'dark'
          if (scheme === desired) return
          const next = scheme === 'light' ? 'day' : currentTheme === 'glass' ? 'glass' : 'night'
          chooseTheme(next, { persist: true, sync: false })
        })

        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            {
              name: 'shell.overlay',
              id: 'arknights-ui',
              order: 30,
              locale: NS,
              inject: () => ({
                toggleSidebar: () => {
                  try {
                    ctx.get('layout')?.toggleSidebar()
                  } catch {
                    // No layout service: leave the control inert rather than throwing.
                  }
                },
              }),
            },
            ThemeDock,
          ),
        )

        ctx.slots.inject('settings.general.item', () =>
          ctx.slots.register(
            {
              name: 'settings.general.item',
              id: 'arknights-ui',
              order: 10.5,
              locale: NS,
            },
            ThemeSettingsRow,
          ),
        )
      },
    }
  },
})
