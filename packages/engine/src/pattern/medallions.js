// The medallion designs the composition can use, behind one contract (compose.js):
//
// A design marked `experimental` builds, but does not meet the panel's guarantees (an exact
// partition, no mortar holes, no warnings); index.js buildPanel refuses it unless asked.
//
//   buildRosette()            → ros: { R_F, sinopia: {circles, lines}, outerPoly?, R_M?, geo? }
//   cutRosette(ros, {finish}) → { exact, warnings }
//
// `exact` partitions the disk r ≤ R_F (pieces before grout: poly, key, stage, kind, layer?);
// `warnings` are {code, msg}. The three designs were written at different times with slightly
// different entry points; the adapters here are the only place that knows.

import * as moorish from './rosette16/moorish.js';
import * as lee from './rosette16/lee.js';
import * as polar from './rosette16/polar.js';

export const MEDALLIONS = {
  moorish: {
    label: 'Moorish',
    note: 'Sixteen-fold rosette with inlaid petals and bows.',
    buildRosette: moorish.buildRosette,
    cutRosette: moorish.cutRosette,
  },
  lee: {
    label: 'Nested',
    note: 'A small rosette nested in a great one, after A. J. Lee\'s construction.',
    buildRosette: lee.buildRosette,
    // lee.cutRosette always finishes its own tiles too (a few ms, unused here).
    cutRosette: ros => { const r = lee.cutRosette(ros); return { exact: r.exact, warnings: r.warnings }; },
  },
  polar: {
    label: 'Polar',
    note: 'Hankin\'s method on a polar tiling, so the stars match the field\'s.',
    // Not offered yet: its frame rings do not share one angular grid (neighbouring rings
    // disagree by a chord's sagitta) and 16 slivers have no neighbour to join, so the panel
    // is not an exact partition: 160 overlaps and an area error near 1e-4 at every size
    // (tests/panel.test.mjs keeps that measured, so a fix shows up as a failing test).
    experimental: true,
    buildRosette: polar.buildRosette,
    cutRosette: ros => {
      const r = polar.rosettePieces(ros, { finish: false });
      const warnings = [...r.arr.warnings, ...r.sw.warnings];
      if (r.dropped.length) warnings.push({ code: 'dropped', msg: `${r.dropped.length} sliver(s) had no neighbour to join` });
      return { exact: r.raw, warnings };
    },
  },
};

export const DEFAULT_MEDALLION = 'moorish';

/** A design by name, or a module with the same contract passed straight through. */
export function resolveMedallion(m = DEFAULT_MEDALLION) {
  if (typeof m !== 'string') return m;
  const d = MEDALLIONS[m];
  if (!d) throw new Error(`unknown medallion '${m}' (known: ${Object.keys(MEDALLIONS).join(', ')})`);
  return d;
}
