const MIN_COLUMN_WIDTH = 80;
const APPROXIMATE_CHARACTER_WIDTH = 8;
const HEADER_HORIZONTAL_SPACE = 24;
const HEADER_CONTROL_SPACE = 24;

export function getLabelBasedColumnWidth(label, hasHeaderControl = false) {
  const labelWidth = String(label || "").trim().length * APPROXIMATE_CHARACTER_WIDTH;
  const controlWidth = hasHeaderControl ? HEADER_CONTROL_SPACE : 0;

  return Math.max(
    MIN_COLUMN_WIDTH,
    labelWidth + HEADER_HORIZONTAL_SPACE + controlWidth,
  );
}

export function withLabelBasedColumnWidth(column, label) {
  const hasHeaderControl = Boolean(
    column.sorter || column.filters || column.filterDropdown,
  );
  const labelWidth = getLabelBasedColumnWidth(label, hasHeaderControl);
  const configuredWidth = Number(column.width);
  const configuredMinWidth = Number(column.minWidth);
  const width = Math.max(
    labelWidth,
    Number.isFinite(configuredWidth) ? configuredWidth : 0,
  );
  const minWidth = Math.max(
    width,
    Number.isFinite(configuredMinWidth) ? configuredMinWidth : 0,
  );

  return {
    ...column,
    width: minWidth,
    minWidth,
  };
}
