export interface SlabItem {
  poly: number[][];
  id: number;
  pivot?: number[];
  bevel?: number;
}
export interface Slabs {
  position: Float32Array;
  normal: Float32Array;
  /** Per vertex: the `id` of the item it belongs to. */
  pieceId: Float32Array;
  index: Uint32Array;
  lodIndex: Uint32Array;
  vertices: number;
  triangles: number;
  lodTriangles: number;
  pieces: number;
  skipped: number[];
  reducedBevel: number;
  maxReach: number;
}
export function buildSlabs(items: SlabItem[], opts: { height: number; bevel: number; segments?: number }): Slabs;
