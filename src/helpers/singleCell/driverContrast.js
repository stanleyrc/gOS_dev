// Subclonal driver deep-dive: carriers of a driver vs matched non-carriers of
// the same patient (a near-isogenic comparison). d3-free so jest can test it.
//
// - subclonalDrivers: drivers carried by part of the tumor cells, with clade fit
// - comparatorCells: matched non-carriers (sister clade / same plate / all)
// - balanceTable: plate / region / state / phase make-up of the two groups
// - cnContrast: mean copy number of each group along the genome, differing regions
// - eventContrast: other events that differ between the groups (co-travellers)
// - stratifiedDE: Wilcoxon per plate, combined across plates (weighted Stouffer)
// - classifyDeRow: locus / copy-number / trans label for a DE gene
// - exonProfile: per-exon expression of a fusion partner in each group
import { benjaminiHochberg, twoSidedP, wilcoxonFromNonzero, yieldToBrowser } from "./rnaStats";
import { chiSquareTable, fisherExact } from "./tests";
import { cladeFitScore } from "./cladeFit";
import { binAt } from "./matrix";

export const splitIds = (s) => `${s || ""}`.split(",").filter(Boolean);

/** Sequencing plate of a cell id: the id without its patient prefix and well (MGH303_MR_4_pl5_8d -> MR_4_pl5). */
export function plateOf(cellId) {
  const parts = `${cellId || ""}`.split("_");
  return parts.length > 2 ? parts.slice(1, -1).join("_") : "";
}

/** Display label and key of a driver event. */
export function driverLabel(e) {
  if (e.fusion_genes && `${e.fusion_genes}`.includes("::")) return `${e.fusion_genes}`;
  const kind = e.vartype || e.type || "";
  return `${e.gene || "?"}${kind ? ` ${kind}` : ""}`;
}

export function driverKey(e) {
  return `${driverLabel(e)}|${e.Genome_Location || `${e.seqnames}:${e.start}-${e.end}`}`;
}

/**
 * Drivers carried by part of the tumor cells.
 * @param events patient filtered events (cell_ids: carrier cells)
 * @param tumorIds tumor cell ids (the denominator)
 * @param layout tree layout for the clade fit (optional)
 * @returns [{ key, label, event, carriers, fraction, tier, fit }] sorted by tier, fit, carriers
 */
export function subclonalDrivers(events, tumorIds, layout, { minFraction = 0.05, maxFraction = 0.95, minCells = 3 } = {}) {
  const tumor = new Set(tumorIds);
  if (!tumor.size) return [];
  const byKey = new Map();
  (events || []).forEach((e) => {
    const carriers = splitIds(e.cell_ids).filter((id) => tumor.has(id));
    const fraction = carriers.length / tumor.size;
    if (carriers.length < minCells || fraction < minFraction || fraction > maxFraction) return;
    const key = driverKey(e);
    const prev = byKey.get(key);
    if (prev && prev.carriers.length >= carriers.length) return;
    byKey.set(key, { key, label: driverLabel(e), event: e, carriers, fraction, tier: Number(e.Tier) || 9 });
  });
  const out = [...byKey.values()];
  out.forEach((d) => (d.fit = layout ? cladeFitScore(d.carriers, layout) : null));
  const fitScore = (d) => (d.fit && Number.isFinite(d.fit.score) ? d.fit.score : 0);
  return out.sort((a, b) => a.tier - b.tier || fitScore(b) - fitScore(a) || b.carriers.length - a.carriers.length);
}

export const COMPARATOR_MODES = ["sister", "plate", "all"];

/**
 * Matched non-carriers.
 * sister: non-carrier tumor cells under the smallest node that strictly contains the carriers'
 *   best clade, widened until there are minCells of them (the carriers' closest relatives);
 * plate: non-carriers on the plates that hold carriers (same processing batch / region);
 * all: every non-carrier tumor cell.
 * @returns { cells, note } note: { key, node, size } describing how the group was chosen
 */
