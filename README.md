# Sepia

A desktop color picker for designers and developers. Pick any pixel on your screen with a global hotkey, save colors into collections, and export to nine formats — CSS, SCSS, Tailwind, JSON, Adobe ASE, Sketch, Figma tokens, GIMP `.gpl`, raw text.

---

## Download

<table>
  <tr>
    <td align="center" width="33%">
      <a href="https://github.com/Youssefsooska/Sepia-Colorize/releases/latest/download/Sepia-mac-arm64.dmg">
        <img src="https://img.shields.io/badge/Download_for-macOS_Apple_Silicon-000?style=for-the-badge&logo=apple&logoColor=white" alt="Download for macOS Apple Silicon">
      </a>
      <br><sub>M1 / M2 / M3 / M4 — most Macs from 2020+</sub>
    </td>
    <td align="center" width="33%">
      <a href="https://github.com/Youssefsooska/Sepia-Colorize/releases/latest/download/Sepia-mac-x64.dmg">
        <img src="https://img.shields.io/badge/Download_for-macOS_Intel-555?style=for-the-badge&logo=apple&logoColor=white" alt="Download for macOS Intel">
      </a>
      <br><sub>Intel-based Macs (pre-2020)</sub>
    </td>
    <td align="center" width="33%">
      <a href="https://github.com/Youssefsooska/Sepia-Colorize/releases/latest/download/Sepia-Setup-windows.exe">
        <img src="https://img.shields.io/badge/Download_for-Windows-0078D4?style=for-the-badge&logo=windows&logoColor=white" alt="Download for Windows">
      </a>
      <br><sub>Installer · 64-bit and ARM</sub>
    </td>
  </tr>
</table>

**Not sure which Mac you have?** Apple menu → *About This Mac*. If it says "Apple M1/M2/M3/M4" → Apple Silicon. If it says "Intel" → Intel.

**Want a portable Windows `.exe` (no install)?** Grab one from the [releases page](https://github.com/Youssefsooska/Sepia-Colorize/releases/latest).

---

## First launch

Sepia isn't signed with a paid developer certificate, so both Apple and Microsoft will warn you the first time. **One-time** click-through on each — here's exactly what to do.

### macOS

When you double-click Sepia.app you'll see *"Apple could not verify Sepia is free of malware"* with **Move to Trash / Done** buttons (no "Open" option on macOS Sequoia and later — Apple removed that shortcut).

1. Click **Done** — don't trash the app.
2. Open **System Settings → Privacy & Security**.
3. Scroll to the **Security** section. You'll see: *"Sepia was blocked from use because it is not from an identified developer."*
4. Click **Open Anyway** next to it.
5. Confirm with Touch ID / your password.
6. Sepia launches. macOS remembers the exception — you won't see this again.

The first time you trigger the picker hotkey, macOS will also ask for **Screen Recording** permission. Grant it in System Settings → Privacy & Security → Screen & System Audio Recording, then relaunch Sepia.

> **Power-user shortcut** (skips steps 1–5): open Terminal and run
> `xattr -cr /Applications/Sepia.app`
> This strips the quarantine flag the browser added at download.

### Windows

When you run the installer or portable .exe, SmartScreen blocks it with *"Windows protected your PC"* and a single **Don't run** button.

1. Click **More info** (small text under the message).
2. A **Run anyway** button appears at the bottom — click it.
3. The installer / app runs. SmartScreen learns you've vouched for it.

### Why these warnings exist

Real fix: sign the app with an **Apple Developer ID** ($99/yr) and an **Authenticode certificate** (~$200-400/yr). Both warnings disappear silently for end users. Until then the click-through above is the trade-off for shipping for free.

---

## What it does

- **Pick from anywhere on screen** — `⇧⌘C` on Mac, `Ctrl+Shift+C` on Windows. A magnifier shows what you're about to grab, with live hex/RGB/HSL readouts.
- **Auto-organize** every pick into "All Colors" plus any collections you create.
- **Color theory** — pick a base, see complementary, analogous, triadic, split-complementary, tetradic, and monochromatic harmonies on an interactive HSL wheel.
- **WCAG contrast checker** — compare any two saved colors and see AA/AAA pass/fail at the same time.
- **Export** to CSS / SCSS / Tailwind / JSON / ASE / Sketch / Figma tokens / GIMP `.gpl` / raw text.
- **Menu-bar / system-tray** swatches — click the Sepia icon and your eight most recent colors appear; click any swatch to copy its hex straight to clipboard.

---

## Privacy

No network, no telemetry, no analytics. Everything is local — colors live in your browser-style `localStorage`, hotkeys live in a local `electron-store` file. Nothing leaves your machine.

---

## Build from source

Requires Node 20+.

```bash
npm install
npm run dev          # Vite + Electron, hot reload
npm run build        # builds .dmg + .exe in dist-release/
npm run build:mac    # macOS only
npm run build:win    # Windows only
```

### Repo layout

```
electron/      Main process: picker, tray, hotkeys, exporter, IPC
src/
  components/  React components (Sidebar, ColorCard, ContrastChecker, …)
  pages/       DrawerPage, ColorTheoryPage, SettingsPage
  stores/      Zustand stores (colorStore, settingsStore)
  utils/       Pure functions (color conversion, color theory, exports)
  types.ts     Shared data contracts
scripts/       Icon generator, after-pack codesign hook
```

### Architecture notes

- **Picker sampling runs in the main process** via `desktopCapturer`, not in the overlay via `getDisplayMedia`. The latter includes the cursor sprite in the captured frame on macOS, which would make every sample read the cursor's pixels. The main-process path uses the cursor-free `CGDisplayCreateImage` underneath.
- **Renderer is sandboxed**. `contextIsolation: true`, `nodeIntegration: false`. The only bridge is `window.sepia`, defined in `electron/preload.ts`.
- **No raw IPC** anywhere in the renderer. Everything goes through typed methods on the bridge.

---

## License

MIT.
