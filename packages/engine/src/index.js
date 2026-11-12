// The engine's public face: one call that turns a customer's choices into a panel of exact cut
// pieces. Pure JavaScript (no renderer, no DOM): runs in Node, in a worker, or in a page.
//
//   buildPanel({ size: 12, medallion: 'lee', palette: { B: '#7a1f2b' } })
//
// Everything under src/pattern/ is Rosette in Tesserae's pattern pipeline
// (github.com/Jameel7007/rosette), with the panel size, the medallion and the palette made
// parameters. With no options the result is Rosette's panel, piece for piece.

import { composePanel } from './pattern/compose.js';
import { MEDALLIONS, DEFAULT_MEDALLION } from './pattern/medallions.js';
import { resolvePalette } from './pattern/palette.js';
import { FIELD, MEDALLION } from './config.js';

export { MEDALLIONS, DEFAULT_MEDALLION } from './pattern/medallions.js';
export { PAL, METAL, GLAZE_NAMES, VARIATION, resolvePalette } from './pattern/palette.js';
export { PIECE } from './config.js';
export { stream } from './util/rand.js';
export { checkPartition } from './pattern/cut.js';
export { area, centroid } from './pattern/geom.js';

/** Width of the border around the field, in pattern units. */
const BORDER_WIDTH = 6;

/**
 * Panel sizes. A size is the field's half-width in field periods (one period is one
 * eight-point star and its strapwork, 4.6 units), so the panel edge always falls on a mirror
 * line of the field and no star is cut off-centre. 7 is the smallest field that clears the
 * medallion (radius 29.5 against a half-width of 32.2); 16 is about 26,000 pieces and one
 * second to build, a practical ceiling for a live preview. 10 is Rosette's panel.
 */
export const SIZES = Object.freeze({ min: 7, max: 16, default: 10 });

/** The medallions buildPanel offers: [{ id, label, note }]. */
export const medallionChoices = () =>
  Object.entries(MEDALLIONS).filter(([, m]) => !m.experimental).map(([id, m]) => ({ id, label: m.label, note: m.note }));

/**
 * The outline of a panel of a given size, without building it.
 * @param {number} [size=SIZES.default]
 * @returns {{ size: number, period: number, half: number, outer: number, side: number, repeats: number }}
 *   in pattern units: `half` the field's half-width, `outer` the panel's (with the border),
 *   `side` the full side length, `repeats` eight-point stars along one side of the field
 */
export function panelSpec(size = SIZES.default) {
  if (!Number.isInteger(size) || size < SIZES.min || size > SIZES.max) {
    throw new Error(`size must be a whole number from ${SIZES.min} to ${SIZES.max}, got ${JSON.stringify(size)}`);
  }
  const half = size * FIELD.P;
  if (!(half > MEDALLION.R_F_MAX)) throw new Error(`size ${size} does not clear the medallion`);
  return { size, period: FIELD.P, half, outer: half + BORDER_WIDTH, side: 2 * (half + BORDER_WIDTH), repeats: 2 * size };
}

/**
 * Build a panel.
 *
 * @param {object} [opts]
 * @param {number} [opts.size=10]             see SIZES
 * @param {string} [opts.medallion='moorish'] an id from medallionChoices()
 * @param {Record<string, string>} [opts.palette]  glaze overrides by key (resolvePalette)
 * @param {number} [opts.seed]                seeds the laying order's jitter and the hand-cut wobble
 * @param {boolean} [opts.exact=false]        also return the pieces before grout (for checks)
 * @param {boolean} [opts.allowExperimental=false]  accept a medallion marked experimental
 * @returns {{
 *   pieces: import('./pattern/compose.js').Piece[], sinopia: object, stats: object,
 *   panel: ReturnType<typeof panelSpec>, medallion: string, palette: Record<string, string>,
 *   exact?: object[],
 * }}
 */
export function buildPanel(opts = {}) {
  const { size = SIZES.default, medallion = DEFAULT_MEDALLION, palette, seed, exact = false, allowExperimental = false } = opts;
  const spec = panelSpec(size);
  const design = MEDALLIONS[medallion];
  if (!design) throw new Error(`unknown medallion ${JSON.stringify(medallion)} (known: ${medallionChoices().map(m => m.id).join(', ')})`);
  if (design.experimental && !allowExperimental) throw new Error(`medallion '${medallion}' is experimental: it does not tile the panel exactly yet`);
  const colours = resolvePalette(palette);   // before the build, so a bad colour fails fast
  const res = composePanel({ medallion, half: spec.half, seed, exact });
  const out = { pieces: res.pieces, sinopia: res.sinopia, stats: res.stats, panel: spec, medallion, palette: colours };
  if (exact) out.exact = res.exact;
  return out;
}
