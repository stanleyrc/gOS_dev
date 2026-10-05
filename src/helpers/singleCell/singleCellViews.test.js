import {
  CN_PALETTE_PRESETS,
  cnColorer,
  columnBins,
  countTicks,
  hexToRgb,
  normalizePalette,
  packRGBA,
  snvBinSummary,
  snvColumnOrder,
  snvMetricMax,
  snvMetricValue,
  treeColumnOrder,
  vafRGBA,
} from "./matrix";
import { allelicRowFromAllelic, parseVariantId, snvFromSparse } from "./cellFiles";
import { expressionByCell, parseRnaSummary, readMatrixBuffers, searchGeneNames } from "./staticRna";
import { layoutTree, parseNewick } from "./newick";

const chromoBins = {
  1: { startPlace: 1, endPlace: 1000, startPoint: 1, endPoint: 1000 },
  2: { startPlace: 1001, endPlace: 2000, startPoint: 1, endPoint: 1000 },
};
const rgba = (hex) => packRGBA(hexToRgb(hex));

describe("copy-number palettes", () => {
  it("colours total CN with the pgv palette and 11+ as the last colour", () => {
    const color = cnColorer(CN_PALETTE_PRESETS.pgv, "total");
    expect(color(2)).toBe(rgba("#FFFFFF"));
    expect(color(0)).toBe(rgba("#168CCB"));
    expect(color(25)).toBe(rgba("#000000"));
    expect(color(NaN)).toBe(rgba("#EEEEEE"));
  });

  it("shifts the allelic palette so CN 1 is white", () => {
    const color = cnColorer(CN_PALETTE_PRESETS.pgv, "major");
    expect(color(1)).toBe(rgba("#FFFFFF"));
    expect(color(2)).toBe(rgba("#FDBF6F"));
  });

  it("repairs stored palettes with missing or invalid colours", () => {
    const p = normalizePalette({ total: ["#123456", "nope"] });
    expect(p.total[0]).toBe("#123456");
    expect(p.total[1]).toBe(CN_PALETTE_PRESETS.pgv.total[1]);
    expect(p.allelic).toHaveLength(12);
  });
});

describe("allelic copy number", () => {
  it("pairs two observations per locus into major and minor", () => {
    const row = allelicRowFromAllelic(
      {
        intervals: [
          { chromosome: "1", startPoint: 1, endPoint: 100, y: 1, type: "interval" },
          { chromosome: "1", startPoint: 1, endPoint: 100, y: 3, type: "interval" },
          { chromosome: "1", startPoint: 101, endPoint: 200, majorCn: 2, minorCn: 0 },
          { chromosome: "2", startPoint: 1, endPoint: 50, y: 2 },
        ],
      },
      chromoBins
    );
    expect(Array.from(row.major)).toEqual([3, 2, NaN]);
    expect(Array.from(row.minor)).toEqual([1, 0, NaN]);
    expect(row.binIndex.n).toBe(3);
  });
});

describe("patient SNV matrix (pgv sparse format)", () => {
  const sparse = {
    variants: [{ id: "chr1_100_G_A" }, { id: "chr2_50_C_T", gene: "EGFR" }, { id: "bad" }],
    cells: {
      a: [
        { variantId: "chr1_100_G_A", refCount: 5, altCount: 5, vaf: 0.5 },
        { variantId: "chr2_50_C_T", refCount: 4, altCount: 0, vaf: 0 },
      ],
      b: [{ variantId: "chr1_100_G_A", refCount: null, altCount: null, vaf: null }],
    },
  };
  const snv = snvFromSparse(sparse, ["a", "b", "c"], chromoBins);

  it("parses variant ids", () => {
    expect(parseVariantId("chr1_100_G_A")).toEqual({ chromosome: "1", position: 100, ref: "G", alt: "A" });
    expect(snv.variants.map((v) => v.id)).toEqual(["chr1_100_G_A", "chr2_50_C_T"]);
    expect(snv.variants[1].gene).toBe("EGFR");
  });

  it("keeps reads at sites where the variant was not called", () => {
    expect(Array.from(snv.status[0])).toEqual([1, 0]);
    expect(Array.from(snv.status[1])).toEqual([-1, -1]);
    expect(snvMetricValue(snv, 0, 0, "vaf")).toBe(0.5);
    expect(snvMetricValue(snv, 0, 1, "vaf")).toBe(0);
    expect(snvMetricValue(snv, 0, 1, "depth")).toBe(4);
    expect(snvMetricValue(snv, 0, 1, "alt")).toBe(0);
    expect(snvMetricValue(snv, 1, 0, "vaf")).toBeNull();
    expect(snvMetricMax(snv, "depth")).toBe(10);
  });

  it("summarizes bins by positive sites", () => {
    expect(snvBinSummary(snv, 0, [0, 1], 0, 2)).toEqual({ positive: 1, zero: 1, missing: 0 });
    expect(snvBinSummary(snv, -1, [0, 1], 0, 2)).toEqual({ positive: 0, zero: 0, missing: 2 });
  });

  it("reads compact [variantIndex, ref, alt] entries", () => {
    const compact = snvFromSparse(
      { variants: sparse.variants, cells: { a: [[0, 5, 5], [1, 4, 0]], b: [[0, null, null]] } },
      ["a", "b", "c"],
      chromoBins
    );
    expect(compact.status).toEqual(snv.status);
    expect(compact.depth).toEqual(snv.depth);
  });

  it("keeps file order as the catalog order", () => {
    expect(snvColumnOrder(snv, "catalog")).toEqual([0, 1]);
  });
});

