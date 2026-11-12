// Bill of materials: what a workshop has to cut, and what it has to buy, to make a panel.
//
// Two steps, kept apart on purpose:
//
//   tallyPieces(pieces)        counts and areas by glaze and shape, in pattern units. This is
//                              the only step that needs the pieces, so it runs once per panel
//                              (in the worker, beside the cutting).
//   billOfMaterials(tally, …)  turns the tally into centimetres, source tiles and money. Pure
//                              arithmetic on a few dozen rows, so the scale, the wastage and
//                              the prices can change without touching the pieces again.
//
// How the numbers are reached:
//   - A piece's area is its finished outline (after the grout inset): the glazed face that
//     has to be cut. The grout is the panel's area minus all of those.
//   - Zellige is cut by hand from square glazed tiles, and much of each tile falls away as
//     offcut. `wastage` is that loss as a share of the tile bought: buying = cut / (1 − wastage).
//   - Source tiles are whole tiles, counted per glaze and rounded up.
//
// Every default below is an assumption for a demo, not a workshop's figure. They are all
// options, and the sample prices are labelled as samples wherever they are shown.

import { area } from './pattern/geom.js';
import { PAL } from './pattern/palette.js';

/** Customer-facing names for the piece kinds. Unknown kinds fall back to the kind itself. */
export const SHAPE_NAMES = {
  strap: 'Strapwork strip', star8: 'Eight-point star', hex: 'Hexagon', pin: 'Pin', border: 'Border piece',
  band: 'Frame band', star16: 'Centre star', kite: 'Kite', petal: 'Petal', bow: 'Bow', candy: 'Lozenge',
  rim: 'Rim piece', shield: 'Shield', dart: 'Dart', arch: 'Arch', star4: 'Four-point star',
  ground: 'Ground piece', tooth: 'Tooth', knot: 'Knot',
};

/** Defaults: assumptions for the demo (see the top of this file). */
export const BOM_DEFAULTS = Object.freeze({
  unitCm: 2,        // one pattern unit; the field's star spacing is 4.6 units
  wastage: 0.3,     // share of each source tile lost as offcut
  tileCm: 10,       // side of the square glazed tile pieces are cut from
});

/** Centimetres per pattern unit the configurator offers. */
export const SCALES = Object.freeze([1.5, 2, 2.5, 3]);

/**
 * Sample prices, in US dollars. Placeholders that make the estimate add up, not quotes:
 * a workshop's own table replaces this object.
 */
export const SAMPLE_PRICES = Object.freeze({
  currency: 'USD',
  sample: true,
  /** Per source tile, by glaze. */
  tile: Object.freeze({ W: 1.1, K: 1.1, B: 1.4, T: 1.4, G: 1.4, O: 1.3, R: 1.2, A: 4.5 }),
  /** Cutting, per finished piece. */
  cutPerPiece: 0.35,
  /** Setting (laying face-down and backing), per square metre of panel. */
  setPerM2: 220,
});

/**
 * Count the pieces by glaze and shape.
 * @param {{poly: number[][], key: string, kind: string}[]} pieces  finished pieces
 * @returns {{ rows: {key: string, kind: string, count: number, area: number}[], pieces: number, area: number }}
 *   areas in square pattern units; rows sorted by glaze (palette order), then by area, largest first
 */
export function tallyPieces(pieces) {
  const map = new Map();
  let total = 0;
  for (const p of pieces) {
    const a = area(p.poly), id = `${p.key}:${p.kind}`;
    let row = map.get(id);
    if (!row) map.set(id, row = { key: p.key, kind: p.kind, count: 0, area: 0 });
    row.count++;
    row.area += a;
    total += a;
  }
  const order = Object.keys(PAL);
  const rows = [...map.values()].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key) || b.area - a.area || a.kind.localeCompare(b.kind));
  return { rows, pieces: pieces.length, area: total };
}

const round2 = x => Math.round(x * 100) / 100;

/**
 * @param {ReturnType<typeof tallyPieces>} tally
 * @param {object} opts
 * @param {number} opts.side              the panel's side, in pattern units (panelSpec().side)
 * @param {number} [opts.unitCm=2]        centimetres per pattern unit
 * @param {number} [opts.wastage=0.3]     share of each source tile lost, 0 ≤ wastage < 1
 * @param {number} [opts.tileCm=10]       side of the square source tile
 * @param {typeof SAMPLE_PRICES | null} [opts.prices=SAMPLE_PRICES]  null: no money columns
 * @returns the bill: `panel`, one entry per glaze in `glazes` (each with its `shapes`), and `totals`.
 *   Areas in square metres, lengths in centimetres, money rounded to cents.
 */
