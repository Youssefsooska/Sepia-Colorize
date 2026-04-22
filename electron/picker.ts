/**
 * Screen color picker — opens a transparent fullscreen overlay on the active
 * display, waits for a click, and returns the pixel color at the cursor.
 *
 * The sampling path runs in the MAIN process via `desktopCapturer.getSources`,
 * not in the overlay via `getDisplayMedia`. On macOS, getDisplayMedia uses
 * ScreenCaptureKit which includes the mouse cursor sprite in every frame —
 * sampling at the cursor position would return the arrow-pixel color, not
 * the pixel underneath. desktopCapturer uses CGDisplayCreateImage, which
 * does NOT include the cursor, so the sample is what the user sees through
 * the transparent overlay.
 */
import {
  BrowserWindow,
  app,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  screen,
  shell,
  systemPreferences,
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { rgbToHsl, rgbToCmyk } from '../src/utils/colorConversion';
import { getMainWindow, sendToRenderer } from './main';
import type { PickedColorPayload } from '../src/types';

// Deep link into System Settings → Privacy & Security → Screen & System
// Audio Recording. Private URL scheme; the only way to land the user on
// the exact pane without a public API.
const MAC_SCREEN_RECORDING_PREFS =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';

const __dirnameLocal = __dirname;

let pickerWindow: BrowserWindow | null = null;

// Minimal overlay: a transparent fullscreen window that shows a small hint
// and a custom crosshair that follows the mouse. The OS cursor is hidden
// via `cursor: none` to eliminate the dual-cursor artifact that always-on-
// top transparent windows exhibit on macOS. Sampling is delegated to main.
const OVERLAY_HTML = `
<!doctype html>
<html><head><meta charset="UTF-8"><style>
  html,body{margin:0;padding:0;height:100%;width:100%;overflow:hidden;background:transparent;color:#fff;font-family:-apple-system,"SF Pro Display","Segoe UI",system-ui,sans-serif;user-select:none}
  /* Hide the OS cursor entirely. macOS keeps drawing the system arrow on
     top of any CSS cursor we set on a transparent always-on-top window,
     which is the "two cursors" bug. cursor:none is the only reliable way
     to get exactly one indicator on screen (our DIV crosshair below). */
  *{cursor:none !important}
  /* Near-invisible body fill so every click registers on this window
     instead of falling through to whatever is underneath. */
  body{background:rgba(0,0,0,0.01)}
  /* Custom crosshair — pure CSS, no bitmap. A 1px hole at the exact
     center keeps the sample point visually unobstructed. */
  #xh{position:fixed;pointer-events:none;width:26px;height:26px;margin-left:-13px;margin-top:-13px;left:-40px;top:-40px;mix-blend-mode:difference;z-index:10}
  #xh::before,#xh::after{content:"";position:absolute;background:#fff}
  #xh::before{left:12px;top:0;width:2px;height:11px;box-shadow:0 15px 0 #fff}
  #xh::after{top:12px;left:0;height:2px;width:11px;box-shadow:15px 0 0 #fff}
  #hint{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);padding:7px 16px;background:rgba(18,19,17,0.88);border:1px solid rgba(255,255,255,0.12);border-radius:999px;color:rgba(240,232,220,0.8);font-size:11px;pointer-events:none;letter-spacing:0.08em;text-transform:uppercase;font-family:"JetBrains Mono",monospace}
</style></head><body>
  <div id="xh"></div>
  <div id="hint">Click to pick · Esc to cancel</div>
  <script>
    const xh = document.getElementById('xh');
    // Follow the mouse. We read clientX/Y for the DIV position (it's
    // relative to the overlay) but send screenX/Y to main for sampling
    // (absolute display coords — what desktopCapturer understands).
    window.addEventListener('mousemove', (e) => {
      xh.style.left = e.clientX + 'px';
      xh.style.top = e.clientY + 'px';
    });
    window.addEventListener('click', (e) => {
      try { window.sepiaPicker.sampleAndSend(e.screenX, e.screenY); }
      catch (err) { console.error('picker IPC missing', err); }
    });
    // Right-click or Esc cancels. Main also watches Escape as a safety net.
    const cancelSafe = () => { try { window.sepiaPicker && window.sepiaPicker.cancel(); } catch {} };
    window.addEventListener('contextmenu', (e) => { e.preventDefault(); cancelSafe(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') cancelSafe(); });
  </script>
</body></html>
`;

// Write the overlay HTML once per app run so Chromium can load it via a
// file:// origin. Loading inline HTML via data: URLs hits origin-null
// restrictions on some Electron APIs, so a real file is safer.
let overlayFilePath: string | null = null;
function ensureOverlayFile(): string {
  if (overlayFilePath && fs.existsSync(overlayFilePath)) return overlayFilePath;
  const target = path.join(app.getPath('temp'), 'sepia-picker-overlay.html');
  fs.writeFileSync(target, OVERLAY_HTML, 'utf8');
  overlayFilePath = target;
  return target;
}

// Open the picker overlay on the display currently under the cursor.
// Requires Screen Recording permission on macOS; prompts the user with a
// System Settings deep link if it's missing.
export async function startPicking(): Promise<void> {
  if (pickerWindow) return; // already picking

  if (process.platform === 'darwin') {
    const status = systemPreferences.getMediaAccessStatus('screen');
    if (status !== 'granted') {
      await promptForScreenRecording(status);
      return;
    }
  }

  const point = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point);

  pickerWindow = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    enableLargerThanScreen: true,
    webPreferences: {
      preload: path.join(__dirnameLocal, 'pickerPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  pickerWindow.setBounds(display.bounds);
  pickerWindow.setAlwaysOnTop(true, 'screen-saver');
  pickerWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  pickerWindow.loadFile(ensureOverlayFile());

  // Safety net — Escape cancels even if the overlay's key listener fails.
  globalShortcut.register('Escape', () => cancelPicking());

  pickerWindow.on('closed', () => {
    pickerWindow = null;
    globalShortcut.unregister('Escape');
  });
}

export function cancelPicking(): void {
  if (pickerWindow) {
    pickerWindow.close();
    pickerWindow = null;
    sendToRenderer('picker:cancelled');
  }
}

// Show the Screen-Recording permission prompt with a direct deep link into
// the System Settings pane. Running without permission returns all-black
// pixels, so we refuse to open the picker in that state.
async function promptForScreenRecording(
  status: 'not-determined' | 'denied' | 'restricted' | 'granted' | 'unknown',
): Promise<void> {
  const parent = getMainWindow();
  const detail =
    status === 'not-determined'
      ? 'Open System Settings → Privacy & Security → Screen & System Audio Recording, enable Sepia, then relaunch the app.'
      : 'Sepia is listed in System Settings → Privacy & Security → Screen & System Audio Recording but permission is denied. Toggle it on and relaunch the app.';
  const options: Electron.MessageBoxOptions = {
    type: 'warning',
    title: 'Screen Recording permission needed',
    message: 'Sepia needs permission to record the screen so it can sample pixel colors.',
    detail,
    buttons: ['Open System Settings', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  };
  const { response } = parent
    ? await dialog.showMessageBox(parent, options)
    : await dialog.showMessageBox(options);
  if (response === 0) {
    await shell.openExternal(MAC_SCREEN_RECORDING_PREFS);
  }
}

// --- Sampling in main process ---------------------------------------------

// Read the RGB pixel at (screenX, screenY) by fetching a fresh screen
// thumbnail via desktopCapturer and extracting one pixel from it. This path
// is on the CLICK hot loop — each pick triggers one getSources call — but
// it's fast enough for a single-pick interaction and guarantees cursor-free
// pixels (CGDisplayCreateImage does not include the cursor sprite).
async function sampleScreenAt(
  screenX: number,
  screenY: number,
): Promise<{ r: number; g: number; b: number } | null> {
  const display = screen.getDisplayNearestPoint({ x: screenX, y: screenY });
  // Ask for the thumbnail at the display's native device-pixel resolution.
  // Anything smaller would force Electron to down-sample and blur the
  // precise pixel we're trying to read.
  const nativeW = Math.round(display.size.width * display.scaleFactor);
  const nativeH = Math.round(display.size.height * display.scaleFactor);
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: nativeW, height: nativeH },
  });
  if (!sources.length) return null;
  // Match the source to the display under the cursor. Fall back to first.
  const match =
    sources.find((s) => String(s.display_id) === String(display.id)) ||
    sources[0];
  const img = match.thumbnail;
  // Convert click coords (CSS pixels on that display) to image pixels.
  const localX = screenX - display.bounds.x;
  const localY = screenY - display.bounds.y;
  const size = img.getSize();
  const px = Math.max(0, Math.min(size.width - 1, Math.round(localX * (size.width / display.bounds.width))));
  const py = Math.max(0, Math.min(size.height - 1, Math.round(localY * (size.height / display.bounds.height))));
  // toBitmap returns a BGRA buffer on macOS/Windows. RGBA on some builds.
  // crop(1×1) keeps the allocation tiny.
  const pixelImg = img.crop({ x: px, y: py, width: 1, height: 1 });
  const buf = pixelImg.toBitmap();
  if (buf.length < 3) return null;
  // Electron's nativeImage.toBitmap is BGRA on every desktop platform we
  // ship for — pull the bytes in that order.
  return { b: buf[0]!, g: buf[1]!, r: buf[2]! };
}

