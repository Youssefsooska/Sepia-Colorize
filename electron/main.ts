/**
 * Electron main-process entry point for Sepia.
 *
 * Responsibilities:
 *   - Create the 800×600 main window with a secure webPreferences config
 *   - Initialize the system tray and global hotkeys on app-ready
 *   - Wire IPC handlers for picker, hotkey updates, exports, and platform
 *   - Standard quit-on-window-closed behavior (except on macOS)
 *
 * Security: contextIsolation is on, nodeIntegration off. The renderer only
 * sees the narrow `window.sepia` API defined in preload.ts — never raw ipc.
 */
import { app, BrowserWindow, desktopCapturer, ipcMain, screen, session, shell } from 'electron';
import path from 'node:path';
import { registerHotkeys, updateHotkey, unregisterAll } from './hotkeys';
import { initTray, destroyTray } from './tray';
import { saveExport } from './exporter';
import { startPicking, cancelPicking } from './picker';
import type { HotkeyUpdatePayload, ExportSavePayload } from '../src/types';

// vite-plugin-electron emits CommonJS, so Node's __dirname is already defined.
const __dirnameLocal = __dirname;

let mainWindow: BrowserWindow | null = null;

/** Exposed to other main-process modules that need to talk to the renderer. */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function sendToRenderer(channel: string, payload?: unknown): void {
  mainWindow?.webContents.send(channel, payload);
}

/** Toggle the main window's visibility; called from tray + toggle hotkey. */
export function toggleMainWindow(): void {
  if (!mainWindow) return;
  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 880,
    height: 640,
    minWidth: 720,
    minHeight: 520,
    backgroundColor: '#0F100F',
    show: false,
    webPreferences: {
      preload: path.join(__dirnameLocal, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required for preload to use Node's path module
    },
  });

  // Open external links in the OS browser, never in-app. Whitelist only
  // http(s) so an injected or malformed link can't coerce us into opening
  // `file://`, `javascript:`, or a custom scheme that might launch another
  // app. Anything we reject falls silently; the request was already denied
  // by returning `action: 'deny'`.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(url);
      }
    } catch {
      // Malformed URL — drop it.
    }
    return { action: 'deny' };
  });

  const devUrl = process.env['VITE_DEV_SERVER_URL'];
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirnameLocal, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

function registerIpc(): void {
  ipcMain.on('pick-color:start', () => startPicking());
  ipcMain.on('picker:cancel', () => cancelPicking());

  ipcMain.handle(
    'hotkey:update',
    (_e, payload: HotkeyUpdatePayload) => updateHotkey(payload),
  );

  ipcMain.handle(
    'export:save',
    (_e, payload: ExportSavePayload) => saveExport(payload, mainWindow),
  );

  ipcMain.handle('app:get-platform', () => process.platform);
}

app.whenReady().then(() => {
  // Auto-respond to getDisplayMedia requests with the display under the
  // cursor. Without this, Electron pops its own "choose what to share"
  // picker every time the color picker opens, which kills the fluidity.
  // The picker window sets setContentProtection(true) so its own overlay
  // doesn't appear in the captured stream.
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      if (!sources.length) return callback({});
      const cursor = screen.getCursorScreenPoint();
      const display = screen.getDisplayNearestPoint(cursor);
      const match =
        sources.find((s) => String(s.display_id) === String(display.id)) ||
        sources[0];
      callback({ video: match });
    });
  });

  createMainWindow();
  initTray();
  registerHotkeys();
  registerIpc();

  app.on('activate', () => {
    // macOS: re-create window when dock icon clicked with no open windows.
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  unregisterAll();
  destroyTray();
});
