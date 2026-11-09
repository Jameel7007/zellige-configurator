// Glaze palette. Keys are shared by the pattern (which piece is which colour) and the
// renderer (what that colour looks like). Values are sRGB hex, as a potter would name them.
export const PAL = {
  W: '#e4d9c2', // cream / white glaze
  K: '#1f1a19', // manganese black
  B: '#1a3473', // lapis blue
  T: '#1b716e', // turquoise
  G: '#29583f', // green
  O: '#a8721f', // ochre (honey: darker than the gold, so the metal reads as metal; the prototype's was #b98128)
  R: '#8e3f2b', // terracotta
  A: '#d3a64e', // gold (rendered metallic)
};

/**
 * The prototype's palette, frozen: the ?legacy=1 build (legacy/tiles.js) is a faithful
 * reference of the prototype's picture, so it keeps these even when PAL above is retuned.
 */
export const PROTOTYPE_PAL = Object.freeze({
  W: '#e4d9c2', K: '#1f1a19', B: '#1a3473', T: '#1b716e',
  G: '#29583f', O: '#b98128', R: '#8e3f2b', A: '#d3a64e',
});

/** Keys rendered with the metallic material. */
export const METAL = new Set(['A']);

/**
 * Per-piece glaze variation, in sRGB HSL units. Real zellige varies strongly tile to tile,
 * most of all in the greens and blues; a few "kiln" pieces come out notably darker or lighter.
 */
export const VARIATION = {
  hue: 0.008,
  sat: 0.06,
  light: { K: 0.035, W: 0.045, default: 0.08 },
  kiln: { chance: 0.02, light: 0.14 },
};

/** What a customer calls each key. */
export const GLAZE_NAMES = {
  W: 'Cream', K: 'Black', B: 'Lapis blue', T: 'Turquoise', G: 'Green', O: 'Ochre', R: 'Terracotta', A: 'Gold',
};

/**
 * The palette with some glazes replaced: { B: '#7a1f2b' } lays every lapis piece in that red.
 * The pattern decides which pieces share a glaze (the keys); this decides what each glaze is.
 * @param {Partial<Record<keyof typeof PAL, string>>} [overrides]  sRGB hex, '#rrggbb'
 * @returns {Record<keyof typeof PAL, string>}
 */
export function resolvePalette(overrides = {}) {
  const out = { ...PAL };
  for (const [key, hex] of Object.entries(overrides ?? {})) {
    if (!(key in PAL)) throw new Error(`resolvePalette: unknown glaze key '${key}' (known: ${Object.keys(PAL).join(', ')})`);
    if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`resolvePalette: '${key}' must be a colour like '#1a3473', got ${JSON.stringify(hex)}`);
    out[key] = hex.toLowerCase();
  }
  return out;
}
