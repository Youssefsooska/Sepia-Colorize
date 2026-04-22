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
  app,
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

// Deep link that opens System Settings → Privacy & Security → Screen &
// System Audio Recording on macOS 10.15 through 15. Using the private
// `x-apple.systempreferences:` URL scheme is the blessed way to land on a
// specific privacy pane; no public API takes the user there directly.
const MAC_SCREEN_RECORDING_PREFS =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';

const __dirnameLocal = __dirname;

let pickerWindow: BrowserWindow | null = null;

// The overlay document is inlined here so no HTML file needs to ship alongside
// the bundled JS. The overlay uses a LIVE MediaStream via getDisplayMedia
// (not a one-shot screenshot) so the picker shows real-time pixels — video
// playing, text being typed, animations all update under the loupe.
//
// The picker window itself is marked setContentProtection(true) in the main
// process so the stream captures the screen WITHOUT the overlay's own loupe
// or hex badge; otherwise we'd sample the loupe pixels instead of the
// screen pixels underneath.
const OVERLAY_HTML = `
<!doctype html>
<html><head><meta charset="UTF-8"><style>
  html,body{margin:0;padding:0;height:100%;width:100%;overflow:hidden;background:transparent;color:#fff;font-family:-apple-system,"SF Pro Display","Segoe UI",system-ui,sans-serif;user-select:none}
  /* Use the native macOS crosshair cursor. A custom url() cursor produced
     a dual-cursor artifact (the system arrow kept showing alongside it)
     on always-on-top transparent windows. Native crosshair is crisp,
     matches OS feel, and avoids the dual-cursor bug entirely. */
  *{cursor:crosshair !important}
  /* Hidden working canvas — we never show it, only sample from it. */
  #work{position:fixed;inset:0;width:100vw;height:100vh;visibility:hidden;pointer-events:none}
  /* The picker panel: magnifier + color readouts in one floating chip. */
  #panel{position:fixed;display:flex;align-items:stretch;padding:10px;background:rgba(18,19,17,0.92);border:1px solid rgba(255,255,255,0.12);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,0.55);pointer-events:none;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
  #zoomWrap{position:relative;width:100px;height:100px;border-radius:50%;overflow:hidden;background:#000;flex-shrink:0;box-shadow:inset 0 0 0 1px rgba(255,255,255,0.15)}
  #zoomCanvas{width:100%;height:100%;image-rendering:pixelated;display:block}
  #zoomCross{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:8px;height:8px;border:1.5px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,0.7);border-radius:1px;pointer-events:none}
  #info{display:flex;flex-direction:column;justify-content:center;padding:0 16px 0 18px;min-width:148px}
  #hexLine{font-family:"JetBrains Mono","SF Mono",monospace;font-size:18px;font-weight:700;letter-spacing:0.02em;color:#F0E8DC;line-height:22px}
  #rgbLine,#hslLine{font-family:"JetBrains Mono","SF Mono",monospace;font-size:11px;color:#A09A8C;margin-top:3px;letter-spacing:0.02em}
  #swatch{width:10px;height:10px;border-radius:2px;margin-right:8px;vertical-align:middle;display:inline-block;box-shadow:inset 0 0 0 1px rgba(255,255,255,0.2)}
  /* A near-invisible body fill guarantees every click hits our window on
     macOS; a fully-transparent window can let clicks fall through. */
  body{background:rgba(0,0,0,0.01)}
  #hint{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);padding:7px 16px;background:rgba(18,19,17,0.88);border:1px solid rgba(255,255,255,0.12);border-radius:999px;color:rgba(240,232,220,0.8);font-size:11px;pointer-events:none;letter-spacing:0.08em;text-transform:uppercase;font-family:"JetBrains Mono",monospace}
</style></head><body>
  <canvas id="work"></canvas>
  <div id="panel">
    <div id="zoomWrap">
      <canvas id="zoomCanvas" width="17" height="17"></canvas>
      <div id="zoomCross"></div>
    </div>
    <div id="info">
      <div id="hexLine">#------</div>
      <div id="rgbLine">rgb 0 0 0</div>
      <div id="hslLine">hsl 0 0 0</div>
    </div>
  </div>
  <div id="hint">Click to pick · Esc to cancel</div>
  <script>
    const work = document.getElementById('work');
    const workCtx = work.getContext('2d', { willReadFrequently: true });
    const zoomCanvas = document.getElementById('zoomCanvas');
    const zoomCtx = zoomCanvas.getContext('2d');
    zoomCtx.imageSmoothingEnabled = false;
    const panel = document.getElementById('panel');
    const hexLine = document.getElementById('hexLine');
    const rgbLine = document.getElementById('rgbLine');
    const hslLine = document.getElementById('hslLine');
    const hint = document.getElementById('hint');
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

    let ready = false;
    // Video element holds the live screen stream. We don't mount it in the
    // DOM — it just drives drawImage every frame.
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;

    // Mouse position tracked in two coordinate systems:
    //   mx/my          — client coords (relative to the overlay window)
    //   smx/smy        — screen coords (absolute on the display)
    // The sample coordinate uses SCREEN coords to avoid off-by-menu-bar
    // bugs when Electron silently pushes the window down below the menu
    // bar on macOS; clientX would be short by ~24px in that case and
    // every pick would be offset. Screen coords align 1:1 with the
    // display pixels the video stream is capturing.
    let mx = -1, my = -1;
    let smx = -1, smy = -1;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 60 } },
          audio: false,
        });
        video.srcObject = stream;
        await new Promise((res) => { video.onloadedmetadata = res; });
        await video.play();
        // Size the working canvas to the raw video resolution so sampling
        // reads from native pixels rather than a downscaled copy.
        work.width = video.videoWidth;
        work.height = video.videoHeight;
        ready = true;
        tick();
      } catch (err) {
        console.warn('getDisplayMedia failed', err);
        const msg = err && err.message ? err.message : String(err);
        const name = err && err.name ? err.name : 'Error';
        hint.textContent = 'Screen capture failed: ' + name + ' — ' + msg + '. Esc to cancel.';
        try { window.sepiaPicker.logError(name + ': ' + msg); } catch {}
      }
    }

    function tick() {
      if (!ready) return;
      // Draw the current video frame into the hidden canvas so we always
      // sample fresh pixels, regardless of whether the mouse moved.
      try { workCtx.drawImage(video, 0, 0, work.width, work.height); } catch {}
      if (mx >= 0) render(mx, my, smx, smy);
      requestAnimationFrame(tick);
    }

    // Convert screen-relative CSS coords to video-pixel coords. Uses
    // window.screen.width/height which reflect the ENTIRE display, not
    // whatever area our overlay window ended up occupying — this gives
    // the right ratio even if the window is offset by the menu bar.
    function screenToVideo(screenX, screenY) {
      const sw = window.screen.width || window.innerWidth;
      const sh = window.screen.height || window.innerHeight;
      return {
        x: Math.round((screenX / sw) * work.width),
        y: Math.round((screenY / sh) * work.height),
      };
    }

    function sampleAt(screenX, screenY) {
      if (!ready) return { r: 0, g: 0, b: 0 };
      const { x, y } = screenToVideo(screenX, screenY);
      try {
        const d = workCtx.getImageData(x, y, 1, 1).data;
        return { r: d[0], g: d[1], b: d[2] };
      } catch { return { r: 0, g: 0, b: 0 }; }
    }

    function render(cssX, cssY, screenX, screenY) {
      // Floating panel follows the cursor with a 28px offset so it never
      // covers the pixel being sampled. The panel flips to the opposite
      // side if it would go off-screen.
      const panelW = panel.offsetWidth || 260;
      const panelH = panel.offsetHeight || 120;
      const gap = 28;
      let px = cssX + gap, py = cssY + gap;
      if (px + panelW > window.innerWidth) px = cssX - gap - panelW;
      if (py + panelH > window.innerHeight) py = cssY - gap - panelH;
      panel.style.left = px + 'px';
      panel.style.top = py + 'px';

      // Zoomed 17×17 view anchored on the SAMPLE point in video pixels.
      const { x: vx, y: vy } = screenToVideo(screenX, screenY);
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

      // Color readouts.
      const c = sampleAt(screenX, screenY);
      const hex = rgbToHex(c.r, c.g, c.b);
      const hsl = rgbToHsl(c.r, c.g, c.b);
      hexLine.innerHTML =
        '<span id="swatch" style="background:' + hex + '"></span>' + hex;
      rgbLine.textContent = 'rgb  ' + c.r + '  ' + c.g + '  ' + c.b;
      hslLine.textContent =
        'hsl  ' + hsl.h + '°  ' + hsl.s + '%  ' + hsl.l + '%';
    }

    function pickAt(e) {
      if (!ready) return; // Don't ship #000000 back before the stream starts.
      // Sample using SCREEN coords so the picked pixel matches the one
      // under the real cursor, regardless of any window offset.
      const { r, g, b } = sampleAt(e.screenX, e.screenY);
      try { window.sepiaPicker.sendResult({ hex: rgbToHex(r, g, b), rgb: { r, g, b } }); }
      catch (err) { console.error('picker IPC missing', err); }
    }

    window.addEventListener('mousemove', (e) => {
      mx = e.clientX; my = e.clientY;
      smx = e.screenX; smy = e.screenY;
    });
    window.addEventListener('click', pickAt);

    // Right-click or Esc always attempts a cancel; if IPC is unavailable we
    // can't close from here, but the main-process Escape watchdog will.
    const cancelSafe = () => { try { window.sepiaPicker && window.sepiaPicker.cancel(); } catch {} };
    window.addEventListener('contextmenu', (e) => { e.preventDefault(); cancelSafe(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') cancelSafe(); });

    start();
  </script>
</body></html>
`;

