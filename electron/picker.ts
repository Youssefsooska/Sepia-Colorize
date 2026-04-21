/**
 * Screen color picker — opens a transparent fullscreen overlay window on the
 * active display, waits for a click, and sends the picked color back.
 *
 * The overlay markup is defined inline here (as a data: URL) rather than as
 * a separate HTML file, because vite-plugin-electron only bundles TypeScript
 * into dist-electron/. Inlining sidesteps a build-time copy step and keeps
 * the picker self-contained.
 *
 * Conversion from the picked RGB to HSL/CMYK happens here so the renderer
 * gets a fully-formed `PickedColorPayload` and doesn't need to do the math.
 */
import {
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  screen,
  systemPreferences,
} from 'electron';
import path from 'node:path';
import { rgbToHsl, rgbToCmyk } from '../src/utils/colorConversion';
import { sendToRenderer } from './main';
import type { PickedColorPayload } from '../src/types';

const __dirnameLocal = __dirname;

let pickerWindow: BrowserWindow | null = null;

// The overlay document is inlined here so no HTML file needs to ship alongside
// the bundled JS. Single quotes are used inside so we can keep the outer
// template literal readable.
const OVERLAY_HTML = `
<!doctype html>
<html><head><meta charset="UTF-8"><style>
  html,body{margin:0;padding:0;height:100%;width:100%;overflow:hidden;background:transparent;cursor:none;color:#fff;font-family:-apple-system,"SF Pro Display","Segoe UI",system-ui,sans-serif;user-select:none}
  #bg{position:fixed;inset:0;width:100vw;height:100vh;image-rendering:pixelated}
  #loupe{position:fixed;width:120px;height:120px;border-radius:50%;border:2px solid rgba(255,255,255,.9);box-shadow:0 4px 24px rgba(0,0,0,.5);pointer-events:none;overflow:hidden;transform:translate(-50%,-50%);background:#000}
  #loupe canvas{width:100%;height:100%;image-rendering:pixelated}
  #crosshair{position:absolute;top:50%;left:50%;width:8px;height:8px;transform:translate(-50%,-50%);border:1.5px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.6);pointer-events:none}
  #hexBadge{position:fixed;pointer-events:none;background:rgba(20,20,20,.9);color:#fff;font-family:"SF Mono","Consolas",monospace;font-size:13px;padding:6px 12px;border-radius:999px;border:1px solid rgba(255,255,255,.15);transform:translate(-50%,0)}
  /* A near-invisible body fill guarantees every click hits our window on
     macOS; a fully-transparent window can let clicks fall through. */
  body{background:rgba(0,0,0,0.01)}
  #hint{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);padding:6px 14px;background:rgba(20,20,20,.85);border:1px solid rgba(255,255,255,.15);border-radius:999px;color:#fff;font-size:12px;pointer-events:none}
</style></head><body>
  <canvas id="bg"></canvas>
  <div id="loupe"><canvas id="loupeCanvas" width="15" height="15"></canvas><div id="crosshair"></div></div>
  <div id="hexBadge">#------</div>
  <div id="hint">Click to pick • Esc to cancel</div>
  <script>
    const bg = document.getElementById('bg');
    const bgCtx = bg.getContext('2d', { willReadFrequently: true });
    const loupeCanvas = document.getElementById('loupeCanvas');
    const loupeCtx = loupeCanvas.getContext('2d');
    loupeCtx.imageSmoothingEnabled = false;
    const loupe = document.getElementById('loupe');
    const badge = document.getElementById('hexBadge');
    const hint = document.getElementById('hint');
    const toHex = (n) => n.toString(16).padStart(2, '0').toUpperCase();
    const rgbToHex = (r, g, b) => '#' + toHex(r) + toHex(g) + toHex(b);
    let ready = false;
    // Ratio of device pixels on the backing canvas to CSS pixels on screen.
    // Sampling is done in device pixels, mouse events arrive in CSS pixels.
    let dpr = 1;
    async function loadScreenshot() {
      try {
        const res = await window.sepiaPicker.capture();
        if (!res || res.error) {
          hint.textContent = res && res.error === 'permission-denied'
            ? 'Screen Recording permission denied. Enable it in System Settings → Privacy.'
            : 'Screen capture failed. Esc to cancel.';
          return;
        }
        dpr = res.scaleFactor || 1;
        bg.width = Math.round(res.displayWidth * dpr);
        bg.height = Math.round(res.displayHeight * dpr);
        // Keep the canvas visually full-screen regardless of backing size.
        bg.style.width = '100vw'; bg.style.height = '100vh';
        const img = new Image();
        img.onload = () => {
          bgCtx.drawImage(img, 0, 0, bg.width, bg.height);
          ready = true;
        };
        img.onerror = () => { hint.textContent = 'Screenshot image failed to decode.'; };
        img.src = res.dataUrl;
      } catch (err) {
        console.warn('picker capture failed', err);
        hint.textContent = 'Screen capture failed. Esc to cancel.';
      }
    }
    function sampleAt(cssX, cssY) {
      if (!ready) return { r: 0, g: 0, b: 0 };
      const px = Math.round(cssX * dpr);
      const py = Math.round(cssY * dpr);
      try { const d = bgCtx.getImageData(px, py, 1, 1).data; return { r: d[0], g: d[1], b: d[2] }; }
      catch { return { r: 0, g: 0, b: 0 }; }
    }
    function updateLoupe(e) {
      const x = e.clientX, y = e.clientY;
      loupe.style.left = x + 'px'; loupe.style.top = y + 'px';
      if (ready) {
        const px = x * dpr, py = y * dpr;
        loupeCtx.clearRect(0, 0, 15, 15);
        loupeCtx.drawImage(bg, Math.max(0, px - 7), Math.max(0, py - 7), 15, 15, 0, 0, 15, 15);
      }
      const { r, g, b } = sampleAt(x, y);
      badge.textContent = rgbToHex(r, g, b);
      badge.style.left = x + 'px'; badge.style.top = (y + 80) + 'px';
    }
    function pickAt(e) {
      if (!ready) return; // Don't ship #000000 back when the capture never loaded.
      const { r, g, b } = sampleAt(e.clientX, e.clientY);
      try { window.sepiaPicker.sendResult({ hex: rgbToHex(r, g, b), rgb: { r, g, b } }); }
      catch (err) { console.error('picker IPC missing', err); }
    }
    window.addEventListener('mousemove', updateLoupe);
    window.addEventListener('click', pickAt);
    // Right-click or Esc always attempts a cancel; if IPC is unavailable we
    // can't close from here, but the main-process Escape watchdog will.
    const cancelSafe = () => { try { window.sepiaPicker && window.sepiaPicker.cancel(); } catch {} };
    window.addEventListener('contextmenu', (e) => { e.preventDefault(); cancelSafe(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') cancelSafe(); });
    loadScreenshot();
  </script>
</body></html>
`;

