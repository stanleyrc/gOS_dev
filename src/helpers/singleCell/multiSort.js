// Multi-column sorting for tables: click sorts by one column, shift-click adds
// sort keys (a key cycles ascending -> descending -> removed). d3-free.
//
// A sort is an ordered array of keys: [{ key: "gene", dir: "asc" | "desc" }].

/**
 * New sort keys after a header click.
 * @param keys current sort keys
 * @param key clicked column key
 * @param shift true when shift was held (add / change a key, keep the others)
 */
export function nextSortKeys(keys = [], key, { shift = false, firstDir = "asc" } = {}) {
  const at = keys.findIndex((k) => k.key === key);
  const flip = (dir) => (dir === "asc" ? "desc" : "asc");
  if (shift) {
    if (at < 0) return [...keys, { key, dir: firstDir }];
    // the key's second click flips it, the third removes it (relative to its first direction)
    if (keys[at].dir === firstDir) return keys.map((k, i) => (i === at ? { key, dir: flip(firstDir) } : k));
    return keys.filter((_, i) => i !== at);
  }
  if (at < 0 || keys.length > 1) return [{ key, dir: at >= 0 && keys.length > 1 ? keys[at].dir : firstDir }];
  if (keys[at].dir === firstDir) return [{ key, dir: flip(firstDir) }];
  return [];
}

/** Position (1-based) and direction of a column in the sort, or null. `count` is the number of keys. */
export function sortBadge(keys = [], key) {
  const at = keys.findIndex((k) => k.key === key);
  return at < 0 ? null : { order: at + 1, dir: keys[at].dir, count: keys.length };
}

const isMissing = (v) => v == null || v === "" || (typeof v === "number" && Number.isNaN(v));

/** Compare two values: numbers numerically, everything else as text (natural order); missing values are handled by the caller. */
export function compareValues(a, b) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return `${a}`.localeCompare(`${b}`, undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Stable sort of rows by several keys.
 * @param accessors { key: (row) => value }, keys without one read row[key]
 * Missing values (null / "" / NaN) always go last, whatever the direction.
 */
export function sortRows(rows = [], keys = [], accessors = {}) {
  if (!keys.length) return rows;
  const get = (row, key) => (accessors[key] ? accessors[key](row) : row[key]);
  return rows
    .map((row, i) => ({ row, i }))
    .sort((x, y) => {
      for (const { key, dir } of keys) {
        const a = get(x.row, key);
        const b = get(y.row, key);
        const ma = isMissing(a);
        const mb = isMissing(b);
        if (ma || mb) {
          if (ma && mb) continue;
          return ma ? 1 : -1;
        }
        const c = compareValues(a, b);
        if (c) return dir === "desc" ? -c : c;
      }
      return x.i - y.i;
    })
    .map((x) => x.row);
}

/** Header text for the order badge: "1", "2" ... only when more than one key is active. */
export const badgeText = (badge) => (badge && badge.count > 1 ? `${badge.order}` : "");
export const arrowOf = (badge) => (badge ? (badge.dir === "asc" ? "▲" : "▼") : "");
