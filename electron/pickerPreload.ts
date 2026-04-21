/**
 * Preload for the fullscreen picker overlay window.
 *
 * Exposes the minimal API the overlay needs to send the chosen color back
 * to the main process (and request a cancel on Escape). Keeping this
 * separate from the main renderer's preload means the picker window can't
 * access the full Sepia bridge.
 */
import { contextBridge, ipcRenderer, desktopCapturer } from 'electron';

interface PickerResult {
  hex: string;
  rgb: { r: number; g: number; b: number };
}

contextBridge.exposeInMainWorld('sepiaPicker', {
  sendResult: (result: PickerResult) => ipcRenderer.send('picker:result', result),
  cancel: () => ipcRenderer.send('picker:cancel'),
  getScreenSources: async () => {
    // Called from the overlay to capture a screenshot for the loupe.
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 },
    });
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      thumbnailDataUrl: s.thumbnail.toDataURL(),
    }));
  },
});
