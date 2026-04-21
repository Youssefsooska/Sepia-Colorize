/**
 * Color-space conversions and WCAG luminance/contrast helpers for Sepia.
 *
 * Pure functions with no side effects — safe to call from both the Electron
 * main process and the React renderer. Every output is clamped and rounded
 * to a sensible precision so UI labels and export files look consistent.
 */
import { RGB, HSL, CMYK } from '../types';

// Clamp a number to [min, max] — used everywhere to defend against drift.
const clamp = (n: number, min: number, max: number): number =>
  Math.min(Math.max(n, min), max);

/** Parse "#RGB", "#RRGGBB", or "RRGGBB" into an {r,g,b} integer triple. */
export function hexToRgb(hex: string): RGB {
  const cleaned = hex.trim().replace(/^#/, '');
  let full = cleaned;
  if (cleaned.length === 3) {
    // Expand shorthand: "abc" -> "aabbcc"
    full = cleaned.split('').map((c) => c + c).join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Invalid hex color: "${hex}"`);
  }
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** Format an integer RGB triple as "#RRGGBB" uppercase. */
export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Standard RGB→HSL conversion. Output: h in [0,360], s/l in [0,100]. */
export function rgbToHsl(r: number, g: number, b: number): HSL {
  const rN = r / 255;
  const gN = g / 255;
  const bN = b / 255;
  const max = Math.max(rN, gN, bN);
  const min = Math.min(rN, gN, bN);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rN: h = ((gN - bN) / d + (gN < bN ? 6 : 0)); break;
      case gN: h = ((bN - rN) / d + 2); break;
      case bN: h = ((rN - gN) / d + 4); break;
    }
    h *= 60;
  }
  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/** HSL→RGB with the same reference formula used everywhere in color math. */
export function hslToRgb(h: number, s: number, l: number): RGB {
  const hN = ((h % 360) + 360) % 360 / 360;
  const sN = clamp(s, 0, 100) / 100;
  const lN = clamp(l, 0, 100) / 100;
  if (sN === 0) {
    const v = Math.round(lN * 255);
    return { r: v, g: v, b: v };
  }
  const q = lN < 0.5 ? lN * (1 + sN) : lN + sN - lN * sN;
  const p = 2 * lN - q;
  const hue2rgb = (t: number): number => {
    let tN = t;
    if (tN < 0) tN += 1;
    if (tN > 1) tN -= 1;
    if (tN < 1 / 6) return p + (q - p) * 6 * tN;
    if (tN < 1 / 2) return q;
    if (tN < 2 / 3) return p + (q - p) * (2 / 3 - tN) * 6;
    return p;
  };
  return {
    r: Math.round(hue2rgb(hN + 1 / 3) * 255),
    g: Math.round(hue2rgb(hN) * 255),
    b: Math.round(hue2rgb(hN - 1 / 3) * 255),
  };
}

/** RGB→CMYK using the naive (non-ICC-profiled) formula. Output 0..100. */
export function rgbToCmyk(r: number, g: number, b: number): CMYK {
  const rN = r / 255;
  const gN = g / 255;
  const bN = b / 255;
  const k = 1 - Math.max(rN, gN, bN);
  if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
  const c = (1 - rN - k) / (1 - k);
  const m = (1 - gN - k) / (1 - k);
  const y = (1 - bN - k) / (1 - k);
  return {
    c: Math.round(c * 100),
    m: Math.round(m * 100),
    y: Math.round(y * 100),
    k: Math.round(k * 100),
  };
}

/** CMYK→RGB inverse of the above. */
export function cmykToRgb(c: number, m: number, y: number, k: number): RGB {
  const cN = clamp(c, 0, 100) / 100;
  const mN = clamp(m, 0, 100) / 100;
  const yN = clamp(y, 0, 100) / 100;
  const kN = clamp(k, 0, 100) / 100;
  return {
    r: Math.round(255 * (1 - cN) * (1 - kN)),
    g: Math.round(255 * (1 - mN) * (1 - kN)),
    b: Math.round(255 * (1 - yN) * (1 - kN)),
  };
}

/** WCAG relative luminance with sRGB gamma expansion. Input 0..255. */
export function getLuminance(r: number, g: number, b: number): number {
  const toLinear = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG contrast ratio. Returns a value in [1, 21]. */
export function getContrastRatio(hex1: string, hex2: string): number {
  const c1 = hexToRgb(hex1);
  const c2 = hexToRgb(hex2);
  const l1 = getLuminance(c1.r, c1.g, c1.b);
  const l2 = getLuminance(c2.r, c2.g, c2.b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// --- Format helpers used by the UI (card labels, modals, etc.) ------------

export function formatRgb({ r, g, b }: RGB): string {
  return `rgb(${r}, ${g}, ${b})`;
}

export function formatHsl({ h, s, l }: HSL): string {
  return `hsl(${h}, ${s}%, ${l}%)`;
}

export function formatCmyk({ c, m, y, k }: CMYK): string {
  return `cmyk(${c}%, ${m}%, ${y}%, ${k}%)`;
}
