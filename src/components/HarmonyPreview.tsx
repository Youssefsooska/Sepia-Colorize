/**
 * Displays a generated harmony as a row of swatches with hex labels.
 * Dumb component — just renders what the parent passes.
 */
import { HSL } from '../types';
import { hslToRgb, rgbToHex } from '../utils/colorConversion';

export function HarmonyPreview({ colors }: { colors: HSL[] }): JSX.Element {
  return (
    <div className="flex flex-wrap gap-2">
      {colors.map((c, i) => {
        const { r, g, b } = hslToRgb(c.h, c.s, c.l);
        const hex = rgbToHex(r, g, b);
        const labelColor = c.l > 55 ? '#0F100F' : '#F0E8DC';
        return (
          <div
            key={i}
            className="flex min-w-[120px] flex-1 flex-col justify-end rounded-card p-3"
            style={{ backgroundColor: hex, minHeight: '96px' }}
          >
            <span
              className="font-mono text-[13px] font-semibold tracking-[0.01em]"
              style={{ color: labelColor }}
            >
              {hex}
            </span>
          </div>
        );
      })}
    </div>
  );
}
