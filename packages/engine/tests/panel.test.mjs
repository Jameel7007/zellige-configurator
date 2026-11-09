// Tests for the engine's public face (src/index.js): every size, medallion and palette a
// customer can choose gives a panel that is an exact partition, with no mortar holes.
//   node --test tests/panel.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPanel, panelSpec, medallionChoices, resolvePalette, checkPartition, area,
  SIZES, MEDALLIONS, PAL, GLAZE_NAMES,
} from '../src/index.js';
import { composePanel, outerPolyOf } from '../src/pattern/compose.js';
import { borderFor, buildBorder, lineCounts, BORDER, LINE_COUNTS } from '../src/pattern/border.js';
import * as moorish from '../src/pattern/rosette16/moorish.js';

// Whole panels are compared as JSON: assert.deepEqual on ten thousand pieces is slow, and when
// they differ it builds a diff that runs Node out of memory.
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const square = s => [[-s, -s], [s, -s], [s, s], [-s, s]];
const sizes = [];
for (let n = SIZES.min; n <= SIZES.max; n++) sizes.push(n);

test('default: buildPanel() is Rosette\'s panel', () => {
  const p = buildPanel();
  assert.equal(p.pieces.length, 10209);
  assert.deepEqual(p.stats.byRegion, { medallion: 2041, field: 6652, border: 1516 });
  assert.equal(p.panel.half, 46);
  assert.equal(p.panel.outer, 52);
  assert.equal(p.medallion, 'moorish');
  assert.deepEqual(p.palette, PAL);
  assert.ok(same(p.pieces, composePanel().pieces), 'the options only add to composePanel\'s defaults');
});

test('choices: two medallions are offered; polar is held back as experimental', () => {
  assert.deepEqual(medallionChoices().map(m => m.id), ['moorish', 'lee']);
  for (const m of medallionChoices()) assert.ok(m.label && m.note);
  assert.equal(MEDALLIONS.polar.experimental, true);
  assert.throws(() => buildPanel({ medallion: 'polar' }), /experimental/);
});

for (const { id } of medallionChoices()) {
  test(`partition: '${id}' tiles the panel exactly at every size, with no holes and no warnings`, t => {
    for (const size of sizes) {
      const p = buildPanel({ size, medallion: id, exact: true });
      const chk = checkPartition(p.exact, [square(p.panel.outer)]);
      const at = `${id} size ${size}`;
      assert.equal(chk.invalid.length, 0, `${at}: invalid pieces`);
      assert.equal(chk.overlaps.length, 0, `${at}: overlaps ${JSON.stringify(chk.overlaps.slice(0, 3))}`);
      assert.ok(chk.relError < 1e-9, `${at}: area error ${chk.relError}`);
      assert.equal(p.stats.drops, 0, `${at}: pieces dropped by the grout`);
      assert.deepEqual(p.stats.warnings, [], at);
      assert.equal(p.pieces.length, p.exact.length, `${at}: every exact piece became a tile`);
      for (const q of p.pieces) {
        assert.ok(q.key in PAL, `${at}: key ${q.key}`);
        assert.ok(area(q.poly) >= 0.05, `${at}: ${q.region}:${q.kind} has area ${area(q.poly)}`);
        assert.ok(q.r <= p.panel.outer * Math.SQRT2 + 1e-9, `${at}: a piece outside the panel`);
      }
      t.diagnostic(`${at}: ${p.pieces.length} pieces, ${p.stats.ms.total} ms${p.stats.ms.total > 3000 ? ' ' + JSON.stringify(p.stats.ms) : ''}`);
    }
  });
}

test('polar (experimental): the measured defect, so a fix is noticed', () => {
  const p = buildPanel({ medallion: 'polar', allowExperimental: true, exact: true });
  const chk = checkPartition(p.exact, [square(p.panel.outer)]);
  assert.equal(chk.overlaps.length, 160);
  assert.ok(chk.relError > 1e-5 && chk.relError < 1e-3, `area error ${chk.relError}`);
  assert.equal(p.stats.warnings.length, 2);
});

test('size: the spec, and what is refused', () => {
  const s = panelSpec(12);
  assert.ok(Math.abs(s.half - 12 * 4.6) < 1e-12);
  assert.equal(s.outer, s.half + 6);
  assert.equal(s.side, 2 * s.outer);
  assert.equal(s.repeats, 24);
  for (const bad of [SIZES.min - 1, SIZES.max + 1, 10.5, '10', NaN, null]) {
    assert.throws(() => panelSpec(bad), /whole number/, `size ${bad}`);
    assert.throws(() => buildPanel({ size: bad }), /whole number/);
  }
  assert.throws(() => buildPanel({ medallion: 'nope' }), /unknown medallion/);
  // A larger panel has more field and border, and the same medallion.
  const a = buildPanel({ size: 9 }), b = buildPanel({ size: 11 });
  assert.equal(a.stats.byRegion.medallion, b.stats.byRegion.medallion);
  assert.ok(a.stats.byRegion.field < b.stats.byRegion.field);
  assert.ok(a.stats.byRegion.border < b.stats.byRegion.border);
});

