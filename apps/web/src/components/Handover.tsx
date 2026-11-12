// What the customer takes away: the spec sheet, the cut plan for the workshop, and a quote request.

import { useId, useMemo, useState } from 'react';
import { billOfMaterials, type Palette } from '@zellige/engine';
import type { Config } from '../config';
import type { PanelData } from '../panel.worker';
import { cutPlan, saveFile } from '../plan';
import type { PlanFormat } from '../plan.worker';
import { QUOTE_ADDRESS, quoteMailto } from '../quote';

interface Props {
  data: PanelData | null;
  config: Config;
  palette: Palette;
  /** The panel on screen is not yet the one the controls ask for. */
  stale: boolean;
  onSheet(): void;
}

const TYPES: Record<PlanFormat, { label: string; mime: string }> = {
  svg: { label: 'SVG', mime: 'image/svg+xml' },
  dxf: { label: 'DXF', mime: 'application/dxf' },
};

export function Handover({ data, config, palette, stale, onSheet }: Props) {
  const [drawing, setDrawing] = useState<PlanFormat | null>(null);
  const [status, setStatus] = useState('');
  const [quoting, setQuoting] = useState(false);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const id = useId();
  const ready = !!data && !stale;
  const bill = useMemo(
    () => (data ? billOfMaterials(data.tally, { side: data.spec.side, unitCm: config.unitCm }) : null),
    [data, config.unitCm],
  );

  const plan = async (format: PlanFormat) => {
    if (!data || drawing) return;
    setDrawing(format);
    setStatus(`Drawing the ${TYPES[format].label} cut plan…`);
    try {
      const text = await cutPlan({ format, size: data.size, medallion: data.medallion, unitCm: config.unitCm, palette, title: `Zellige panel, size ${data.size}` });
      saveFile(`zellige-${data.medallion}-size-${data.size}-cut-plan-mm.${format}`, text, TYPES[format].mime);
      setStatus(`${TYPES[format].label} cut plan saved: ${data.pieces.toLocaleString('en')} pieces, in millimetres.`);
    } catch (err) {
      setStatus(`The cut plan could not be drawn: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDrawing(null);
    }
  };

  const mailto = bill ? quoteMailto(config, bill, palette, window.location.href, { name, notes }) : '';

  return (
    <section className="handover" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Take it to a workshop</h2>
      <div className="handover-actions">
        <button type="button" className="primary" disabled={!ready} onClick={onSheet}>Spec sheet</button>
        <button type="button" disabled={!ready || !!drawing} onClick={() => plan('svg')}>Cut plan (SVG)</button>
        <button type="button" disabled={!ready || !!drawing} onClick={() => plan('dxf')}>Cut plan (DXF)</button>
      </div>
      <p className="hint">The cut plan is every piece's outline at real size, a layer per glaze. SVG opens in any drawing program; DXF is for CAD and cutting software.</p>
      <p className="copy-status" role="status" aria-live="polite">{status}</p>

      {!quoting ? (
        <button type="button" disabled={!ready} onClick={() => setQuoting(true)}>Request a quote</button>
      ) : (
        <form className="quote" onSubmit={e => { e.preventDefault(); if (mailto) window.location.href = mailto; }}>
          <label htmlFor={`${id}-name`}>Your name</label>
          <input id={`${id}-name`} type="text" autoComplete="name" value={name} onChange={e => setName(e.target.value)} required autoFocus />
          <label htmlFor={`${id}-notes`}>Anything the workshop should know <small>(optional)</small></label>
          <textarea id={`${id}-notes`} rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Where it is going, when you need it" />
          <div className="quote-actions">
            <button type="submit" className="primary" disabled={!ready}>Write the email</button>
            <button type="button" onClick={() => setQuoting(false)}>Cancel</button>
          </div>
          <p className="hint">
            This opens your own email program with the design written out, for you to read and send. Nothing is sent from this page.
            Demo: the address ({QUOTE_ADDRESS}) is a placeholder.
          </p>
        </form>
      )}
    </section>
  );
}
