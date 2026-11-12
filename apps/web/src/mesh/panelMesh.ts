// A panel's pieces as two meshes' worth of typed arrays (glazed pieces and gold ones), plus
// the few numbers per piece the colouring needs. Nothing here touches the GPU or the DOM: it
// runs in the worker, and in Node for the tests.
//
// Colour is deliberately NOT baked in. The arrays say which piece each vertex belongs to and
// which glaze each piece is; colour.ts turns that into vertex colours for a palette. So
// changing a glaze repaints the panel without cutting it again.

import { METAL, PIECE, stream, VARIATION, type GlazeKey, type Piece } from '@zellige/engine';
import { buildSlabs, type SlabItem } from './extrude.js';

/** Order of the glaze keys in `PanelMesh.keys`. */
export const KEY_ORDER: GlazeKey[] = ['W', 'K', 'B', 'T', 'G', 'O', 'R', 'A'];

/** Hand-laid look: how much each piece's height and bedding depth vary (Rosette's ranges). */
const LOOK = { SY: [0.88, 1.12], YB: [-0.03, -0.06], BEVEL_STRAP: 0.035 } as const;

export interface MeshPart {
  position: Float32Array;
  normal: Float32Array;
  /** Per vertex: index of its piece in the panel's piece list. */
  pieceId: Float32Array;
  index: Uint32Array;
}

export interface PanelMesh {
  glaze: MeshPart;
  gold: MeshPart;
  /** Per piece: index into KEY_ORDER. */
  keys: Uint8Array;
  /** Per piece: hue, saturation and lightness offsets (sRGB HSL), three numbers each. */
  jitter: Float32Array;
  pieces: number;
  vertices: number;
  triangles: number;
  /** Pieces whose outline could not be built into a slab (expected: none). */
  skipped: number;
}

export function buildPanelMesh(pieces: Piece[], seed?: number): PanelMesh {
  const rand = stream('pieces', seed);
  const N = pieces.length;
  const keys = new Uint8Array(N), jitter = new Float32Array(N * 3);
  const sy = new Float32Array(N), yb = new Float32Array(N);
  const glazeItems: SlabItem[] = [], goldItems: SlabItem[] = [];
  const sym = (a: number) => (rand() * 2 - 1) * a;

  for (let i = 0; i < N; i++) {
    const p = pieces[i];
    const k = KEY_ORDER.indexOf(p.key);
    if (k < 0) throw new Error(`piece ${i} has an unknown glaze key '${p.key}'`);
    keys[i] = k;
    const metal = METAL.has(p.key);

    // Always the same draws in the same order, so one piece's look never depends on another's.
    sy[i] = LOOK.SY[0] + (LOOK.SY[1] - LOOK.SY[0]) * rand();
    yb[i] = LOOK.YB[0] + (LOOK.YB[1] - LOOK.YB[0]) * rand();
    const light = p.key === 'K' ? VARIATION.light.K : p.key === 'W' ? VARIATION.light.W : VARIATION.light.default;
    let dl = sym(light);
    const dh = sym(VARIATION.hue), ds = sym(VARIATION.sat);
    const kilnRoll = rand(), kilnDarker = rand() < 0.5, kilnSize = rand();
    // A rare "kiln" piece fired notably darker or lighter. Gold is not a glaze: no kiln pieces.
    if (!metal && kilnRoll < VARIATION.kiln.chance) dl += (kilnDarker ? -1 : 1) * VARIATION.kiln.light * (0.6 + 0.4 * kilnSize);
    jitter[i * 3] = dh; jitter[i * 3 + 1] = ds; jitter[i * 3 + 2] = dl;

    const item = { poly: p.poly, id: i, bevel: p.kind === 'strap' ? LOOK.BEVEL_STRAP : undefined };
    (metal ? goldItems : glazeItems).push(item);
  }

  let skipped = 0;
  const part = (items: SlabItem[]): MeshPart => {
    const s = buildSlabs(items, { height: PIECE.HEIGHT, bevel: PIECE.BEVEL });
    skipped += s.skipped.length;
    // Each piece its own height and depth in the mortar. extrude.js writes x, height, -y.
    for (let v = 0; v < s.vertices; v++) {
      const id = s.pieceId[v];
      s.position[v * 3 + 1] = s.position[v * 3 + 1] * sy[id] + yb[id];
    }
    return { position: s.position, normal: s.normal, pieceId: s.pieceId, index: s.index };
  };
  const glaze = part(glazeItems), gold = part(goldItems);

  return {
    glaze, gold, keys, jitter, pieces: N, skipped,
    vertices: (glaze.position.length + gold.position.length) / 3,
    triangles: (glaze.index.length + gold.index.length) / 3,
  };
}

/** The buffers to hand over (not copy) when the mesh crosses from the worker. */
export function transferables(m: PanelMesh): ArrayBuffer[] {
  const out: ArrayBuffer[] = [m.keys.buffer as ArrayBuffer, m.jitter.buffer as ArrayBuffer];
  for (const p of [m.glaze, m.gold]) out.push(p.position.buffer as ArrayBuffer, p.normal.buffer as ArrayBuffer, p.pieceId.buffer as ArrayBuffer, p.index.buffer as ArrayBuffer);
  return out;
}
