/**
 * Settings page: hotkey rebinding, general toggles, export defaults, and a
 * data-management section (totals + import/export/clear-all).
 *
 * Hotkey changes are sent to the main process via window.sepia.updateHotkey.
 * If Electron rejects the combo (reserved / in-use), we surface the error
 * and revert the store to the previous value.
 */
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { useColorStore } from '../stores/colorStore';
import { HotkeyRecorder } from '../components/HotkeyRecorder';
import { showToast } from '../components/Toast';
import { ColorFormat, ExportFormat } from '../types';
import { EXPORT_FORMAT_LABELS } from '../utils/exportFormats';
import { rgbToHsl, rgbToCmyk } from '../utils/colorConversion';

export function SettingsPage(): JSX.Element {
  const settings = useSettingsStore();
  const totalColors = useColorStore((s) => Object.keys(s.colors).length);
  const totalCollections = useColorStore((s) => s.collectionOrder.length);
  const colorsState = useColorStore();

  const [platform, setPlatform] = useState<NodeJS.Platform>('darwin');
  useEffect(() => { window.sepia?.getPlatform().then(setPlatform).catch(() => {}); }, []);

  const updateHotkey = async (action: 'pickColor' | 'toggleDrawer', shortcut: string) => {
    const previous = settings.hotkeys[action];
    settings.setHotkey(action, shortcut);
    const res = await window.sepia?.updateHotkey({ action, shortcut });
    if (!res?.success) {
      settings.setHotkey(action, previous);
      showToast(res?.error ?? 'Shortcut rejected');
    } else {
      showToast('Shortcut updated');
    }
  };

  const clearAll = () => {
    const ok = window.confirm('This will delete every saved color and collection. Continue?');
    if (!ok) return;
    // Replace the persisted store state with a fresh snapshot.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (useColorStore as any).setState({ colors: {}, collections: {}, collectionOrder: [] });
    showToast('All data cleared');
  };

  const exportAllJson = async () => {
    const data = JSON.stringify(
      {
        colors: colorsState.colors,
        collections: colorsState.collections,
        collectionOrder: colorsState.collectionOrder,
      },
      null,
      2,
    );
    await window.sepia?.saveExport({
      format: 'json',
      data,
      defaultName: 'sepia-backup.json',
    });
  };

  const importData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.gpl';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        if (file.name.endsWith('.gpl')) {
          importGpl(text);
          showToast('Imported GPL palette');
        } else {
          const parsed = JSON.parse(text);
          if (parsed.colors && parsed.collections) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (useColorStore as any).setState({
              colors: parsed.colors,
              collections: parsed.collections,
              collectionOrder: parsed.collectionOrder ?? Object.keys(parsed.collections),
            });
            showToast('Imported backup');
          } else {
            showToast('Unrecognized JSON format');
          }
        }
      } catch {
        showToast('Failed to import');
      }
    };
    input.click();
  };

  return (
    <div className="flex-1 space-y-6 overflow-y-auto p-6">
      <h1 className="text-xl font-medium">Settings</h1>

      <Section title="HOTKEYS">
        <Row label="Pick color from screen">
          <HotkeyRecorder
            shortcut={settings.hotkeys.pickColor}
            platform={platform}
            onChange={(v) => updateHotkey('pickColor', v)}
          />
        </Row>
        <Row label="Toggle drawer window">
          <HotkeyRecorder
            shortcut={settings.hotkeys.toggleDrawer}
            platform={platform}
            onChange={(v) => updateHotkey('toggleDrawer', v)}
          />
        </Row>
        <p className="text-xs text-text-muted mt-2">
          Click a shortcut to re-record. Press Esc to cancel, Enter to confirm.
        </p>
      </Section>

      <Section title="GENERAL">
        <Checkbox
          label="Launch at login"
          checked={settings.launchAtLogin}
          onChange={settings.setLaunchAtLogin}
        />
        <Checkbox
          label="Show in menu bar / system tray"
          checked={settings.showInTray}
          onChange={settings.setShowInTray}
        />
        <Checkbox
          label="Play sound on color pick"
          checked={settings.playSoundOnPick}
          onChange={settings.setPlaySoundOnPick}
        />
        <Checkbox
          label="Auto-copy HEX to clipboard on pick"
          checked={settings.autoCopyOnPick}
          onChange={settings.setAutoCopyOnPick}
        />
        <Row label="Default color format">
          <select
            value={settings.defaultColorFormat}
            onChange={(e) => settings.setDefaultColorFormat(e.target.value as ColorFormat)}
            className="rounded-button border border-border-subtle bg-app px-2 py-1 text-sm"
          >
            <option value="hex">HEX</option>
            <option value="rgb">RGB</option>
            <option value="hsl">HSL</option>
            <option value="cmyk">CMYK</option>
          </select>
        </Row>
      </Section>

      <Section title="EXPORT DEFAULTS">
        <Row label="Default export format">
          <select
            value={settings.defaultExportFormat}
            onChange={(e) => settings.setDefaultExportFormat(e.target.value as ExportFormat)}
            className="rounded-button border border-border-subtle bg-app px-2 py-1 text-sm"
          >
            {(Object.keys(EXPORT_FORMAT_LABELS) as ExportFormat[]).map((f) => (
              <option key={f} value={f}>{EXPORT_FORMAT_LABELS[f]}</option>
            ))}
          </select>
        </Row>
      </Section>

      <Section title="DATA">
        <div className="text-sm text-text-secondary">Total colors saved: <span className="text-text-primary">{totalColors}</span></div>
        <div className="text-sm text-text-secondary">Total collections: <span className="text-text-primary">{totalCollections}</span></div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={exportAllJson}
            className="rounded-button border border-border-subtle bg-surface-elevated px-3 py-1.5 text-sm hover:bg-surface-hover"
          >
            Export All Data (JSON)
          </button>
          <button
            onClick={importData}
            className="rounded-button border border-border-subtle bg-surface-elevated px-3 py-1.5 text-sm hover:bg-surface-hover"
          >
            Import Data
          </button>
          <button
            onClick={clearAll}
            className="rounded-button border border-danger/40 bg-danger/10 px-3 py-1.5 text-sm text-danger hover:bg-danger/20"
          >
            Clear All Data
          </button>
        </div>
      </Section>

      <div className="text-xs text-text-muted">About Sepia v1.0.0</div>
    </div>
  );
}