export function billOfMaterials(tally, opts) {
  const { side, unitCm = BOM_DEFAULTS.unitCm, wastage = BOM_DEFAULTS.wastage, tileCm = BOM_DEFAULTS.tileCm } = opts ?? {};
  const prices = opts?.prices === undefined ? SAMPLE_PRICES : opts.prices;
  if (!(side > 0)) throw new Error('billOfMaterials: side (the panel side in pattern units) is required');
  if (!(unitCm > 0)) throw new Error('billOfMaterials: unitCm must be positive');
  if (!(wastage >= 0 && wastage < 1)) throw new Error('billOfMaterials: wastage is a share from 0 up to (not including) 1');
  if (!(tileCm > 0)) throw new Error('billOfMaterials: tileCm must be positive');

  const m2PerUnit2 = (unitCm / 100) ** 2;
  const tileM2 = (tileCm / 100) ** 2;
  const sideCm = side * unitCm;
  const panelM2 = (sideCm / 100) ** 2;

  const glazes = [];
  for (const row of tally.rows) {
    let g = glazes[glazes.length - 1];
    if (!g || g.key !== row.key) glazes.push(g = { key: row.key, count: 0, areaM2: 0, shapes: [] });
    const areaM2 = row.area * m2PerUnit2;
    g.count += row.count;
    g.areaM2 += areaM2;
    g.shapes.push({ kind: row.kind, name: SHAPE_NAMES[row.kind] ?? row.kind, count: row.count, areaM2, avgCm2: (row.area / row.count) * unitCm * unitCm });
  }

  const totals = { pieces: 0, tileAreaM2: 0, buyAreaM2: 0, sourceTiles: 0 };
  for (const g of glazes) {
    g.buyAreaM2 = g.areaM2 / (1 - wastage);
    // A hair of tolerance so 12.000000001 tiles is 12, not 13.
    g.sourceTiles = Math.ceil(g.buyAreaM2 / tileM2 - 1e-9);
    if (prices) g.tileCost = round2(g.sourceTiles * (prices.tile[g.key] ?? 0));
    totals.pieces += g.count;
    totals.tileAreaM2 += g.areaM2;
    totals.buyAreaM2 += g.buyAreaM2;
    totals.sourceTiles += g.sourceTiles;
  }
  totals.groutAreaM2 = Math.max(0, panelM2 - totals.tileAreaM2);
  totals.cover = totals.tileAreaM2 / panelM2;

  let cost = null;
  if (prices) {
    const tiles = round2(glazes.reduce((s, g) => s + g.tileCost, 0));
    const cutting = round2(totals.pieces * prices.cutPerPiece);
    const setting = round2(panelM2 * prices.setPerM2);
    cost = { currency: prices.currency, sample: !!prices.sample, tiles, cutting, setting, total: round2(tiles + cutting + setting) };
  }

  return {
    panel: { sideCm, areaM2: panelM2 },
    assumptions: { unitCm, wastage, tileCm },
    glazes, totals, cost,
  };
}

/** One CSV field: quoted when it holds a comma, a quote or a line break. */
const csvField = v => { const s = String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/**
 * The bill as CSV: one line per glaze and shape, for a spreadsheet or a workshop's own system.
 * @param {ReturnType<typeof billOfMaterials>} bill
 * @param {Record<string, string>} [glazeNames]  key → name (palette.js GLAZE_NAMES)
 * @param {Record<string, string>} [colours]     key → '#rrggbb', the customer's palette
 */
export function billToCsv(bill, glazeNames = {}, colours = {}) {
  const lines = [['Glaze', 'Colour', 'Shape', 'Pieces', 'Area (m2)', 'Average piece (cm2)'].join(',')];
  for (const g of bill.glazes) {
    for (const s of g.shapes) {
      lines.push([glazeNames[g.key] ?? g.key, colours[g.key] ?? '', s.name, s.count, s.areaM2.toFixed(4), s.avgCm2.toFixed(2)].map(csvField).join(','));
    }
  }
  return lines.join('\r\n') + '\r\n';
}
