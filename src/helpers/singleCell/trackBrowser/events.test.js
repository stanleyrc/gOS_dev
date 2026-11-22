import { eventLabel, eventsInWindows, normalizeEvents } from "./events";

test("events: normalize, clip to windows, label", () => {
  const ev = normalizeEvents({ events: [
    { id: "a1", kind: "amplicon", seqnames: "chr7", start: 45e6, end: 48e6, class: "BFB (fold-back ladder)", ecdna_call: "stable" },
    { id: "r1", kind: "arm", chrom: "7", start: 1, end: 60e6, class: "whole-chromosome missegregation", status: "fixed (clonal)" },
    { id: "bad", chrom: "7", start: 5, end: 1 },
  ] });
  expect(ev.map((e) => e.id)).toEqual(["a1", "r1"]);
  const slots = [{ window: { chrom: "7", start: 46e6, end: 50e6 } }, { window: { chrom: "12", start: 1, end: 2e6 } }];
  const hits = eventsInWindows(ev, slots);
  expect(hits.map((h) => [h.event.id, h.slot, h.start, h.end])).toEqual([["a1", 0, 46e6, 48e6], ["r1", 0, 46e6, 50e6]]);
  expect(eventLabel(ev[0])).toBe("BFB (fold-back ladder) · ecDNA caller: stable");
  expect(eventLabel(ev[1])).toBe("whole-chromosome missegregation (fixed (clonal))");
});

test("events v0.4: fragments per copy and ATAC vs CN kept when present", () => {
  const ev = normalizeEvents([{ id: "a", kind: "amplicon", chrom: "12", start: 1, end: 10, fragments_per_copy: "3.2", atac_vs_cn: "0.81" }, { id: "b", kind: "amplicon", chrom: "12", start: 1, end: 10 }]);
  expect(ev[0].fragmentsPerCopy).toBe(3.2);
  expect(ev[0].atacVsCn).toBe("0.81");
  expect(ev[1].fragmentsPerCopy).toBeNull();
});
