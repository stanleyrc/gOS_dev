// Opt-in storage for display state (layout, palette, UMAP choices, column choosers).
// Off by default: nothing is read from or written to localStorage, so every page load uses the
// shipped defaults plus URL parameters. A signed-in user can turn "Remember my view settings" on;
// state is then kept under per-user keys (gos.u.<userId>.<name>). Theme, cell-label mode and the
// help centre state are not analysis state and stay remembered for everyone (see ALWAYS_REMEMBERED).
// No d3 / React imports so this is unit-testable.

/** Bump when layout defaults or meaning change: saved layouts from older versions are dropped. */
export const SC_LAYOUT_SCHEMA_VERSION = 2;
export const USER_KEY = "gOS_user";
export const SWITCH_KEY_NAME = "viewSettings.on";
export const NOTICE_KEY = "gos.viewSettings.notice";
/** Keys that stay remembered whether or not saving is on. */
export const ALWAYS_REMEMBERED = ["gos-theme", "gos.sc.cellLabelMode", "gos.help.patient"];

export function getStorage() {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch (error) {
    return null;
  }
}

/** The signed-in user id, or null. */
export function currentUserId(storage = getStorage()) {
  try {
    const raw = storage && storage.getItem(USER_KEY);
    const user = raw ? JSON.parse(raw) : null;
    return user && user.userId ? String(user.userId) : null;
  } catch (error) {
    return null;
  }
}

/** "gos.singleCell.layout" -> "gos.u.<id>.singleCell.layout"; "gos-cohort-x" -> "gos.u.<id>.gos-cohort-x". */
export function scopedKey(userId, key) {
  return `gos.u.${userId}.${String(key).replace(/^gos\./, "")}`;
}

/** Is saving on for the signed-in user? Signed out is always off. */
export function savingEnabled(storage = getStorage()) {
  const id = currentUserId(storage);
  if (!id) return false;
  try {
    return storage.getItem(scopedKey(id, SWITCH_KEY_NAME)) === "1";
  } catch (error) {
    return false;
  }
}

export function setSavingEnabled(on, storage = getStorage()) {
  const id = currentUserId(storage);
  if (!id || !storage) return false;
  try {
    if (on) storage.setItem(scopedKey(id, SWITCH_KEY_NAME), "1");
    else storage.removeItem(scopedKey(id, SWITCH_KEY_NAME));
    return true;
  } catch (error) {
    return false;
  }
}

/** Read a remembered value (string) or null. Always-remembered keys use their plain key. */
export function readPref(key, storage = getStorage()) {
  try {
    if (!storage) return null;
    if (ALWAYS_REMEMBERED.includes(key)) return storage.getItem(key);
    if (!savingEnabled(storage)) return null;
    return storage.getItem(scopedKey(currentUserId(storage), key));
  } catch (error) {
    return null;
  }
}

/** Write a value; a no-op unless saving is on (or the key is always remembered). Returns whether written. */
export function writePref(key, value, storage = getStorage()) {
  try {
    if (!storage) return false;
    if (ALWAYS_REMEMBERED.includes(key)) {
      storage.setItem(key, value);
      return true;
    }
    if (!savingEnabled(storage)) return false;
    storage.setItem(scopedKey(currentUserId(storage), key), value);
    return true;
  } catch (error) {
    return false;
  }
}

export function removePref(key, storage = getStorage()) {
  try {
    const id = currentUserId(storage);
    if (storage && id) storage.removeItem(scopedKey(id, key));
  } catch (error) {
    // ignore
  }
}

/** Saved layout object, or null when saving is off, nothing is saved, or the version is stale.
 *  A stale version is dropped (removed) and a one-time notice is queued. */
export function readLayout(key, storage = getStorage()) {
  const raw = readPref(key, storage);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || parsed.__v !== SC_LAYOUT_SCHEMA_VERSION) {
      removePref(key, storage);
      try {
        storage.setItem(NOTICE_KEY, "1");
      } catch (error) {
        // ignore
      }
      return null;
    }
    const { __v, ...layout } = parsed;
    return layout;
  } catch (error) {
    return null;
  }
}

export function writeLayout(key, layout, storage = getStorage()) {
  return writePref(key, JSON.stringify({ ...layout, __v: SC_LAYOUT_SCHEMA_VERSION }), storage);
}

/** One-time notice that an old saved layout was dropped; returns true once, then false. */
export function takeDroppedNotice(storage = getStorage()) {
  try {
    if (!storage || storage.getItem(NOTICE_KEY) !== "1") return false;
    storage.removeItem(NOTICE_KEY);
    return true;
  } catch (error) {
    return false;
  }
}

/** Keys of a saved layout whose value differs from the defaults (empty when none / not in effect). */
export function savedLayoutDiffers(key, defaults, storage = getStorage()) {
  const saved = readLayout(key, storage);
  if (!saved) return [];
  return Object.keys(saved).filter((k) => JSON.stringify(saved[k]) !== JSON.stringify(defaults[k]));
}

/** Reset: drop this user's saved layout, palette and UMAP / column choices (not notes, searches, switch). */
export function resetSavedView(keys, storage = getStorage()) {
  (keys || []).forEach((k) => removePref(k, storage));
}

/** A localStorage-shaped adapter that goes through the opt-in rules (for code that takes a storage). */
export function viewStorage(storage = getStorage()) {
  if (!storage) return null;
  return {
    getItem: (k) => readPref(k, storage),
    setItem: (k, v) => {
      writePref(k, v, storage);
    },
    removeItem: (k) => removePref(k, storage),
  };
}
