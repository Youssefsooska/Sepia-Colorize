/**
 * WCAG contrast checker — two color pickers (foreground + background), the
 * computed ratio, AA / AAA pass-fail for normal and large text, and a live
 * preview rendered with the two colors applied.
 */
import { useState } from 'react';
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
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 text-sm text-text-secondary">{label}</span>
      <div className="h-6 w-6 rounded border border-border-subtle" style={{ backgroundColor: safeHex(value) }} />
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { try { hexToRgb(draft); onChange(draft); } catch { setDraft(value); } }}
        className="w-24 rounded-button border border-border-subtle bg-bg-app px-2 py-1 font-mono text-sm"
      />
      <select
        value=""
        onChange={(e) => { if (e.target.value) { setDraft(e.target.value); onChange(e.target.value); } }}
        className="rounded-button border border-border-subtle bg-bg-app px-2 py-1 text-xs"
      >
        <option value="">from collection…</option>
        {Object.values(colors).map((c) => (
          <option key={c.id} value={c.hex}>{c.hex}</option>
        ))}
      </select>
    </div>
  );
}

function safeHex(h: string): string {
  try { hexToRgb(h); return h; } catch { return '#000000'; }
}

export function ContrastChecker(): JSX.Element {
  const [fg, setFg] = useState('#C34C4C');
  const [bg, setBg] = useState('#FFFFFF');
  let ratio = 0;
  try { ratio = getContrastRatio(fg, bg); } catch { ratio = 0; }
  const r = Math.round(ratio * 100) / 100;
  const Pass = ({ ok }: { ok: boolean }) => (
    <span className={ok ? 'text-success' : 'text-danger'}>{ok ? '✓ PASS' : '✗ FAIL'}</span>
  );
  return (
    <div className="rounded-card bg-surface p-5">
      <h3 className="text-base font-medium">Contrast Checker</h3>
      <div className="mt-3 space-y-2">
        <SwatchPicker value={fg} onChange={setFg} label="Foreground" />
        <SwatchPicker value={bg} onChange={setBg} label="Background" />
      </div>

      <div className="mt-4 text-sm">
        <div>Contrast ratio: <span className="font-mono text-text-primary">{r}:1</span></div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <div>WCAG AA — Normal: <Pass ok={meetsWCAG_AA(ratio, false)} /></div>
          <div>WCAG AA — Large: <Pass ok={meetsWCAG_AA(ratio, true)} /></div>
          <div>WCAG AAA — Normal: <Pass ok={meetsWCAG_AAA(ratio, false)} /></div>
          <div>WCAG AAA — Large: <Pass ok={meetsWCAG_AAA(ratio, true)} /></div>
        </div>
      </div>

      <div className="mt-4">
        <div className="text-xs text-text-secondary">Preview</div>
        <div
          className="mt-1 rounded-card p-4 text-base"
          style={{ backgroundColor: safeHex(bg), color: safeHex(fg) }}
        >
          The quick brown fox jumps over the lazy dog
        </div>
      </div>
    </div>
  );
}