/** Open the picker overlay on whatever display the cursor is currently on. */
export function startPicking(): void {
  if (pickerWindow) return; // Already picking — ignore repeat triggers.

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
    webPreferences: {
      preload: path.join(__dirnameLocal, 'pickerPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  pickerWindow.setAlwaysOnTop(true, 'screen-saver');
  pickerWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  pickerWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(OVERLAY_HTML));

  // Safety net: register Escape in main so the user can always cancel, even
  // if the picker renderer's own key listener fails to run.
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

// --- IPC from the picker overlay ------------------------------------------

/**
 * Capture a thumbnail of the display the picker is currently on and hand it
 * back to the overlay as a data URL. This runs in the main process because
 * `desktopCapturer` is main-process-only in Electron 17+; calling it from a
 * preload script returns undefined and the overlay ends up sampling a blank
 * canvas (every pick reads as #000000).
 *
 * On macOS we first confirm Screen Recording permission — without it, the
 * thumbnail comes back blank, so we surface an explicit error instead of
 * silently handing back a black image.
 */
ipcMain.handle('picker:capture', async () => {
  if (process.platform === 'darwin') {
    const status = systemPreferences.getMediaAccessStatus('screen');
    if (status !== 'granted') {
      return { error: 'permission-denied', status };
    }
  }
  // Capture the display the picker window is on; fall back to the cursor's
  // display if the picker isn't open yet for some reason.
  const cursor = screen.getCursorScreenPoint();
  const display =
    (pickerWindow && screen.getDisplayMatching(pickerWindow.getBounds())) ||
    screen.getDisplayNearestPoint(cursor);
  const scale = display.scaleFactor || 1;
  const thumbnailSize = {
    width: Math.round(display.bounds.width * scale),
    height: Math.round(display.bounds.height * scale),
  };
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize,
    });
    // Match to the right display — sources.display_id is a string on macOS,
    // numeric elsewhere, so compare loosely.
    const match =
      sources.find((s) => String(s.display_id) === String(display.id)) ||
      sources[0];
    if (!match) return { error: 'no-sources' };
    return {
      dataUrl: match.thumbnail.toDataURL(),
      displayWidth: display.bounds.width,
      displayHeight: display.bounds.height,
      scaleFactor: scale,
    };
  } catch (err) {
    return { error: 'capture-failed', message: (err as Error).message };
  }
});

ipcMain.on('picker:result', (_e, payload: { hex: string; rgb: { r: number; g: number; b: number } }) => {
  if (!payload || typeof payload.hex !== 'string') return;
  const { r, g, b } = payload.rgb;
  const hsl = rgbToHsl(r, g, b);
  const cmyk = rgbToCmyk(r, g, b);
  const color: PickedColorPayload = {
    hex: payload.hex,
    rgb: payload.rgb,
    hsl,
    cmyk,
    timestamp: Date.now(),
  };
  sendToRenderer('color:picked', color);
  if (pickerWindow) {
    pickerWindow.close();
    pickerWindow = null;
  }
});

ipcMain.on('picker:cancel', () => cancelPicking());
