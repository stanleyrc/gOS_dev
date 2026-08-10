/** @jest-environment node */
/* eslint-disable import/first */

jest.mock("./browseScope", () => ({
  datasetHasField: (dataset, fieldId) =>
    (dataset?.fields || []).some(
      (field) => (field.id || field.name) === fieldId,
    ),
}));

import { getMyeloSeqSpecimenFacts } from "./myeloSeqSpecimenFacts";

describe("MyeloSeq specimen facts", () => {
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

  it("uses NA when primary site is schema-disabled", () => {
    expect(
      getMyeloSeqSpecimenFacts({
        dataset: {
          fields: [{ id: "disease" }],
        },
        patient: { primarySite: "Schema-disabled site" },
        metadata: { primary_site: "Schema-disabled metadata site" },
      }),
    ).toEqual([
      { label: "Specimen Type", value: "NA" },
      { label: "Clinical History", value: "NA" },
    ]);
  });
});
