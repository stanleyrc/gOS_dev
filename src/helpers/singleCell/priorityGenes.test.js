import { GBM_CORE_GENES, priorityGenes, priorityGenesMemo } from "./priorityGenes";

test("priority genes = GBM core + tier 1-2 driver genes", () => {
  const g = priorityGenes([{ gene: "ZZZ1", Tier: 1 }, { gene: "ZZZ2", Tier: 3 }, { fusion_genes: "AAA::BBB", Tier: 2 }]);
  expect(g).toEqual(expect.arrayContaining([...GBM_CORE_GENES, "ZZZ1", "AAA", "BBB"]));
  expect(g).not.toContain("ZZZ2");
});

test("memo returns the same array for the same events", () => {
  const ev = [{ gene: "Q", Tier: 1 }];
  expect(priorityGenesMemo(ev)).toBe(priorityGenesMemo(ev));
});
