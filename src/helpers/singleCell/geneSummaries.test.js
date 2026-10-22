import { NOT_AVAILABLE, functionLine, geneBadges, geneInfoLinks, loadGeneSummaries, lookupGene, parseGeneSummaries, summarySnippet } from "./geneSummaries";
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from "util";

// jsdom has no TextEncoder / TextDecoder
if (typeof global.TextEncoder === "undefined") global.TextEncoder = NodeTextEncoder;
if (typeof global.TextDecoder === "undefined") global.TextDecoder = NodeTextDecoder;

// synthetic fixture (not real summaries)
const HEAD = "symbol\tentrez_id\tensembl_id\tname\tgene_type\tsummary\tsource\turl\toncokb_oncogene\toncokb_tsg\toncokb_level\tin_data";
const TSV = [
  HEAD,
  "GENEA\t1\tENSG1\tgene a\tprotein-coding\tGENEA, a kinase, is altered in tumors. It has a \\\"quoted\\\" second sentence.\tOncoKB\thttps://www.oncokb.org/gene/GENEA\tyes\t\t1/R1\tsplicing",
  "GENEB\t2\t\tgene b\tprotein-coding\tThis gene encodes a protein involved in e.g. transport of ions across membranes. Second sentence here.\tNCBI Gene (RefSeq)\thttps://www.ncbi.nlm.nih.gov/gene/2\t\tyes\t\tde",
  `GENEC\t3\t\t\tncRNA\t${NOT_AVAILABLE}\tnone\t\t\t\t\t`,
].join("\n");

describe("parseGeneSummaries", () => {
  const map = parseGeneSummaries(TSV);
  it("reads records and unescapes", () => {
    expect(map.size).toBe(3);
    const a = map.get("GENEA");
    expect(a).toMatchObject({ entrez: "1", ensembl: "ENSG1", source: "OncoKB", oncogene: true, tsg: false, level: "1/R1" });
    expect(a.summary).toContain('"quoted"');
  });
  it("blanks the summary when the source is none", () => {
    expect(map.get("GENEC")).toMatchObject({ summary: "", source: "", type: "ncRNA" });
  });
  it("rejects other files", () => {
    expect(parseGeneSummaries("<html></html>")).toBeNull();
    expect(parseGeneSummaries("")).toBeNull();
  });
});

describe("lookupGene", () => {
  const map = parseGeneSummaries(TSV);
  it("matches exact, first of a list and upper case", () => {
    expect(lookupGene(map, "GENEA").symbol).toBe("GENEA");
    expect(lookupGene(map, "GENEB,OTHER").symbol).toBe("GENEB");
    expect(lookupGene(map, "GENEA(1234)").symbol).toBe("GENEA");
    expect(lookupGene(map, "geneb").symbol).toBe("GENEB");
    expect(lookupGene(map, "NOPE")).toBeNull();
    expect(lookupGene(null, "GENEA")).toBeNull();
  });
});

describe("text helpers", () => {
  it("snippets cut at a word boundary", () => {
    const long = "word ".repeat(100).trim();
    const s = summarySnippet(long, 50);
    expect(s.truncated).toBe(true);
    expect(s.text.length).toBeLessThanOrEqual(51);
    expect(s.text.endsWith("…")).toBe(true);
    expect(summarySnippet("short", 50)).toEqual({ text: "short", truncated: false });
  });
  it("functionLine takes the first sentence", () => {
    const map = parseGeneSummaries(TSV);
    expect(functionLine(map.get("GENEA"))).toBe("GENEA, a kinase, is altered in tumors.");
    expect(functionLine(map.get("GENEB"))).toBe("This gene encodes a protein involved in e.g. transport of ions across membranes.");
    expect(functionLine(map.get("GENEC"))).toBe("");
    expect(functionLine(null)).toBe("");
  });
  it("badges and links", () => {
    const map = parseGeneSummaries(TSV);
    expect(geneBadges(map.get("GENEA")).map((b) => b.key)).toEqual(["onc", "lvl"]);
    expect(geneBadges(map.get("GENEB")).map((b) => b.key)).toEqual(["tsg"]);
    const links = geneInfoLinks("GENEB", map.get("GENEB"));
    expect(links.map((l) => l.label)).toEqual(["GeneCards", "NCBI Gene", "UniProt", "OncoKB"]);
    expect(links[1].href).toBe("https://www.ncbi.nlm.nih.gov/gene/2");
  });
});

describe("loadGeneSummaries", () => {
  const enc = (s) => new TextEncoder().encode(s).buffer;
  const resp = (ok, buf, status = 200) => ({ ok, status, arrayBuffer: async () => buf });
  it("falls back to the plain file when the .gz is missing", async () => {
    const urls = [];
    const fetchImpl = async (u) => {
      urls.push(u);
      return u.endsWith(".gz") ? resp(false, null, 404) : resp(true, enc(TSV));
    };
    const res = await loadGeneSummaries("common/", { fetchImpl });
    expect(urls).toEqual(["common/gene_summaries.tsv.gz", "common/gene_summaries.tsv"]);
    expect(res.map.size).toBe(3);
  });
  it("gunzips a gzip body", async () => {
    const gz = new Uint8Array([0x1f, 0x8b, 0, 0]).buffer;
    const res = await loadGeneSummaries("x/", { fetchImpl: async () => resp(true, gz), gunzip: async () => TSV });
    expect(res.map.get("GENEB").tsg).toBe(true);
  });
  it("accepts a .gz served already inflated (Content-Encoding)", async () => {
    const res = await loadGeneSummaries("x/", { fetchImpl: async () => resp(true, enc(TSV)) });
    expect(res.map.size).toBe(3);
  });
  it("reports why when nothing can be read", async () => {
    const res = await loadGeneSummaries("x/", { fetchImpl: async () => resp(true, enc("<html>")) });
    expect(res.map).toBeUndefined();
    expect(res.error).toMatch(/not a gene summary table/);
  });
});
