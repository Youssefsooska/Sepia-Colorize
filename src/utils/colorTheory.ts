/**
 * Color-theory primitives for Sepia's Color Theory page.
 *
 * Given a base HSL color, produce the harmony palette the designer wants
 * (complementary, analogous, etc.). Also includes WCAG pass/fail helpers.
 * All hue math wraps positively via mod-360 so negative hues are valid input.
 */
import { HSL, HarmonyType } from '../types';

const wrapHue = (h: number): number => ((h % 360) + 360) % 360;
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

const mk = (h: number, s: number, l: number): HSL => ({
  h: wrapHue(h),
  s: clamp(Math.round(s), 0, 100),
  l: clamp(Math.round(l), 0, 100),
});

export function getComplementary(h: number, s: number, l: number): HSL[] {
  return [mk(h, s, l), mk(h + 180, s, l)];
}

export function getAnalogous(h: number, s: number, l: number): HSL[] {
  return [mk(h, s, l), mk(h - 30, s, l), mk(h + 30, s, l)];
}

export function getTriadic(h: number, s: number, l: number): HSL[] {
  return [mk(h, s, l), mk(h + 120, s, l), mk(h + 240, s, l)];
}

export function getSplitComplementary(h: number, s: number, l: number): HSL[] {
  return [mk(h, s, l), mk(h + 150, s, l), mk(h + 210, s, l)];
}

export function getTetradic(h: number, s: number, l: number): HSL[] {
  return [mk(h, s, l), mk(h + 90, s, l), mk(h + 180, s, l), mk(h + 270, s, l)];
}

/** Monochromatic: same hue/sat, 5 lightness steps clamped to [5,95]. */
export function getMonochromatic(h: number, s: number, l: number): HSL[] {
  const offsets = [-30, -15, 0, 15, 30];
  return offsets.map((o) => mk(h, s, clamp(l + o, 5, 95)));
}

/** Dispatcher used by the Color Theory page and export UI. */
export function getHarmony(type: HarmonyType, h: number, s: number, l: number): HSL[] {
  switch (type) {
    case 'complementary': return getComplementary(h, s, l);
    case 'analogous': return getAnalogous(h, s, l);
    case 'triadic': return getTriadic(h, s, l);
    case 'split-complementary': return getSplitComplementary(h, s, l);
    case 'tetradic': return getTetradic(h, s, l);
    case 'monochromatic': return getMonochromatic(h, s, l);
  }
}

// --- WCAG thresholds -------------------------------------------------------
// Large text = 18pt regular or 14pt bold (WCAG 2.1 definition).

export const meetsWCAG_AA = (ratio: number, isLargeText: boolean): boolean =>
  isLargeText ? ratio >= 3.0 : ratio >= 4.5;

export const meetsWCAG_AAA = (ratio: number, isLargeText: boolean): boolean =>
  isLargeText ? ratio >= 4.5 : ratio >= 7.0;
