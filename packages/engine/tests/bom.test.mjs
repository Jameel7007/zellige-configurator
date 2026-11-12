// Tests for the bill of materials (src/bom.js).
//   node --test tests/bom.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPanel, medallionChoices, tallyPieces, billOfMaterials, billToCsv, area,
  BOM_DEFAULTS, SCALES, SAMPLE_PRICES, SHAPE_NAMES, GLAZE_NAMES, PAL,
} from '../src/index.js';

const panel = buildPanel();
const tally = tallyPieces(panel.pieces);
const side = panel.panel.side;
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

test('tally: every piece is counted once, and the areas add up', () => {
  assert.equal(tally.pieces, 10209);
  assert.equal(tally.rows.reduce((s, r) => s + r.count, 0), 10209);
  const total = panel.pieces.reduce((s, p) => s + area(p.poly), 0);
  assert.ok(near(tally.area, total));
  assert.ok(near(tally.rows.reduce((s, r) => s + r.area, 0), total));
  const byKey = {};
  for (const r of tally.rows) byKey[r.key] = (byKey[r.key] ?? 0) + r.count;
  assert.deepEqual(byKey, panel.stats.byKey);
});

test('tally: rows are grouped by glaze in palette order, largest area first, with no repeats', () => {
  const order = Object.keys(PAL);
  const seen = new Set();
  tally.rows.forEach((r, i) => {
    const id = `${r.key}:${r.kind}`;
    assert.ok(!seen.has(id), `duplicate row ${id}`);
    seen.add(id);
    const prev = tally.rows[i - 1];
    if (!prev) return;
    assert.ok(order.indexOf(prev.key) <= order.indexOf(r.key));
    if (prev.key === r.key) assert.ok(prev.area >= r.area);
  });
});

test('names: every shape either centrepiece can produce has a customer-facing name', () => {
  for (const { id } of medallionChoices()) {
    for (const r of tallyPieces(buildPanel({ medallion: id, size: 7 }).pieces).rows) {
      assert.ok(SHAPE_NAMES[r.kind], `${id}: no name for '${r.kind}'`);
    }
  }
});

test('bill: the default panel at 2 cm per unit, worked by hand', () => {
  const bill = billOfMaterials(tally, { side });
  assert.deepEqual(bill.assumptions, { unitCm: 2, wastage: 0.3, tileCm: 10 });
  // 104 units × 2 cm = 208 cm; 2.08 m squared = 4.3264 m².
  assert.equal(bill.panel.sideCm, 208);
  assert.ok(near(bill.panel.areaM2, 4.3264));
  // A square unit is 4 cm² = 0.0004 m².
  assert.ok(near(bill.totals.tileAreaM2, tally.area * 0.0004));
  assert.ok(near(bill.totals.groutAreaM2 + bill.totals.tileAreaM2, bill.panel.areaM2));
  assert.ok(bill.totals.cover > 0.7 && bill.totals.cover < 0.8, `cover ${bill.totals.cover}`);
  assert.equal(bill.totals.pieces, 10209);
  assert.equal(bill.glazes.length, 8);
  for (const g of bill.glazes) {
    assert.equal(g.count, panel.stats.byKey[g.key]);
    assert.ok(near(g.buyAreaM2, g.areaM2 / 0.7), 'buying = cut / (1 - wastage)');
    // A source tile is 0.01 m²: whole tiles, rounded up, never short.
    assert.equal(g.sourceTiles, Math.ceil(g.buyAreaM2 / 0.01 - 1e-9));
    assert.ok(g.sourceTiles * 0.01 >= g.buyAreaM2 - 1e-9);
    assert.ok(near(g.shapes.reduce((s, x) => s + x.areaM2, 0), g.areaM2));
    assert.equal(g.shapes.reduce((s, x) => s + x.count, 0), g.count);
  }
  assert.equal(bill.totals.sourceTiles, bill.glazes.reduce((s, g) => s + g.sourceTiles, 0));
});

test('bill: scale changes lengths linearly and areas by its square; counts do not move', () => {
  const a = billOfMaterials(tally, { side, unitCm: 2 }), b = billOfMaterials(tally, { side, unitCm: 3 });
  assert.ok(near(b.panel.sideCm / a.panel.sideCm, 1.5));
  assert.ok(near(b.panel.areaM2 / a.panel.areaM2, 2.25));
  assert.ok(near(b.totals.tileAreaM2 / a.totals.tileAreaM2, 2.25));
  assert.equal(b.totals.pieces, a.totals.pieces);
  assert.ok(near(b.totals.cover, a.totals.cover));
  assert.ok(b.totals.sourceTiles > a.totals.sourceTiles);
  for (const s of SCALES) assert.ok(billOfMaterials(tally, { side, unitCm: s }).panel.sideCm > 0);
  assert.ok(SCALES.includes(BOM_DEFAULTS.unitCm));
});

