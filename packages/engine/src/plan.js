// The cut plan: every piece's outline at real size, as a drawing a workshop can open.
//
//   panelToSvg(pieces, …)   a picture: pieces filled with their glaze on the mortar, one group
//                           per glaze. Real size (its width and height are in millimetres), so
//                           it prints to scale and opens in any vector program.
//   panelToDxf(pieces, …)   the same outlines for CAD and cutting software: one closed polyline
//                           per piece, one layer per glaze, in millimetres.
//
// Both put the origin at the panel's bottom-left corner with x to the right. DXF has y up;
// SVG has y down, so the SVG is the same drawing flipped to read the right way up.
//
// The outlines are the finished pieces (after the grout inset), the same ones the bill of
// materials measures: what is drawn is what is counted.

import { PAL, GLAZE_NAMES } from './pattern/palette.js';

const MORTAR = '#b9ad98';

/** AutoCAD colour index per glaze: the nearest of the standard colours, so layers can be told apart. */
const ACI = { W: 7, K: 8, B: 5, T: 4, G: 3, O: 30, R: 1, A: 2 };

/** 'Lapis blue' → 'LAPIS_BLUE': layer names CAD programs accept. */
const layerName = s => String(s).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');

/** Millimetres with at most two decimals and no trailing zeros: 1/100 mm is finer than any cut. */
const mm = v => { const s = (Math.round(v * 100) / 100).toFixed(2); return s.replace(/\.?0+$/, '') || '0'; };

const xmlText = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function check(pieces, opts, who) {
  if (!Array.isArray(pieces)) throw new Error(`${who}: pieces must be an array`);
  if (!(opts?.outer > 0)) throw new Error(`${who}: outer (the panel's half-width in pattern units, panel.outer) is required`);
  const unitCm = opts.unitCm ?? 2;
  if (!(unitCm > 0)) throw new Error(`${who}: unitCm must be positive`);
  return { outer: opts.outer, k: unitCm * 10 };   // k: millimetres per pattern unit
}

/** Pieces grouped by glaze, in palette order; unknown keys last. */
function byGlaze(pieces) {
  const groups = new Map(Object.keys(PAL).map(k => [k, []]));
  for (const p of pieces) {
    if (!groups.has(p.key)) groups.set(p.key, []);
    groups.get(p.key).push(p);
  }
  return [...groups].filter(([, list]) => list.length);
}

/**
 * @param {{poly: number[][], key: string}[]} pieces  finished pieces
 * @param {object} opts
 * @param {number} opts.outer            the panel's half-width with its border, in pattern units
 * @param {number} [opts.unitCm=2]       centimetres per pattern unit
 * @param {Record<string,string>} [opts.palette]  key → '#rrggbb'; defaults to the engine's
 * @param {string} [opts.title]
 * @returns {string} an SVG document
 */
export function panelToSvg(pieces, opts) {
  const { outer, k } = check(pieces, opts, 'panelToSvg');
  const palette = { ...PAL, ...(opts.palette ?? {}) };
  const side = mm(2 * outer * k);
  const X = x => mm((x + outer) * k), Y = y => mm((outer - y) * k);
  const groups = byGlaze(pieces).map(([key, list]) => {
    const d = list.map(p => 'M' + p.poly.map(([x, y]) => `${X(x)} ${Y(y)}`).join('L') + 'Z').join('');
    return `<g id="${layerName(GLAZE_NAMES[key] ?? key)}" fill="${xmlText(palette[key] ?? '#888888')}"><path d="${d}"/></g>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${side}mm" height="${side}mm" viewBox="0 0 ${side} ${side}">
<title>${xmlText(opts.title ?? 'Zellige panel cut plan')}</title>
<desc>${pieces.length} pieces. Drawn at real size: one drawing unit is one millimetre.</desc>
<rect id="MORTAR" width="${side}" height="${side}" fill="${MORTAR}"/>
${groups.join('\n')}
</svg>
`;
}

/**
 * @param {{poly: number[][], key: string}[]} pieces  finished pieces
 * @param {object} opts
 * @param {number} opts.outer        the panel's half-width with its border, in pattern units
 * @param {number} [opts.unitCm=2]   centimetres per pattern unit
 * @returns {string} an ASCII DXF (the R12 dialect, which every CAD and cutting program reads):
 *   a layer per glaze plus PANEL_EDGE for the panel's square; millimetres; CRLF line ends
 */
export function panelToDxf(pieces, opts) {
  const { outer, k } = check(pieces, opts, 'panelToDxf');
  const side = mm(2 * outer * k);
  const groups = byGlaze(pieces).map(([key, list]) => ({ layer: layerName(GLAZE_NAMES[key] ?? key), colour: ACI[key] ?? 7, list }));
  const layers = [{ layer: 'PANEL_EDGE', colour: 7 }, ...groups];
  const out = [];
  const add = (...pairs) => { for (let i = 0; i < pairs.length; i += 2) out.push(String(pairs[i]), String(pairs[i + 1])); };

  add(999, `Zellige panel cut plan. Units: millimetres. ${pieces.length} pieces.`);
  add(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009');
  add(9, '$EXTMIN', 10, 0, 20, 0, 9, '$EXTMAX', 10, side, 20, side, 0, 'ENDSEC');

  add(0, 'SECTION', 2, 'TABLES');
  add(0, 'TABLE', 2, 'LTYPE', 70, 1, 0, 'LTYPE', 2, 'CONTINUOUS', 70, 0, 3, 'Solid line', 72, 65, 73, 0, 40, 0, 0, 'ENDTAB');
  add(0, 'TABLE', 2, 'LAYER', 70, layers.length);
  for (const l of layers) add(0, 'LAYER', 2, l.layer, 70, 0, 62, l.colour, 6, 'CONTINUOUS');
  add(0, 'ENDTAB', 0, 'ENDSEC');

  add(0, 'SECTION', 2, 'ENTITIES');
  const polyline = (layer, pts) => {
    add(0, 'POLYLINE', 8, layer, 66, 1, 70, 1);          // 70 = 1: closed
    for (const [x, y] of pts) add(0, 'VERTEX', 8, layer, 10, x, 20, y);
    add(0, 'SEQEND', 8, layer);
  };
  polyline('PANEL_EDGE', [[0, 0], [side, 0], [side, side], [0, side]]);
  for (const g of groups) for (const p of g.list) polyline(g.layer, p.poly.map(([x, y]) => [mm((x + outer) * k), mm((y + outer) * k)]));
  add(0, 'ENDSEC', 0, 'EOF');
  return out.join('\r\n') + '\r\n';
}
