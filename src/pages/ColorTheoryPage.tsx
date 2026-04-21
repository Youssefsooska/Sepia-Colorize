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
    <div className="flex-1 space-y-6 overflow-y-auto p-8">
      <header className="flex items-baseline gap-4">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-text-primary">Color Theory</h1>
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">
          harmony · contrast
        </span>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="space-y-5 rounded-card bg-surface p-6">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-accent">
              01 · Base
            </span>
            <span className="font-mono text-[11px] tracking-[0.08em] text-text-muted">
              H {base.h.toFixed(0)}° · S {base.s.toFixed(0)}% · L {base.l.toFixed(0)}%
            </span>
          </div>
          <ColorWheel value={base} onChange={setBase} markers={palette} />

          <div>
            <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
              Or pick from collections
            </label>
            <select
              className="mt-2 w-full rounded-button border border-border-subtle bg-app px-3 py-2 text-sm"
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
        </section>

        <section className="flex flex-col gap-5 rounded-card bg-surface p-6">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-accent">
              02 · Harmony
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted">
              {palette.length} colors
            </span>
          </div>

          <div className="flex items-center gap-3 rounded-card bg-app p-4">
            <div
              className="h-12 w-12 rounded-card shadow-inner"
              style={{ backgroundColor: baseHex }}
            />
            <div className="min-w-0">
              <div className="font-mono text-base font-medium tracking-[0.01em] text-text-primary">
                {baseHex}
              </div>
              <div className="font-mono text-[11px] text-text-secondary">
                rgb {baseRgb.r} {baseRgb.g} {baseRgb.b}
              </div>
            </div>
          </div>

          <div>
            <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
              Harmony type
            </label>
            <select
              value={harmony}
              onChange={(e) => setHarmony(e.target.value as HarmonyType)}
              className="mt-2 w-full rounded-button border border-border-subtle bg-app px-3 py-2 text-sm"
            >
              {HARMONY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
              Generated palette
            </div>
            <HarmonyPreview colors={palette} />
          </div>

          <button
            onClick={savePalette}
            className="mt-auto w-full rounded-button bg-accent px-3 py-2.5 text-sm font-semibold text-app hover:bg-accent-hover"
          >
            Save palette to new collection
          </button>
        </section>
      </div>

      <ContrastChecker />
    </div>
  );
}

function harmonyLabel(t: HarmonyType): string {
  return HARMONY_OPTIONS.find((o) => o.value === t)?.label ?? t;
}
