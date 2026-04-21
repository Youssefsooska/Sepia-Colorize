/**
 * Preload for the fullscreen picker overlay window.
 *
 * Exposes the minimal API the overlay needs:
 *   - request a screen capture from the main process (desktopCapturer is
 *     main-process-only in Electron 17+, so we can't call it directly here);
 *   - send the picked color back;
 *   - request a cancel on Escape.
 *
 * Keeping this separate from the main renderer's preload means the picker
 * window can't access the full Sepia bridge.
 */
import { contextBridge, ipcRenderer } from 'electron';

interface PickerResult {
  hex: string;
  rgb: { r: number; g: number; b: number };
}

interface CaptureResponse {
  dataUrl?: string;
  displayWidth?: number;
  displayHeight?: number;
  scaleFactor?: number;
  error?: string;
  message?: string;
  status?: string;
}

contextBridge.exposeInMainWorld('sepiaPicker', {
  sendResult: (result: PickerResult) => ipcRenderer.send('picker:result', result),
  cancel: () => ipcRenderer.send('picker:cancel'),
  capture: (): Promise<CaptureResponse> => ipcRenderer.invoke('picker:capture'),
});
