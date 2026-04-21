/**
 * Interactive HSL color wheel for the Color Theory page.
 *
 * Hue maps to the angle around the center, saturation to the radius. The
 * lightness is controlled with a slider beside the wheel. Click/drag anywhere
 * inside the disc to pick a base color. Optional `markers` overlay small dots
 * for the generated harmony colors so the user can see the geometric pattern.
 */
import { useEffect, useRef, useState } from 'react';
import { HSL } from '../types';
import { hslToRgb, rgbToHex } from '../utils/colorConversion';

interface ColorWheelProps {
  value: HSL;
  onChange: (next: HSL) => void;
  markers?: HSL[];
  size?: number;
}

export function ColorWheel({ value, onChange, markers = [], size = 240 }: ColorWheelProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragging, setDragging] = useState(false);

  // Paint the HSL disc once per size change.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const radius = size / 2;
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - radius;
        const dy = y - radius;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const idx = (y * size + x) * 4;
        if (dist > radius) {
          img.data[idx + 3] = 0; // transparent outside disc
          continue;
        }
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        const h = (angle + 360) % 360;
        const s = Math.min(100, (dist / radius) * 100);
        const { r, g, b } = hslToRgb(h, s, 50);
        img.data[idx + 0] = r;
        img.data[idx + 1] = g;
        img.data[idx + 2] = b;
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [size]);

  const pick = (clientX: number, clientY: number) => {
    const c = canvasRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const radius = size / 2;
    const dx = x - radius;
    const dy = y - radius;
    const dist = Math.min(radius, Math.sqrt(dx * dx + dy * dy));
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const h = (angle + 360) % 360;
    const s = Math.min(100, (dist / radius) * 100);
    onChange({ h: Math.round(h), s: Math.round(s), l: value.l });
  };

  const pointerToXY = (h: number, s: number): { x: number; y: number } => {
    const radius = size / 2;
    const r = (s / 100) * radius;
    const angle = (h * Math.PI) / 180;
    return { x: radius + r * Math.cos(angle), y: radius + r * Math.sin(angle) };
  };

  const sel = pointerToXY(value.h, value.s);

  return (
    <div className="inline-flex flex-col items-center gap-3">
      <div
        className="relative"
        style={{ width: size, height: size }}
        onMouseDown={(e) => { setDragging(true); pick(e.clientX, e.clientY); }}
        onMouseMove={(e) => { if (dragging) pick(e.clientX, e.clientY); }}
        onMouseUp={() => setDragging(false)}
        onMouseLeave={() => setDragging(false)}
      >
        <canvas ref={canvasRef} width={size} height={size} className="rounded-full" />
        {/* Markers for harmony colors */}
        {markers.map((m, i) => {
          const { x, y } = pointerToXY(m.h, m.s);
          const { r, g, b } = hslToRgb(m.h, m.s, m.l);
          return (
            <div
              key={i}
              className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
              style={{ left: x, top: y, backgroundColor: rgbToHex(r, g, b) }}
            />
          );
        })}
        {/* Main selection dot (white, thicker border) */}
        <div
          className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white ring-2 ring-black/50"
          style={{ left: sel.x, top: sel.y }}
        />
      </div>
      <div className="flex w-full items-center gap-2">
        <span className="text-xs text-text-secondary">L</span>
        <input
          type="range"
          min={0}
          max={100}
          value={value.l}
          onChange={(e) => onChange({ ...value, l: Number(e.target.value) })}
          className="flex-1 accent-accent"
        />
        <span className="w-8 text-right font-mono text-xs text-text-secondary">{value.l}</span>
      </div>
    </div>
  );
}
