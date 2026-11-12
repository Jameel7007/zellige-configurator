// Draws the cut plan off the main thread. The pieces are not kept on the page (only their
// mesh is), so the panel is cut again here: the engine is deterministic, so it is the same
// panel, piece for piece, as the one on screen.

import { buildPanel, panelToDxf, panelToSvg, type MedallionId, type Palette } from '@zellige/engine';

export type PlanFormat = 'svg' | 'dxf';

export interface PlanRequest {
  format: PlanFormat;
  size: number;
  medallion: MedallionId;
  unitCm: number;
  palette: Palette;
  title: string;
}

export type PlanReply = { ok: true; text: string } | { ok: false; error: string };

self.onmessage = (e: MessageEvent<PlanRequest>) => {
  const { format, size, medallion, unitCm, palette, title } = e.data;
  let reply: PlanReply;
  try {
    const panel = buildPanel({ size, medallion });
    const opts = { outer: panel.panel.outer, unitCm };
    reply = { ok: true, text: format === 'dxf' ? panelToDxf(panel.pieces, opts) : panelToSvg(panel.pieces, { ...opts, palette, title }) };
  } catch (err) {
    reply = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  (self as unknown as { postMessage(m: PlanReply): void }).postMessage(reply);
};