test('medallion: a design without outerPoly gets the same one from its pieces', () => {
  const ros = moorish.buildRosette();
  const { exact } = moorish.cutRosette(ros, { finish: false });
  assert.deepEqual(outerPolyOf(exact, ros.R_F), ros.outerPoly, 'the same points, in the same order');
  const hidden = {
    buildRosette: () => { const { outerPoly, ...rest } = moorish.buildRosette(); return rest; },
    cutRosette: moorish.cutRosette,
  };
  assert.ok(same(composePanel({ medallion: hidden }).pieces, composePanel().pieces));
});

test('medallion: lee\'s straps are laid with their ring, not first', () => {
  // The lee design gives its straps no layer; without the fallback in layingOrder all 1,440
  // would be laid before anything else.
  const p = buildPanel({ medallion: 'lee' });
  const med = p.pieces.filter(q => q.region === 'medallion');
  const first = med.slice(0, 20);
  assert.ok(first.every(q => q.rc < 6), `first pieces are at the centre (max rc ${Math.max(...first.map(q => q.rc)).toFixed(2)})`);
  const early = med.slice(0, Math.round(med.length / 10)).filter(q => q.kind === 'strap').length;
  const straps = med.filter(q => q.kind === 'strap').length;
  assert.ok(early < straps * 0.15, `${early} of ${straps} straps are in the first tenth of the order`);
});

test('border: borderFor(46) is the original border, and other sizes keep its rules', () => {
  const { counts, ...geo } = borderFor(46);
  assert.deepEqual(geo, BORDER);
  assert.equal(counts, LINE_COUNTS);
  assert.ok(same(buildBorder(borderFor(46)).pieces, buildBorder().pieces));
  for (const size of sizes) {
    const H = panelSpec(size).half, o = borderFor(H), c = lineCounts(H);
    const teeth = (2 * H) / o.period;
    assert.ok(Math.abs(teeth - Math.round(teeth)) < 1e-9, `size ${size}: a whole number of teeth`);
    assert.ok(Math.abs(o.period - 5.75) < 0.5, `size ${size}: tooth period ${o.period}`);
    for (const [e0, n] of [[H, c.lineA], [H + 4, c.lineB], [H + 5, c.edge]]) {
      const pitch = (2 * e0) / n;
      assert.ok(pitch > 1.17 && pitch < 1.31, `size ${size}: strip length ${pitch}`);
    }
    assert.equal(c.lineA % 2, 0);
    assert.equal(c.lineB % 2, 1);
    const b = buildBorder(o);
    const ring = square(H + 6).reduce(() => (2 * (H + 6)) ** 2 - (2 * H) ** 2, 0);
    const chk = checkPartition(b.pieces, ring);
    assert.equal(chk.overlaps.length, 0, `size ${size}: border overlaps`);
    assert.ok(chk.relError < 1e-9, `size ${size}: border area error ${chk.relError}`);
    for (const p of b.pieces) assert.ok(area(p.poly) <= BORDER.maxArea + 1e-9, `size ${size}: a border piece of ${area(p.poly)}`);
  }
});

test('palette: overrides replace glazes, bad input is refused, the pattern is untouched', () => {
  assert.deepEqual(resolvePalette(), PAL);
  assert.notEqual(resolvePalette(), PAL, 'a copy');
  assert.equal(resolvePalette({ B: '#7A1F2B' }).B, '#7a1f2b');
  assert.throws(() => resolvePalette({ Z: '#000000' }), /unknown glaze key/);
  for (const bad of ['red', '#fff', '7a1f2b', 5]) assert.throws(() => resolvePalette({ B: bad }), /must be a colour/);
  assert.throws(() => buildPanel({ palette: { B: 'blue' } }), /must be a colour/);
  assert.deepEqual(Object.keys(GLAZE_NAMES).sort(), Object.keys(PAL).sort());
  const a = buildPanel(), b = buildPanel({ palette: { B: '#7a1f2b' } });
  assert.ok(same(a.pieces, b.pieces));
  assert.equal(b.palette.B, '#7a1f2b');
  assert.equal(b.palette.T, PAL.T);
});

test('seed: the same seed lays the same panel; another seed changes only the hand', () => {
  const a = buildPanel({ size: 8, seed: 1 }), b = buildPanel({ size: 8, seed: 1 }), c = buildPanel({ size: 8, seed: 2 });
  assert.ok(same(a.pieces, b.pieces));
  assert.ok(!same(a.pieces, c.pieces));
  assert.deepEqual(a.stats.byKey, c.stats.byKey);
});
