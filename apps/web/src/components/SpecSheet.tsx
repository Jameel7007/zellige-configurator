// The spec sheet: one page that says what the panel is, for printing or saving as a PDF
// (the browser's own Print dialog does both). It lies over the configurator; when printed,
// only the sheet is on the paper.

import { useEffect, useMemo, useRef, useState } from 'react';
import { GLAZE_NAMES, MEDALLIONS, METAL, billOfMaterials, type Palette } from '@zellige/engine';
import type { Config } from '../config';
import type { PanelData } from '../panel.worker';
import { cutPlan } from '../plan';
import { cm1, int, length, m2, money } from '../format';

interface Props {
  data: PanelData;
  config: Config;
  palette: Palette;
  onClose(): void;
}

export function SpecSheet({ data, config, palette, onClose }: Props) {
  const bill = useMemo(() => billOfMaterials(data.tally, { side: data.spec.side, unitCm: config.unitCm }), [data, config.unitCm]);
  const [drawing, setDrawing] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);
  const link = window.location.href;
  const today = useMemo(() => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), []);

  // The drawing is the cut plan itself, so the sheet shows exactly what the workshop gets.
  useEffect(() => {
    let url = '', gone = false;
    cutPlan({ format: 'svg', size: data.size, medallion: data.medallion, unitCm: config.unitCm, palette, title: 'Panel drawing' }).then(
      svg => {
        if (gone) return;
        url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
        setDrawing(url);
      },
      () => { if (!gone) setFailed(true); },
    );
    return () => { gone = true; if (url) URL.revokeObjectURL(url); };
  }, [data, config.unitCm, palette]);

  useEffect(() => {
    // The sheet itself takes the focus (Print is not ready until the drawing is), so Tab starts at its buttons.
    sheet.current?.focus();
    document.documentElement.classList.add('sheet-open');
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.documentElement.classList.remove('sheet-open');
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="sheet" ref={sheet} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <div className="sheet-bar">
        <button type="button" className="primary" disabled={!drawing && !failed} onClick={() => window.print()}>Print or save as PDF</button>
        <button type="button" onClick={onClose}>Close</button>
        <span className="hint" role="status">{!drawing && !failed ? 'Drawing the panel…' : 'In the print dialog, choose “Save as PDF” to keep a file.'}</span>
      </div>

      <article className="sheet-page">
        <header className="sheet-head">
          <div>
            <h1 id="sheet-title">Zellige panel specification</h1>
            <p>{MEDALLIONS[config.medallion].label} centrepiece, {length(bill.panel.sideCm)} square</p>
          </div>
          <p className="sheet-date">{today}<br /><span className="tag tag-sample">demo</span></p>
        </header>

        <div className="sheet-top">
          <figure className="sheet-drawing">
            {drawing ? <img src={drawing} alt={`Drawing of the panel: ${int(data.pieces)} pieces`} />
              : <div className="sheet-drawing-wait">{failed ? 'The drawing could not be made.' : 'Drawing the panel…'}</div>}
            <figcaption>Every piece as it will be cut. {length(bill.panel.sideCm)} across.</figcaption>
          </figure>

          <dl className="sheet-facts">
            <dt>Panel</dt><dd>{length(bill.panel.sideCm)} × {length(bill.panel.sideCm)}</dd>
            <dt>Area</dt><dd>{m2(bill.panel.areaM2)} m²</dd>
            <dt>Centrepiece</dt><dd>{MEDALLIONS[config.medallion].label}</dd>
            <dt>Field</dt><dd>{2 * data.size} × {2 * data.size} stars, {cm1(data.spec.period * config.unitCm)} cm apart</dd>
            <dt>Pieces to cut</dt><dd>{int(bill.totals.pieces)}</dd>
            <dt>Tiles to buy</dt><dd>{int(bill.totals.sourceTiles)} of {bill.assumptions.tileCm} cm</dd>
            <dt>Glazed face</dt><dd>{m2(bill.totals.tileAreaM2)} m² ({Math.round(bill.totals.cover * 100)}% of the panel; the rest is grout)</dd>
          </dl>
        </div>

        <table className="bill sheet-table">
          <caption>Glazes</caption>
          <thead>
            <tr><th scope="col">Glaze</th><th scope="col">Colour</th><th scope="col">Pieces</th><th scope="col">Glazed m²</th><th scope="col">Tiles to buy</th></tr>
          </thead>
          <tbody>
            {bill.glazes.map(g => (
              <tr key={g.key}>
                <th scope="row"><span className="chip" style={{ background: palette[g.key] }} aria-hidden="true" />{GLAZE_NAMES[g.key]}{METAL.has(g.key) ? ' (metallic)' : ''}</th>
                <td className="mono">{palette[g.key]}</td>
                <td>{int(g.count)}</td>
                <td>{m2(g.areaM2)}</td>
                <td>{int(g.sourceTiles)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><th scope="row">Total</th><td /><td>{int(bill.totals.pieces)}</td><td>{m2(bill.totals.tileAreaM2)}</td><td>{int(bill.totals.sourceTiles)}</td></tr>
          </tfoot>
        </table>

        {bill.cost && (
          <section className="sheet-estimate">
            <h2>Estimate {bill.cost.sample && <span className="tag tag-sample">sample prices</span>}</h2>
            <dl>
              <dt>Tiles</dt><dd>{money(bill.cost.tiles, bill.cost.currency)}</dd>
              <dt>Cutting</dt><dd>{money(bill.cost.cutting, bill.cost.currency)}</dd>
              <dt>Setting</dt><dd>{money(bill.cost.setting, bill.cost.currency)}</dd>
              <dt className="total">Total</dt><dd className="total">{money(bill.cost.total, bill.cost.currency)}</dd>
            </dl>
          </section>
        )}

        <footer className="sheet-foot">
          <p>
            Assumptions: one pattern unit is {bill.assumptions.unitCm} cm; pieces are cut from {bill.assumptions.tileCm} cm tiles;
            {' '}{Math.round(bill.assumptions.wastage * 100)}% of each tile is lost in cutting.
            {bill.cost?.sample ? ' The prices are samples for this demo, not a quote.' : ''}
          </p>
          <p>This design: <a href={link}>{link}</a></p>
        </footer>
      </article>
    </div>
  );
}
