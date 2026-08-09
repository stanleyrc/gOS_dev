const PRIORITY_KEYS = ["lastModified", "authorName", "tier", "frequency"];

export default function orderInterpretationVersionColumns(columns) {
  return columns
    .map((column, originalIndex) => ({ column, originalIndex }))
    .sort((a, b) => {
      const priorityA = PRIORITY_KEYS.indexOf(a.column.key);
      const priorityB = PRIORITY_KEYS.indexOf(b.column.key);
      const orderA = priorityA === -1 ? PRIORITY_KEYS.length : priorityA;
      const orderB = priorityB === -1 ? PRIORITY_KEYS.length : priorityB;
      return orderA - orderB || a.originalIndex - b.originalIndex;
    })
    .map(({ column }) => column);
}
