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
import { fileURLToPath } from 'node:url';
import { startPicking } from './picker.js';
import { getMainWindow, toggleMainWindow } from './main.js';
import { getCurrentHotkeys } from './hotkeys.js';

const __filename = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
const __dirnameLocal = path.dirname(__filename);

let tray: Tray | null = null;

function loadIcon(): Electron.NativeImage {
  // Expected asset path (packaged or dev).
  const candidate = path.join(__dirnameLocal, '../assets/trayTemplate.png');
  const img = nativeImage.createFromPath(candidate);
  if (!img.isEmpty()) {
    if (process.platform === 'darwin') img.setTemplateImage(true);
    return img;
  }
  // Fallback: create a tiny solid placeholder so the tray has *something*.
  const placeholder = nativeImage.createEmpty();
  return placeholder;
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
