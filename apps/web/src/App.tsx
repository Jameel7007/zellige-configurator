import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GlazeKey, MedallionId } from '@zellige/engine';
import { DEFAULT_CONFIG, fullPalette, parseConfig, serialiseConfig, withGlaze, withSun, type Config } from './config';
import { usePanel } from './usePanel';
import { Controls } from './components/Controls';
import { Materials } from './components/Materials';
import { Handover } from './components/Handover';
import { SpecSheet } from './components/SpecSheet';
import { PreviewPane, type PreviewHandle } from './components/PreviewPane';
import { LIGHTS, LIGHT_IDS, SETTINGS, SETTING_IDS, SUN, type LightId, type SettingId } from './preview/settings';

type Copied = 'idle' | 'copied' | 'failed';

/** A row of radio buttons drawn as one control. Arrow keys move between the options. */
function Segmented<T extends string>({ label, name, value, options, onChange }: {
  label: string; name: string; value: T; options: { id: T; label: string }[]; onChange(id: T): void;
}) {
  return (
    <fieldset className="segmented">
      <legend>{label}</legend>
      {options.map(o => (
        <label key={o.id} className={o.id === value ? 'is-selected' : ''}>
          <input type="radio" name={name} value={o.id} checked={o.id === value} onChange={() => onChange(o.id)} />
          <span>{o.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function App() {
  const [config, setConfig] = useState<Config>(() => parseConfig(window.location.search));
  const panel = usePanel(config.size, config.medallion);
  const palette = useMemo(() => fullPalette(config), [config]);
  const preview = useRef<PreviewHandle>(null);
  const [copied, setCopied] = useState<Copied>('idle');
  const [sheet, setSheet] = useState(false);
  // The button that opened the sheet gets the focus back when it closes. It is noted here, at
  // the click: once the sheet is up the page behind is inert and nothing in it has the focus.
  const sheetOpener = useRef<HTMLElement | null>(null);
  const openSheet = useCallback(() => { sheetOpener.current = document.activeElement as HTMLElement | null; setSheet(true); }, []);
  const closeSheet = useCallback(() => { setSheet(false); window.setTimeout(() => sheetOpener.current?.focus(), 0); }, []);

  // The Sun slider sits with the buttons under the preview, not up here: a third row on a phone
  // covered the panel. The View and Light controls lie over the top of the preview (one row on a desktop, two on
  // a phone). The preview is told how tall they are so it frames the panel clear of them.
  const stageTop = useRef<HTMLDivElement>(null);
  const [topInset, setTopInset] = useState(0);
  useEffect(() => {
    const el = stageTop.current;
    if (!el) return;
    const measure = () => setTopInset(el.offsetTop + el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The address always describes the panel on screen, so it can be copied at any moment.
  // replaceState, not pushState: dragging the slider must not fill the Back button's history.
  const query = serialiseConfig(config);
  useEffect(() => {
    const url = window.location.pathname + (query ? `?${query}` : '') + window.location.hash;
    if (url !== window.location.pathname + window.location.search + window.location.hash) window.history.replaceState(null, '', url);
  }, [query]);

  useEffect(() => {
    if (copied === 'idle') return;
    const t = window.setTimeout(() => setCopied('idle'), 2500);
    return () => window.clearTimeout(t);
  }, [copied]);

  const onSize = useCallback((size: number) => setConfig(c => ({ ...c, size })), []);
  const onScale = useCallback((unitCm: number) => setConfig(c => ({ ...c, unitCm })), []);
  const onView = useCallback((view: SettingId) => setConfig(c => ({ ...c, view })), []);
  // A sun the customer has placed stays put when the light changes; one they have not follows the light.
  const onLight = useCallback((light: LightId) => setConfig(c => ({ ...c, light, sun: withSun(light, c.sun) })), []);
  const onSun = useCallback((sun: number | null) => setConfig(c => ({ ...c, sun: withSun(c.light, sun) })), []);
  const onMedallion = useCallback((medallion: MedallionId) => setConfig(c => ({ ...c, medallion })), []);
  const onGlaze = useCallback((key: GlazeKey, hex: string) => setConfig(c => withGlaze(c, key, hex)), []);
  const onResetGlazes = useCallback(() => setConfig(c => ({ ...c, palette: {} })), []);

  const copyLink = async () => {
    const href = window.location.href;
    try {
      await navigator.clipboard.writeText(href);
      setCopied('copied');
    } catch {
      // The clipboard API is refused in some embedded views and on plain http. The older
      // select-and-copy still works there; if that fails too, say so and point at the address bar.
      const field = document.createElement('textarea');
      field.value = href;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      field.remove();
      setCopied(ok ? 'copied' : 'failed');
    }
  };

  const isDefault = query === '';
  const sunAt = config.sun ?? LIGHTS[config.light].azimuth;
  const data = panel.data;

  const stale = !!data && (data.size !== config.size || data.medallion !== config.medallion);
  const showSheet = sheet && !!data && !stale;

  return (
    <>
    <div className="app" inert={showSheet}>
      <main className="stage">
        <PreviewPane ref={preview} data={data} palette={palette} view={config.view} light={config.light} sun={config.sun} unitCm={config.unitCm} topInset={topInset} busy={panel.status === 'building'} error={panel.error} />
        <div className="stage-top" ref={stageTop}>
          <Segmented label="View" name="view" value={config.view} options={SETTING_IDS.map(id => ({ id, label: SETTINGS[id].label }))} onChange={onView} />
          <Segmented label="Light" name="light" value={config.light} options={LIGHT_IDS.map(id => ({ id, label: LIGHTS[id].label }))} onChange={onLight} />
        </div>
        <div className="stage-actions">
          <button type="button" onClick={() => preview.current?.resetView()}>Reset view</button>
          <div className="sun" role="group" aria-label="Sun position">
            <label htmlFor="sun">Sun</label>
            <input
              id="sun" type="range" min={SUN.min} max={SUN.max} step={SUN.step} value={sunAt}
              onChange={e => onSun(Number(e.target.value))}
              aria-valuetext={sunAt === 0 ? 'Straight in front' : `${Math.abs(sunAt)} degrees to the ${sunAt < 0 ? 'left' : 'right'}`}
            />
            <button type="button" className="sun-reset" disabled={config.sun === null} onClick={() => onSun(null)} aria-label="Put the sun back" title="Put the sun back">↺</button>
          </div>
          {config.view !== 'studio' && <span className="scale-note">Figure: 1.7 m tall</span>}
        </div>
      </main>

      <aside className="panel" aria-label="Design your panel">
        <header className="panel-head">
          <h1>Zellige configurator</h1>
          <p>Choose a centrepiece, a size and your glazes. Every tile is cut to shape as you go.</p>
        </header>

        <Controls
          config={config}
          counts={data?.byKey ?? null}
          shownSize={data?.size ?? null}
          pieces={data?.pieces ?? null}
          onSize={onSize} onMedallion={onMedallion} onGlaze={onGlaze} onResetGlazes={onResetGlazes}
        />

        <Materials data={data} config={config} palette={palette} stale={stale} onScale={onScale} />

        <Handover data={data} config={config} palette={palette} stale={stale} onSheet={openSheet} />

        <footer className="panel-foot">
          <button type="button" className="primary" onClick={copyLink}>Copy link to this design</button>
          <button type="button" disabled={isDefault} onClick={() => setConfig(DEFAULT_CONFIG)}>Start over</button>
          <p className="copy-status" role="status" aria-live="polite">
            {copied === 'copied' && 'Link copied.'}
            {copied === 'failed' && 'Could not copy. The address bar has the link.'}
          </p>
          <p className="fineprint">Demo: the prices are samples and no order is placed from this page.</p>
        </footer>
      </aside>
    </div>
    {showSheet && data && <SpecSheet data={data} config={config} palette={palette} onClose={closeSheet} />}
    </>
  );
}
