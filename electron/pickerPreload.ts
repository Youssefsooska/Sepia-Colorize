/**
 * Preload for the picker overlay. Exposes a tiny API that lets the overlay
 * ask main to sample a pixel at a screen coordinate and to cancel.
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('sepiaPicker', {
  // Ask main to sample the pixel at (screenX, screenY) via desktopCapturer
  // and forward the result to the renderer. Returns true once main has
  // accepted the request — the color itself flows through the main→renderer
  // 'color:picked' channel, not back through this call.
  sampleAndSend: (screenX: number, screenY: number) =>
    ipcRenderer.invoke('picker:sample-at', { x: screenX, y: screenY }),
  cancel: () => ipcRenderer.send('picker:cancel'),
  logError: (message: string) => ipcRenderer.send('picker:log-error', String(message)),
});
