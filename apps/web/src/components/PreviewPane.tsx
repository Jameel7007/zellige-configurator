import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import type { Palette } from '@zellige/engine';
import { Preview } from '../preview/Preview';
import type { PanelData } from '../panel.worker';
import type { LightId, SettingId } from '../preview/settings';

export interface PreviewHandle {
  resetView(): void;
}

interface Props {
  data: PanelData | null;
  palette: Palette;
  view: SettingId;
  light: LightId;
  /** Sun angle the customer chose, or null for the light's own. */
  sun: number | null;
  unitCm: number;
  /** Pixels at the top of the preview covered by controls. */
  topInset: number;
  busy: boolean;
  error: string | null;
  ref?: Ref<PreviewHandle>;
}

export function PreviewPane({ data, palette, view, light, sun, unitCm, topInset, busy, error, ref }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const preview = useRef<Preview | null>(null);
  const [noWebGL, setNoWebGL] = useState(false);

  useEffect(() => {
    let p: Preview;
    try {
      p = new Preview(canvas.current!);
    } catch {
      setNoWebGL(true);
      return;
    }
    preview.current = p;
    return () => { p.dispose(); preview.current = null; };
  }, []);

  // Palette first, so a new panel is painted as it arrives rather than a frame later.
  useEffect(() => { preview.current?.setPalette(palette); }, [palette]);
  useEffect(() => { preview.current?.setTopInset(topInset); }, [topInset]);
  useEffect(() => { preview.current?.setLight(light); }, [light]);
  useEffect(() => { preview.current?.setSun(sun); }, [sun]);
  useEffect(() => { preview.current?.setRoom(view, unitCm); }, [view, unitCm]);
  useEffect(() => { if (data) preview.current?.setPanel(data.mesh, data.spec.outer); }, [data]);

  useImperativeHandle(ref, () => ({ resetView: () => preview.current?.resetView() }), []);

  return (
    <div className="preview">
      <canvas
        ref={canvas}
        className="preview-canvas"
        role="img"
        aria-label={data ? `Three-dimensional preview of the panel: ${data.pieces.toLocaleString('en')} tiles. ${view === 'studio' ? '' : ` Shown ${view === 'wall' ? 'on a wall' : 'in a floor'} beside a figure 1.7 metres tall.`} Drag to turn, scroll to zoom.` : 'Three-dimensional preview of the panel'}
      />
      {noWebGL && (
        <p className="preview-note" role="alert">
          This browser cannot show the 3D preview (WebGL is unavailable). The tile counts on this page are still correct.
        </p>
      )}
      {error && !noWebGL && (
        <p className="preview-note" role="alert">The panel could not be cut: {error}</p>
      )}
      <p className={`preview-status${busy && !error ? ' is-on' : ''}`} role="status" aria-live="polite">
        {busy && !error ? 'Cutting tiles…' : ''}
      </p>
    </div>
  );
}
