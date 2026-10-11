// A one-shot hand-off of "show this evidence" between views: the vignette
// queues a request (e.g. ecDNA walks to draw and highlight), the target tab
// takes it when it mounts or when its data arrive. Module state, no redux
// (the request is transient and must not persist with the layout).

let pending = null; // { kind, patient, ...payload, at }
const listeners = new Set();

/** Queue a request for a target view: { kind: "walks", patient, walks: [labels] }. */
export function requestEvidence(request) {
  pending = request ? { ...request, at: Date.now() } : null;
  listeners.forEach((fn) => fn(pending));
}

/** Take (and clear) the pending request of this kind for this patient; null when none. */
export function takeEvidence(kind, patient = null) {
  if (!pending || pending.kind !== kind) return null;
  if (patient != null && pending.patient != null && `${pending.patient}` !== `${patient}`) return null;
  const out = pending;
  pending = null;
  return out;
}

/** Peek without clearing. */
export const peekEvidence = () => pending;

/** Called with each new request; returns an unsubscribe function. */
export function subscribeEvidence(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