test('bill: wastage only changes what is bought', () => {
  const none = billOfMaterials(tally, { side, wastage: 0 }), half = billOfMaterials(tally, { side, wastage: 0.5 });
  assert.ok(near(none.totals.buyAreaM2, none.totals.tileAreaM2));
  assert.ok(near(half.totals.buyAreaM2, 2 * half.totals.tileAreaM2));
  assert.ok(near(half.totals.tileAreaM2, none.totals.tileAreaM2));
});

test('bill: source tiles round up, and an exact fit is not rounded past', () => {
  // 3 pieces of 100 square units at 1 cm per unit = 300 cm² = exactly 3 tiles with no wastage.
  const exact = { rows: [{ key: 'B', kind: 'hex', count: 3, area: 300 }], pieces: 3, area: 300 };
  assert.equal(billOfMaterials(exact, { side: 100, unitCm: 1, wastage: 0 }).glazes[0].sourceTiles, 3);
  const over = { rows: [{ key: 'B', kind: 'hex', count: 3, area: 300.5 }], pieces: 3, area: 300.5 };
  assert.equal(billOfMaterials(over, { side: 100, unitCm: 1, wastage: 0 }).glazes[0].sourceTiles, 4);
});

test('cost: tiles + cutting + setting, to the cent, and labelled as a sample', () => {
  const bill = billOfMaterials(tally, { side });
  const c = bill.cost;
  assert.equal(c.currency, 'USD');
  assert.equal(c.sample, true);
  const tiles = bill.glazes.reduce((s, g) => s + g.sourceTiles * SAMPLE_PRICES.tile[g.key], 0);
  assert.ok(Math.abs(c.tiles - tiles) < 0.05);
  assert.equal(c.cutting, Math.round(10209 * SAMPLE_PRICES.cutPerPiece * 100) / 100);
  assert.equal(c.setting, Math.round(4.3264 * SAMPLE_PRICES.setPerM2 * 100) / 100);
  assert.equal(c.total, Math.round((c.tiles + c.cutting + c.setting) * 100) / 100);
  for (const v of [c.tiles, c.cutting, c.setting, c.total]) assert.equal(Math.round(v * 100) / 100, v, 'whole cents');
  // A workshop's own table, and no table at all.
  const own = billOfMaterials(tally, { side, prices: { currency: 'EUR', tile: { ...SAMPLE_PRICES.tile, A: 10 }, cutPerPiece: 0, setPerM2: 0 } });
  assert.equal(own.cost.currency, 'EUR');
  assert.equal(own.cost.sample, false);
  assert.equal(own.cost.total, own.cost.tiles);
  assert.ok(own.cost.tiles > c.tiles);
  const bare = billOfMaterials(tally, { side, prices: null });
  assert.equal(bare.cost, null);
  assert.equal(bare.glazes[0].tileCost, undefined);
});

test('bill: bad options are refused', () => {
  assert.throws(() => billOfMaterials(tally, {}), /side/);
  assert.throws(() => billOfMaterials(tally), /side/);
  assert.throws(() => billOfMaterials(tally, { side, unitCm: 0 }), /unitCm/);
  for (const w of [-0.1, 1, 1.5, NaN]) assert.throws(() => billOfMaterials(tally, { side, wastage: w }), /wastage/);
  assert.throws(() => billOfMaterials(tally, { side, tileCm: -1 }), /tileCm/);
});

test('csv: one line per glaze and shape, with fields quoted when they need it', () => {
  const bill = billOfMaterials(tally, { side });
  const csv = billToCsv(bill, GLAZE_NAMES, PAL);
  const lines = csv.trimEnd().split('\r\n');
  assert.equal(lines[0], 'Glaze,Colour,Shape,Pieces,Area (m2),Average piece (cm2)');
  assert.equal(lines.length - 1, tally.rows.length);
  assert.ok(csv.endsWith('\r\n'));
  let pieces = 0;
  for (const line of lines.slice(1)) {
    const f = line.split(',');
    assert.equal(f.length, 6, line);
    assert.match(f[1], /^#[0-9a-f]{6}$/);
    pieces += Number(f[3]);
  }
  assert.equal(pieces, 10209);
  const odd = billToCsv({ glazes: [{ key: 'B', shapes: [{ name: 'Star, "big"', count: 1, areaM2: 0.5, avgCm2: 2 }] }] }, { B: 'Blue' });
  assert.equal(odd.split('\r\n')[1], 'Blue,,"Star, ""big""",1,0.5000,2.00');
});
