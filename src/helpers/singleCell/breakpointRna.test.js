import {
  normalizeBreakpointTranscripts, normalizeDnaSupport, visibleTranscripts, transcriptsByJid, transcriptsForJunctionIds, parseJunctionCoords, dnaSupportOfFusion,
  igvLocus, transcriptLoci, igvUrl, contrastText, readsText, headlineCounts, emptyMessage, NOT_EXPORTED, NONE_FOUND,
} from "./breakpointRna";

const raw = {
  format: "breakpoint_transcripts_v1", patient: "SYN1", n_sv: 3,
  transcripts: [
    { jid: 11, stratum: "amplicon", cls: "dup", chrA: "7", posA: 1000, chrB: "7", posB: 5000, genes_a: ["AAA"], genes_b: ["BBB"], label: "AAA::BBB", n_car_rna: 10, n_non_rna: 40, cross_car: 6, cross_non: 0, car_rate: 0.6, non_rate: 0, fold: null, fisher_p: 1e-6, reads_car: 20, reads_non: null, confidence: "consistent", igv_locus_a: "chr7:900-1100" },
    { jid: "12", stratum: "non-amplicon", genes_a: [], genes_b: ["CCC"], n_car_rna: null, cross_car: 2, cross_non: 1, confidence: "suggestive" },
    { jid: "13", cross_car: 1, confidence: "low", fold: 2.5, non_rate: 0.1, fisher_p: 0.2, n_car_rna: 4, n_non_rna: 9, cross_non: 1 },
  ],
};
const bt = normalizeBreakpointTranscripts(raw);

describe("breakpoint transcripts", () => {
  it("normalises ids, labels and numbers", () => {
    expect(bt.transcripts.map((t) => t.jid)).toEqual(["11", "12", "13"]);
    expect(bt.transcripts[1].label).toBe("CCC");
    expect(bt.transcripts[1].n_car_rna).toBeNull();
    expect(bt.nSv).toBe(3);
  });
  it("rejects other formats", () => {
    expect(() => normalizeBreakpointTranscripts({ transcripts: [], format: "x" })).toThrow();
    expect(() => normalizeBreakpointTranscripts({})).toThrow();
  });
  it("filters by the less-confident toggle and passes untiered through", () => {
    expect(visibleTranscripts(bt.transcripts, "consistent")).toHaveLength(1);
    expect(visibleTranscripts(bt.transcripts, "suggestive")).toHaveLength(2);
    expect(visibleTranscripts(bt.transcripts, "low")).toHaveLength(3);
    expect(visibleTranscripts([{ jid: "z" }], "consistent")).toHaveLength(1);
    expect(headlineCounts(bt.transcripts, "consistent")).toMatchObject({ n: 1, total: 3, hidden: 2 });
  });
  it("looks up by jid, also numeric", () => {
    expect(transcriptsByJid(bt.transcripts, 11)).toHaveLength(1);
    expect(transcriptsByJid(bt.transcripts, "99")).toEqual([]);
    expect(transcriptsForJunctionIds(bt.transcripts, [12, "13", "x"]).map((t) => t.jid)).toEqual(["12", "13"]);
  });
  it("matches event junction strings by breakpoint coordinates, either orientation, within tolerance", () => {
    expect(parseJunctionCoords("7:1000-|chr7:5003+")).toEqual({ a: ["7", 1000], b: ["7", 5003] });
    expect(parseJunctionCoords("nonsense")).toBeNull();
    expect(transcriptsForJunctionIds(bt.transcripts, ["7:5005+|7:998-"]).map((t) => t.jid)).toEqual(["11"]);
    expect(transcriptsForJunctionIds(bt.transcripts, ["7:1000-|7:5500+"])).toEqual([]);
    expect(transcriptsForJunctionIds(bt.transcripts, ["8:1000-|8:5000+"])).toEqual([]);
  });
  it("builds loci and links", () => {
    expect(igvLocus("7:5-9")).toBe("chr7:5-9");
    expect(igvLocus("junk")).toBeNull();
    expect(transcriptLoci(bt.transcripts[0])).toEqual({ a: "chr7:900-1100", b: "chr7:4900-5100" });
    expect(igvUrl("chr7:5-9")).toContain("locus=chr7:5-9");
  });
  it("writes contrast and read text with missing values explicit", () => {
    expect(contrastText(bt.transcripts[0])).toMatch(/carriers 6\/10, non-carriers 0\/40 \(non-carrier rate 0, Fisher p 1\.0e-6\)/);
    expect(contrastText(bt.transcripts[1])).toContain("n.a.");
    expect(readsText(bt.transcripts[0])).toBe("20 / n.a.");
    expect(readsText(bt.transcripts[1])).toBe("reads not available");
  });
});

describe("DNA support sidecar", () => {
  const ds = normalizeDnaSupport({ format: "fusions_dna_support_v1", entries: [{ fusion_id: "f1", sv_jid: 11, class: "cryptic_end", confidence: "consistent" }, { fusion_id: null, sv_jid: 12 }] });
  it("indexes by fusion id", () => {
    expect(dnaSupportOfFusion(ds, { id: "f1" }).sv_jid).toBe("11");
    expect(dnaSupportOfFusion(ds, "nope")).toBeNull();
    expect(ds.byFusionId.size).toBe(1);
  });
  it("rejects other formats", () => expect(() => normalizeDnaSupport({ entries: [], format: "zz" })).toThrow());
});

describe("emptyMessage", () => {
  it("separates missing, empty and hidden", () => {
    expect(emptyMessage({ status: "missing" }, 0, 0)).toBe(NOT_EXPORTED);
    expect(emptyMessage({ status: "ok" }, 0, 0)).toBe(NONE_FOUND);
    expect(emptyMessage({ status: "ok" }, 0, 5)).toMatch(/5 hidden/);
    expect(emptyMessage({ status: "ok" }, 2, 5)).toBeNull();
  });
});
