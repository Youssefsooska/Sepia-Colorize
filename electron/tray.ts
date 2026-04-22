/**
 * System tray / menu-bar icon for Sepia.
 *
 * The icon lives in the tray so the user can trigger picking without the
 * main window being open. A real template icon should live at
 * `assets/trayTemplate.png` (16×16, monochrome for macOS template behavior).
 * If the asset is missing we fall back to an empty native image so the tray
 * still appears rather than crashing — the menu is the important part.
 */
import { Tray, Menu, MenuItemConstructorOptions, nativeImage, app, clipboard } from 'electron';
import path from 'node:path';
import { startPicking } from './picker';
import { getMainWindow, toggleMainWindow } from './main';
import { getCurrentHotkeys } from './hotkeys';

const __dirnameLocal = __dirname;

let tray: Tray | null = null;

// Renderer pushes its recent-color list here whenever the color store
// changes, so the tray menu can show clickable swatches. Held in module
// scope rather than fetched from the store because the tray lives in the
// main process and has no direct access to the renderer's localStorage.
interface TrayColor { id: string; hex: string }
let recentColors: TrayColor[] = [];

// Replaces the cached list and rebuilds the menu so the swatches reflect
// the latest state. Called from main on IPC from the renderer.
export function setRecentColors(next: TrayColor[]): void {
  recentColors = next.slice(0, 8); // cap list — a long menu is noisy
  rebuildMenu();
}

// 16x16 solid-color NativeImage from a hex string. Menu item icons only
// accept NativeImage, so we synthesize a tiny BGRA buffer per swatch.
// Template mode is OFF — template would tint to match the menu theme and
// erase the hue we're trying to show.
function swatchIcon(hex: string): Electron.NativeImage {
  const size = 16;
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  const r = m ? parseInt(m[1]!, 16) : 0;
  const g = m ? parseInt(m[2]!, 16) : 0;
  const b = m ? parseInt(m[3]!, 16) : 0;
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    buf[i * 4] = b;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = r;
    buf[i * 4 + 3] = 255;
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size });
}

function loadIcon(): Electron.NativeImage {
  // Expected asset path (packaged or dev).
  const candidate = path.join(__dirnameLocal, '../assets/trayTemplate.png');
  const img = nativeImage.createFromPath(candidate);
  if (!img.isEmpty()) {
    // Template mode is macOS-only — macOS auto-tints the black+alpha shape
    // to match the menu bar theme. On Windows the notification area shows
    // the icon as-is, so we leave template off and the black file will be
    // invisible there; fall through to the procedural icon in that case.
    if (process.platform === 'darwin') {
      img.setTemplateImage(true);
      return img;
    }
  }
  // Runtime fallback — always used on Windows/Linux, and on macOS if the
  // asset file is missing. Windows taskbar chrome is dark, so we paint
  // white-on-transparent there; macOS templates flip tone automatically,
  // so black-on-transparent is the right base for that.
  return buildFallbackTrayIcon();
}

function buildFallbackTrayIcon(): Electron.NativeImage {
  // White glyph on Windows/Linux (visible on dark taskbars); black on
  // macOS where template-image mode tint-matches the menu bar theme.
  const white = process.platform !== 'darwin';
  const base = drawReticleBitmap(16, white);
  const at2x = drawReticleBitmap(32, white);
  const img = nativeImage.createFromBuffer(base, { width: 16, height: 16 });
  img.addRepresentation({
    scaleFactor: 2,
    width: 32,
    height: 32,
    buffer: at2x,
  });
  if (process.platform === 'darwin') img.setTemplateImage(true);
  return img;
}

function drawReticleBitmap(size: number, white: boolean): Buffer {
  // BGRA buffer. Alpha carries the ring+dot shape; color channels set to
  // white on Windows/Linux so the glyph reads on the default dark taskbar,
  // black on macOS where setTemplateImage handles tinting.
  const buf = Buffer.alloc(size * size * 4);
  const scale = size / 16;
  const cx = size / 2 - 0.5;
  const cy = size / 2 - 0.5;
  const rOuter = 6 * scale;
  const rInner = 4 * scale;
  const rDot = 1.4 * scale;
  const v = white ? 255 : 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      let a = 0;
      if (d >= rInner && d <= rOuter) a = 255;
      if (d <= rDot) a = 255;
      const i = (y * size + x) * 4;
      buf[i] = v;     // B
      buf[i + 1] = v; // G
      buf[i + 2] = v; // R
      buf[i + 3] = a;
    }
  }
  return buf;
}

export function initTray(): void {
  tray = new Tray(loadIcon());
  tray.setToolTip('Sepia');
  rebuildMenu();

  tray.on('click', () => {
    // On Windows, a left click should toggle the main window; macOS opens
    // the menu automatically, so this is a no-op there.
    if (process.platform === 'win32') toggleMainWindow();
  });
}

// Rebuilds the tray menu — called after hotkey changes and whenever the
// renderer pushes a new recent-colors list. Colors are rendered as
// clickable swatches with the hex as label; clicking copies the hex to
// the clipboard so the user can paste it anywhere without opening the app.
export function rebuildMenu(): void {
  if (!tray) return;
  const hk = getCurrentHotkeys();

  const colorItems: MenuItemConstructorOptions[] = recentColors.length
    ? recentColors.map((c) => ({
        label: c.hex,
        icon: swatchIcon(c.hex),
        click: () => clipboard.writeText(c.hex),
      }))
    : [{ label: 'No colors yet', enabled: false }];

  const menu = Menu.buildFromTemplate([
    {
      label: 'Pick Color',
      accelerator: hk.pickColor,
      click: () => startPicking(),
    },
    {
      label: 'Open Sepia',
      click: () => {
        const win = getMainWindow();
        if (win) { win.show(); win.focus(); }
      },
    },
    { type: 'separator' },
    { label: 'Recent Colors', enabled: false },
    ...colorItems,
    { type: 'separator' },
    {
      label: 'Quit Sepia',
      role: 'quit',
      click: () => app.quit(),
    },
  ]);
  tray.setContextMenu(menu);
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}
