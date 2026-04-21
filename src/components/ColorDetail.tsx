/**
 * Detail panel showing all color-space representations of a single color
 * with per-format copy buttons. Used by the Color Theory page when the user
 * focuses a specific color — kept simple and flat to stay readable.
 */
import { SavedColor } from '../types';
import { formatRgb, formatHsl, formatCmyk } from '../utils/colorConversion';
import { showToast } from './Toast';

export function ColorDetail({ color }: { color: SavedColor }): JSX.Element {
  const rows: Array<{ label: string; value: string }> = [
    { label: 'HEX', value: color.hex },
    { label: 'RGB', value: formatRgb(color.rgb) },
    { label: 'HSL', value: formatHsl(color.hsl) },
    { label: 'CMYK', value: formatCmyk(color.cmyk) },
  ];
  const copy = (v: string, label: string) => {
    navigator.clipboard.writeText(v).catch(() => {});
    showToast(`Copied ${label}`);
  };
  return (
    <div className="flex items-center gap-4">
      <div className="h-16 w-16 rounded-card" style={{ backgroundColor: color.hex }} />
      <div className="flex-1 space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2 text-sm">
            <span className="w-12 text-text-secondary">{r.label}</span>
            <span className="flex-1 font-mono text-text-primary">{r.value}</span>
            <button
              onClick={() => copy(r.value, r.label)}
              className="rounded-button px-2 py-0.5 text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            >
              Copy
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
