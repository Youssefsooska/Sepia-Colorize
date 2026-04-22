/**
 * Preload script — the only bridge between the React renderer and Electron.
 *
 * Exposes a narrow, typed `window.sepia` API via contextBridge. The renderer
 * never sees raw ipcRenderer, which keeps the attack surface small: if a
 * compromised third-party script runs in the renderer, it can only call the
 * specific functions listed here, not arbitrary IPC.
 */
import { contextBridge, ipcRenderer } from 'electron';
import type {
  SepiaBridge,
  HotkeyUpdatePayload,
  ExportSavePayload,
  PickedColorPayload,
} from '../src/types';

const bridge: SepiaBridge = {
  startPicking: () => ipcRenderer.send('pick-color:start'),

  updateHotkey: (payload: HotkeyUpdatePayload) =>
    ipcRenderer.invoke('hotkey:update', payload),

  saveExport: (payload: ExportSavePayload) =>
    ipcRenderer.invoke('export:save', payload),

  getPlatform: () => ipcRenderer.invoke('app:get-platform'),

  onColorPicked: (cb: (color: PickedColorPayload) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, color: PickedColorPayload) => cb(color);
    ipcRenderer.on('color:picked', listener);
    return () => ipcRenderer.removeListener('color:picked', listener);
  },

  onPickerCancelled: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on('picker:cancelled', listener);
    return () => ipcRenderer.removeListener('picker:cancelled', listener);
  },

  syncTrayColors: (colors) => ipcRenderer.send('tray:sync-colors', colors),
};

contextBridge.exposeInMainWorld('sepia', bridge);
