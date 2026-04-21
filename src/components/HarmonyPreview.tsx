/**
 * Displays a generated harmony as a row of swatches with hex labels.
 * Dumb component — just renders what the parent passes.
 */
import { HSL } from '../types';
import { hslToRgb, rgbToHex } from '../utils/colorConversion';

export function HarmonyPreview({ colors }: { colors: HSL[] }): JSX.Element {
  return (
    <div className="grid grid-cols-3 gap-3">
      {colors.map((c, i) => {
        const { r, g, b } = hslToRgb(c.h, c.s, c.l);
        const hex = rgbToHex(r, g, b);
        return (
          <div key={i} className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-card" style={{ backgroundColor: hex }} />
            <span className="font-mono text-xs text-text-primary">{hex}</span>
          </div>
        );
      })}
    </div>
  );
}
