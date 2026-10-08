import { binAt } from "./matrix";

const median = (v) => {
  const s = v.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return NaN;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/**
 * How solid a copy-number call (homozygous deletion or amplification) is in
 * the cells carrying it: the width of the CN segment at the gene in each
 * carrier and the copy number of its flanks. Narrow segments (median under
 * `narrowBp`) whose flanks are at the cell's baseline are the calls most
 * likely to be read-depth noise in a single cell.
 * `cn` is the CN payload ({ cells, rows: [{ binIndex, values }] }).
 */
export function segmentNoise(cn, { globalPosition, carriers, narrowBp = 1e6 }) {
  if (!cn?.rows?.length || !Number.isFinite(globalPosition)) return null;
  const rowOf = new Map(cn.cells.map((id, k) => [id, cn.rows[k]]));
  const widths = [];
  const flanks = [];
  let nCovered = 0;
  carriers.forEach((id) => {
    const row = rowOf.get(id);
    if (!row) return;
    const b = binAt(row.binIndex, globalPosition);
    if (b < 0) return;
    nCovered += 1;
    const { gStart, gEnd } = row.binIndex;
    const v = row.values[b];
    // extend over neighbouring bins with the same copy number (adjacent segments of one state)
    let a = b;
    let z = b;
    while (a > 0 && row.values[a - 1] === v && gEnd[a - 1] >= gStart[a] - 1) a -= 1;
    while (z < row.values.length - 1 && row.values[z + 1] === v && gStart[z + 1] <= gEnd[z] + 1) z += 1;
    widths.push(gEnd[z] - gStart[a] + 1);
    const left = a > 0 ? row.values[a - 1] : NaN;
    const right = z < row.values.length - 1 ? row.values[z + 1] : NaN;
    flanks.push(median([left, right]));
  });
  if (!nCovered) return null;
  const medianWidth = median(widths);
  const nNarrow = widths.filter((w) => w < narrowBp).length;
  return {
    nCovered,
    medianWidthBp: medianWidth,
    medianFlankCn: median(flanks),
    nNarrow,
    narrow: nNarrow > nCovered / 2,
  };
}
