import {
  DATA_TYPES,
  assayFamily,
  canonicalReason,
  chooseCanonical,
  dataTypeOptions,
  dedupeReports,
  groupReports,
  homeFilterQuery,
  isDedupeOn,
  mergeDataTypes,
  normalizeDataTypes,
  parseDtypeParam,
  readHomeFilterPrefs,
  recordDataTypes,
  reportGroupKey,
  reportPatient,
  withDataTypeField,
} from "./reportDataTypes";

// synthetic fixtures only
const sc = (pair, extra = {}) => ({ pair, caseReportId: pair, entry_type: "patient", data_type: ["sc_dna_pta"], ...extra });

describe("data type parsing", () => {
  it("normalises codes, labels, aliases and comma strings in facet order", () => {
    expect(normalizeDataTypes("bulk_wgs")).toEqual(["bulk_wgs"]);
    expect(normalizeDataTypes("same-cell DNA + RNA, PTA")).toEqual(["sc_dna_pta", "sc_dna_rna"]);
    expect(normalizeDataTypes(["low-pass", "slide-tag", "dATAC", "DLP+", "hic"])).toEqual(["sc_dna_lowpass", "sc_dna_spatial", "datac", "droplet_hic", "dlp_plus"]);
    expect(normalizeDataTypes("something new")).toEqual(["other"]);
  });

  it("empty or missing is unknown; unknown drops out when a real type is present", () => {
    expect(normalizeDataTypes(undefined)).toEqual(["unknown"]);
    expect(normalizeDataTypes("")).toEqual(["unknown"]);
    expect(normalizeDataTypes(["unknown", "bulk_wgs"])).toEqual(["bulk_wgs"]);
  });

  it("takes a report's own type over its dataset's", () => {
    expect(recordDataTypes({ data_type: "sc_rna" }, { data_type: ["bulk_wgs"] })).toEqual(["sc_rna"]);
    expect(recordDataTypes({}, { data_type: ["bulk_wgs"] })).toEqual(["bulk_wgs"]);
    expect(recordDataTypes({}, {})).toEqual(["unknown"]);
  });

  it("merges types of the same report seen in two datasets", () => {
    expect(mergeDataTypes(["sc_dna_pta"], "sc_dna_rna")).toEqual(["sc_dna_pta", "sc_dna_rna"]);
  });

  it("lists every known type as an option with counts; absent ones disabled", () => {
    const opts = dataTypeOptions({ bulk_wgs: 3, sc_dna_pta: 5, weird: 1 });
    expect(opts.slice(0, DATA_TYPES.length).map((o) => o.value)).toEqual(DATA_TYPES.map((d) => d.value));
    expect(opts.find((o) => o.value === "bulk_wgs")).toMatchObject({ count: 3, disabled: false, label: "bulk WGS" });
    expect(opts.find((o) => o.value === "datac")).toMatchObject({ count: 0, disabled: true });
    expect(opts[opts.length - 1]).toMatchObject({ value: "weird", count: 1 });
  });

  it("adds the Data type field after Dataset once", () => {
    const fields = [{ id: "tags" }, { id: "pair" }, { id: "sourceDatasetTitle" }, { id: "patient_id" }];
    const out = withDataTypeField(fields);
    expect(out.map((f) => f.id)).toEqual(["tags", "pair", "sourceDatasetTitle", "data_type", "patient_id"]);
    expect(withDataTypeField(out)).toBe(out);
    expect(withDataTypeField([{ id: "pair" }]).map((f) => f.id)).toEqual(["pair", "data_type"]);
  });
});

describe("URL / storage persistence", () => {
  const store = (obj) => ({ getItem: () => (obj ? JSON.stringify(obj) : null), setItem: () => {} });

  it("parses dtype= lists", () => {
    expect(parseDtypeParam("bulk_wgs,sc_dna_pta")).toEqual(["sc_dna_pta", "bulk_wgs"]);
    expect(parseDtypeParam("")).toEqual([]);
    expect(parseDtypeParam(null)).toEqual([]);
  });

  it("URL wins over storage; storage fills in when the URL is silent", () => {
    expect(readHomeFilterPrefs("?dtype=bulk_wgs&dedupe=0", store({ dtype: ["sc_rna"], dedupe: 1 }))).toEqual({ data_type: ["bulk_wgs"], dedupe: 0 });
    expect(readHomeFilterPrefs("", store({ dtype: ["sc_rna"], dedupe: 0 }))).toEqual({ data_type: ["sc_rna"], dedupe: 0 });
    expect(readHomeFilterPrefs("", store(null))).toEqual({});
  });

  it("writes dtype / dedupe into the query and keeps other params", () => {
    expect(homeFilterQuery("?location=1:1-2&scope=all", { data_type: ["sc_dna_pta", "bulk_wgs"], dedupe: 1 })).toBe("?location=1%3A1-2&scope=all&dtype=sc_dna_pta%2Cbulk_wgs&dedupe=1");
    expect(homeFilterQuery("?dtype=x&dedupe=1", {})).toBe("");
  });

  it("dedupe defaults on", () => {
    expect(isDedupeOn({})).toBe(true);
    expect(isDedupeOn({ dedupe: 1 })).toBe(true);
    expect(isDedupeOn({ dedupe: 0 })).toBe(false);
    expect(isDedupeOn({ dedupe: "0" })).toBe(false);
  });
});

