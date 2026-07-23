/** @jest-environment node */

import axios from "axios";
import { tableFromArrays, tableToIPC } from "apache-arrow";
import {
  clearPatientCaseSearchCache,
  combinePatientCasePages,
  findPatientCases,
  isArrowDatafilesPath,
  isSamePatientCase,
  loadDatasetDatafiles,
  normalizePatientCase,
  normalizePatientId,
  parseSpecimenDate,
  patientCaseIdentityKey,
  sortPatientCases,
} from "./helpers";

jest.mock("axios", () => ({
  get: jest.fn(),
  isCancel: jest.fn(() => false),
}));

jest.mock("../../helpers/utility", () => ({
  datafilesArrowTableToJson: (table) =>
    table.toArray().map((row) =>
      row.toJSON ? row.toJSON() : Object.fromEntries(row)
    ),
}));

describe("patient case switcher helpers", () => {
  beforeEach(() => {
    axios.get.mockReset();
    clearPatientCaseSearchCache();
  });

  describe("normalizePatientId", () => {
    it("accepts trimmed nonblank strings", () => {
      expect(normalizePatientId("  PATIENT-1  ")).toBe("PATIENT-1");
    });

    it.each([null, undefined, "", "   ", 42])(
      "rejects a non-PatientId value: %p",
      (value) => {
        expect(normalizePatientId(value)).toBeNull();
      }
    );
  });

  describe("parseSpecimenDate", () => {
    it.each(["2024-02-29", "2000-02-29", "2025-12-31"])(
      "accepts a calendar-valid ISO date-only value: %s",
      (value) => {
        expect(parseSpecimenDate(value)).toBe(value);
      }
    );

    it.each([
      null,
      undefined,
      "",
      "2023-02-29",
      "1900-02-29",
      "2025-02-30",
      "2025-00-10",
      "2025-13-10",
      "0000-01-01",
      "2025-1-01",
      "2025-01-1",
      "2025-01-01T00:00:00Z",
      "not-a-date",
    ])("rejects an invalid or non-exact date: %p", (value) => {
      expect(parseSpecimenDate(value)).toBeNull();
    });
  });

  describe("source-aware identity", () => {
    const identity = { datasetId: "dataset-a", caseReportId: "case-1" };

    it("creates an unambiguous stable key", () => {
      expect(patientCaseIdentityKey(identity)).toBe(
        JSON.stringify(["dataset-a", "case-1"])
      );
      expect(
        patientCaseIdentityKey({
          datasetId: "dataset-a:case",
          caseReportId: "1",
        })
      ).not.toBe(
        patientCaseIdentityKey({
          datasetId: "dataset-a",
          caseReportId: "case:1",
        })
      );
    });

    it("requires both dataset and case-report identity to match", () => {
      expect(isSamePatientCase(identity, { ...identity })).toBe(true);
      expect(
        isSamePatientCase(identity, { ...identity, datasetId: "dataset-b" })
      ).toBe(false);
      expect(
        isSamePatientCase(identity, { ...identity, caseReportId: "case-2" })
      ).toBe(false);
      expect(isSamePatientCase(identity, null)).toBe(false);
    });
  });

  describe("normalizePatientCase", () => {
    it("normalizes static identity, display pair, and a valid specimen date", () => {
      expect(
        normalizePatientCase({
          caseReportId: "case-1",
          datasetId: "dataset-a",
          pair: "Pair A",
          patient_id: "PATIENT-1",
          specimen_date: "2025-03-17",
        })
      ).toEqual({
        identity: { datasetId: "dataset-a", caseReportId: "case-1" },
        pair: "Pair A",
        specimenDate: "2025-03-17",
      });
    });

    it("prefers static case-directory fields over an unrelated generic ID", () => {
      expect(
        normalizePatientCase({
          id: "cohort-id",
          case_id_clean: "case-directory-id",
          pair: "Display Pair",
          datasetId: "dataset-a",
        })
      ).toMatchObject({
        identity: {
          datasetId: "dataset-a",
          caseReportId: "case-directory-id",
        },
        pair: "Display Pair",
      });
    });

    it("keeps a case with an absent or invalid date as undated", () => {
      expect(
        normalizePatientCase({
          pair: "case-1",
          datasetId: "dataset-a",
          specimen_date: "2025-02-30",
        })
      ).toEqual({
        identity: { datasetId: "dataset-a", caseReportId: "case-1" },
        pair: "case-1",
        specimenDate: null,
      });
      expect(
        normalizePatientCase({ pair: "case-2", datasetId: "dataset-a" })
          .specimenDate
      ).toBeNull();
    });

    it.each([
      {},
      { pair: "case-1" },
      { datasetId: "dataset-a" },
      { pair: "", datasetId: "dataset-a" },
    ])("omits a record without a complete source identity: %p", (record) => {
      expect(normalizePatientCase(record)).toBeNull();
    });
  });

  describe("ordering", () => {
    const record = (pair, datasetId, specimenDate) => ({
      pair,
      datasetId,
      specimen_date: specimenDate,
    });

    it("combines sources, omits malformed records, and de-duplicates identities", () => {
      const cases = combinePatientCasePages([
        [
          record("Pair B", "dataset-b", "2024-01-01"),
          record("Pair A", "dataset-a", "2025-01-01"),
        ],
        [
          record("Pair A", "dataset-a", "2020-01-01"),
          { pair: "missing-dataset" },
          record("Pair C", "dataset-a", "invalid"),
        ],
      ]);

      expect(cases).toEqual([
        {
          identity: { datasetId: "dataset-a", caseReportId: "Pair A" },
          pair: "Pair A",
          specimenDate: "2025-01-01",
        },
        {
          identity: { datasetId: "dataset-b", caseReportId: "Pair B" },
          pair: "Pair B",
          specimenDate: "2024-01-01",
        },
        {
          identity: { datasetId: "dataset-a", caseReportId: "Pair C" },
          pair: "Pair C",
          specimenDate: null,
        },
      ]);
    });

    it("sorts dates newest-first and uses deterministic text tie-breakers", () => {
      const cases = [
        normalizePatientCase(record("Pair A", "dataset-b", null)),
        normalizePatientCase(record("Pair B", "dataset-a", "2025-01-01")),
        normalizePatientCase(record("Pair A", "dataset-b", "2025-01-01")),
        normalizePatientCase(record("Pair A", "dataset-a", "2025-01-01")),
        normalizePatientCase(record("Pair Z", "dataset-z", "2026-01-01")),
        normalizePatientCase(record("Pair A", "dataset-a", "bad")),
      ];
      const original = [...cases];

      expect(
        sortPatientCases(cases).map(
          ({ identity }) => `${identity.datasetId}/${identity.caseReportId}`
        )
      ).toEqual([
        "dataset-z/Pair Z",
        "dataset-a/Pair A",
        "dataset-b/Pair A",
        "dataset-a/Pair B",
        "dataset-a/Pair A",
        "dataset-b/Pair A",
      ]);
      expect(cases).toEqual(original);
    });
  });

  describe("static manifest loading", () => {
    it.each([
      ["datafiles.arrow", true],
      ["DATAFILES.ARROW?version=1", true],
      ["datafiles.arrow#download", true],
      ["datafiles.json", false],
    ])("detects Arrow paths: %s", (path, expected) => {
      expect(isArrowDatafilesPath(path)).toBe(expected);
    });

    it("loads a JSON manifest with the supplied cancellation config", async () => {
      const records = [{ pair: "case-1", patient_id: "PATIENT-1" }];
      const cancelToken = {};
      axios.get.mockResolvedValue({ data: records });

      await expect(
        loadDatasetDatafiles(
          { id: "dataset-a", datafilesPath: "a.json" },
          { cancelToken }
        )
      ).resolves.toBe(records);
      expect(axios.get).toHaveBeenCalledWith("a.json", {
        cancelToken,
        responseType: "json",
      });
    });

    it("scans JSON and Arrow manifests and keeps each source identity", async () => {
      const arrowTable = tableFromArrays({
        pair: ["same-case", "arrow-other"],
        patient_id: ["PATIENT-1", "PATIENT-2"],
        specimen_date: ["2026-01-01", "2020-01-01"],
      });
      const arrowBuffer = tableToIPC(arrowTable);
      const manifests = {
        "a.json": [
          {
            pair: "Display Pair",
            caseReportId: "case-directory-id",
            patient_id: "PATIENT-1",
            specimen_date: "2027-01-01",
          },
          {
            pair: "same-case",
            patient_id: " PATIENT-1 ",
            specimen_date: "2025-01-01",
          },
          { pair: "undated", patient_id: "PATIENT-1" },
          { pair: "missing-patient" },
          { pair: "hidden", patient_id: "PATIENT-1", visible: false },
        ],
        "b.arrow": arrowBuffer,
      };
      axios.get.mockImplementation((path) =>
        Promise.resolve({ data: manifests[path] })
      );
      const datasets = [
        { id: "dataset-a", datafilesPath: "a.json" },
        { id: "dataset-b", datafilesPath: "b.arrow" },
      ];
      const cancelToken = {};

      await expect(
        findPatientCases(datasets, "PATIENT-1", { cancelToken })
      ).resolves.toEqual({
        cases: [
          {
            identity: {
              datasetId: "dataset-a",
              caseReportId: "case-directory-id",
            },
            pair: "Display Pair",
            specimenDate: "2027-01-01",
          },
          {
            identity: {
              datasetId: "dataset-b",
              caseReportId: "same-case",
            },
            pair: "same-case",
            specimenDate: "2026-01-01",
          },
          {
            identity: {
              datasetId: "dataset-a",
              caseReportId: "same-case",
            },
            pair: "same-case",
            specimenDate: "2025-01-01",
          },
          {
            identity: { datasetId: "dataset-a", caseReportId: "undated" },
            pair: "undated",
            specimenDate: null,
          },
        ],
        failedDatasetCount: 0,
      });
      expect(axios.get).toHaveBeenCalledWith("b.arrow", {
        cancelToken,
        responseType: "arraybuffer",
      });
    });

    it("keeps available patient cases when one manifest cannot be loaded", async () => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      axios.get
        .mockResolvedValueOnce({
          data: [{ pair: "case-1", patient_id: "PATIENT-1" }],
        })
        .mockRejectedValueOnce(new Error("not accessible"));

      await expect(
        findPatientCases(
          [
            { id: "dataset-a", datafilesPath: "a.json" },
            { id: "dataset-b", datafilesPath: "b.json" },
          ],
          "PATIENT-1"
        )
      ).resolves.toEqual({
        cases: [
          {
            identity: { datasetId: "dataset-a", caseReportId: "case-1" },
            pair: "case-1",
            specimenDate: null,
          },
        ],
        failedDatasetCount: 1,
      });
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it("fails the global scan when no manifest can be loaded", async () => {
      axios.get.mockRejectedValue(new Error("not accessible"));

      await expect(
        findPatientCases(
          [{ id: "dataset-a", datafilesPath: "a.json" }],
          "PATIENT-1"
        )
      ).rejects.toThrow("not accessible");
    });

    it("caches only a completed patient search, not every full manifest", async () => {
      axios.get.mockResolvedValue({
        data: [{ pair: "case-1", patient_id: "PATIENT-1" }],
      });
      const datasets = [{ id: "dataset-a", datafilesPath: "a.json" }];

      await findPatientCases(datasets, "PATIENT-1");
      await findPatientCases(datasets, "PATIENT-1");

      expect(axios.get).toHaveBeenCalledTimes(1);
    });
  });
});
