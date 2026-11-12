import { useMemo } from 'react';
import { BOM_DEFAULTS, GLAZE_NAMES, SCALES, billOfMaterials, billToCsv, type Palette } from '@zellige/engine';
import type { Config } from '../config';
import type { PanelData } from '../panel.worker';

import { cm1, int, length, m2 } from '../format';
import { saveFile } from '../plan';

interface Props {
  data: PanelData | null;
  config: Config;
  palette: Palette;
  /** The panel on screen is not yet the one the controls ask for. */
  stale: boolean;
  onScale(unitCm: number): void;
}

export function Materials({ data, config, palette, stale, onScale }: Props) {
  // The pieces are counted once per panel (in the worker). Scale only changes this arithmetic.
  const bill = useMemo(
    () => (data ? billOfMaterials(data.tally, { side: data.spec.side, unitCm: config.unitCm }) : null),
    [data, config.unitCm],
  );
  const money = useMemo(
    () => new Intl.NumberFormat('en-US', { style: 'currency', currency: bill?.cost?.currency ?? 'USD' }),
    [bill?.cost?.currency],
  );
  const spacing = data ? data.spec.period * config.unitCm : null;

  const download = () => {
    if (!bill || !data) return;
    saveFile(`zellige-${data.medallion}-size-${data.size}-materials.csv`, billToCsv(bill, GLAZE_NAMES, palette), 'text/csv;charset=utf-8');
  };

  return (
    <section className={`materials${stale ? ' is-stale' : ''}`} aria-labelledby="materials-title" aria-busy={stale || !bill}>
      <h2 id="materials-title">Materials</h2>

      <label className="scale">
        <span>Scale</span>
        <select value={config.unitCm} onChange={e => onScale(Number(e.target.value))}>
          {SCALES.map(s => (
            <option key={s} value={s}>
              Stars {cm1((data?.spec.period ?? 4.6) * s)} cm apart{s === BOM_DEFAULTS.unitCm ? ' (standard)' : ''}
            </option>
          ))}
        </select>
      </label>

      {!bill ? (
        <p className="hint">Counting tiles…</p>
      ) : (
        <>
          <dl className="facts">
            <div className="fact">
              <dt>Panel</dt>
              <dd>{length(bill.panel.sideCm)} <small>square</small></dd>
            </div>
            <div className="fact">
              <dt>Area</dt>
              <dd>{m2(bill.panel.areaM2)} <small>m²</small></dd>
            </div>
            <div className="fact">
              <dt>Pieces to cut</dt>
              <dd>{int(bill.totals.pieces)}</dd>
            </div>
            <div className="fact">
              <dt>Tiles to buy</dt>
              <dd>{int(bill.totals.sourceTiles)} <small>of {bill.assumptions.tileCm} cm</small></dd>
            </div>
          </dl>

          <div className="table-wrap">
            <table className="bill">
              <caption>By glaze</caption>
              <thead>
                <tr>
                  <th scope="col">Glaze</th>
                  <th scope="col">Pieces</th>
                  <th scope="col">Glazed m²</th>
                  <th scope="col">Tiles to buy</th>
                </tr>
              </thead>
              <tbody>
                {bill.glazes.map(g => (
                  <tr key={g.key}>
                    <th scope="row"><span className="chip" style={{ background: palette[g.key] }} aria-hidden="true" />{GLAZE_NAMES[g.key]}</th>
                    <td>{int(g.count)}</td>
                    <td>{m2(g.areaM2)}</td>
                    <td>{int(g.sourceTiles)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total</th>
                  <td>{int(bill.totals.pieces)}</td>
                  <td>{m2(bill.totals.tileAreaM2)}</td>
                  <td>{int(bill.totals.sourceTiles)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {bill.cost && (
            <div className="estimate">
              <div className="estimate-head">
                <span>Estimate</span>
                {bill.cost.sample && <span className="tag tag-sample">sample prices</span>}
              </div>
              <dl>
                <dt>Tiles</dt><dd>{money.format(bill.cost.tiles)}</dd>
                <dt>Cutting</dt><dd>{money.format(bill.cost.cutting)}</dd>
                <dt>Setting</dt><dd>{money.format(bill.cost.setting)}</dd>
                <dt className="total">Total</dt><dd className="total">{money.format(bill.cost.total)}</dd>
              </dl>
            </div>
          )}

          <div className="materials-actions">
            <p className="hint">
              Assumes {Math.round(bill.assumptions.wastage * 100)}% of each {bill.assumptions.tileCm} cm tile is lost in cutting
              {spacing ? `; pieces average ${cm1((bill.totals.tileAreaM2 * 1e4) / bill.totals.pieces)} cm²` : ''}.
            </p>
            <button type="button" onClick={download}>Download CSV</button>
          </div>
        </>
      )}
    </section>
  );
}
