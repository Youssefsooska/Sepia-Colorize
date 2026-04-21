/**
 * Color Theory & Optimizer page. Two main regions:
 *   1. Wheel + harmony generator: pick a base color, choose a harmony type,
 *      preview the generated palette, save it as a new collection.
 *   2. Contrast checker: AA/AAA test between any two colors.
 */
import { useMemo, useState } from 'react';
import { HarmonyType, SavedColor } from '../types';
import { ColorWheel } from '../components/ColorWheel';
import { HarmonyPreview } from '../components/HarmonyPreview';
import { ContrastChecker } from '../components/ContrastChecker';
import { getHarmony } from '../utils/colorTheory';
import {
  rgbToHex,
  hslToRgb,
  rgbToHsl,
  rgbToCmyk,
} from '../utils/colorConversion';
import { useColorStore } from '../stores/colorStore';
import { showToast } from '../components/Toast';

const HARMONY_OPTIONS: Array<{ value: HarmonyType; label: string }> = [
  { value: 'complementary', label: 'Complementary' },
  { value: 'analogous', label: 'Analogous' },
  { value: 'triadic', label: 'Triadic' },
  { value: 'split-complementary', label: 'Split-complementary' },
  { value: 'tetradic', label: 'Tetradic' },
  { value: 'monochromatic', label: 'Monochromatic' },
];

export function ColorTheoryPage(): JSX.Element {
  const colors = useColorStore((s) => s.colors);
  const addColor = useColorStore((s) => s.addColor);
  const createCollection = useColorStore((s) => s.createCollection);
  const moveColorToCollection = useColorStore((s) => s.moveColorToCollection);

  const [base, setBase] = useState({ h: 0, s: 70, l: 50 });
  const [harmony, setHarmony] = useState<HarmonyType>('complementary');

  const palette = useMemo(() => getHarmony(harmony, base.h, base.s, base.l), [harmony, base]);

  const baseRgb = hslToRgb(base.h, base.s, base.l);
  const baseHex = rgbToHex(baseRgb.r, baseRgb.g, baseRgb.b);

  const savePalette = () => {
    const col = createCollection(`${harmonyLabel(harmony)} palette`);
    for (const c of palette) {
      const rgb = hslToRgb(c.h, c.s, c.l);
      const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
      const saved = addColor({
        hex,
        rgb,
        hsl: rgbToHsl(rgb.r, rgb.g, rgb.b),
        cmyk: rgbToCmyk(rgb.r, rgb.g, rgb.b),
        timestamp: Date.now(),
      });
      moveColorToCollection(saved.id, col.id);
    }
    showToast('Saved palette');
  };

  const pickFromCollections = (color: SavedColor) => {
    setBase(color.hsl);
  };

  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-6">
      <h1 className="text-xl font-medium">Color Theory &amp; Optimizer</h1>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-card bg-surface p-5">
          <ColorWheel value={base} onChange={setBase} markers={palette} />

          <div className="mt-4">
            <label className="text-xs text-text-secondary">Or pick from your collections:</label>
            <select
              className="mt-1 w-full rounded-button border border-border-subtle bg-bg-app px-2 py-1 text-sm"
              onChange={(e) => {
                const c = colors[e.target.value];
                if (c) pickFromCollections(c);
              }}
              value=""
            >
              <option value="">Select a saved color…</option>
              {Object.values(colors).map((c) => (
                <option key={c.id} value={c.id}>{c.hex}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-card bg-surface p-5">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-card" style={{ backgroundColor: baseHex }} />
            <div>
              <div className="text-xs text-text-secondary">Selected</div>
              <div className="font-mono text-sm">{baseHex}</div>
            </div>
          </div>

          <div className="mt-4">
            <label className="text-xs text-text-secondary">Harmony type</label>
            <select
              value={harmony}
              onChange={(e) => setHarmony(e.target.value as HarmonyType)}
              className="mt-1 w-full rounded-button border border-border-subtle bg-bg-app px-2 py-1 text-sm"
            >
              {HARMONY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="mt-4">
            <div className="mb-2 text-xs text-text-secondary">Generated palette</div>
            <HarmonyPreview colors={palette} />
          </div>

          <button
            onClick={savePalette}
            className="mt-4 w-full rounded-button bg-accent px-3 py-2 text-sm text-white hover:bg-accent-hover"
          >
            Save palette to new collection
          </button>
        </div>
      </div>

      <ContrastChecker />
    </div>
  );
}

function harmonyLabel(t: HarmonyType): string {
  return HARMONY_OPTIONS.find((o) => o.value === t)?.label ?? t;
}
