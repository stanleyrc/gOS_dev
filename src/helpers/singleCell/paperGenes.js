// d3-free: gene symbols inside interactive paper figures -> gene card. The figure SVGs are cairo output (text is glyph paths, no <text>),
// so genes are found from the sidecar: a `gene` field on a mark, the discrete axis labels (a label may hold several symbols, e.g.
// "BWH70 EGFR" or "CNOT2::PPM1H (MGH303) e1 > intron 4"), and, optionally, the gene under the cursor on a genome-axis track
// (gene_spans.json). A symbol counts only if it is an exact (case-sensitive) key of the gene summary table: no hard-coded lists.
import { plotHitAt, toData } from "./paperSidecar";
import { regionWindow } from "./paperZoom";
import { GBM_GENES } from "./geneInfo";

export const CHAR_PT = 3.3; // average label glyph width (pt) at the figures' axis font size

const TOKEN = /[^\s:,;()/>|[\]{}=*+~"'<]+/g;

/** Symbols of a text that pass isGene: [{ gene, i0, i1 }] (character span in the text); stray dots / dashes at the ends are trimmed. */
export function labelGenes(text, isGene) {
  const out = [];
  if (!isGene) return out;
  `${text ?? ""}`.replace(TOKEN, (m, i) => {
    const t = m.replace(/^[-.]+|[-.]+$/g, "");
    if (t && isGene(t)) out.push({ gene: t, i0: i, i1: i + m.length });
    return m;
  });
  return out;
}

/** The symbol of a right-aligned label (ending at page x `end`) under page x, else the first one. */
function pickByX(label, genes, x, end, charPt) {
  if (genes.length < 2) return genes[0]?.gene || null;
  const idx = (x - (end - label.length * charPt)) / charPt;
  const hit = genes.find((g) => idx >= g.i0 && idx <= g.i1);
  return (hit || genes.reduce((a, b) => (Math.abs((a.i0 + a.i1) / 2 - idx) <= Math.abs((b.i0 + b.i1) / 2 - idx) ? a : b))).gene;
}

const cache = new WeakMap();
const byChrom = (spans) => {
  if (!cache.has(spans)) {
    const m = new Map();
    spans.forEach((s) => m.set(s.chromosome, [...(m.get(s.chromosome) || []), s]));
    cache.set(spans, m);
  }
  return cache.get(spans);
};

/** Genes of the spans overlapping chr:pos +- tol (bp), coding first when any, GBM drivers first, then narrowest span first; max names. */
export function genesAtPosition(spans, chr, pos, tol = 0, max = 6) {
  if (!spans || !Number.isFinite(pos)) return [];
  const hits = (byChrom(spans).get(`${chr}`.replace(/^chr/i, "")) || []).filter((s) => s.start <= pos + tol && s.end >= pos - tol);
  const coding = hits.filter((s) => s.coding);
  const rank = (s) => [GBM_GENES[s.gene] ? 0 : 1, s.end - s.start];
  return (coding.length ? coding : hits)
    .sort((a, b) => rank(a)[0] - rank(b)[0] || rank(a)[1] - rank(b)[1])
    .slice(0, max)
    .map((s) => s.gene);
}

const inBox = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/**
 * The gene under a page point (pt) of an interactive figure: { gene, genes, kind: "mark" | "axis label" | "genome", fields? } or null.
 * isGene(symbol): exact symbol test. genome: also resolve genome-axis rows regions through spans (hg38 GENCODE coordinates).
 * zoomWin(region): a zoomed CN window { from, to } replacing the sidecar axis, or null.
 */
export function geneAtPoint(sidecar, x, y, { isGene, spans = null, genome = false, zoomWin = null, charPt = CHAR_PT } = {}) {
  if (!sidecar || !isGene) return null;
  const ph = plotHitAt(sidecar, x, y);
  if (ph?.fields?.gene != null) {
    const gs = labelGenes(ph.fields.gene, isGene);
    if (gs.length) return { gene: gs[0].gene, genes: gs.map((g) => g.gene), kind: "mark", fields: ph.fields };
  }
  for (const r of sidecar.regions) {
    if (r.kind !== "plot" || !r.xscale || !r.yscale) continue;
    const ys = r.yscale;
    if (ys.discrete && ys.labels?.length) {
      const w = Math.max(...ys.labels.map((l) => `${l}`.length)) * charPt + 6;
      if (x >= r.x - w && x < r.x && y >= r.y && y <= r.y + r.h) {
        const row = Math.round(toData(r, r.x, y)[1]);
        const lab = ys.labels[row - 1];
        const gs = labelGenes(lab, isGene);
        if (gs.length) return { gene: pickByX(`${lab}`, gs, x, r.x - 2, charPt), genes: gs.map((g) => g.gene), kind: "axis label" };
      }
    }
    const xs = r.xscale;
    if (xs.discrete && xs.labels?.length && x >= r.x && x <= r.x + r.w && y > r.y + r.h && y <= r.y + r.h + 16) {
      const lab = xs.labels[Math.round(toData(r, x, r.y)[0]) - 1];
      const gs = labelGenes(lab, isGene);
      if (gs.length) return { gene: gs[0].gene, genes: gs.map((g) => g.gene), kind: "axis label" };
    }
  }
  if (genome && spans) {
    const r = sidecar.regions.find((q) => q.kind === "rows" && q.axis?.type === "genome" && inBox(q, x, y));
    if (r) {
      const zw = zoomWin ? zoomWin(r) : null;
      const [chr, from, to] = zw
        ? [`${r.axis.chr}`, zw.from + (((x - 1) - r.x) / r.w) * (zw.to - zw.from), zw.from + (((x + 1) - r.x) / r.w) * (zw.to - zw.from)]
        : (() => {
            const w = regionWindow(r, x - 1, x + 1);
            return [w.chr, w.from, w.to];
          })();
      const genes = genesAtPosition(spans, chr, Math.round((from + to) / 2), Math.round((to - from) / 2));
      if (genes.length) return { gene: genes[0], genes, kind: "genome", position: { chr, pos: Math.round((from + to) / 2) } };
    }
  }
  return null;
}

// ---- our data for the card: _cohort/depmap_amplicon_genes.json (srctools DepMap 26Q3 amplicon-gene export)

export const DEPMAP_FILE = "depmap_amplicon_genes.json";
export const DEPMAP_MISSING = `not available (${DEPMAP_FILE} is not exported for this dataset)`;

/** Map(gene -> rows[]) from the parsed json, null when missing / wrong schema. */
export function parseDepmap(doc) {
  if (!doc || doc.format !== "depmap_amplicon_genes_v1" || !Array.isArray(doc.rows)) return null;
  const m = new Map();
  doc.rows.forEach((r) => r?.gene && m.set(r.gene, [...(m.get(r.gene) || []), r]));
  return { genes: m, release: doc.release?.release || doc.release_id || "" };
}

const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * Card data for a gene: { patients: [{ patient, cells, driverWalk }] (on an amplicon walk in >= 3 cells), dep } with DepMap Chronos
 * (gene-level, identical across a gene's rows) or null when the gene has no row.
 */
export function geneCardData(dm, gene) {
  const rows = dm?.genes.get(gene) || [];
  if (!rows.length) return { patients: [], dep: null };
  const r0 = rows.find((r) => r.in_depmap === true || r.in_depmap === "TRUE") || null;
  return {
    patients: rows.map((r) => ({ patient: r.patient, cells: num(r.max_walk_cells), driverWalk: r.in_driver_walk === true || r.in_driver_walk === "TRUE" })).sort((a, b) => (b.cells ?? 0) - (a.cells ?? 0)),
    dep: r0 && {
      cls: r0.dep_class || "",
      nLines: num(r0.n_lines),
      nGlioma: num(r0.n_glioma),
      pan: num(r0.chronos_pan_median),
      glioma: num(r0.chronos_glioma_median),
      fracPan: num(r0["frac_pan_lt_0.5"]),
      fracGlioma: num(r0["frac_glioma_lt_0.5"]),
      nAmp: num(r0.n_amp_lines),
      effAmp: num(r0.effect_amp_median),
      effNonamp: num(r0.effect_nonamp_median),
      pAmp: num(r0.p_amp_vs_not),
      rhoCn: num(r0.rho_cn_effect),
      qCn: num(r0.q_cn_effect),
    },
  };
}

const fx = (v, d = 2) => (v == null ? "n/a" : v.toFixed(d));
const fp = (v) => (v == null ? "n/a" : v < 0.001 ? v.toExponential(1) : v.toFixed(3));

/** Text lines for the DepMap block: [{ key, text }]; [] when dep is null. */
export function depLines(dep, release = "DepMap") {
  if (!dep) return [];
  const out = [{ key: "chr", text: `Chronos (${release}): glioma median ${fx(dep.glioma)} (${fx(dep.fracGlioma == null ? null : dep.fracGlioma * 100, 0)}% of ${dep.nGlioma ?? "?"} lines < -0.5), all lines ${fx(dep.pan)} (${dep.nLines ?? "?"} lines)` }];
  if (dep.cls) out.push({ key: "cls", text: `Dependency class: ${dep.cls.replace(/_/g, " ")}` });
  if (dep.nAmp != null && dep.effAmp != null) out.push({ key: "amp", text: `Amplified lines (${dep.nAmp}): median effect ${fx(dep.effAmp)} vs ${fx(dep.effNonamp)} otherwise (p ${fp(dep.pAmp)})` });
  return out;
}
