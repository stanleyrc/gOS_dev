/** @jest-environment node */

import fs from "fs";
import path from "path";
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

  it("finds the bundled cases whose patient IDs power filters and case switching", () => {
    const manifests = [
      {
        datasetId: "filtered-events-refactor",
        path: "public/data_filtered_events_test/datafiles.json",
      },
      {
        datasetId: "demo-solid-2",
        path: "public/data2/datafiles.json",
      },
    ];
    const records = manifests.flatMap((manifest) =>
      JSON.parse(
        fs.readFileSync(path.join(process.cwd(), manifest.path), "utf8"),
      ).map((record) => ({
        ...record,
        datasetId: manifest.datasetId,
        caseReportId: record.pair,
      })),
    );

    expect(
      findPatientCases(records, "patient 1").map(
        ({ identity, pair, specimenDate }) => ({
          identity,
          pair,
          specimenDate: specimenDate?.label,
        }),
      ),
    ).toEqual([
      {
        identity: {
          datasetId: "filtered-events-refactor",
          caseReportId: "B24-1267___B23-2915",
        },
        pair: "B24-1267___B23-2915",
        specimenDate: "2025-02-14",
      },
      {
        identity: {
          datasetId: "demo-solid-2",
          caseReportId: "A_DIFFERENT_CASE",
        },
        pair: "A_DIFFERENT_CASE",
        specimenDate: "2024-06-03",
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
