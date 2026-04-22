/**
 * Shared type definitions for Sepia.
 *
 * This file is the single source of truth for the data contract between the
 * Electron main process, the renderer (React), and the persistent store.
 * Utilities, stores, IPC handlers, and UI components all import from here so
 * that a change to a shape is visible everywhere at compile time.
 */

// ---------------------------------------------------------------------------
// Primitive color shapes
// ---------------------------------------------------------------------------

export interface RGB {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
}

export interface HSL {
  h: number; // 0-360 degrees
  s: number; // 0-100 percent
  l: number; // 0-100 percent
}

export interface CMYK {
  c: number; // 0-100 percent
  m: number; // 0-100 percent
  y: number; // 0-100 percent
  k: number; // 0-100 percent
}

// ---------------------------------------------------------------------------
// Domain models persisted in electron-store
// ---------------------------------------------------------------------------

export interface SavedColor {
  id: string;              // UUID
  hex: string;             // "#RRGGBB" (uppercase)
  rgb: RGB;
  hsl: HSL;
  cmyk: CMYK;
  timestamp: number;       // Unix ms — used for "X ago" labels and sorting
  collectionIds: string[]; // Collections this color belongs to
}

export interface Collection {
  id: string;              // UUID
  name: string;
  colorIds: string[];      // Ordered list of color IDs
  createdAt: number;       // Unix ms
  isExpanded: boolean;     // UI: expanded or collapsed
}

export type ColorFormat = 'hex' | 'rgb' | 'hsl' | 'cmyk';

export type ExportFormat =
  | 'css'
  | 'scss'
  | 'tailwind'
  | 'json'
  | 'ase'
  | 'sketch'
  | 'figma-tokens'
  | 'gpl'
  | 'raw';

export interface AppSettings {
  hotkeys: {
    pickColor: string;    // e.g. "Shift+CommandOrControl+C"
    toggleDrawer: string; // e.g. "Shift+CommandOrControl+D"
  };
  launchAtLogin: boolean;
  showInTray: boolean;
  playSoundOnPick: boolean;
  autoCopyOnPick: boolean;
  defaultColorFormat: ColorFormat;
  defaultExportFormat: ExportFormat;
}

// ---------------------------------------------------------------------------
// Harmony types for the Color Theory page
// ---------------------------------------------------------------------------

export type HarmonyType =
  | 'complementary'
  | 'analogous'
  | 'triadic'
  | 'split-complementary'
  | 'tetradic'
  | 'monochromatic';

// ---------------------------------------------------------------------------
// IPC payload shapes (renderer <-> main)
// ---------------------------------------------------------------------------

export interface PickedColorPayload {
  hex: string;
  rgb: RGB;
  hsl: HSL;
  cmyk: CMYK;
  timestamp: number;
}

export interface HotkeyUpdatePayload {
  action: 'pickColor' | 'toggleDrawer';
  shortcut: string;
}

export interface HotkeyUpdateResult extends HotkeyUpdatePayload {
  success: boolean;
  error?: string;
}

export interface ExportSavePayload {
  format: ExportFormat;
  data: string;       // For binary formats (ASE), base64-encoded.
  defaultName: string;
  isBinary?: boolean;
}

// ---------------------------------------------------------------------------
// Preload-exposed API surface (window.sepia)
// ---------------------------------------------------------------------------

export interface SepiaBridge {
  startPicking: () => void;
  updateHotkey: (payload: HotkeyUpdatePayload) => Promise<HotkeyUpdateResult>;
  saveExport: (payload: ExportSavePayload) => Promise<{ saved: boolean; path?: string }>;
  getPlatform: () => Promise<NodeJS.Platform>;
  onColorPicked: (cb: (color: PickedColorPayload) => void) => () => void;
  onPickerCancelled: (cb: () => void) => () => void;
  // Push the renderer's recent-colors list to the tray menu. Called whenever
  // the color store changes so the menu-bar swatches stay in sync.
  syncTrayColors: (colors: { id: string; hex: string }[]) => void;
}

declare global {
  interface Window {
    sepia: SepiaBridge;
  }
}
