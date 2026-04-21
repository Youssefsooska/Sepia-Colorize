/**
 * Zustand store for user preferences (hotkeys, toggles, export defaults).
 *
 * Mirrors the `AppSettings` type so we have a single definition used in both
 * renderer (here) and main process. Persisted to localStorage with key
 * `sepia:settings`. When a hotkey changes, the renderer also invokes
 * `window.sepia.updateHotkey(...)` so the main process re-registers the
 * global shortcut — see SettingsPage.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { AppSettings, ColorFormat, ExportFormat } from '../types';

interface SettingsStoreState extends AppSettings {
  setHotkey: (action: 'pickColor' | 'toggleDrawer', shortcut: string) => void;
  setLaunchAtLogin: (v: boolean) => void;
  setShowInTray: (v: boolean) => void;
  setPlaySoundOnPick: (v: boolean) => void;
  setAutoCopyOnPick: (v: boolean) => void;
  setDefaultColorFormat: (v: ColorFormat) => void;
  setDefaultExportFormat: (v: ExportFormat) => void;
}

const DEFAULTS: AppSettings = {
  hotkeys: {
    pickColor: 'Shift+CommandOrControl+C',
    toggleDrawer: 'Shift+CommandOrControl+D',
  },
  launchAtLogin: false,
  showInTray: true,
  playSoundOnPick: false,
  autoCopyOnPick: true,
  defaultColorFormat: 'hex',
  defaultExportFormat: 'css',
};

const safeStorage = () => {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  const mem: Record<string, string> = {};
  return {
    getItem: (k: string) => mem[k] ?? null,
    setItem: (k: string, v: string) => { mem[k] = v; },
    removeItem: (k: string) => { delete mem[k]; },
  } as Storage;
};

export const useSettingsStore = create<SettingsStoreState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setHotkey: (action, shortcut) =>
        set((state) => ({ hotkeys: { ...state.hotkeys, [action]: shortcut } })),
      setLaunchAtLogin: (v) => set({ launchAtLogin: v }),
      setShowInTray: (v) => set({ showInTray: v }),
      setPlaySoundOnPick: (v) => set({ playSoundOnPick: v }),
      setAutoCopyOnPick: (v) => set({ autoCopyOnPick: v }),
      setDefaultColorFormat: (v) => set({ defaultColorFormat: v }),
      setDefaultExportFormat: (v) => set({ defaultExportFormat: v }),
    }),
    {
      name: 'sepia:settings',
      storage: createJSONStorage(safeStorage),
      partialize: (state): AppSettings => ({
        hotkeys: state.hotkeys,
        launchAtLogin: state.launchAtLogin,
        showInTray: state.showInTray,
        playSoundOnPick: state.playSoundOnPick,
        autoCopyOnPick: state.autoCopyOnPick,
        defaultColorFormat: state.defaultColorFormat,
        defaultExportFormat: state.defaultExportFormat,
      }),
    },
  ),
);