describe("mutation colours and bins", () => {
  it("draws VAF white to black", () => {
    expect(vafRGBA(0)).toBe(rgba("#FFFFFF"));
    expect(vafRGBA(1)).toBe(rgba("#000000"));
  });

  it("bins sites when they outnumber pixels, else spreads them", () => {
    const many = columnBins(1000, 100);
    expect(many.binned).toBe(true);
    expect(many.binStart[0]).toBe(0);
    expect(many.binEnd[99]).toBe(1000);
    const few = columnBins(10, 100, [2, 7]);
    expect(few.binned).toBe(false);
    expect(few.binStart[0]).toBe(2);
    expect(few.binStart[99]).toBe(6);
    expect(few.binEnd[99] - few.binStart[99]).toBe(1);
  });

  it("gives log-spaced count ticks", () => {
    expect(countTicks(100)[0]).toBe(0);
    expect(countTicks(100).slice(-1)[0]).toBe(100);
  });
});

describe("tree-ordered mutation columns", () => {
  it("places trunk variants first, then each clade's variants", () => {
    // ((a,b),(c,d)): leaf rows a=0, b=1, c=2, d=3.
    const layout = layoutTree(parseNewick("((a:1,b:1):1,(c:1,d:1):1);"));
    const ids = layout.leaves;
    const calls = {
      // v0 in c,d; v1 in all; v2 in a,b
      a: [0, 1, 1],
      b: [0, 1, 1],
      c: [1, 1, 0],
      d: [1, 1, 0],
    };
    const snv = {
      variants: [0, 1, 2].map((index) => ({ index, id: `v${index}` })),
      status: ids.map((id) => Int8Array.from(calls[id])),
      alt: ids.map(() => new Float32Array(3)),
      depth: ids.map(() => new Float32Array(3)),
    };
    const rows = Int32Array.from(ids, (_, k) => k);
    const order = treeColumnOrder(snv, layout, rows);
    expect(order[0]).toBe(1);
    const clade = (v) => (calls[ids[0]][v] ? "top" : "bottom");
    expect(order.slice(1).map(clade)).toEqual(["top", "bottom"]);
  });
});

describe("static RNA files", () => {
  const summary = parseRnaSummary(
    {
      cells: [
        { rna_id: "r1", cell_id: "c1", umap_1: 0, umap_2: 1, state: "MES", score: 0.5 },
        { rna_id: "r2", cell_id: null, umap_1: 1, umap_2: 0, state: "AC", score: -1 },
      ],
    },
    "EGFR\nPTEN\nEGR1\n"
  );

  it("parses cells, genes and colourable fields", () => {
    expect(summary.cells.map((c) => c.displayId)).toEqual(["c1", "r2"]);
    expect(summary.hasUmap).toBe(true);
    const fields = Object.fromEntries(summary.fields.map((f) => [f.name, f.numeric]));
    expect(fields).toEqual({ state: false, score: true });
    expect(searchGeneNames(summary.genes, "eg")).toEqual(["EGFR", "EGR1"]);
  });

  it("reads one gene from the gene-compressed matrix", () => {
    // genes x cells: EGFR = [2, 0], PTEN = [0, 3], EGR1 = [1, 1]
    const i32 = (a) => Int32Array.from(a).buffer;
    const f32 = (a) => Float32Array.from(a).buffer;
    const matrix = readMatrixBuffers(i32([0, 1, 2, 4]), i32([0, 1, 0, 1]), f32([2, 3, 1, 1]));
    expect(expressionByCell(summary, matrix, "egfr")).toEqual({ gene: "EGFR", values: { c1: 2, r2: 0 }, max: 2 });
    expect(expressionByCell(summary, matrix, "PTEN").values).toEqual({ c1: 0, r2: 3 });
    expect(expressionByCell(summary, matrix, "NOPE")).toBeNull();
  });
});
