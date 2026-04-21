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
import { Toggle, SettingsRow } from '../components/Toggle';
import { Segmented, ChipGroup } from '../components/Segmented';
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
    <div className="flex-1 space-y-8 overflow-y-auto p-8">
      <header className="flex items-baseline gap-4">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-text-primary">Settings</h1>
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">
          v1.0.0 · synced locally
        </span>
      </header>

      <Section title="HOTKEYS" aside="click to rebind · esc to cancel">
        <SettingsRow
          label="Pick color from screen"
          description="Opens the fullscreen magnifier loupe."
        >
          <HotkeyRecorder
            shortcut={settings.hotkeys.pickColor}
            platform={platform}
            onChange={(v) => updateHotkey('pickColor', v)}
          />
        </SettingsRow>
        <SettingsRow
          label="Toggle drawer window"
          description="Show or hide the main Sepia window."
        >
          <HotkeyRecorder
            shortcut={settings.hotkeys.toggleDrawer}
            platform={platform}
            onChange={(v) => updateHotkey('toggleDrawer', v)}
          />
        </SettingsRow>
      </Section>

      <Section title="GENERAL">
        <SettingsRow
          label="Launch at login"
          description="Start Sepia in the background when you sign in."
        >
          <Toggle
            checked={settings.launchAtLogin}
            onChange={settings.setLaunchAtLogin}
            label="Launch at login"
          />
        </SettingsRow>
        <SettingsRow
          label="Show in menu bar"
          description="Keep a Sepia icon in the system tray / menu bar."
        >
          <Toggle
            checked={settings.showInTray}
            onChange={settings.setShowInTray}
            label="Show in menu bar"
          />
        </SettingsRow>
        <SettingsRow
          label="Play sound on color pick"
          description="A subtle click confirms every pick."
        >
          <Toggle
            checked={settings.playSoundOnPick}
            onChange={settings.setPlaySoundOnPick}
            label="Play sound on color pick"
          />
        </SettingsRow>
        <SettingsRow
          label="Auto-copy HEX on pick"
          description="Put the picked hex straight onto your clipboard."
        >
          <Toggle
            checked={settings.autoCopyOnPick}
            onChange={settings.setAutoCopyOnPick}
            label="Auto-copy HEX on pick"
          />
        </SettingsRow>
        <SettingsRow
          label="Default color format"
          description="Which representation lands on the clipboard when you click a swatch."
        >
          <Segmented
            value={settings.defaultColorFormat}
            onChange={(v) => settings.setDefaultColorFormat(v as ColorFormat)}
            options={[
              { value: 'hex', label: 'HEX' },
              { value: 'rgb', label: 'RGB' },
              { value: 'hsl', label: 'HSL' },
              { value: 'cmyk', label: 'CMYK' },
            ]}
          />
        </SettingsRow>
      </Section>

      <Section
        title="EXPORT DEFAULTS"
        aside={`${Object.keys(EXPORT_FORMAT_LABELS).length} formats available`}
      >
        <ChipGroup<ExportFormat>
          value={settings.defaultExportFormat}
          onChange={settings.setDefaultExportFormat}
          options={(Object.keys(EXPORT_FORMAT_LABELS) as ExportFormat[]).map((f) => ({
            value: f,
            label: EXPORT_FORMAT_LABELS[f],
          }))}
          ariaLabel="Default export format"
        />
      </Section>

      <Section title="DATA" aside="stored locally · never leaves this machine">
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

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <section className="space-y-4">
      <header className="flex items-baseline gap-4">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-accent">{title}</h2>
        <div className="h-px flex-1 bg-border-subtle" />
        {aside && (
          <span className="font-mono text-[10px] tracking-[0.08em] text-text-muted">{aside}</span>
        )}
      </header>
      <div className="rounded-card bg-surface p-5 space-y-3">{children}</div>
    </section>
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
