// The panel for the current size and medallion, built in the worker.
//
// Rules that keep the slider honest:
//   - one build at a time; while it runs only the LATEST request is kept waiting, so dragging
//     the slider across five sizes cuts two panels, not five
//   - a reply is shown only if it is still what the customer is asking for
//   - the last few panels are kept, so going back to one is instant

import { useEffect, useRef, useState } from 'react';
import type { MedallionId } from '@zellige/engine';
import type { BuildReply, BuildRequest, PanelData } from './panel.worker';

export type PanelState =
  | { status: 'building'; data: PanelData | null; error: null }
  | { status: 'ready'; data: PanelData; error: null }
  | { status: 'error'; data: PanelData | null; error: string };

const KEEP = 4;
const keyOf = (size: number, medallion: MedallionId) => `${medallion}:${size}`;

export function usePanel(size: number, medallion: MedallionId): PanelState {
  const [state, setState] = useState<PanelState>({ status: 'building', data: null, error: null });
  const worker = useRef<Worker | null>(null);
  const cache = useRef(new Map<string, PanelData>());
  const wanted = useRef('');                       // what the customer is asking for now
  const running = useRef<BuildRequest | null>(null);
  const waiting = useRef<BuildRequest | null>(null);
  const nextId = useRef(1);

  useEffect(() => {
    const w = new Worker(new URL('./panel.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    const fail = (error: string) => setState(s => ({ status: 'error', data: s.data, error }));
    w.onmessage = (e: MessageEvent<BuildReply>) => {
      const reply = e.data, req = running.current;
      running.current = null;
      if (reply.ok) {
        const k = keyOf(reply.data.size, reply.data.medallion);
        cache.current.set(k, reply.data);
        while (cache.current.size > KEEP) cache.current.delete(cache.current.keys().next().value!);
        if (k === wanted.current) setState({ status: 'ready', data: reply.data, error: null });
      } else if (req && keyOf(req.size, req.medallion) === wanted.current) {
        fail(reply.error);
      }
      if (waiting.current) {
        running.current = waiting.current;
        waiting.current = null;
        w.postMessage(running.current);
      }
    };
    w.onerror = e => { running.current = null; fail(e.message || 'The panel could not be built.'); };
    return () => { w.terminate(); worker.current = null; running.current = null; waiting.current = null; };
  }, []);

  useEffect(() => {
    const k = keyOf(size, medallion);
    wanted.current = k;
    const hit = cache.current.get(k);
    if (hit) {
      waiting.current = null;
      setState({ status: 'ready', data: hit, error: null });
      return;
    }
    setState(s => ({ status: 'building', data: s.data, error: null }));
    const req: BuildRequest = { id: nextId.current++, size, medallion };
    if (running.current) {
      // Already cutting exactly this? Then there is nothing to queue.
      waiting.current = keyOf(running.current.size, running.current.medallion) === k ? null : req;
    } else {
      running.current = req;
      worker.current?.postMessage(req);
    }
  }, [size, medallion]);

  return state;
}
