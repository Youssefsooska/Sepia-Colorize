/**
 * System tray / menu-bar icon for Sepia.
 *
 * The icon lives in the tray so the user can trigger picking without the
 * main window being open. A real template icon should live at
 * `assets/trayTemplate.png` (16×16, monochrome for macOS template behavior).
 * If the asset is missing we fall back to an empty native image so the tray
 * still appears rather than crashing — the menu is the important part.
 */
import { Tray, Menu, nativeImage, app } from 'electron';
import path from 'node:path';
import { startPicking } from './picker';
import { getMainWindow, toggleMainWindow } from './main';
import { getCurrentHotkeys } from './hotkeys';

const __dirnameLocal = __dirname;

let tray: Tray | null = null;

function loadIcon(): Electron.NativeImage {
  // Expected asset path (packaged or dev).
  const candidate = path.join(__dirnameLocal, '../assets/trayTemplate.png');
  const img = nativeImage.createFromPath(candidate);
  if (!img.isEmpty()) {
    if (process.platform === 'darwin') img.setTemplateImage(true);
    return img;
  }
  // Runtime fallback — build the aperture/reticle glyph pixel-by-pixel so
  // the tray is always visible even if the asset file never made it into
  // the bundle. Template mode (macOS) auto-tints the black+alpha shape to
  // match the menu bar theme.
  return buildFallbackTrayIcon();
}

function buildFallbackTrayIcon(): Electron.NativeImage {
  // 16×16 base resolution for standard DPI; a 32×32 @2x variant is added
  // via addRepresentation so Retina menu bars get the crisp version.
  const base = drawReticleBitmap(16);
  const at2x = drawReticleBitmap(32);
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

function drawReticleBitmap(size: number): Buffer {
  // BGRA buffer: pure-black pixels with alpha carrying the ring+dot shape.
  const buf = Buffer.alloc(size * size * 4);
  const scale = size / 16;
  const cx = size / 2 - 0.5;
  const cy = size / 2 - 0.5;
  const rOuter = 6 * scale;
  const rInner = 4 * scale;
  const rDot = 1.4 * scale;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      let a = 0;
      if (d >= rInner && d <= rOuter) a = 255;
      if (d <= rDot) a = 255;
      const i = (y * size + x) * 4;
      buf[i] = 0;     // B
      buf[i + 1] = 0; // G
      buf[i + 2] = 0; // R
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

/** Rebuilds the tray menu — called after hotkey changes for fresh labels. */
export function rebuildMenu(): void {
  if (!tray) return;
  const hk = getCurrentHotkeys();
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
    {
      // Populated lazily from renderer state is out of scope for MVP — this
      // static label keeps the menu layout consistent.
      label: 'Recent Colors',
      enabled: false,
    },
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
