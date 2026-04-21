/**
 * Keycap-style shortcut input. Click to enter "listening" mode, then press
 * the target combo. We translate the browser KeyboardEvent into Electron's
 * accelerator syntax (e.g. "Shift+CommandOrControl+C") and hand it to the
 * caller, which in turn pushes it to the main process via window.sepia.
 */
import { useEffect, useState } from 'react';

interface HotkeyRecorderProps {
  shortcut: string;
  onChange: (next: string) => void;
  platform: NodeJS.Platform;
}

export function HotkeyRecorder({ shortcut, onChange, platform }: HotkeyRecorderProps): JSX.Element {
  const [listening, setListening] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => {
    if (!listening) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') { setListening(false); setDraft(null); return; }
      if (e.key === 'Enter' && draft) { onChange(draft); setListening(false); setDraft(null); return; }
      const accel = eventToAccelerator(e);
      if (accel) setDraft(accel);
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [listening, draft, onChange]);

  const display = draft ?? shortcut;
  const symbols = acceleratorToSymbols(display, platform);

  return (
    <button
      onClick={() => { setListening(true); setDraft(null); }}
      onBlur={() => { if (draft) onChange(draft); setListening(false); setDraft(null); }}
      className={`inline-flex items-center gap-1 rounded-button border px-2 py-1 font-mono text-sm transition-colors ${
        listening
          ? 'border-accent text-accent shadow-[0_0_0_2px_rgba(232,162,59,0.28)]'
          : 'border-border-subtle bg-surface-elevated text-text-primary hover:border-border-accent'
      }`}
    >
      {listening && !draft ? (
        <span className="text-text-secondary">Press new shortcut...</span>
      ) : (
        symbols.map((s, i) => (
          <span key={i} className="rounded border border-border-subtle bg-app px-1.5 py-0.5">
            {s}
          </span>
        ))
      )}
    </button>
  );
}

// Convert a KeyboardEvent into an Electron accelerator string.
function eventToAccelerator(e: KeyboardEvent): string | null {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  // The "main" key of the combo: ignore when it's just a modifier.
  const key = e.key;
  if (['Control', 'Meta', 'Alt', 'Shift'].includes(key)) return null;
  const main = key.length === 1 ? key.toUpperCase() : key;
  parts.push(main);
  return parts.join('+');
}

// Render the accelerator as platform-appropriate key-cap glyphs.
function acceleratorToSymbols(accel: string, platform: NodeJS.Platform): string[] {
  const parts = accel.split('+');
  return parts.map((p) => {
    if (p === 'CommandOrControl' || p === 'Command' || p === 'CmdOrCtrl') {
      return platform === 'darwin' ? '⌘' : 'Ctrl';
    }
    if (p === 'Control') return 'Ctrl';
    if (p === 'Shift') return '⇧';
    if (p === 'Alt') return platform === 'darwin' ? '⌥' : 'Alt';
    return p;
  });
}

/** Standalone helper used elsewhere in the UI for showing the shortcut badge. */
export function acceleratorDisplay(accel: string, platform: NodeJS.Platform): string {
  return acceleratorToSymbols(accel, platform).join('');
}

/** Render a shortcut as a row of individual kbd chips — the dashboard-style
 * badge used in the drawer toolbar and anywhere else we want the accelerator
 * to read like keycaps rather than a single mono string. */
export function AcceleratorChips({
  shortcut,
  platform,
}: {
  shortcut: string;
  platform: NodeJS.Platform;
}): JSX.Element {
  const symbols = acceleratorToSymbols(shortcut, platform);
  return (
    <span className="inline-flex items-center gap-1">
      {symbols.map((s, i) => (
        <span
          key={i}
          className="inline-flex min-w-[22px] items-center justify-center rounded border border-border-subtle bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-text-primary"
        >
          {s}
        </span>
      ))}
    </span>
  );
}
