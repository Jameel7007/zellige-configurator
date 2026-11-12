export type Point = [number, number];
export type Poly = Point[];
export type GlazeKey = 'W' | 'K' | 'B' | 'T' | 'G' | 'O' | 'R' | 'A';
export type Palette = Record<GlazeKey, string>;
export type MedallionId = 'moorish' | 'lee' | 'polar';

/** A finished piece: inset by half the grout and wobbled, counter-clockwise. */
export interface Piece {
  poly: Poly;
  key: GlazeKey;
  stage: string;
  kind: string;
  /** Laying order: 0, 1, 2, ... */
  seq: number;
  cx: number;
  cy: number;
  rc: number;
  r: number;
  ang: number;
  region: 'medallion' | 'field' | 'border';
}

export interface PanelSpec {
  size: number;
  period: number;
  half: number;
  outer: number;
  side: number;
  repeats: number;
}

export interface PanelStats {
  pieces: number;
  exactPieces: number;
  byKind: Record<string, number>;
  byStage: Record<string, number>;
  byRegion: Record<string, number>;
  byKey: Record<string, number>;
  area: { min: number; median: number; max: number };
  ms: Record<string, number>;
  drops: number;
  warnings: string[];
  [extra: string]: unknown;
}

export interface BuildOptions {
  size?: number;
  medallion?: MedallionId;
  palette?: Partial<Palette>;
  seed?: number;
  exact?: boolean;
  allowExperimental?: boolean;
}

export interface Panel {
  pieces: Piece[];
  sinopia: object;
  stats: PanelStats;
  panel: PanelSpec;
  medallion: MedallionId;
  palette: Palette;
  exact?: Array<{ poly: Poly; key: GlazeKey; kind: string; region: string }>;
}

export const SIZES: Readonly<{ min: number; max: number; default: number }>;
export const DEFAULT_MEDALLION: MedallionId;
export const MEDALLIONS: Record<MedallionId, { label: string; note: string; experimental?: boolean }>;
export const PAL: Palette;
export const METAL: Set<GlazeKey>;
export const GLAZE_NAMES: Record<GlazeKey, string>;

/** Per-piece glaze variation, in sRGB HSL units. */
export const VARIATION: {
  hue: number;
  sat: number;
  light: { K: number; W: number; default: number };
  kiln: { chance: number; light: number };
};
/** Slab numbers, in pattern units: grout width, bevel, height, wobble. */
export const PIECE: { GROUT: number; BEVEL: number; HEIGHT: number; WOBBLE: number };
/** A seeded random stream, independent per name. */
export function stream(name: string, seed?: number): () => number;

export function medallionChoices(): Array<{ id: MedallionId; label: string; note: string }>;
export function panelSpec(size?: number): PanelSpec;
export function buildPanel(opts?: BuildOptions): Panel;
export function resolvePalette(overrides?: Partial<Palette>): Palette;
export function area(poly: Poly): number;
export function centroid(poly: Poly): Point;
export function checkPartition(
  pieces: Array<{ poly: Poly }>,
  region: number | Poly | Poly[],
  opts?: { tol?: number },
): {
  ok: boolean;
  areaSum: number;
  regionArea: number;
  areaError: number;
  relError: number;
  overlaps: Array<{ i: number; j: number; area: number }>;
  overlapArea: number;
  invalid: number[];
};

// ---- bill of materials ------------------------------------------------------------------

export interface Tally {
  /** By glaze and shape; areas in square pattern units. */
  rows: Array<{ key: GlazeKey; kind: string; count: number; area: number }>;
  pieces: number;
  area: number;
}

export interface Prices {
  currency: string;
  sample?: boolean;
  /** Per source tile, by glaze. */
  tile: Record<GlazeKey, number>;
  cutPerPiece: number;
  setPerM2: number;
}

export interface BillOptions {
  /** The panel's side in pattern units (PanelSpec.side). */
  side: number;
  unitCm?: number;
  wastage?: number;
  tileCm?: number;
  /** null: no money. Omitted: SAMPLE_PRICES. */
  prices?: Prices | null;
}

export interface BillShape {
  kind: string;
  name: string;
  count: number;
  areaM2: number;
  avgCm2: number;
}

export interface BillGlaze {
  key: GlazeKey;
  count: number;
  areaM2: number;
  buyAreaM2: number;
  sourceTiles: number;
  tileCost?: number;
  shapes: BillShape[];
}

export interface Bill {
  panel: { sideCm: number; areaM2: number };
  assumptions: { unitCm: number; wastage: number; tileCm: number };
  glazes: BillGlaze[];
  totals: { pieces: number; tileAreaM2: number; buyAreaM2: number; sourceTiles: number; groutAreaM2: number; cover: number };
  cost: { currency: string; sample: boolean; tiles: number; cutting: number; setting: number; total: number } | null;
}

export const BOM_DEFAULTS: Readonly<{ unitCm: number; wastage: number; tileCm: number }>;
export const SCALES: readonly number[];
export const SAMPLE_PRICES: Readonly<Prices>;
export const SHAPE_NAMES: Record<string, string>;
export function tallyPieces(pieces: Array<{ poly: Poly; key: GlazeKey; kind: string }>): Tally;
export function billOfMaterials(tally: Tally, opts: BillOptions): Bill;
export function billToCsv(bill: Bill, glazeNames?: Partial<Record<GlazeKey, string>>, colours?: Partial<Record<GlazeKey, string>>): string;
