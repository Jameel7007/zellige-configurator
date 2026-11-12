// Vertex colours for a palette. Kept apart from the mesh so that changing a glaze is a repaint
// (a few milliseconds), not a rebuild.
//
// Each piece's colour is its glaze, moved a little in hue, saturation and lightness (in sRGB
// HSL, so "8% lighter" means what a potter would see), then converted to linear RGB, which is
// what the renderer lights.

import type { Palette } from '@zellige/engine';
import { KEY_ORDER, type MeshPart } from './panelMesh';

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number) => {
    t = ((t % 1) + 1) % 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

export const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/** Linear RGB for every piece: three numbers each. */
export function pieceColours(keys: Uint8Array, jitter: Float32Array, palette: Palette, out: Float32Array = new Float32Array(keys.length * 3)): Float32Array {
  const base = KEY_ORDER.map(k => rgbToHsl(...hexToRgb(palette[k])));
  for (let i = 0; i < keys.length; i++) {
    const [h, s, l] = base[keys[i]];
    const rgb = hslToRgb(h + jitter[i * 3], clamp01(s + jitter[i * 3 + 1]), clamp01(l + jitter[i * 3 + 2]));
    out[i * 3] = srgbToLinear(rgb[0]);
    out[i * 3 + 1] = srgbToLinear(rgb[1]);
    out[i * 3 + 2] = srgbToLinear(rgb[2]);
  }
  return out;
}

/** Spread the piece colours over a part's vertices. */
export function vertexColours(part: MeshPart, colours: Float32Array, out: Float32Array = new Float32Array(part.pieceId.length * 3)): Float32Array {
  const ids = part.pieceId;
  for (let v = 0; v < ids.length; v++) {
    const i = ids[v] * 3;
    out[v * 3] = colours[i];
    out[v * 3 + 1] = colours[i + 1];
    out[v * 3 + 2] = colours[i + 2];
  }
  return out;
}
