import { describe, expect, it } from 'vitest';
import { buildPanel, PAL, PIECE } from '@zellige/engine';
import { buildPanelMesh, KEY_ORDER, transferables } from './panelMesh';
import { hexToRgb, hslToRgb, pieceColours, rgbToHsl, srgbToLinear, vertexColours } from './colour';

const panel = buildPanel({ size: 7 });
const mesh = buildPanelMesh(panel.pieces);

describe('panel mesh', () => {
  it('every piece becomes a slab, in the right mesh', () => {
    expect(mesh.pieces).toBe(panel.pieces.length);
    expect(mesh.skipped).toBe(0);
    const seen = new Set<number>();
    for (const [part, gold] of [[mesh.glaze, false], [mesh.gold, true]] as const) {
      for (const id of part.pieceId) {
        seen.add(id);
        expect(panel.pieces[id].key === 'A').toBe(gold);
      }
    }
    expect(seen.size).toBe(panel.pieces.length);
  });

  it('buffers are consistent and finite', () => {
    for (const part of [mesh.glaze, mesh.gold]) {
      const n = part.position.length / 3;
      expect(part.normal.length).toBe(n * 3);
      expect(part.pieceId.length).toBe(n);
      expect(part.index.length % 3).toBe(0);
      let max = 0;
      for (const i of part.index) max = Math.max(max, i);
      expect(max).toBeLessThan(n);
      expect(part.position.every(Number.isFinite)).toBe(true);
      expect(part.normal.every(Number.isFinite)).toBe(true);
    }
    expect(mesh.vertices).toBe((mesh.glaze.position.length + mesh.gold.position.length) / 3);
  });

  it('pieces lie inside the panel, bedded in the mortar and no taller than a tall tile', () => {
    const o = panel.panel.outer;
    for (const part of [mesh.glaze, mesh.gold]) {
      for (let v = 0; v < part.position.length; v += 3) {
        expect(Math.abs(part.position[v])).toBeLessThanOrEqual(o);
        expect(Math.abs(part.position[v + 2])).toBeLessThanOrEqual(o);
        expect(part.position[v + 1]).toBeGreaterThanOrEqual(-0.06 - 1e-6);
        expect(part.position[v + 1]).toBeLessThanOrEqual(PIECE.HEIGHT * 1.12 + 1e-6);
      }
    }
  });

  it('keys match the pieces, and the same panel always looks the same', () => {
    panel.pieces.forEach((p, i) => expect(KEY_ORDER[mesh.keys[i]]).toBe(p.key));
    const again = buildPanelMesh(panel.pieces);
    expect(Array.from(again.jitter)).toEqual(Array.from(mesh.jitter));
    expect(again.glaze.position).toEqual(mesh.glaze.position);
  });

  it('faces lean a little, each piece its own way, and normals stay unit length', () => {
    for (const [part, max] of [[mesh.glaze, 0.05], [mesh.gold, 0.16]] as const) {
      const leans = new Map<number, string>();
      for (let v = 0; v < part.pieceId.length; v++) {
        const x = part.normal[v * 3], y = part.normal[v * 3 + 1], z = part.normal[v * 3 + 2];
        expect(Math.hypot(x, y, z)).toBeCloseTo(1, 5);
        // A top-face vertex: nearly straight up, off by no more than the lean.
        if (y > 0.985) {
          expect(Math.hypot(x, z) / y).toBeLessThanOrEqual(max * Math.SQRT2 + 1e-4);
          leans.set(part.pieceId[v], `${x.toFixed(4)},${z.toFixed(4)}`);
        }
      }
      expect(new Set(leans.values()).size).toBeGreaterThan(leans.size * 0.9);
    }
  });

  it('lists every buffer for transfer, once', () => {
    const t = transferables(mesh);
    expect(t.length).toBe(10);
    expect(new Set(t).size).toBe(10);
  });
});

describe('colour', () => {
  it('converts hex → HSL → RGB and back', () => {
    for (const hex of Object.values(PAL)) {
      const rgb = hexToRgb(hex);
      const back = hslToRgb(...rgbToHsl(...rgb));
      back.forEach((c, i) => expect(c).toBeCloseTo(rgb[i], 10));
    }
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(1)).toBeCloseTo(1, 12);
    expect(srgbToLinear(0.5)).toBeCloseTo(0.214041, 5);
  });

  it('each piece is its glaze, varied a little', () => {
    const cols = pieceColours(mesh.keys, mesh.jitter, PAL);
    const mean: Record<string, number[]> = {};
    panel.pieces.forEach((p, i) => {
      const m = (mean[p.key] ??= [0, 0, 0, 0]);
      m[0] += cols[i * 3]; m[1] += cols[i * 3 + 1]; m[2] += cols[i * 3 + 2]; m[3]++;
      for (let c = 0; c < 3; c++) expect(cols[i * 3 + c]).toBeGreaterThanOrEqual(0), expect(cols[i * 3 + c]).toBeLessThanOrEqual(1);
    });
    for (const [key, m] of Object.entries(mean)) {
      const want = hexToRgb(PAL[key as keyof typeof PAL]).map(srgbToLinear);
      for (let c = 0; c < 3; c++) expect(Math.abs(m[c] / m[3] - want[c])).toBeLessThan(0.03);
    }
  });

  it('changing one glaze repaints only that glaze\'s pieces', () => {
    const a = pieceColours(mesh.keys, mesh.jitter, PAL);
    const b = pieceColours(mesh.keys, mesh.jitter, { ...PAL, B: '#7a1f2b' });
    let changed = 0;
    panel.pieces.forEach((p, i) => {
      const same = a[i * 3] === b[i * 3] && a[i * 3 + 1] === b[i * 3 + 1] && a[i * 3 + 2] === b[i * 3 + 2];
      expect(same).toBe(p.key !== 'B');
      if (!same) changed++;
    });
    expect(changed).toBe(panel.stats.byKey.B);
    // Red now dominates those pieces.
    const i = panel.pieces.findIndex(p => p.key === 'B');
    expect(b[i * 3]).toBeGreaterThan(b[i * 3 + 2]);
  });

  it('vertex colours follow their piece', () => {
    const cols = pieceColours(mesh.keys, mesh.jitter, PAL);
    const vc = vertexColours(mesh.gold, cols);
    expect(vc.length).toBe(mesh.gold.position.length);
    for (let v = 0; v < mesh.gold.pieceId.length; v += 97) {
      const id = mesh.gold.pieceId[v];
      expect(vc[v * 3]).toBe(cols[id * 3]);
      expect(vc[v * 3 + 2]).toBe(cols[id * 3 + 2]);
    }
  });
});