// --- Layout primitives ----------------------------------------------------

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="space-y-2">
      <h2 className="text-[11px] font-medium uppercase tracking-wider text-text-muted">{title}</h2>
      <div className="rounded-card bg-surface p-5 space-y-3">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-text-primary">{label}</span>
      {children}
    </div>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }): JSX.Element {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-accent"
      />
      {label}
    </label>
  );
}

// --- GPL import helper ----------------------------------------------------
// Parses a minimal GIMP Palette (.gpl) file: ignores header lines, reads
// "R G B\tname" rows. Names are used to pick a collection name; lines that
// are comments (#) or don't parse are skipped.
function importGpl(text: string): void {
  const lines = text.split(/\r?\n/);
  let name = 'Imported';
  const entries: Array<{ r: number; g: number; b: number; label: string }> = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('GIMP Palette') || line.startsWith('Columns:')) continue;
    if (line.startsWith('Name:')) { name = line.slice(5).trim() || name; continue; }
    if (line.startsWith('#')) continue;
    const m = line.match(/^(\d+)\s+(\d+)\s+(\d+)(?:\s+(.*))?$/);
    if (!m) continue;
    entries.push({
      r: Number(m[1]),
      g: Number(m[2]),
      b: Number(m[3]),
      label: (m[4] ?? '').trim(),
    });
  }
  if (!entries.length) return;
  const store = useColorStore.getState();
  const col = store.createCollection(name);
  for (const e of entries) {
    const hex = `#${[e.r, e.g, e.b].map((n) => n.toString(16).padStart(2, '0').toUpperCase()).join('')}`;
    const saved = store.addColor({
      hex,
      rgb: { r: e.r, g: e.g, b: e.b },
      hsl: rgbToHsl(e.r, e.g, e.b),
      cmyk: rgbToCmyk(e.r, e.g, e.b),
      timestamp: Date.now(),
    });
    store.moveColorToCollection(saved.id, col.id);
  }
}
