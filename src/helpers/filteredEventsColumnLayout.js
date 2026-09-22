// Browser-local preferences shared by matching column IDs across cases/datasets.
export const COLUMN_LAYOUT_STORAGE_KEY = "gos.filteredEventsColumnLayout.v1";
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isColumnKey = (key) => typeof key === "string" && key.trim() !== "" &&
  !["__proto__", "constructor", "prototype"].includes(key);
const uniqueKeys = (keys) => [...new Set(Array.isArray(keys) ? keys.filter(isColumnKey) : [])];

export function normalizeColumnLayout(value) {
  return {
    columnWidths: Object.fromEntries(
      Object.entries(isObject(value?.columnWidths) ? value.columnWidths : {})
        .filter(([key, width]) => isColumnKey(key) && Number.isFinite(width) && width > 0),
    ),
    columnOrderKeys: uniqueKeys(value?.columnOrderKeys),
  };
}

// Replace only the current dataset's slots; retain keys from other datasets.
export function mergeColumnOrder(previous, current) {
  const keys = uniqueKeys(current);
  if (keys.length === 0) return [];
  const currentKeys = new Set(keys);
  const allKeys = [...new Set([...uniqueKeys(previous), ...keys])];
  let index = 0;
  return allKeys.map((key) => currentKeys.has(key) ? keys[index++] : key);
}

function getStorage() {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch (error) {
    return null;
  }
}

export function readColumnLayout(storage = getStorage()) {
  try {
    return normalizeColumnLayout(storage ? JSON.parse(storage.getItem(COLUMN_LAYOUT_STORAGE_KEY)) : null);
  } catch (error) {
    return normalizeColumnLayout(null);
  }
}

export function saveColumnLayout(patch, storage = getStorage()) {
  if (!storage) return false;
  const previous = readColumnLayout(storage);
  const normalized = normalizeColumnLayout(patch);
  const layout = {
    columnWidths: { ...previous.columnWidths, ...normalized.columnWidths },
    columnOrderKeys: Array.isArray(patch?.columnOrderKeys)
      ? mergeColumnOrder(previous.columnOrderKeys, normalized.columnOrderKeys)
      : previous.columnOrderKeys,
  };
  try {
    storage.setItem(COLUMN_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
    return true;
  } catch (error) {
    // A full/disabled storage area must not prevent table interactions.
    return false;
  }
}
