// Ask for a cut plan. Each request gets its own short-lived worker: plans are asked for
// rarely, and this keeps them out of the way of the worker that feeds the live preview.

import type { PlanReply, PlanRequest } from './plan.worker';

export function cutPlan(request: PlanRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./plan.worker.ts', import.meta.url), { type: 'module' });
    const done = (fn: () => void) => { w.terminate(); fn(); };
    w.onmessage = (e: MessageEvent<PlanReply>) => {
      const reply = e.data;
      done(() => (reply.ok ? resolve(reply.text) : reject(new Error(reply.error))));
    };
    w.onerror = e => done(() => reject(new Error(e.message || 'The cut plan could not be drawn.')));
    w.postMessage(request);
  });
}

/** Hand the customer a file. The address is released once the browser has taken it. */
export function saveFile(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