// Called from the overlay's preload when the user clicks. We sample in
// main, run the color conversions, forward the result to the renderer,
// and close the picker window.
ipcMain.handle('picker:sample-at', async (_e, raw: unknown) => {
  if (!raw || typeof raw !== 'object') return false;
  const { x, y } = raw as { x?: unknown; y?: unknown };
  if (typeof x !== 'number' || typeof y !== 'number') return false;
  const sample = await sampleScreenAt(Math.round(x), Math.round(y));
  if (!sample) return false;
  const hex =
    '#' +
    [sample.r, sample.g, sample.b]
      .map((n) => n.toString(16).padStart(2, '0').toUpperCase())
      .join('');
  const hsl = rgbToHsl(sample.r, sample.g, sample.b);
  const cmyk = rgbToCmyk(sample.r, sample.g, sample.b);
  const color: PickedColorPayload = {
    hex,
    rgb: sample,
    hsl,
    cmyk,
    timestamp: Date.now(),
  };
  sendToRenderer('color:picked', color);
  if (pickerWindow) {
    pickerWindow.close();
    pickerWindow = null;
  }
  return true;
});

ipcMain.on('picker:cancel', () => cancelPicking());

// Diagnostic channel — any fatal error in the overlay lands here so it
// shows up in main-process logs and packaged-app Console.app entries.
ipcMain.on('picker:log-error', (_e, message: unknown) => {
  if (typeof message === 'string') {
    console.error('[sepia picker]', message);
  }
});
