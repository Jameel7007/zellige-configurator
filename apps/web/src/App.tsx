import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GlazeKey, MedallionId } from '@zellige/engine';
import { DEFAULT_CONFIG, fullPalette, parseConfig, serialiseConfig, withGlaze, type Config } from './config';
import { usePanel } from './usePanel';
import { Controls } from './components/Controls';
import { Materials } from './components/Materials';
import { PreviewPane, type PreviewHandle } from './components/PreviewPane';

type Copied = 'idle' | 'copied' | 'failed';

export function App() {
  const [config, setConfig] = useState<Config>(() => parseConfig(window.location.search));
  const panel = usePanel(config.size, config.medallion);
  const palette = useMemo(() => fullPalette(config), [config]);
  const preview = useRef<PreviewHandle>(null);
  const [copied, setCopied] = useState<Copied>('idle');

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
  const data = panel.data;

  return (
    <div className="app">
      <main className="stage">
        <PreviewPane ref={preview} data={data} palette={palette} busy={panel.status === 'building'} error={panel.error} />
        <div className="stage-actions">
          <button type="button" onClick={() => preview.current?.resetView()}>Reset view</button>
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

        <Materials data={data} config={config} palette={palette} stale={!!data && (data.size !== config.size || data.medallion !== config.medallion)} onScale={onScale} />

        <footer className="panel-foot">
          <button type="button" className="primary" onClick={copyLink}>Copy link to this design</button>
          <button type="button" disabled={isDefault} onClick={() => setConfig(DEFAULT_CONFIG)}>Start over</button>
          <p className="copy-status" role="status" aria-live="polite">
            {copied === 'copied' && 'Link copied.'}
            {copied === 'failed' && 'Could not copy. The address bar has the link.'}
          </p>
          <p className="fineprint">Demo. A room view and a printable spec sheet are still to come.</p>
        </footer>
      </aside>
    </div>
  );
}
