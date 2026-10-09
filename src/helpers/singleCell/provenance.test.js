import fs from "fs";
import path from "path";
import { PROVENANCE, WHERE, provenanceOf } from "./provenance";

const SRC = path.resolve(__dirname, "../..");

function jsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return jsFiles(p);
    return d.name.endsWith(".js") && !d.name.endsWith(".test.js") ? [p] : [];
  });
}

const files = [...jsFiles(path.join(SRC, "components/singleCell")), ...jsFiles(path.join(SRC, "tabs"))];
const used = new Set();
files.forEach((f) => {
  const s = fs.readFileSync(f, "utf8");
  for (const m of s.matchAll(/(?:<Provenance id=|<ProvenanceTip id=|provenance=)"([A-Za-z]+)"/g)) used.add(m[1]);
  // dynamic ids: the branches of a ternary (id={a ? "x" : b ? "y" : "z"})
  for (const m of s.matchAll(/<Provenance id=\{[^}]*\}/g)) for (const k of m[0].matchAll(/[?:] "([A-Za-z]+)"/g)) used.add(k[1]);
});

describe("provenance registry", () => {
  it("has a source, a calculation, a title and a known location for every entry", () => {
    Object.entries(PROVENANCE).forEach(([id, e]) => {
      expect([id, typeof e.title]).toEqual([id, "string"]);
      expect(e.source.length).toBeGreaterThan(10);
      expect(e.calc.length).toBeGreaterThan(10);
      expect(Object.keys(WHERE)).toContain(e.where);
    });
  });

  it("keeps hovers short (about 2–4 lines each)", () => {
    Object.entries(PROVENANCE).forEach(([id, e]) => {
      expect([id, e.source.length <= 200]).toEqual([id, true]);
      expect([id, e.calc.length <= 160]).toEqual([id, true]);
    });
  });

  it("names a pipeline file for every precomputed entry", () => {
    Object.entries(PROVENANCE)
      .filter(([, e]) => e.where !== "browser")
      .forEach(([id, e]) => expect([id, /\.(json|nwk|arrow|bam|rds)|rna\/|datafiles/.test(e.source)]).toEqual([id, true]));
  });

  it("is referenced only by ids that exist", () => {
    expect(used.size).toBeGreaterThan(30);
    used.forEach((id) => expect([id, !!provenanceOf(id)]).toEqual([id, true]));
  });

  it("covers the key single-cell views", () => {
    ["cnHeatmap", "snvHeatmap", "junctionHeatmap", "phylogeny", "cloneFraction", "cladeFit", "burden", "tmb", "walkCopies", "signatureSets", "qc", "de", "dosage"].forEach((id) =>
      expect([id, used.has(id)]).toEqual([id, true])
    );
  });
});
