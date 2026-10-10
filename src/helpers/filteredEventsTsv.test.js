import { eventsToTsv, sortForExport, tsvCell } from "./filteredEventsTsv";

describe("filtered events TSV", () => {
  const rows = [
    { gene: "HAS2", variant: "p.F44L", type: "Missense", tier: 3, Variant_g: "8:121629209-121629209 G>C", cell_fraction: 0.95, driver_score: 0, driver_evidence: "SIFT tolerated (1.00)\tPolyPhen benign" },
    { gene: "EGFR", variant: "AMP", type: "SCNA", tier: 2, Genome_Location: "7:55019017-55211628", cell_fraction: 1, therapeutics: ["Erlotinib", "Gefitinib"] },
  ];

  it("writes only the fields some row has, plus export columns", () => {
    const tsv = eventsToTsv(rows, [{ key: "cladeScore", exportTitle: "clade_f1", exportValue: (r) => (r.gene === "HAS2" ? 0.98 : null) }, { key: "select", title: "x" }]);
    const [header, first, second] = tsv.split("\n").filter(Boolean).map((l) => l.split("\t"));
    expect(header).toEqual(["gene", "variant", "type", "tier", "location", "cell_fraction", "driver_score", "driver_evidence", "therapeutics", "clade_f1"]);
    expect(first).toEqual(["HAS2", "p.F44L", "Missense", "3", "8:121629209-121629209 G>C", "0.95", "0", "SIFT tolerated (1.00) PolyPhen benign", "", "0.98"]);
    expect(second[4]).toBe("7:55019017-55211628");
    expect(second[8]).toBe("Erlotinib,Gefitinib");
    expect(second[9]).toBe("");
  });

  it("cleans cells", () => {
    expect(tsvCell("<b>a</b>\nb")).toBe("a b");
    expect(tsvCell(NaN)).toBe("");
    expect(tsvCell(0)).toBe("0");
  });

  it("applies the table's active sort", () => {
    const columns = [{ key: "frac", sorter: (a, b) => a.cell_fraction - b.cell_fraction }];
    expect(sortForExport(rows, columns, { columnKey: "frac", order: "ascend" }).map((r) => r.gene)).toEqual(["HAS2", "EGFR"]);
    expect(sortForExport(rows, columns, { columnKey: "frac", order: "descend" }).map((r) => r.gene)).toEqual(["EGFR", "HAS2"]);
    expect(sortForExport(rows, columns, { columnKey: null, order: null })).toBe(rows);
  });
});
