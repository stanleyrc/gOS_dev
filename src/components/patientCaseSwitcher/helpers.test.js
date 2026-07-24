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
        datasetId: "d",
        caseReportId: "case-4",
        pair: "PAIR-D",
        patient_id: "PATIENT-1",
        specimen_date: "2024-06-01/2024-06-15",
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
        specimenDate: {
          start: "2025-02-01",
          end: null,
          sortKey: "2025-02-01",
          label: "2025-02-01",
        },
      },
      {
        identity: { datasetId: "d", caseReportId: "case-4" },
        pair: "PAIR-D",
        specimenDate: {
          start: "2024-06-01",
          end: "2024-06-15",
          sortKey: "2024-06-01",
          label: "2024-06-01 to 2024-06-15",
        },
      },
      {
        identity: { datasetId: "b", caseReportId: "case-2" },
        pair: "PAIR-B",
        specimenDate: {
          start: "2024-01-01",
          end: null,
          sortKey: "2024-01-01",
          label: "2024-01-01",
        },
      },
    ]);
  });

  it("accepts valid point/range dates and rejects invalid calendar dates", () => {
    expect(parseSpecimenDate("2024-02-29")).toEqual({
      start: "2024-02-29",
      end: null,
      sortKey: "2024-02-29",
      label: "2024-02-29",
    });
    expect(parseSpecimenDate("2024-01-01/2024-02-03")).toEqual({
      start: "2024-01-01",
      end: "2024-02-03",
      sortKey: "2024-01-01",
      label: "2024-01-01 to 2024-02-03",
    });
    expect(parseSpecimenDate("2023-02-29")).toBeNull();
    expect(parseSpecimenDate("2024-03-01/2024-02-01")).toBeNull();
  });
});
