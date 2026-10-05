// Build single-cell views from the standard per-case files of each cell
// (complex.json, mutations.json) and from datafiles.json manifest records.
import { binAt, buildBinIndex, naturalCompare, resolveChromosome, toGlobal } from "./matrix";

/* ----------------------------------------------------------------------- */
/* Manifest records                                                         */
/* ----------------------------------------------------------------------- */

/** datafiles.json `entry_type`: "patient", "cell", or null for ordinary (bulk) cases. */
export function entryType(record) {
  const raw = record?.entry_type ?? record?.entryType;
  if (raw == null) return null;
  const value = `${raw}`.trim().toLowerCase();
  return value === "patient" || value === "cell" ? value : null;
}

export const isCellRecord = (record) => entryType(record) === "cell";
export const isPatientRecord = (record) => entryType(record) === "patient";

const caseIdOf = (record) =>
  `${record?.caseReportId ?? record?.pair ?? record?.case_id ?? record?.id ?? ""}`;

/** Patient key a record belongs to: its patient_id, or (for patients) its own ID. */
export function patientKeyOf(record) {
  const pid = record?.patient_id;
  if (pid != null && `${pid}`.trim()) return `${pid}`.trim();
  return isPatientRecord(record) ? caseIdOf(record) : null;
}

/** Cell records of a patient, normalized to { cell_id, clone_id, ...record }. */
export function cellsForPatient(records = [], patientKey) {
  const seen = new Set();
  const cells = [];
  records.forEach((record) => {
    if (!isCellRecord(record) || patientKeyOf(record) !== patientKey) return;
    const id = caseIdOf(record);
    if (!id || seen.has(id)) return;
    seen.add(id);
    cells.push({
      ...record,
      cell_id: id,
      clone_id: record.clone_id == null || record.clone_id === "" ? null : `${record.clone_id}`,
    });
  });
  return cells.sort((a, b) => naturalCompare(a.cell_id, b.cell_id));
}

/** The patient record for a cell, if the manifest has one. */
export function patientRecordFor(records = [], cellRecord) {
  const key = patientKeyOf(cellRecord);
  if (!key) return null;
  return (
    records.find((r) => isPatientRecord(r) && patientKeyOf(r) === key) || null
  );
}

/** One summary row per patient record: cell counts and clone composition. */
export function cohortSummaries(records = []) {
  const cellsByPatient = new Map();
  records.forEach((r) => {
    if (!isCellRecord(r)) return;
    const key = patientKeyOf(r);
    if (!key) return;
    if (!cellsByPatient.has(key)) cellsByPatient.set(key, []);
    cellsByPatient.get(key).push(r);
  });
  return records
    .filter(isPatientRecord)
    .map((patient) => {
      const key = patientKeyOf(patient);
      const cells = cellsByPatient.get(key) || [];
      const cloneCounts = {};
      cells.forEach((c) => {
        const clone = c.clone_id == null || c.clone_id === "" ? "unassigned" : `${c.clone_id}`;
        cloneCounts[clone] = (cloneCounts[clone] || 0) + 1;
      });
      return {
        record: patient,
        caseReportId: caseIdOf(patient),
        patientKey: key,
        nCells: cells.length,
        nClones: Object.keys(cloneCounts).filter((c) => c !== "unassigned").length,
        cloneCounts,
      };
    })
    .sort((a, b) => naturalCompare(a.caseReportId, b.caseReportId));
}

/* ----------------------------------------------------------------------- */
/* Total copy number from complex.json                                      */
/* ----------------------------------------------------------------------- */

/**
 * The intervals ("nodes") of a cell's genome graph as a heatmap row:
 * { binIndex, values } where values[k] is the interval's copy number (y).
 */
export function cnRowFromGenome(genome, chromoBins) {
  const intervals = (genome?.intervals || []).filter(
    (d) =>
      (d.type == null || d.type === "interval") &&
      Number.isFinite(Number(d.y)) &&
      resolveChromosome(d.chromosome, chromoBins)
  );
  const binIndex = buildBinIndex(
    {
      chromosome: intervals.map((d) => d.chromosome),
      start: intervals.map((d) => Number(d.startPoint)),
      end: intervals.map((d) => Number(d.endPoint)),
    },
    chromoBins
  );
  const values = Float32Array.from(intervals, (d) => Number(d.y));
  return { binIndex, values };
}

