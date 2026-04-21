# Sepia

A cross-platform desktop color picker and color-theory tool for macOS and Windows.

## What it does

- **Pick colors from anywhere on your screen** with a global hotkey
  (default: `Shift+Cmd+C` on macOS, `Shift+Ctrl+C` on Windows). A
  fullscreen magnifier loupe lets you target individual pixels.
- **Organize colors into collections** — every pick is saved
  automatically and grouped under "All Colors" plus any user-created
  collections.
- **Analyze palettes** on the Color Theory page: pick a base color, see
  complementary / analogous / triadic / split-complementary / tetradic /
  monochromatic harmonies on an interactive HSL wheel, and run WCAG
  contrast checks against any two saved colors.
- **Export** to nine formats: CSS variables, SCSS variables, Tailwind
  config, JSON, Adobe ASE, Sketch palette, Figma tokens, GIMP `.gpl`,
  and raw text.
- **Import** from JSON backups or GIMP `.gpl` palette files.

## How it works

Sepia is an Electron app with a React + TypeScript renderer and a thin
main-process layer:

- **Main process** (`electron/`) — owns the system tray, global
  shortcuts, the fullscreen picker overlay, and the native save dialog.
  It exposes a narrow `window.sepia` bridge via preload; the renderer
  never sees raw IPC.
- **Renderer** (`src/`) — React UI with three pages (Drawer, Color
  Theory, Settings). State lives in two Zustand stores persisted to
  `localStorage`. Color math and export-format generators are pure
  functions in `src/utils/` so they are trivially testable.
- **Picker** — on hotkey, main opens a transparent always-on-top window
  on the active display. The overlay captures a screenshot via
  `desktopCapturer`, paints it into a canvas, and samples pixels under
  the cursor. An 8× loupe shows what you're about to click.

Key directories:

```
electron/     Electron main process (main, preload, tray, hotkeys, picker, exporter)
src/
  components/ React components (Sidebar, ColorCard, HotkeyRecorder, …)
  pages/      DrawerPage, ColorTheoryPage, SettingsPage
  stores/     Zustand stores (colorStore, settingsStore)
  utils/      Pure functions (colorConversion, colorTheory, exportFormats)
  types.ts    Single source of truth for shared data contracts
```

## How to run it

Install dependencies and start the dev server with hot reload:

```bash
npm install
npm run dev
```

`npm run dev` launches Vite plus the Electron main process via
`vite-plugin-electron`; saving a renderer file hot-reloads the window,
and saving a main-process file restarts Electron.

### Build packaged binaries

```bash
npm run build
```

This type-checks, builds the renderer bundle, and runs
`electron-builder` to produce a `.dmg` (macOS) or an NSIS installer +
portable `.exe` (Windows) in `dist-release/`.

### Type-check only

```bash
npm run typecheck
```

## Security & privacy

- `contextIsolation` is enabled and `nodeIntegration` is disabled on
  every renderer window.
- The renderer only sees the small, typed `window.sepia` API exposed by
  preload; there is no raw `ipcRenderer` access.
- No network calls, telemetry, or analytics.
- Data (colors, collections, settings) is stored locally — in the
  renderer's `localStorage` for state and in `electron-store` for
  global-hotkey preferences. Nothing leaves your machine.
- `.env` and other sensitive files are excluded via `.gitignore`.
