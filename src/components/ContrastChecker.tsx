/**
 * WCAG contrast checker — two color pickers (foreground + background), the
 * computed ratio, AA / AAA pass/fail for normal and large text, and a live
 * sample of the combination.
 *
 * Presentation follows the "instrument panel" treatment: numbered section
 * label, a big monospaced ratio readout, explicit AA/AAA threshold badges,
 * and three layout bands (picker row / result row).
 */
import { useEffect, useState } from 'react';
import { getContrastRatio, hexToRgb } from '../utils/colorConversion';
import { meetsWCAG_AA, meetsWCAG_AAA } from '../utils/colorTheory';
import { useColorStore } from '../stores/colorStore';

interface SwatchPickerProps {
  value: string;
  onChange: (next: string) => void;
  label: string;
}

function SwatchPicker({ value, onChange, label }: SwatchPickerProps): JSX.Element {
  const colors = useColorStore((s) => s.colors);
  const [draft, setDraft] = useState(value);
  // Keep the draft in sync when the parent swaps values externally (e.g. swap
  // button) and the input is not currently being edited.
  useEffect(() => {
    if (document.activeElement?.tagName !== 'INPUT') setDraft(value);
  }, [value]);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
        {label}
      </span>
      <div className="flex items-center gap-2 rounded-button border border-border-subtle bg-app px-3 py-2">
        <div
          className="h-5 w-5 flex-shrink-0 rounded border border-border-subtle"
          style={{ backgroundColor: safeHex(value) }}
        />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            try {
              hexToRgb(draft);
              onChange(draft);
            } catch {
              setDraft(value);
            }
          }}
          className="flex-1 bg-transparent font-mono text-sm outline-none"
        />
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) {
              setDraft(e.target.value);
              onChange(e.target.value);
            }
          }}
          className="rounded border border-border-subtle bg-surface px-1.5 py-0.5 font-mono text-[11px]"
        >
          <option value="">saved…</option>
          {Object.values(colors).map((c) => (
            <option key={c.id} value={c.hex}>{c.hex}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function safeHex(h: string): string {
  try { hexToRgb(h); return h; } catch { return '#000000'; }
}

interface BadgeProps {
  label: string;
  threshold: string;
  ok: boolean;
}

function Badge({ label, threshold, ok }: BadgeProps): JSX.Element {
  const color = ok ? 'var(--success)' : 'var(--danger)';
  return (
    <div
      className="flex items-center gap-2.5 rounded-button border px-3 py-2"
      style={{ borderColor: `${color}59`, backgroundColor: `${color}1A` }}
    >
      {ok ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      )}
      <span className="text-xs font-semibold tracking-[0.02em]" style={{ color }}>
        {label}
      </span>
      <span className="flex-1" />
      <span className="font-mono text-[11px]" style={{ color }}>
        {threshold}
      </span>
    </div>
  );
}

export function ContrastChecker(): JSX.Element {
  const [fg, setFg] = useState('#F0E8DC');
  const [bg, setBg] = useState('#171815');
  let ratio = 0;
  try { ratio = getContrastRatio(fg, bg); } catch { ratio = 0; }
  const r = Math.round(ratio * 100) / 100;

  const swap = () => { const f = fg; setFg(bg); setBg(f); };

  return (
    <section className="space-y-5 rounded-card bg-surface p-6">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-accent">
          03 · Contrast
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted">
          WCAG 2.2
        </span>
      </div>

      <div className="flex items-end gap-4">
        <div className="flex-1">
          <SwatchPicker value={fg} onChange={setFg} label="Foreground" />
        </div>
        <button
          type="button"
          onClick={swap}
          title="Swap foreground and background"
          className="flex h-10 w-10 items-center justify-center rounded-button border border-border-subtle text-text-secondary hover:text-text-primary"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 16V4" />
            <path d="M3 8l4-4 4 4" />
            <path d="M17 8v12" />
            <path d="M13 16l4 4 4-4" />
          </svg>
        </button>
        <div className="flex-1">
          <SwatchPicker value={bg} onChange={setBg} label="Background" />
        </div>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-stretch">
        <div className="flex min-w-[200px] flex-col justify-center gap-1 rounded-button border border-border-subtle bg-app p-5">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
            Ratio
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-[36px] font-semibold leading-none tracking-[-0.02em] text-text-primary">
              {r}
            </span>
            <span className="font-mono text-base text-text-muted">: 1</span>
          </div>
        </div>

        <div className="flex min-w-[220px] flex-col justify-center gap-1.5">
          <Badge label="AA normal" threshold="≥ 4.5" ok={meetsWCAG_AA(ratio, false)} />
          <Badge label="AAA normal" threshold="≥ 7.0" ok={meetsWCAG_AAA(ratio, false)} />
        </div>

        <div
          className="flex flex-1 flex-col justify-center gap-1 rounded-button p-5"
          style={{ backgroundColor: safeHex(bg), color: safeHex(fg) }}
        >
          <div className="text-lg font-semibold tracking-[-0.01em]">
            Large heading · 22px bold
          </div>
          <div className="text-sm leading-snug">
            Body copy at 14px — the quick brown fox jumps over the lazy dog.
          </div>
          <div className="text-[11px] opacity-70">
            Caption 11px · metadata and footnotes.
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 font-mono text-[11px] text-text-muted">
        <span className="rounded border border-border-subtle px-2 py-0.5">
          AA large ≥ 3 · {meetsWCAG_AA(ratio, true) ? 'pass' : 'fail'}
        </span>
        <span className="rounded border border-border-subtle px-2 py-0.5">
          AAA large ≥ 4.5 · {meetsWCAG_AAA(ratio, true) ? 'pass' : 'fail'}
        </span>
      </div>
    </section>
  );
}