/**
 * Write the inline overlay HTML to a stable path inside Electron's
 * per-user temp directory and return that path. Done once per app run and
 * cached thereafter. We inline the HTML in TypeScript so the renderer
 * stays self-contained, but Chromium requires a real origin for
 * `getDisplayMedia`, so we need to actually land it on disk.
 */
let overlayFilePath: string | null = null;
function ensureOverlayFile(): string {
  if (overlayFilePath && fs.existsSync(overlayFilePath)) return overlayFilePath;
  const target = path.join(app.getPath('temp'), 'sepia-picker-overlay.html');
  fs.writeFileSync(target, OVERLAY_HTML, 'utf8');
  overlayFilePath = target;
  return target;
}

/**
 * Open the picker overlay on whatever display the cursor is currently on.
 *
 * On macOS, we require Screen Recording permission before even showing the
 * overlay — picking without it returns all-black pixels. If the permission
 * is missing we surface a modal dialog with a direct shortcut to the right
 * pane in System Settings; opening the fullscreen overlay in that state
 * would be confusing and would also swallow the user's next click.
 */
export async function startPicking(): Promise<void> {
  if (pickerWindow) return; // Already picking — ignore repeat triggers.

  if (process.platform === 'darwin') {
    const status = systemPreferences.getMediaAccessStatus('screen');
    // Anything other than 'granted' means the capture will return all-black
    // pixels, so don't waste a fullscreen overlay — prompt for permission
    // first. 'unknown' exists only on non-macOS and won't hit this branch.
    if (status !== 'granted') {
      await promptForScreenRecording(status);
      return;
    }
  }

  const point = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point);
  console.log('[picker] opening on display', display.id, 'bounds', display.bounds, 'scaleFactor', display.scaleFactor);

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
    // Let the window cover the menu bar on macOS. Without this, the OS
    // clamps Y to workArea.top and every mouse-Y reading is offset.
    enableLargerThanScreen: true,
    webPreferences: {
      preload: path.join(__dirnameLocal, 'pickerPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Force the exact display bounds after creation — Electron / macOS can
  // silently nudge the initial position to avoid the menu bar, and if
  // that happens every sample is shifted by the menu bar height.
  pickerWindow.setBounds(display.bounds);
  pickerWindow.setAlwaysOnTop(true, 'screen-saver');
  pickerWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  pickerWindow.once('ready-to-show', () => {
    const actual = pickerWindow && pickerWindow.getBounds();
    console.log('[picker] window bounds after ready:', actual, 'expected:', display.bounds);
  });
  // Hide the overlay from any screen capture — including our own live
  // stream. Without this, the loupe and hex badge drawn on the overlay
  // would appear in the video feed and we'd sample the loupe's pixels
  // instead of the screen pixels beneath.
  pickerWindow.setContentProtection(true);
  // Load the overlay from a real file on disk rather than a data: URL.
  // Chromium denies `navigator.mediaDevices.getDisplayMedia` on data-URL
  // origins (they're null-origin), and the picker silently fails with
  // "NotAllowedError" the moment it tries to start a stream. A file:/
  // origin is a valid secure context so the capture proceeds.
  pickerWindow.loadFile(ensureOverlayFile());

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

/**
 * Show a modal prompting the user to grant Screen Recording permission and,
 * if they agree, deep-link into the right System Settings pane. We can't
 * open the pane directly from code — macOS requires user action — so the
 * "Open Settings" button is the only thing that'll land the user there.
 */
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

// --- IPC from the picker overlay ------------------------------------------

/**
 * Validate the payload coming back from the picker overlay before trusting
 * it enough to run color math on or forward to the renderer. The overlay
 * is technically running in a separate, sandboxed window, but we treat its
 * IPC as untrusted anyway — a malformed \`rgb\` object would crash the
 * main process when we destructure numbers out of it.
 */
function isValidPickerResult(
  value: unknown,
): value is { hex: string; rgb: { r: number; g: number; b: number } } {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v.hex)) return false;
  const rgb = v.rgb as Record<string, unknown> | undefined;
  if (!rgb || typeof rgb !== 'object') return false;
  const isByte = (n: unknown): n is number =>
    typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 255;
  return isByte(rgb.r) && isByte(rgb.g) && isByte(rgb.b);
}

ipcMain.on('picker:result', (_e, payload: unknown) => {
  if (!isValidPickerResult(payload)) return;
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

// Diagnostic channel — overlay forwards any fatal error so we can inspect it
// from the main-process log (and the packaged app's Console.app entries).
ipcMain.on('picker:log-error', (_e, message: unknown) => {
  if (typeof message === 'string') {
    console.error('[sepia picker]', message);
  }
});
