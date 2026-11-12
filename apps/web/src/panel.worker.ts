// Cuts a panel off the main thread: the pattern (engine), then the slabs (mesh). Half a second
// to a couple of seconds of work that would otherwise freeze the page on every size change.

import { buildPanel, type MedallionId, type PanelSpec } from '@zellige/engine';
import { buildPanelMesh, transferables, type PanelMesh } from './mesh/panelMesh';

export interface BuildRequest {
  id: number;
  size: number;
  medallion: MedallionId;
}

export interface PanelData {
  size: number;
  medallion: MedallionId;
  spec: PanelSpec;
  mesh: PanelMesh;
  /** Tiles per glaze key. */
  byKey: Record<string, number>;
  pieces: number;
  ms: number;
}

export type BuildReply =
  | { id: number; ok: true; data: PanelData }
  | { id: number; ok: false; error: string };

const post = (reply: BuildReply, transfer: Transferable[] = []) =>
  (self as unknown as { postMessage(m: BuildReply, t: Transferable[]): void }).postMessage(reply, transfer);

self.onmessage = (e: MessageEvent<BuildRequest>) => {
  const { id, size, medallion } = e.data;
  try {
    const t0 = performance.now();
    const panel = buildPanel({ size, medallion });
    const mesh = buildPanelMesh(panel.pieces);
    const data: PanelData = {
      size, medallion, spec: panel.panel, mesh,
      byKey: panel.stats.byKey, pieces: panel.pieces.length,
      ms: Math.round(performance.now() - t0),
    };
    post({ id, ok: true, data }, transferables(mesh));
  } catch (err) {
    post({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
