import { GLAZE_NAMES, METAL, PAL, SIZES, medallionChoices, type GlazeKey, type MedallionId } from '@zellige/engine';
import { GLAZE_KEYS, fullPalette, type Config } from '../config';

const fmt = (n: number) => n.toLocaleString('en');
const MEDALLIONS = medallionChoices();

interface Props {
  config: Config;
  /** Tiles per glaze for the panel on screen, or null while the first one is being cut. */
  counts: Record<string, number> | null;
  /** The size the counts belong to (the slider can be ahead of the panel on screen). */
  shownSize: number | null;
  pieces: number | null;
  onSize(size: number): void;
  onMedallion(id: MedallionId): void;
  onGlaze(key: GlazeKey, hex: string): void;
  onResetGlazes(): void;
}

export function Controls({ config, counts, shownSize, pieces, onSize, onMedallion, onGlaze, onResetGlazes }: Props) {
  const palette = fullPalette(config);
  const changed = Object.keys(config.palette).length;
  const stars = 2 * config.size;
  const stale = shownSize !== null && shownSize !== config.size;

  return (
    <form className="controls" onSubmit={e => e.preventDefault()}>
      <fieldset className="group">
        <legend>Centrepiece</legend>
        <div className="cards">
          {MEDALLIONS.map(m => (
            <label key={m.id} className={`card${config.medallion === m.id ? ' is-selected' : ''}`}>
              <input type="radio" name="medallion" value={m.id} checked={config.medallion === m.id} onChange={() => onMedallion(m.id)} />
              <span className="card-title">{m.label}</span>
              <span className="card-note">{m.note}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="group">
        <legend>Size</legend>
        <label className="slider">
          <span className="visually-hidden">Panel size, from {SIZES.min} to {SIZES.max}</span>
          <input
            type="range" min={SIZES.min} max={SIZES.max} step={1} value={config.size}
            onChange={e => onSize(Number(e.target.value))}
            aria-valuetext={`Size ${config.size}: ${stars} stars across`}
          />
        </label>
        <p className="readout">
          <strong>{stars} × {stars} stars</strong>
          <span className={stale ? 'is-stale' : ''}>{pieces === null ? 'cutting…' : `${fmt(pieces)} tiles${stale ? ' (updating)' : ''}`}</span>
        </p>
        <p className="hint">The centrepiece stays the same size; a larger panel adds field around it.</p>
      </fieldset>

      <fieldset className="group">
        <legend>Glazes</legend>
        <ul className="glazes">
          {GLAZE_KEYS.map(key => {
            const isChanged = key in config.palette;
            return (
              <li key={key} className="glaze">
                <input
                  type="color" id={`glaze-${key}`} value={palette[key]}
                  onChange={e => onGlaze(key, e.target.value)}
                  aria-label={`${GLAZE_NAMES[key]} glaze colour`}
                />
                <label htmlFor={`glaze-${key}`} className="glaze-name">
                  {GLAZE_NAMES[key]}
                  {METAL.has(key) && <span className="tag">metallic</span>}
                  {isChanged && <span className="tag tag-changed">changed</span>}
                </label>
                <span className={`glaze-count${stale ? ' is-stale' : ''}`}>{counts ? fmt(counts[key] ?? 0) : '–'}</span>
                <button
                  type="button" className="glaze-reset" disabled={!isChanged}
                  onClick={() => onGlaze(key, PAL[key])}
                  aria-label={`Reset ${GLAZE_NAMES[key]} to its original colour`}
                  title="Reset"
                >↺</button>
              </li>
            );
          })}
        </ul>
        <div className="row">
          <span className="hint">Tiles per glaze. A colour changes the glaze, not which tiles share it.</span>
          <button type="button" className="link" disabled={!changed} onClick={onResetGlazes}>Reset all</button>
        </div>
      </fieldset>
    </form>
  );
}