export function comparatorCells(mode, carriers, tumorIds, layout, { minCells = 5 } = {}) {
  const carrierSet = new Set(carriers);
  const nonCarriers = tumorIds.filter((id) => !carrierSet.has(id));
  if (mode === "plate") {
    const plates = new Set(carriers.map(plateOf));
    return { cells: nonCarriers.filter((id) => plates.has(plateOf(id))), note: { key: "plate", plates: [...plates] } };
  }
  if (mode === "sister" && layout && layout.nodes?.length) {
    const fit = cladeFitScore(carriers, layout);
    if (fit.node != null) {
      const tumor = new Set(tumorIds);
      let node = layout.nodes[fit.node];
      let id = fit.node;
      while (node && node.parent >= 0) {
        id = node.parent;
        node = layout.nodes[id];
        const leaves = layout.leaves.slice(node.firstLeaf, node.lastLeaf + 1);
        const cells = leaves.filter((c) => tumor.has(c) && !carrierSet.has(c));
        if (cells.length >= minCells || node.parent < 0) {
          return { cells, note: { key: "sister", node: id, size: leaves.length } };
        }
      }
    }
  }
  return { cells: nonCarriers, note: { key: "all" } };
}

/**
 * Make-up of the two groups for each attribute.
 * @param attrOf (cellId, attr) -> level or null
 * @returns [{ attr, levels: [{ level, a, b }], nA, nB, p, onlyA: levels holding A cells but no B cells }]
 */
export function balanceTable(cellsA, cellsB, attrs, attrOf) {
  return attrs.map((attr) => {
    const counts = new Map();
    let nA = 0;
    let nB = 0;
    const add = (id, side) => {
      const v = attrOf(id, attr);
      if (v == null || v === "") return;
      if (!counts.has(`${v}`)) counts.set(`${v}`, { level: `${v}`, a: 0, b: 0 });
      counts.get(`${v}`)[side] += 1;
      if (side === "a") nA += 1;
      else nB += 1;
    };
    cellsA.forEach((id) => add(id, "a"));
    cellsB.forEach((id) => add(id, "b"));
    const levels = [...counts.values()].sort((x, y) => x.level.localeCompare(y.level, undefined, { numeric: true }));
    let p = NaN;
    if (levels.length === 2 && nA && nB) p = fisherExact(levels[0].a, levels[0].b, levels[1].a, levels[1].b).p;
    else if (levels.length > 2 && nA && nB) p = chiSquareTable(levels.map((l) => [l.a, l.b]));
    return { attr, levels, nA, nB, p, onlyA: levels.filter((l) => l.a > 0 && l.b === 0).map((l) => l.level) };
  });
}

/** Mean of numbers, NaN when empty. */
const mean = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN);

/**
 * Mean total copy number of each group on a grid of global positions.
 * @param cn SingleCell cn source data: { cells, rows: [{ binIndex, values } | null] }
 * @param positions global positions (e.g. every 1 Mb)
 * @returns { positions, meanA, meanB, nA, nB, regions: [{ start, end, meanA, meanB, diff }] }
 *   regions: runs of grid points where |meanA - meanB| >= minDiff
 */
export function cnContrast(cn, idsA, idsB, positions, { minDiff = 0.5 } = {}) {
  const rowOf = new Map((cn?.cells || []).map((id, k) => [id, k]));
  const rowsFor = (ids) => ids.map((id) => cn.rows[rowOf.get(id)]).filter(Boolean);
  const rA = cn ? rowsFor(idsA) : [];
  const rB = cn ? rowsFor(idsB) : [];
  const at = (rows, g) => {
    const v = [];
    rows.forEach((row) => {
      const b = binAt(row.binIndex, g);
      if (b >= 0 && Number.isFinite(row.values[b])) v.push(row.values[b]);
    });
    return mean(v);
  };
  const meanA = positions.map((g) => at(rA, g));
  const meanB = positions.map((g) => at(rB, g));
  const regions = [];
  let cur = null;
  positions.forEach((g, i) => {
    const d = meanA[i] - meanB[i];
    const hit = Number.isFinite(d) && Math.abs(d) >= minDiff;
    if (hit && cur && Math.sign(d) === Math.sign(cur.sum) && i === cur.last + 1) {
      cur.end = g;
      cur.last = i;
      cur.sum += d;
      cur.a.push(meanA[i]);
      cur.b.push(meanB[i]);
    } else {
      if (cur) regions.push(cur);
      cur = hit ? { start: g, end: g, last: i, sum: d, a: [meanA[i]], b: [meanB[i]] } : null;
    }
  });
  if (cur) regions.push(cur);
  return {
    positions,
    meanA,
    meanB,
    nA: rA.length,
    nB: rB.length,
    regions: regions.map((r) => ({ start: r.start, end: r.end, meanA: mean(r.a), meanB: mean(r.b), diff: mean(r.a) - mean(r.b) })),
  };
}

