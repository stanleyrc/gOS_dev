/** @jest-environment node */

import { getMyeloSeqSpecimenFacts } from "./myeloSeqSpecimenFacts";

describe("MyeloSeq specimen facts", () => {
  it("shortens only the Tumor sample display without changing the report's case ID", () => {
    const id = "TM26-240-0650-B26-6895_v1_TM26-240-0650-Q26-5679_RNA_v1";
    const report = { patient: { caseId: id } };
    expect(getMyeloSeqSpecimenFacts(report)[0]).toEqual({ label: "Tumor sample", value: "TM26-240-0650" });
    expect(report.patient.caseId).toBe(id);
  });

  it("uses primary site for Specimen Type and never maps Clinical History", () => {
    expect(
      getMyeloSeqSpecimenFacts({
        patient: { caseId: "CASE-1", primarySite: "Bone marrow" },
        metadata: {
          specimen_type: "Peripheral blood",
          clinical_history: "Existing history",
        },
      }),
    ).toEqual([
      { label: "Tumor sample", value: "CASE-1" },
      { label: "Specimen Type", value: "Bone marrow" },
      { label: "Clinical History", value: "NA" },
    ]);
  });

  it.each([
    [{ primarySite: "Selected site" }, { primary_site: "Source site" }, "Selected site"],
    [{ primarySite: "Selected site" }, {}, "Selected site"],
    [{}, { primary_site: "Source site" }, "Source site"],
    [{}, { primarySite: "Alias site" }, "Alias site"],
    [{}, {}, "NA"],
    [{ primarySite: "" }, { primary_site: "  " }, "NA"],
    [{ primarySite: "na" }, {}, "na"],
  ])("resolves specimen type independently of dataset fields: %p, %p", (patient, metadata, expected) => {
    expect(
      getMyeloSeqSpecimenFacts({
        dataset: { fields: [{ id: "disease" }] },
        patient,
        metadata,
      }),
    ).toEqual([
      { label: "Specimen Type", value: expected },
      { label: "Clinical History", value: "NA" },
    ]);
  });
});
