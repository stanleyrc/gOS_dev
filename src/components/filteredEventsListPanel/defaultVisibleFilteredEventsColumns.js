const uniqueColumnKeys = (columnKeys) => [
  ...new Set(Array.isArray(columnKeys) ? columnKeys : []),
];

/**
 * Apply a dataset's configured column order without disturbing unconfigured
 * columns or caller-owned columns that are positioned separately by the panel.
 */
export function orderFilteredEventsColumns(columns, orderedColumnKeys) {
  const safeColumns = Array.isArray(columns) ? columns : [];
  if (!Array.isArray(orderedColumnKeys)) return safeColumns;

  const configuredOrder = new Map(
    uniqueColumnKeys(orderedColumnKeys).map((key, index) => [key, index]),
  );

  return safeColumns
    .map((column, originalIndex) => ({ column, originalIndex }))
    .sort((a, b) => {
      const orderA = configuredOrder.has(a.column?.key)
        ? configuredOrder.get(a.column.key)
        : configuredOrder.size;
      const orderB = configuredOrder.has(b.column?.key)
        ? configuredOrder.get(b.column.key)
        : configuredOrder.size;
      return orderA - orderB || a.originalIndex - b.originalIndex;
    })
    .map(({ column }) => column);
}

/**
 * Select dataset-configured defaults from available columns while preserving
 * columns supplied directly by the caller.
 */
export default function getDefaultVisibleFilteredEventsColumnKeys(
  availableColumnKeys,
  defaultVisibleColumnKeys,
  additionalColumnKeys,
) {
  const availableKeys = uniqueColumnKeys(availableColumnKeys);
  let selectedAvailableKeys = availableKeys;

  if (Array.isArray(defaultVisibleColumnKeys)) {
    const availableKeySet = new Set(availableKeys);
    selectedAvailableKeys = uniqueColumnKeys(defaultVisibleColumnKeys).filter(
      (key) => availableKeySet.has(key),
    );
  }

  return uniqueColumnKeys([
    ...selectedAvailableKeys,
    ...uniqueColumnKeys(additionalColumnKeys),
  ]);
}
