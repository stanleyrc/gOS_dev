import { setOptionParts, treeOptionParts } from "./selectOptions";

test("tree option keeps label and note", () => {
  const o = treeOptionParts({ name: "a", label: "Our tree · 132 cells", note: "built from X" });
  expect(o).toEqual({ value: "a", short: "Our tree · 132 cells", note: "built from X", title: "Our tree · 132 cells\nbuilt from X" });
  expect(treeOptionParts({ name: "b" }).title).toBe("b");
});

test("set option splits at the first parenthesis", () => {
  const o = setOptionParts({ name: "s", label: "Collaborator QC-ok (slow to load)", n_variants: 30277 });
  expect(o.short).toBe("Collaborator QC-ok");
  expect(o.note).toContain("(slow to load)");
  expect(o.note).toContain("30,277 sites");
  expect(setOptionParts({ name: "f", label: "Full" }).note).toBe("");
});