/**
 * Other events whose carrier fraction differs between the groups (Fisher's exact test).
 * @returns [{ label, event, a, b, fracA, fracB, p }] sorted by p
 */
export function eventContrast(events, idsA, idsB, skipKey, { maxP = 0.05, minDelta = 0.25 } = {}) {
  const A = new Set(idsA);
  const B = new Set(idsB);
  const seen = new Set();
  const out = [];
  (events || []).forEach((e) => {
    const key = driverKey(e);
    if (key === skipKey || seen.has(key)) return;
    seen.add(key);
    let a = 0;
    let b = 0;
    splitIds(e.cell_ids).forEach((id) => {
      if (A.has(id)) a += 1;
      else if (B.has(id)) b += 1;
    });
    if (!a && !b) return;
    const fracA = a / (A.size || 1);
    const fracB = b / (B.size || 1);
    const { p, oddsRatio } = fisherExact(a, A.size - a, b, B.size - b);
    if (p <= maxP || Math.abs(fracA - fracB) >= minDelta) out.push({ key, label: driverLabel(e), event: e, a, b, fracA, fracB, p, oddsRatio });
  });
  return out.sort((x, y) => x.p - y.p);
}

/**
 * Differential expression of group A vs B tested within strata (plates) and
 * combined across strata (Stouffer, weights sqrt(nA nB / (nA + nB))), so a
 * plate or region that holds only one group cannot drive the result.
 * Strata need >= minPerStratum cells of each group; without any usable stratum
 * the test falls back to one pooled stratum (flagged pooled: true).
 * @param stratumOfRow (rnaRow) -> stratum key
 * @returns { rows: [{ gene, geneIndex, avg_log2FC, pct_1, pct_2, z, p_val, q_val }], strata: [{ key, nA, nB }], pooled }
 */
export async function stratifiedDE(matrix, genes, nCells, rowsA, rowsB, stratumOfRow, options = {}) {
  const { minPct = 0.05, minPerStratum = 3, onProgress = null, chunk = 1500 } = options;
  const keyOf = new Map();
  [...rowsA, ...rowsB].forEach((r) => keyOf.set(r, `${stratumOfRow(r) ?? ""}`));
  const tally = new Map();
  const bump = (r, side) => {
    const k = keyOf.get(r);
    if (!tally.has(k)) tally.set(k, { key: k, nA: 0, nB: 0 });
    tally.get(k)[side] += 1;
  };
  rowsA.forEach((r) => bump(r, "nA"));
  rowsB.forEach((r) => bump(r, "nB"));
  let strata = [...tally.values()].filter((s) => s.nA >= minPerStratum && s.nB >= minPerStratum);
  const pooled = strata.length === 0;
  if (pooled) strata = [{ key: "", nA: rowsA.length, nB: rowsB.length }];
  const sIndex = new Map(strata.map((s, i) => [s.key, i]));
  const group = new Int8Array(nCells);
  const stratum = new Int16Array(nCells).fill(-1);
  rowsA.forEach((r) => {
    group[r] = 1;
    stratum[r] = pooled ? 0 : sIndex.get(keyOf.get(r)) ?? -1;
  });
  rowsB.forEach((r) => {
    group[r] = 2;
    stratum[r] = pooled ? 0 : sIndex.get(keyOf.get(r)) ?? -1;
  });
  const used = strata.reduce((acc, s) => ({ nA: acc.nA + s.nA, nB: acc.nB + s.nB }), { nA: 0, nB: 0 });
  const weights = strata.map((s) => Math.sqrt((s.nA * s.nB) / (s.nA + s.nB)));
  const wNorm = Math.sqrt(weights.reduce((acc, w) => acc + w * w, 0));
  const rows = [];
  for (let g = 0; g < genes.length; g += 1) {
    const aVals = strata.map(() => []);
    const bVals = strata.map(() => []);
    let sumA = 0;
    let sumB = 0;
    let detA = 0;
    let detB = 0;
    for (let k = matrix.indptr[g]; k < matrix.indptr[g + 1]; k += 1) {
      const r = matrix.indices[k];
      const s = stratum[r];
      if (s < 0) continue;
      const v = matrix.data[k];
      if (group[r] === 1) {
        aVals[s].push(v);
        sumA += Math.expm1(v);
        detA += 1;
      } else if (group[r] === 2) {
        bVals[s].push(v);
        sumB += Math.expm1(v);
        detB += 1;
      }
    }
    const pct1 = detA / (used.nA || 1);
    const pct2 = detB / (used.nB || 1);
    if (Math.max(pct1, pct2) >= minPct) {
      let zSum = 0;
      strata.forEach((s, i) => {
        zSum += weights[i] * wilcoxonFromNonzero(aVals[i], bVals[i], s.nA, s.nB).z;
      });
      const z = wNorm > 0 ? zSum / wNorm : 0;
      rows.push({
        gene: genes[g],
        geneIndex: g,
        avg_log2FC: Math.log2((sumA + 1) / (used.nA || 1)) - Math.log2((sumB + 1) / (used.nB || 1)),
        pct_1: pct1,
        pct_2: pct2,
        z,
        p_val: twoSidedP(z),
      });
    }
    if (g % chunk === chunk - 1) {
      if (onProgress) onProgress((g + 1) / genes.length);
      await yieldToBrowser();
    }
  }
  const q = benjaminiHochberg(rows.map((r) => r.p_val));
  rows.forEach((r, k) => (r.q_val = q[k]));
  rows.sort((a, b) => a.p_val - b.p_val || Math.abs(b.avg_log2FC) - Math.abs(a.avg_log2FC));
  if (onProgress) onProgress(1);
  return { rows, strata, pooled };
}

