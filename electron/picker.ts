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

// Overlay: transparent fullscreen window with a custom crosshair, a hex /
// rgb / hsl readout, and a 17×17 pixelated loupe. The OS cursor is hidden
// via `cursor: none` to avoid the dual-cursor artifact on transparent
// always-on-top windows. The magnifier draws from a one-shot snapshot
// that main ships over IPC at open; the actual color-for-pick still
// re-samples via desktopCapturer at click time so the picked value is
// live, not frozen.
const OVERLAY_HTML = `
<!doctype html>
<html><head><meta charset="UTF-8"><style>
  html,body{margin:0;padding:0;height:100%;width:100%;overflow:hidden;background:transparent;color:#fff;font-family:-apple-system,"SF Pro Display","Segoe UI",system-ui,sans-serif;user-select:none}
  *{cursor:none !important}
  body{background:rgba(0,0,0,0.01)}
  #work{position:fixed;inset:0;width:100vw;height:100vh;visibility:hidden;pointer-events:none}
  #panel{position:fixed;display:flex;align-items:stretch;padding:10px;background:rgba(18,19,17,0.92);border:1px solid rgba(255,255,255,0.12);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,0.55);pointer-events:none;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);opacity:0;transition:opacity 120ms}
  #panel.ready{opacity:1}
  #zoomWrap{position:relative;width:100px;height:100px;border-radius:50%;overflow:hidden;background:#000;flex-shrink:0;box-shadow:inset 0 0 0 1px rgba(255,255,255,0.15)}
  #zoomCanvas{width:100%;height:100%;image-rendering:pixelated;display:block}
  #zoomCross{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:8px;height:8px;border:1.5px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,0.7);border-radius:1px;pointer-events:none}
  #info{display:flex;flex-direction:column;justify-content:center;padding:0 16px 0 18px;min-width:148px}
  #hexLine{display:flex;align-items:center;font-family:"JetBrains Mono","SF Mono",monospace;font-size:18px;font-weight:700;letter-spacing:0.02em;color:#F0E8DC;line-height:22px}
  #rgbLine,#hslLine{font-family:"JetBrains Mono","SF Mono",monospace;font-size:11px;color:#A09A8C;margin-top:3px;letter-spacing:0.02em}
  #swatch{width:10px;height:10px;border-radius:2px;margin-right:8px;display:inline-block;box-shadow:inset 0 0 0 1px rgba(255,255,255,0.2);flex-shrink:0}
  #xh{position:fixed;pointer-events:none;width:26px;height:26px;margin-left:-13px;margin-top:-13px;left:-40px;top:-40px;mix-blend-mode:difference;z-index:10}
  #xh::before,#xh::after{content:"";position:absolute;background:#fff}
  #xh::before{left:12px;top:0;width:2px;height:11px;box-shadow:0 15px 0 #fff}
  #xh::after{top:12px;left:0;height:2px;width:11px;box-shadow:15px 0 0 #fff}
  #hint{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);padding:7px 16px;background:rgba(18,19,17,0.88);border:1px solid rgba(255,255,255,0.12);border-radius:999px;color:rgba(240,232,220,0.8);font-size:11px;pointer-events:none;letter-spacing:0.08em;text-transform:uppercase;font-family:"JetBrains Mono",monospace}
</style></head><body>
  <canvas id="work"></canvas>
  <div id="panel">
    <div id="zoomWrap">
      <canvas id="zoomCanvas" width="17" height="17"></canvas>
      <div id="zoomCross"></div>
    </div>
    <div id="info">
      <div id="hexLine"><span id="swatch"></span><span id="hexText">#------</span></div>
      <div id="rgbLine">rgb 0 0 0</div>
      <div id="hslLine">hsl 0 0 0</div>
    </div>
  </div>
  <div id="xh"></div>
  <div id="hint">Click to pick · Esc to cancel</div>
  <script>
    const work = document.getElementById('work');
    const workCtx = work.getContext('2d', { willReadFrequently: true });
    const zoomCanvas = document.getElementById('zoomCanvas');
    const zoomCtx = zoomCanvas.getContext('2d');
    zoomCtx.imageSmoothingEnabled = false;
    const panel = document.getElementById('panel');
    const swatch = document.getElementById('swatch');
    const hexText = document.getElementById('hexText');
    const rgbLine = document.getElementById('rgbLine');
    const hslLine = document.getElementById('hslLine');
    const xh = document.getElementById('xh');
    const toHex = (n) => n.toString(16).padStart(2, '0').toUpperCase();
    const rgbToHex = (r, g, b) => '#' + toHex(r) + toHex(g) + toHex(b);
    function rgbToHsl(r, g, b) {
      r /= 255; g /= 255; b /= 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const d = max - min;
      let h = 0, s = 0, l = (max + min) / 2;
      if (d !== 0) {
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
        else if (max === g) h = ((b - r) / d + 2);
        else h = ((r - g) / d + 4);
        h *= 60;
      }
      return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
    }

    // Snapshot from main arrives as a PNG data URL. We paint it into
    // #work at its native resolution so the magnifier can sample crisp
    // pixels. This snapshot is PREVIEW-ONLY; the click path takes its
    // own fresh sample through main.
    let ready = false;
    let snapWidth = 0, snapHeight = 0;
    window.sepiaPicker.onSnapshot((dataUrl) => {
      const img = new Image();
      img.onload = () => {
        snapWidth = img.naturalWidth;
        snapHeight = img.naturalHeight;
        work.width = snapWidth;
        work.height = snapHeight;
        workCtx.drawImage(img, 0, 0);
        ready = true;
      };
      img.src = dataUrl;
    });

    // CSS screen coords → snapshot-image pixel coords.
    function screenToSnap(screenX, screenY) {
      const sw = window.screen.width || window.innerWidth;
      const sh = window.screen.height || window.innerHeight;
      return {
        x: Math.round((screenX / sw) * snapWidth),
        y: Math.round((screenY / sh) * snapHeight),
      };
    }

    function sampleAt(screenX, screenY) {
      if (!ready) return { r: 0, g: 0, b: 0 };
      const { x, y } = screenToSnap(screenX, screenY);
      try {
        const d = workCtx.getImageData(x, y, 1, 1).data;
        return { r: d[0], g: d[1], b: d[2] };
      } catch { return { r: 0, g: 0, b: 0 }; }
    }

    function render(cssX, cssY, screenX, screenY) {
      xh.style.left = cssX + 'px';
      xh.style.top = cssY + 'px';
      if (!ready) return;

      const panelW = panel.offsetWidth || 260;
      const panelH = panel.offsetHeight || 120;
      const gap = 28;
      let px = cssX + gap, py = cssY + gap;
      if (px + panelW > window.innerWidth) px = cssX - gap - panelW;
      if (py + panelH > window.innerHeight) py = cssY - gap - panelH;
      panel.style.left = px + 'px';
      panel.style.top = py + 'px';
      panel.classList.add('ready');

      // 17×17 zoom anchored on the sample point, drawn pixelated.
      const { x: vx, y: vy } = screenToSnap(screenX, screenY);
      const half = 8;
      zoomCtx.clearRect(0, 0, 17, 17);
      try {
        zoomCtx.drawImage(
          work,
          Math.max(0, vx - half),
          Math.max(0, vy - half),
          17, 17, 0, 0, 17, 17,
        );
      } catch {}

      // Readouts updated via textContent + style.setProperty, no innerHTML.
      const c = sampleAt(screenX, screenY);
      const hex = rgbToHex(c.r, c.g, c.b);
      const hsl = rgbToHsl(c.r, c.g, c.b);
      swatch.style.background = hex;
      hexText.textContent = hex;
      rgbLine.textContent = 'rgb  ' + c.r + '  ' + c.g + '  ' + c.b;
      hslLine.textContent = 'hsl  ' + hsl.h + '°  ' + hsl.s + '%  ' + hsl.l + '%';
    }

    window.addEventListener('mousemove', (e) => {
      render(e.clientX, e.clientY, e.screenX, e.screenY);
    });
    window.addEventListener('click', (e) => {
      // Click path: ask main to take a FRESH cursor-free capture and
      // sample from it. The snapshot above is preview-only and may be
      // seconds stale if the user lingers before clicking.
      try { window.sepiaPicker.sampleAndSend(e.screenX, e.screenY); }
      catch (err) { console.error('picker IPC missing', err); }
    });
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

  // Ship a one-shot snapshot of the display to the overlay for the
  // magnifier preview. Captured BEFORE the overlay paints so its own
  // chrome (crosshair, panel, hint) doesn't end up in the image. Fires
  // on did-finish-load so the renderer is ready to receive it; without
  // the wait, the IPC can land before the overlay's listener is set.
  pickerWindow.webContents.once('did-finish-load', async () => {
    try {
      const nativeW = Math.round(display.size.width * display.scaleFactor);
      const nativeH = Math.round(display.size.height * display.scaleFactor);
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: nativeW, height: nativeH },
      });
      if (!sources.length) return;
      const match =
        sources.find((s) => String(s.display_id) === String(display.id)) ||
        sources[0];
      const dataUrl = match.thumbnail.toDataURL();
      if (pickerWindow && !pickerWindow.isDestroyed()) {
        pickerWindow.webContents.send('picker:snapshot', dataUrl);
      }
    } catch (err) {
      console.error('[picker] snapshot failed', err);
    }
  });

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
