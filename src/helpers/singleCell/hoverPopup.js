// Shared hover-popup lifecycle for the paper figures (d3-free). A popup is opened by hovering a hit region (unpinned:
// it closes when the pointer leaves both the region and the popup, after a short grace delay, on Escape, on scroll, on
// a click elsewhere, or when another popup opens) or by clicking its pin (pinned: only the close x, Escape or another
// popup closes it; scrolling and clicking elsewhere leave it).
export const GRACE_MS = 350;

export function createPopupController({ graceMs = GRACE_MS, onChange = () => {}, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let state = null; // { key, data, pinned }
  let timer = null;
  const emit = () => onChange(state);
  const cancel = () => {
    if (timer != null) clearTimer(timer);
    timer = null;
  };
  const set = (next) => {
    state = next;
    emit();
  };
  const close = () => {
    cancel();
    if (state) set(null);
  };
  return {
    get: () => state,
    // pointer on a hit region: opens (or switches) an unpinned popup; a pinned one stays until replaced explicitly
    hoverRegion(key, data) {
      cancel();
      if (state?.pinned && state.key !== key) return; // do not displace a pinned popup by passing over other rows
      if (!state || state.key !== key) set({ key, data, pinned: false });
    },
    // pointer left the hit region (or moved onto empty figure): close after the grace delay unless it enters the popup
    leaveRegion() {
      cancel();
      if (!state || state.pinned) return;
      timer = setTimer(close, graceMs);
    },
    enterPopup: cancel,
    leavePopup() {
      cancel();
      if (!state || state.pinned) return;
      timer = setTimer(close, graceMs);
    },
    // explicit open (click on a mark) replaces whatever is open
    open(key, data, pinned = false) {
      cancel();
      set({ key, data, pinned });
    },
    pin() {
      cancel();
      if (state && !state.pinned) set({ ...state, pinned: true });
    },
    unpin() {
      if (state?.pinned) set({ ...state, pinned: false });
    },
    escape: close,
    close,
    scroll() {
      if (state && !state.pinned) close();
    },
    clickOutside() {
      if (state && !state.pinned) close();
    },
    dispose: cancel,
  };
}
