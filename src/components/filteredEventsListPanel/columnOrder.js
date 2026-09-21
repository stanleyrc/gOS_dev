import { orderFilteredEventsColumns } from "./defaultVisibleFilteredEventsColumns";

/** Move a known unique key to the target's original index, without mutation. */
export function moveColumnKey(keys, sourceKey, targetKey) {
  const sourceIndex = keys.indexOf(sourceKey);
  const targetIndex = keys.indexOf(targetKey);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return keys;
  }

  const orderedKeys = [...keys];
  orderedKeys.splice(sourceIndex, 1);
  orderedKeys.splice(targetIndex, 0, sourceKey);
  return orderedKeys;
}

/** Apply key order within non-fixed slots; caller-owned columns stay outside. */
export function orderMovableColumns(columns, keys) {
  const movableColumns = orderFilteredEventsColumns(
    columns.filter((column) => !column.fixed),
    keys,
  );
  let movableIndex = 0;
  return columns.map((column) =>
    column.fixed ? column : movableColumns[movableIndex++],
  );
}
