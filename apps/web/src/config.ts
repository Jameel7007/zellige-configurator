// What the customer has chosen, and how it travels in a link.
//
//   ?size=12&medallion=lee&scale=2.5&B=7a1f2b
//
// Only what differs from the default is written, so the plain address is the default panel.
// Anything a link gets wrong (a size out of range, a medallion that does not exist, a colour
// that is not a colour) is dropped: a bad link opens the nearest valid panel, never an error.

import { SIZES, PAL, DEFAULT_MEDALLION, BOM_DEFAULTS, SCALES, medallionChoices, type GlazeKey, type MedallionId, type Palette } from '@zellige/engine';

export interface Config {
  size: number;
  medallion: MedallionId;
  /** Centimetres per pattern unit: one of SCALES. */
  unitCm: number;
  /** Only the glazes the customer changed. */
  palette: Partial<Palette>;
}

export const GLAZE_KEYS = Object.keys(PAL) as GlazeKey[];

export const DEFAULT_CONFIG: Config = Object.freeze({ size: SIZES.default, medallion: DEFAULT_MEDALLION, unitCm: BOM_DEFAULTS.unitCm, palette: {} });

const HEX = /^#?([0-9a-f]{6})$/i;

/** '#7A1F2B' or '7a1f2b' → '#7a1f2b'; anything else → null. */
export function normaliseHex(value: string | null | undefined): string | null {
  const m = HEX.exec(value ?? '');
  return m ? `#${m[1].toLowerCase()}` : null;
}

export function parseConfig(search: string): Config {
  const q = new URLSearchParams(search);
  const offered = medallionChoices().map(m => m.id);

  const rawSize = q.get('size');
  const n = rawSize !== null && /^\d+$/.test(rawSize) ? Number(rawSize) : NaN;
  const size = Number.isInteger(n) ? Math.min(SIZES.max, Math.max(SIZES.min, n)) : SIZES.default;

  const m = q.get('medallion') as MedallionId | null;
  const medallion = m && offered.includes(m) ? m : DEFAULT_MEDALLION;

  // Only the scales on offer: the text must be exactly how one of them is written.
  const unitCm = SCALES.find(s => String(s) === q.get('scale')) ?? BOM_DEFAULTS.unitCm;

  const palette: Partial<Palette> = {};
  for (const key of GLAZE_KEYS) {
    const hex = normaliseHex(q.get(key));
    if (hex && hex !== PAL[key]) palette[key] = hex;
  }
  return { size, medallion, unitCm, palette };
}

/** The query string for a config, without the '?': '' for the default panel. */
export function serialiseConfig(c: Config): string {
  const q = new URLSearchParams();
  if (c.size !== SIZES.default) q.set('size', String(c.size));
  if (c.medallion !== DEFAULT_MEDALLION) q.set('medallion', c.medallion);
  if (c.unitCm !== BOM_DEFAULTS.unitCm && SCALES.includes(c.unitCm)) q.set('scale', String(c.unitCm));
  for (const key of GLAZE_KEYS) {
    const hex = normaliseHex(c.palette[key]);
    if (hex && hex !== PAL[key]) q.set(key, hex.slice(1));
  }
  return q.toString();
}

/** The full palette: the defaults with the customer's changes on top. */
export function fullPalette(c: Config): Palette {
  const out = { ...PAL };
  for (const key of GLAZE_KEYS) {
    const hex = normaliseHex(c.palette[key]);
    if (hex) out[key] = hex;
  }
  return out;
}

/** Set one glaze; setting it back to its default removes the override. */
export function withGlaze(c: Config, key: GlazeKey, hex: string): Config {
  const palette = { ...c.palette };
  const clean = normaliseHex(hex);
  if (!clean || clean === PAL[key]) delete palette[key];
  else palette[key] = clean;
  return { ...c, palette };
}
