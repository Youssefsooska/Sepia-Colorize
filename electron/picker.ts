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
  dialog,
  globalShortcut,
  ipcMain,
  screen,
  shell,
  systemPreferences,
} from 'electron';
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
  html,body{margin:0;padding:0;height:100%;width:100%;overflow:hidden;background:transparent;cursor:none;color:#fff;font-family:-apple-system,"SF Pro Display","Segoe UI",system-ui,sans-serif;user-select:none}
  /* Hidden working canvas — we never show it, only sample from it. */
  #work{position:fixed;inset:0;width:100vw;height:100vh;visibility:hidden;pointer-events:none}
  /* The loupe sits offset from the cursor so the pixel under the cursor is
     visible through the transparent overlay. 18px below + right keeps it
     out of the way on both small and large screens. */
  #loupe{position:fixed;width:140px;height:140px;border-radius:50%;border:2px solid rgba(255,255,255,.9);box-shadow:0 8px 32px rgba(0,0,0,.55);pointer-events:none;overflow:hidden;background:#000}
  #loupe canvas{width:100%;height:100%;image-rendering:pixelated}
  #crosshair{position:absolute;top:50%;left:50%;width:9px;height:9px;transform:translate(-50%,-50%);border:1.5px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.75);pointer-events:none;border-radius:1px}
  #hexBadge{position:fixed;pointer-events:none;background:rgba(20,20,20,.92);color:#fff;font-family:"JetBrains Mono","SF Mono","Consolas",monospace;font-size:13px;padding:7px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.18);letter-spacing:0.02em;font-weight:600}
  /* A near-invisible body fill guarantees every click hits our window on
     macOS; a fully-transparent window can let clicks fall through. */
  body{background:rgba(0,0,0,0.01)}
  #hint{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);padding:7px 16px;background:rgba(20,20,20,.88);border:1px solid rgba(255,255,255,.18);border-radius:999px;color:#fff;font-size:12px;pointer-events:none;letter-spacing:0.04em}
</style></head><body>
  <canvas id="work"></canvas>
  <div id="loupe"><canvas id="loupeCanvas" width="17" height="17"></canvas><div id="crosshair"></div></div>
  <div id="hexBadge">#------</div>
  <div id="hint">Click to pick · Esc to cancel</div>
  <script>
    const work = document.getElementById('work');
    const workCtx = work.getContext('2d', { willReadFrequently: true });
    const loupeCanvas = document.getElementById('loupeCanvas');
    const loupeCtx = loupeCanvas.getContext('2d');
    loupeCtx.imageSmoothingEnabled = false;
    const loupe = document.getElementById('loupe');
    const badge = document.getElementById('hexBadge');
    const hint = document.getElementById('hint');
    const toHex = (n) => n.toString(16).padStart(2, '0').toUpperCase();
    const rgbToHex = (r, g, b) => '#' + toHex(r) + toHex(g) + toHex(b);

    let ready = false;
    // Video element holds the live screen stream. We don't mount it in the
    // DOM — it just drives drawImage every frame.
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;

    // The last known mouse position in CSS pixels. Updated on every
    // mousemove and used inside the raf loop so the loupe tracks the
    // cursor smoothly even if mousemove events temporarily stop firing.
    let mx = -1, my = -1;

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
        hint.textContent = 'Screen capture failed — check Screen Recording permission. Esc to cancel.';
      }
    }

    function tick() {
      if (!ready) return;
      // Draw the current video frame into the hidden canvas so we always
      // sample fresh pixels, regardless of whether the mouse moved.
      try { workCtx.drawImage(video, 0, 0, work.width, work.height); } catch {}
      if (mx >= 0) render(mx, my);
      requestAnimationFrame(tick);
    }

    function sampleAt(cssX, cssY) {
      if (!ready) return { r: 0, g: 0, b: 0 };
      // Scale CSS coords to video-pixel coords; handles any DPR or resolution
      // mismatch between the screen and the stream.
      const sx = Math.round((cssX / window.innerWidth) * work.width);
      const sy = Math.round((cssY / window.innerHeight) * work.height);
      try {
        const d = workCtx.getImageData(sx, sy, 1, 1).data;
        return { r: d[0], g: d[1], b: d[2] };
      } catch { return { r: 0, g: 0, b: 0 }; }
    }

    function render(cssX, cssY) {
      // Position the loupe below-right of the cursor so it never covers
      // the pixels being sampled. Flip to above-left near the screen edge.
      const offset = 28;
      let lx = cssX + offset, ly = cssY + offset;
      if (lx + 140 > window.innerWidth) lx = cssX - offset - 140;
      if (ly + 140 > window.innerHeight) ly = cssY - offset - 140;
      loupe.style.left = lx + 'px';
      loupe.style.top = ly + 'px';

      // Zoomed 17×17 view around the cursor.
      const sx = (cssX / window.innerWidth) * work.width;
      const sy = (cssY / window.innerHeight) * work.height;
      const half = 8;
      loupeCtx.clearRect(0, 0, 17, 17);
      try {
        loupeCtx.drawImage(
          work,
          Math.max(0, Math.round(sx - half)),
          Math.max(0, Math.round(sy - half)),
          17, 17, 0, 0, 17, 17,
        );
      } catch {}

      const c = sampleAt(cssX, cssY);
      badge.textContent = rgbToHex(c.r, c.g, c.b);
      // Badge hugs the loupe.
      badge.style.left = (lx + 70 - 40) + 'px';
      badge.style.top = (ly + 148) + 'px';
    }

    function pickAt(e) {
      if (!ready) return; // Don't ship #000000 back before the stream starts.
      const { r, g, b } = sampleAt(e.clientX, e.clientY);
      try { window.sepiaPicker.sendResult({ hex: rgbToHex(r, g, b), rgb: { r, g, b } }); }
      catch (err) { console.error('picker IPC missing', err); }
    }

    window.addEventListener('mousemove', (e) => { mx = e.clientX; my = e.clientY; });
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
  // Hide the overlay from any screen capture — including our own live
  // stream. Without this, the loupe and hex badge drawn on the overlay
  // would appear in the video feed and we'd sample the loupe's pixels
  // instead of the screen pixels beneath.
  pickerWindow.setContentProtection(true);
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
