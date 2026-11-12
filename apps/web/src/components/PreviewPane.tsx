import { useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent, type Ref } from 'react';
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

  // The same moves as the mouse, for a keyboard: arrows turn, plus and minus zoom, Home puts it back.
  const onKey = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const p = preview.current;
    if (!p || e.altKey || e.ctrlKey || e.metaKey) return;
    switch (e.key) {
      case 'ArrowLeft': p.orbit(-10, 0); break;
      case 'ArrowRight': p.orbit(10, 0); break;
      case 'ArrowUp': p.orbit(0, -6); break;
      case 'ArrowDown': p.orbit(0, 6); break;
      case '+': case '=': p.zoom(0.87); break;
      case '-': case '_': p.zoom(1 / 0.87); break;
      case 'Home': case '0': p.resetView(); break;
      default: return;
    }
    e.preventDefault();
  };

  const where = view === 'studio' ? '' : ` Shown ${view === 'wall' ? 'on a wall' : 'in a floor'}, in a room paved with 60 centimetre stones.`;

  return (
    <div className="preview">
      <canvas
        ref={canvas}
        className="preview-canvas"
        tabIndex={noWebGL ? -1 : 0}
        role="application"
        aria-roledescription="3D preview"
        aria-label={data ? `Preview of the panel: ${data.pieces.toLocaleString('en')} tiles.${where}` : 'Preview of the panel'}
        aria-describedby="preview-keys"
        onKeyDown={onKey}
      />
      <p id="preview-keys" className="visually-hidden">Drag or use the arrow keys to turn it, scroll or press plus and minus to zoom, press Home to put it back.</p>
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
