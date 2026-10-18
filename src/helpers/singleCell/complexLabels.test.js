import { buildDriverEntries } from "./driverLayer";
import { cohortEntries } from "./cohortOncoprint";
import { chromosomeSpan, complexEntryLabel, legacyComplexLabel, collapseTwins, twinNamesOf, dmOverlap, dmOverlapText, intervalInside } from "./complexLabels";
import { parseFootprint } from "./complexZoom";

const cx = (o) => ({ type: "Complex SV", seqnames: "1", start: "1", end: "2", gene: "", ...o });
const rdd = cx({ vartype: "rDelDup", Variant: "rDelDup (1,7)", Genome_Location: "1:178054688-179054722,7:53954498-54954567", cell_ids: "a,b,c,d" });
const dm17 = cx({ vartype: "DM", Variant: "DM (1,7)", Genome_Location: "7:41978527-55927140,1:176054688-181054722", cell_ids: "a,b,x" });
const dm6 = cx({ vartype: "DM", Variant: "DM (6)", Genome_Location: "6:1-100", cell_ids: "a,b,c,d" });

describe("complex labels", () => {
  test("every chromosome in footprint order, unique", () => {
    expect(chromosomeSpan(rdd.Genome_Location)).toBe("chr1↔chr7");
    expect(chromosomeSpan("20:30687223-31687400,20:30551978-31552105")).toBe("chr20");
    expect(chromosomeSpan("12:1-5,16:1-5,7:1-5")).toBe("chr12↔chr16↔chr7");
    expect(chromosomeSpan("")).toBe("");
  });
  test("new label and the old single-chromosome form", () => {
    expect(complexEntryLabel(rdd)).toBe("rDelDup chr1↔chr7");
    expect(legacyComplexLabel(rdd)).toBe("rDelDup chr1");
  });
  test("driver entries carry the new label and the short form", () => {
    const [e] = buildDriverEntries([rdd]);
    expect(e.label).toBe("rDelDup chr1↔chr7");
    expect(e.shortLabel).toBe("rDelDup chr1");
  });
});

describe("twin groups", () => {
  const a = cx({ vartype: "TIC", Variant: "TIC (6,8)", Genome_Location: "6:10-20,8:10-20", cell_ids: "a,b,c", twin_group: "P:1", twin_names: ["TIC (6,8)", "rDelDup (6,8)"] });
  const b = cx({ vartype: "rDelDup", Variant: "rDelDup (6,8)", Genome_Location: "6:10-20,8:11-19", cell_ids: "a,b,c", twin_group: "P:1", twin_names: ["TIC (6,8)", "rDelDup (6,8)"] });
  test("string twin_names parse", () => {
    expect(twinNamesOf({ twin_names: "['TIC (6,8)', 'rDelDup (6,8)']" })).toEqual(["TIC (6,8)", "rDelDup (6,8)"]);
  });
  test("collapse keeps the first row", () => {
    const { events, twins } = collapseTwins([a, b, rdd]);
    expect(events).toEqual([a, rdd]);
    expect(twins.get(a).names).toEqual(["TIC (6,8)", "rDelDup (6,8)"]);
  });
  test("one entry, combined label, tooltip, also in the cohort path", () => {
    const entries = buildDriverEntries([a, b, rdd]);
    expect(entries).toHaveLength(2);
    const t = entries.find((e) => e.twin);
    expect(t.label).toBe("TIC / rDelDup chr6↔chr8");
    expect(t.twinTip).toMatch(/classifier reported this junction set as both/);
    expect(cohortEntries([a, b, rdd])).toHaveLength(2);
  });
});

describe("ecDNA footprint overlap", () => {
  test("containment is per interval and same chromosome", () => {
    expect(intervalInside(parseFootprint("1:178054688-179054722")[0], parseFootprint(dm17.Genome_Location))).toBe(true);
    expect(intervalInside(parseFootprint("1:170000000-179054722")[0], parseFootprint(dm17.Genome_Location))).toBe(false);
    expect(intervalInside(parseFootprint("2:178054688-179054722")[0], parseFootprint(dm17.Genome_Location))).toBe(false);
  });
  test("counts carriers inside the DM, ignores non-containing and DM events themselves", () => {
    const entries = buildDriverEntries([rdd, dm17, dm6]);
    const mine = entries.find((e) => e.event === rdd);
    const o = dmOverlap(mine, entries);
    expect(o.carriers).toBe(4);
    expect(o.overlap).toBe(2);
    expect(o.dms.map((d) => d.label)).toEqual(["DM (1,7)"]);
    expect(dmOverlap(entries.find((e) => e.event === dm17), entries)).toBeNull();
    const text = dmOverlapText(o);
    expect(text.chip).toBe("inside DM (1,7) footprint in 2 of 4 carriers");
    expect(text.note).toMatch(/not direct proof/);
    expect(dmOverlap(mine, [mine])).toBeNull();
  });
});
