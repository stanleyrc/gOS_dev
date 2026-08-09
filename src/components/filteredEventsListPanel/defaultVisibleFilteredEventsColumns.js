const uniqueColumnKeys = (columnKeys) => [
  ...new Set(Array.isArray(columnKeys) ? columnKeys : []),
];

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
    const defaultVisibleKeySet = new Set(defaultVisibleColumnKeys);
    selectedAvailableKeys = availableKeys.filter((key) =>
      defaultVisibleKeySet.has(key),
    );
  }

  return uniqueColumnKeys([
    ...selectedAvailableKeys,
    ...uniqueColumnKeys(additionalColumnKeys),
  ]);
}