/* ----------------------------------------------------------------------- */
/* Junctions from complex.json connections                                  */
/* ----------------------------------------------------------------------- */

/**
 * Breakpoints of a gGraph connection. Signs follow gGnome's JSON: a positive
 * source leaves from the interval's right end, a negative one from its left;
 * a positive sink enters at the left end, a negative one at the right.
 */
export function connectionBreakpoints(connection, intervalsById) {
  const src = intervalsById.get(Math.abs(connection.source));
  const snk = intervalsById.get(Math.abs(connection.sink));
  if (!src || !snk) return null;
  return [
    {
      chromosome: `${src.chromosome}`,
      position: connection.source > 0 ? Number(src.endPoint) : Number(src.startPoint),
      strand: connection.source > 0 ? "+" : "-",
    },
    {
      chromosome: `${snk.chromosome}`,
      position: connection.sink > 0 ? Number(snk.startPoint) : Number(snk.endPoint),
      strand: connection.sink > 0 ? "-" : "+",
    },
  ];
}

const isJunction = (c) => {
  const type = `${c?.type ?? ""}`.toUpperCase();
  return type === "ALT" || type === "";
};

/**
 * Match ALT junctions across cells by breakpoints (rounded to `tolerance` bp,
 * orientation-aware, endpoint order normalized) and collect each junction's
 * copy number (connection weight) per cell. Cells whose complex.json loaded
 * but lack a junction get 0; cells without complex.json get NaN.
 */
export function junctionsFromGenomes(cellIds, genomeByCell, chromoBins, tolerance = 1000) {
  const junctions = [];
  const byKey = new Map();
  const perCell = cellIds.map(() => new Map());

  cellIds.forEach((cellId, row) => {
    const genome = genomeByCell[cellId];
    if (!genome) return;
    const intervalsById = new Map((genome.intervals || []).map((d) => [Math.abs(d.iid), d]));
    (genome.connections || []).forEach((c) => {
      if (!isJunction(c) || c.source == null || c.sink == null) return;
      const bps = connectionBreakpoints(c, intervalsById);
      if (!bps) return;
      const g = bps.map((bp) => toGlobal(chromoBins, bp.chromosome, bp.position));
      if (!g.every(Number.isFinite)) return;
      const ordered = g[0] <= g[1] ? bps : [bps[1], bps[0]];
      const key = ordered
        .map((bp) => `${bp.chromosome}:${Math.round(bp.position / tolerance)}${bp.strand}`)
        .join("|");
      if (!byKey.has(key)) {
        byKey.set(key, junctions.length);
        junctions.push({
          id: `${ordered[0].chromosome}:${ordered[0].position}${ordered[0].strand}|${ordered[1].chromosome}:${ordered[1].position}${ordered[1].strand}`,
          index: junctions.length,
          chromosome1: ordered[0].chromosome,
          position1: ordered[0].position,
          strand1: ordered[0].strand,
          chromosome2: ordered[1].chromosome,
          position2: ordered[1].position,
          strand2: ordered[1].strand,
          class: c.title || null,
          global1: Math.min(g[0], g[1]),
          global2: Math.max(g[0], g[1]),
        });
      }
      const k = byKey.get(key);
      const weight = Number(c.weight);
      const value = Number.isFinite(weight) ? weight : 1;
      perCell[row].set(k, Math.max(perCell[row].get(k) || 0, value));
    });
  });

  let maxCn = 0;
  const cn = cellIds.map((cellId, row) => {
    const out = new Float32Array(junctions.length);
    const loaded = Boolean(genomeByCell[cellId]);
    for (let k = 0; k < junctions.length; k += 1) {
      out[k] = loaded ? perCell[row].get(k) || 0 : NaN;
      if (out[k] > maxCn) maxCn = out[k];
    }
    return out;
  });
  return { cells: [...cellIds], junctions, cn, maxCn };
}

/* ----------------------------------------------------------------------- */
/* SNVs from mutations.json                                                 */
/* ----------------------------------------------------------------------- */

