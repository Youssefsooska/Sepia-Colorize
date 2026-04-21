/**
 * Preload for the fullscreen picker overlay window.
 *
 * Exposes only what the overlay needs:
 *   - send the picked color back to the main process;
 *   - request a cancel on Escape or right-click.
 *
 * The overlay itself fetches its live pixels via `navigator.mediaDevices.
 * getDisplayMedia`; the main-process \`session.setDisplayMediaRequestHandler\`
 * auto-responds with the display under the cursor, so no capture IPC is
 * needed here.
 */
import { contextBridge, ipcRenderer } from 'electron';

interface PickerResult {
  hex: string;
  rgb: { r: number; g: number; b: number };
}

contextBridge.exposeInMainWorld('sepiaPicker', {
  sendResult: (result: PickerResult) => ipcRenderer.send('picker:result', result),
  cancel: () => ipcRenderer.send('picker:cancel'),
  logError: (message: string) => ipcRenderer.send('picker:log-error', String(message)),
});
