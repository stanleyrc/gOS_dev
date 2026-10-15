import { columnBins } from "./matrix";
import { placeLabels, positionLabel, siteLabel } from "./snvLabels";

const v = (o) => ({ id: "chr7_1_A_G", chromosome: "chr7", position: 55181378, ref: "G", alt: "A", ...o });

describe("siteLabel", () => {
  test("gene + protein change", () => expect(siteLabel(v({ gene: "TP53", protein: "p.R273H" }))).toBe("TP53 p.R273H"));
  test("protein without p. prefix", () => expect(siteLabel(v({ gene: "EGFR", protein: "A289V" }))).toBe("EGFR p.A289V"));
  test("non-coding: gene + consequence", () => expect(siteLabel(v({ gene: "INTS11", consequence: "upstream_gene_variant" }))).toBe("INTS11 upstream gene"));
  test("Ensembl ids and unannotated sites fall back to position", () => {
    expect(siteLabel(v({ gene: "ENSG0001" }))).toBe("chr7:55,181,378 G>A");
    expect(positionLabel(v())).toBe("chr7:55,181,378 G>A");
  });
  test("modes", () => {
    const s = v({ gene: "TP53", protein: "R273H" });
    expect(siteLabel(s, "gene")).toBe("TP53");
    expect(siteLabel(s, "position")).toBe("chr7:55,181,378 G>A");
    expect(siteLabel(s, "none")).toBeNull();
  });
});

describe("placeLabels", () => {
  const variants = Array.from({ length: 100 }, (_, i) => v({ id: `s${i}`, gene: `G${i}`, protein: "A1B", driver: i === 50 }));
  const order = variants.map((_, i) => i);
  test("zoomed with wide columns labels sites without overlap", () => {
    const bins = columnBins(100, 1000, [0, 100]); // 10 px columns
    const out = placeLabels(variants, order, bins, { columnPx: 10, minGap: 11 });
    expect(out.length).toBeGreaterThan(40);
    for (let i = 1; i < out.length; i += 1) expect(out[i].x - out[i - 1].x).toBeGreaterThanOrEqual(11);
    expect(out.some((l) => l.driver)).toBe(true);
  });
  test("narrow columns: only drivers", () => {
    const bins = columnBins(100, 300, [0, 100]);
    const out = placeLabels(variants, order, bins, { columnPx: 3 });
    expect(out.map((l) => l.c)).toEqual([50]);
  });
  test("drivers labelled even with mode none", () => {
    const bins = columnBins(100, 1000, [0, 100]);
    const out = placeLabels(variants, order, bins, { mode: "none", columnPx: 10 });
    expect(out.map((l) => l.c)).toEqual([50]);
  });
});
