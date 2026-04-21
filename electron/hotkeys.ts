/**
 * Global hotkey management for Sepia.
 *
 * Persists the user's shortcut choices in electron-store and registers them
 * with Electron's globalShortcut module so the picker works even when the
 * app is not focused. `updateHotkey` attempts the new binding first and
 * rolls back (reports failure) if Electron rejects it — this prevents the
 * user from being locked out of a working shortcut by a bad keystroke.
 */
import { globalShortcut } from 'electron';
import Store from 'electron-store';
import type { HotkeyUpdatePayload, HotkeyUpdateResult } from '../src/types';
import { startPicking } from './picker.js';
import { toggleMainWindow } from './main.js';

interface HotkeysSchema {
  pickColor: string;
  toggleDrawer: string;
}

const DEFAULTS: HotkeysSchema = {
  pickColor: 'Shift+CommandOrControl+C',
  toggleDrawer: 'Shift+CommandOrControl+D',
};

const store = new Store<HotkeysSchema>({
  name: 'sepia-hotkeys',
  defaults: DEFAULTS,
});

const actionHandlers: Record<keyof HotkeysSchema, () => void> = {
  pickColor: () => startPicking(),
  toggleDrawer: () => toggleMainWindow(),
};

export function getCurrentHotkeys(): HotkeysSchema {
  return {
    pickColor: store.get('pickColor', DEFAULTS.pickColor),
    toggleDrawer: store.get('toggleDrawer', DEFAULTS.toggleDrawer),
  };
}

export function registerHotkeys(): void {
  globalShortcut.unregisterAll();
  const current = getCurrentHotkeys();
  (Object.keys(current) as Array<keyof HotkeysSchema>).forEach((action) => {
    const accel = current[action];
    try {
      const ok = globalShortcut.register(accel, actionHandlers[action]);
      if (!ok) console.warn(`Sepia: failed to register ${action} shortcut (${accel})`);
    } catch (err) {
      console.warn(`Sepia: exception registering ${action} (${accel}):`, err);
    }
  });
}

export async function updateHotkey(payload: HotkeyUpdatePayload): Promise<HotkeyUpdateResult> {
  const { action, shortcut } = payload;
  const current = getCurrentHotkeys();
  const previous = current[action];

  // Unregister the old binding for this action so we can test the new one.
  if (previous) globalShortcut.unregister(previous);

  try {
    const ok = globalShortcut.register(shortcut, actionHandlers[action]);
    if (!ok) {
      // Re-register previous so the user isn't left with nothing.
      globalShortcut.register(previous, actionHandlers[action]);
      return {
        action,
        shortcut,
        success: false,
        error: 'Shortcut is already in use or invalid',
      };
    }
    store.set(action, shortcut);
    return { action, shortcut, success: true };
  } catch (err) {
    globalShortcut.register(previous, actionHandlers[action]);
    return {
      action,
      shortcut,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function unregisterAll(): void {
  globalShortcut.unregisterAll();
}