/** "Type: x; Gene: y; VAF: 0.5; " -> { Type: "x", Gene: "y", VAF: "0.5" } */
export function parseAnnotation(annotation) {
  const out = {};
  `${annotation ?? ""}`.split(";").forEach((part) => {
    const at = part.indexOf(":");
    if (at < 0) return;
    const key = part.slice(0, at).trim();
    const value = part.slice(at + 1).trim();
    if (key) out[key] = value;
  });
  return out;
}

const numberOrNaN = (v) => (v == null || v === "" ? NaN : Number(v));

/**
 * Union of annotated SNVs/indels across cells. Status per cell: 1 when the
 * cell's mutations.json lists the variant with alt reads, 0 when the cell's
 * file loaded but the variant was not called there (or alt count is 0),
 * -1 when the cell has no mutations.json.
 */
export function snvFromMutations(cellIds, mutationsByCell, chromoBins) {
  const variants = [];
  const byKey = new Map();
  const calls = cellIds.map(() => new Map());

  cellIds.forEach((cellId, row) => {
    const data = mutationsByCell[cellId];
    if (!data) return;
    (data.intervals || []).forEach((d) => {
      const a = parseAnnotation(d.annotation);
      const change = a.Genomic_variant || a.Variant || "";
      const key = `${d.chromosome}:${d.startPoint}:${change}`;
      if (!byKey.has(key)) {
        byKey.set(key, variants.length);
        variants.push({
          id: key,
          index: variants.length,
          chromosome: `${d.chromosome}`,
          position: Number(d.startPoint),
          gene: a.Gene || null,
          annotation: [a.Type, a.Protein_variant || a.Variant].filter(Boolean).join(" ") || null,
          global: toGlobal(chromoBins, d.chromosome, d.startPoint),
        });
      }
      calls[row].set(byKey.get(key), {
        alt: numberOrNaN(a.Alt_count),
        ref: numberOrNaN(a.Ref_count),
      });
    });
  });

  const n = variants.length;
  const status = [];
  const alt = [];
  const depth = [];
  cellIds.forEach((cellId, row) => {
    const loaded = Boolean(mutationsByCell[cellId]);
    const s = new Int8Array(n).fill(loaded ? 0 : -1);
    const a = new Float32Array(n).fill(NaN);
    const dp = new Float32Array(n).fill(NaN);
    calls[row].forEach(({ alt: x, ref }, k) => {
      s[k] = Number.isFinite(x) && x <= 0 ? 0 : 1;
      a[k] = x;
      dp[k] = Number.isFinite(x) && Number.isFinite(ref) ? x + ref : NaN;
    });
    status.push(s);
    alt.push(a);
    depth.push(dp);
  });
  return { cells: [...cellIds], variants, status, alt, depth };
}

/**
 * Consensus total copy number of several cells: the median state on a
 * regular per-chromosome grid (`step` bp). Used when a patient folder has no
 * pseudobulk complex.json of its own.
 */
export function medianCnRow(rows, chromoBins, step = 1e6) {
  const present = rows.filter(Boolean);
  const chromosome = [];
  const start = [];
  const end = [];
  Object.keys(chromoBins).forEach((chr) => {
    const c = chromoBins[chr];
    for (let s = c.startPoint; s <= c.endPoint; s += step) {
      chromosome.push(chr);
      start.push(s);
      end.push(Math.min(c.endPoint, s + step - 1));
    }
  });
  const binIndex = buildBinIndex({ chromosome, start, end }, chromoBins);
  const values = new Float32Array(binIndex.n).fill(NaN);
  const scratch = [];
  for (let b = 0; b < binIndex.n; b += 1) {
    const g = (binIndex.gStart[b] + binIndex.gEnd[b]) / 2;
    scratch.length = 0;
    present.forEach((row) => {
      const k = binAt(row.binIndex, g);
      if (k >= 0 && Number.isFinite(row.values[k])) scratch.push(row.values[k]);
    });
    if (scratch.length) {
      scratch.sort((x, y) => x - y);
      const m = scratch.length >> 1;
      values[b] = scratch.length % 2 ? scratch[m] : (scratch[m - 1] + scratch[m]) / 2;
    }
  }
  return { binIndex, values };
}