/**
 * Why a gene may differ between carriers and non-carriers:
 * "locus": within windowBp of the driver (the rearrangement itself / its breakpoint);
 * "cn": the gene's own copy number differs between the groups in the same direction (dosage);
 * "trans": neither (a candidate downstream effect).
 * @param locus { mid } of the gene, driverLoci [{ start, end }] global coordinates
 */
export function classifyDeRow(row, geneLocus, driverLoci, cnDiff, { windowBp = 5e6, minCnDiff = 0.5 } = {}) {
  if (geneLocus && (driverLoci || []).some((d) => geneLocus.mid >= d.start - windowBp && geneLocus.mid <= d.end + windowBp)) return "locus";
  if (Number.isFinite(cnDiff) && Math.abs(cnDiff) >= minCnDiff && Math.sign(cnDiff) === Math.sign(row.avg_log2FC)) return "cn";
  return "trans";
}

/**
 * Per-exon expression of a fusion partner in each group, from driver evidence
 * counts normalised to counts per million of each cell's library.
 * @param entry evidence fusion entry; gene partner gene name
 * @param libSize (cellId) -> library size (nCount_RNA)
 * @returns { exons: [{ n, start, end, a, b }], nA, nB } a/b: mean CPM per exon
 */
export function exonProfile(entry, gene, cellsA, cellsB, libSize) {
  const g = (entry?.genes || []).find((x) => x.gene === gene);
  if (!g) return null;
  const side = (ids) => {
    const rows = ids
      .map((id) => ({ id, rec: entry.cells?.[id] }))
      .filter((x) => x.rec?.exons?.[gene] && libSize(x.id) > 0);
    const sums = new Float64Array(g.exons.length);
    rows.forEach(({ id, rec }) => {
      const scale = 1e6 / libSize(id);
      rec.exons[gene].forEach((c, k) => (sums[k] += c * scale));
    });
    return { values: Array.from(sums, (s) => (rows.length ? s / rows.length : NaN)), n: rows.length };
  };
  const A = side(cellsA);
  const B = side(cellsB);
  return { exons: g.exons.map((e, k) => ({ ...e, a: A.values[k], b: B.values[k] })), nA: A.n, nB: B.n, strand: g.strand, transcript: g.transcript };
}

/** Chimeric RNA reads per group: { a: { cells, reads, discarded }, b: {...} } (cells with >= 1 read). */
export function chimericSupport(entry, cellsA, cellsB) {
  const side = (ids) =>
    ids.reduce(
      (acc, id) => {
        const r = entry?.cells?.[id];
        if (!r) return acc;
        acc.withRna += 1;
        if (r.arriba + r.discarded > 0) acc.cells += 1;
        acc.reads += r.arriba;
        acc.discarded += r.discarded;
        return acc;
      },
      { withRna: 0, cells: 0, reads: 0, discarded: 0 }
    );
  return { a: side(cellsA), b: side(cellsB) };
}