describe("one per patient: grouping", () => {
  it("takes the patient from the field, else the name before the first underscore", () => {
    expect(reportPatient({ pair: "PT9_v2", patient: "PT9" })).toEqual({ patient: "PT9", source: "field" });
    expect(reportPatient({ pair: "PT9_PRI_REC_clean" })).toEqual({ patient: "PT9", source: "name" });
  });

  it("keeps slide-tag and plate single-cell data apart; bulk without a patient field is never grouped", () => {
    expect(assayFamily(["sc_dna_pta", "sc_dna_rna"])).toBe("scdna");
    expect(assayFamily(["sc_dna_lowpass"])).toBe("scdna");
    expect(assayFamily(["sc_dna_spatial"])).toBe("spatial");
    expect(reportGroupKey(sc("PT1_ST", { data_type: ["sc_dna_spatial"] }))).toBe("PT1|spatial");
    expect(reportGroupKey(sc("PT1_v6"))).toBe("PT1|scdna");
    expect(reportGroupKey({ pair: "TCGA_pair_1", data_type: ["bulk_wgs"] })).toBeNull();
    expect(reportGroupKey({ pair: "B1", patient: "PT1", data_type: ["bulk_wgs"] })).toBe("PT1|bulk_wgs");
    expect(reportGroupKey({ pair: "X", report_group: "g1" })).toBe("g1");
  });

  it("groups versions in first-seen order", () => {
    const groups = groupReports([sc("PT1"), sc("PT2_v6"), sc("PT1_v6"), sc("PT2")]);
    expect(groups.map((g) => g.key)).toEqual(["PT1|scdna", "PT2|scdna"]);
    expect(groups[0].members.map((r) => r.pair)).toEqual(["PT1", "PT1_v6"]);
  });
});

describe("one per patient: canonical choice", () => {
  it("1. an explicit canonical / primary_report flag wins", () => {
    const g = [sc("PT1"), sc("PT1_v7_c11", { canonical: true }), sc("PT1_v6")];
    expect(chooseCanonical(g).pair).toBe("PT1_v7_c11");
    expect(canonicalReason(g[1], g)).toBe("explicit canonical flag");
    expect(chooseCanonical([sc("PT1"), sc("PT1_b", { primary_report: "true" })]).pair).toBe("PT1_b");
  });

  it("2. else the un-suffixed name", () => {
    const g = [sc("PT1_v6", { exported: "2026-12-01" }), sc("PT1", { exported: "2026-01-01" })];
    expect(chooseCanonical(g).pair).toBe("PT1");
    expect(canonicalReason(g[1], g)).toBe("un-suffixed name");
  });

  it("3. else the fewest suffixes, 4. then the newest export, 5. then list order", () => {
    expect(chooseCanonical([sc("PT1_ST_v6"), sc("PT1_ST"), sc("PT1_ST_auto")]).pair).toBe("PT1_ST");
    expect(chooseCanonical([sc("PT1_a", { exported: "2026-10-20 15:33" }), sc("PT1_b", { exported: "2026-10-22 08:52" })]).pair).toBe("PT1_b");
    expect(chooseCanonical([sc("PT1_a"), sc("PT1_b")]).pair).toBe("PT1_a");
  });

  it("dedupes in list order, folding the other versions into the canonical copy", () => {
    const records = [sc("PT1_v6"), { pair: "BULK_1", data_type: ["bulk_wgs"] }, sc("PT1"), sc("PT2_ST", { data_type: ["sc_dna_spatial"] }), sc("PT2")];
    const out = dedupeReports(records);
    expect(out.map((r) => r.pair)).toEqual(["BULK_1", "PT1", "PT2_ST", "PT2"]);
    expect(out[1]._versions.map((r) => r.pair)).toEqual(["PT1_v6"]);
    expect(out[2]._versions).toBeUndefined();
    expect(records[2]._versions).toBeUndefined(); // inputs untouched
  });
});
