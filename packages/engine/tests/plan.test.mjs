// Tests for the cut plan (src/plan.js).
//   node --test tests/plan.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPanel, panelToSvg, panelToDxf, area, GLAZE_NAMES } from '../src/index.js';

const panel = buildPanel();
const { pieces } = panel, outer = panel.panel.outer;
const vertices = pieces.reduce((s, p) => s + p.poly.length, 0);
const count = (text, re) => (text.match(re) ?? []).length;

/** Read a DXF back: group code / value pairs, then the polylines by layer. */
function readDxf(text) {
  const lines = text.split('\r\n');
  assert.equal(lines.pop(), '', 'ends with a line break');
  assert.equal(lines.length % 2, 0, 'code and value lines come in pairs');
  const pairs = [];
  for (let i = 0; i < lines.length; i += 2) {
    assert.match(lines[i], /^\d+$/, `line ${i + 1} is a group code`);
    pairs.push([Number(lines[i]), lines[i + 1]]);
  }
  const polys = [];
  let cur = null, inEntities = false;
  for (let i = 0; i < pairs.length; i++) {
    const [code, value] = pairs[i];
    if (code === 2 && value === 'ENTITIES') inEntities = true;
    if (!inEntities || code !== 0) continue;
    if (value === 'POLYLINE') {
      cur = { layer: pairs[i + 1][1], closed: pairs[i + 3][1] === '1', pts: [] };
    } else if (value === 'VERTEX') {
      assert.deepEqual([pairs[i + 2][0], pairs[i + 3][0]], [10, 20]);
      cur.pts.push([Number(pairs[i + 2][1]), Number(pairs[i + 3][1])]);
    } else if (value === 'SEQEND') { polys.push(cur); cur = null; }
  }
  return { pairs, polys };
}

test('svg: every piece is drawn once, at real size', () => {
  const svg = panelToSvg(pieces, { outer, unitCm: 2 });
  assert.equal(count(svg, /M\d/g), pieces.length);
  assert.equal(count(svg, /Z(?=[M"])/g), pieces.length);
  // 104 units across at 2 cm a unit is 2.08 m.
  assert.match(svg, /<svg [^>]*width="2080mm" height="2080mm" viewBox="0 0 2080 2080"/);
  assert.equal(count(svg, /<g id="/g), Object.keys(panel.stats.byKey).length);
  assert.ok(svg.includes(`<g id="LAPIS_BLUE" fill="${panel.palette.B}">`));
  // Every coordinate is inside the panel.
  for (const m of svg.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)) {
    assert.ok(+m[1] >= 0 && +m[1] <= 2080 && +m[2] >= 0 && +m[2] <= 2080, m[0]);
  }
});

test('svg: follows the scale and the customer\'s colours, and escapes its title', () => {
  const svg = panelToSvg(pieces, { outer, unitCm: 3, palette: { B: '#7a1f2b' }, title: 'A & B <panel>' });
  assert.match(svg, /width="3120mm"/);
  assert.ok(svg.includes('<g id="LAPIS_BLUE" fill="#7a1f2b">'));
  assert.ok(svg.includes('<title>A &amp; B &lt;panel&gt;</title>'));
});

test('dxf: one closed polyline per piece, on its glaze\'s layer, in millimetres', () => {
  const { pairs, polys } = readDxf(panelToDxf(pieces, { outer, unitCm: 2 }));
  assert.deepEqual(pairs.at(-1), [0, 'EOF']);
  assert.equal(count(pairs.map(p => p.join(':')).join('\n'), /^0:SECTION$/gm), 3);
  assert.equal(count(pairs.map(p => p.join(':')).join('\n'), /^0:ENDSEC$/gm), 3);

  const edge = polys.shift();
  assert.equal(edge.layer, 'PANEL_EDGE');
  assert.deepEqual(edge.pts, [[0, 0], [2080, 0], [2080, 2080], [0, 2080]]);

  assert.equal(polys.length, pieces.length);
  assert.equal(polys.reduce((s, p) => s + p.pts.length, 0), vertices);
  assert.ok(polys.every(p => p.closed));
  const byLayer = {};
  for (const p of polys) byLayer[p.layer] = (byLayer[p.layer] ?? 0) + 1;
  const want = {};
  for (const [key, n] of Object.entries(panel.stats.byKey)) want[GLAZE_NAMES[key].toUpperCase().replace(/[^A-Z0-9]+/g, '_')] = n;
  assert.deepEqual(byLayer, want);

  // Every layer used is declared, and every point is inside the panel.
  const declared = new Set();
  for (let i = 0; i < pairs.length; i++) if (pairs[i][0] === 0 && pairs[i][1] === 'LAYER') declared.add(pairs[i + 1][1]);
  for (const layer of Object.keys(byLayer)) assert.ok(declared.has(layer), layer);
  for (const p of polys) for (const [x, y] of p.pts) assert.ok(x >= 0 && x <= 2080 && y >= 0 && y <= 2080);

  // The drawing is the pieces: the areas agree (to the 1/100 mm rounding), and y is up, so
  // the outlines are still counter-clockwise.
  const total = pieces.reduce((s, p) => s + area(p.poly), 0) * 400;   // square millimetres
  const drawn = polys.reduce((s, p) => s + area(p.pts), 0);
  assert.ok(Math.abs(drawn - total) / total < 1e-4, `${drawn} vs ${total}`);
  assert.ok(polys.every(p => area(p.pts) > 0));
});

test('plan: bad input is refused with a message', () => {
  assert.throws(() => panelToSvg(pieces, {}), /outer/);
  assert.throws(() => panelToDxf(pieces, { outer, unitCm: 0 }), /unitCm/);
  assert.throws(() => panelToDxf(null, { outer }), /array/);
});
