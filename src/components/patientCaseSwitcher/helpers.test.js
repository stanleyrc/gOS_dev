/** @jest-environment node */

import {
  findPatientCases,
  parseSpecimenDate,
} from "./helpers";

describe("patient case manifest scan", () => {
  it("finds, deduplicates, and sorts matching cases across datasets", () => {
    const records = [
      {
        datasetId: "b",
        caseReportId: "case-2",
        pair: "PAIR-B",
        patient_id: "PATIENT-1",
        specimen_date: "2024-01-01",
      },
      {
        datasetId: "a",
        caseReportId: "case-1",
        pair: "PAIR-A",
        patient_id: "PATIENT-1",
        specimen_date: "2025-02-01",
      },
      {
        datasetId: "a",
        caseReportId: "case-1",
        pair: "PAIR-A duplicate",
        patient_id: "PATIENT-1",
      },
      {
        datasetId: "c",
        caseReportId: "case-3",
        pair: "OTHER",
        patient_id: "PATIENT-2",
      },
      {
        datasetId: "c",
        caseReportId: "hidden",
        pair: "HIDDEN",
        patient_id: "PATIENT-1",
        visible: false,
      },
    ];

    expect(findPatientCases(records, " PATIENT-1 ")).toEqual([
      {
        identity: { datasetId: "a", caseReportId: "case-1" },
        pair: "PAIR-A",
        specimenDate: "2025-02-01",
      },
      {
        identity: { datasetId: "b", caseReportId: "case-2" },
        pair: "PAIR-B",
        specimenDate: "2024-01-01",
      },
    ]);
  });

  it("accepts valid leap dates and rejects invalid calendar dates", () => {
    expect(parseSpecimenDate("2024-02-29")).toBe("2024-02-29");
    expect(parseSpecimenDate("2023-02-29")).toBeNull();
  });
});
