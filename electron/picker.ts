/**
 * Screen color picker — opens a transparent fullscreen overlay window on the
 * active display, waits for a click, and sends the picked color back.
 *
 * Conversion from the picked RGB to HSL/CMYK happens here so the renderer
 * gets a fully-formed `PickedColorPayload` and doesn't need to do the math.
 */
import { BrowserWindow, ipcMain, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rgbToHsl, rgbToCmyk } from '../src/utils/colorConversion.js';
import { sendToRenderer } from './main.js';
import type { PickedColorPayload } from '../src/types';

const __filename = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
const __dirnameLocal = path.dirname(__filename);

let pickerWindow: BrowserWindow | null = null;

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
  pickerWindow.loadFile(path.join(__dirnameLocal, 'pickerOverlay.html'));

  pickerWindow.on('closed', () => { pickerWindow = null; });
}

export function cancelPicking(): void {
  if (pickerWindow) {
    pickerWindow.close();
    pickerWindow = null;
    sendToRenderer('picker:cancelled');
  }
}

// --- IPC from the picker overlay ------------------------------------------

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
