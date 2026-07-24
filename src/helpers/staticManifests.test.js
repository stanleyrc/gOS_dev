/** @jest-environment node */
/* eslint-disable import/first */

jest.mock("axios", () => ({ get: jest.fn() }));

jest.mock("apache-arrow", () => ({
  tableFromIPC: jest.fn(() => ({ mocked: true })),
}));

jest.mock("./utility", () => ({
  datafilesArrowTableToJson: jest.fn(() => [
    { pair: "ARROW-1", patient_id: "PATIENT-1" },
  ]),
}));

jest.mock("./metadata", () => ({
  qcEvaluator: jest.fn(() => "PASS"),
}));

import axios from "axios";
import {
  clearStaticManifestCache,
  getManifestRequestConfig,
  loadConfiguredManifestsWithStatus,
  loadDatasetManifest,
  normalizeManifestRecord,
} from "./staticManifests";

describe("static manifests", () => {
  beforeEach(() => {
    axios.get.mockReset();
    clearStaticManifestCache();
  });

  it("normalizes source identity without mutating the manifest record", () => {
    const record = { pair: "PAIR-1", summary: "Gene: TP53" };
    const normalized = normalizeManifestRecord(record, {
      id: "dataset-a",
      title: "Dataset A",
    });

    expect(record.datasetId).toBeUndefined();
    expect(normalized).toMatchObject({
      datasetId: "dataset-a",
      caseReportId: "PAIR-1",
      pair: "PAIR-1",
      sourceDatasetTitle: "Dataset A",
      tags: ["Gene: TP53"],
    });
  });

  it.each(["b/data.arrow", "b/data.arrow?version=2", "b/data.arrow#download"])(
    "requests Arrow manifests as binary data: %s",
    (datafilesPath) => {
      const dataset = { id: "dataset-b", datafilesPath };
      expect(getManifestRequestConfig(dataset).responseType).toBe("arraybuffer");
    },
  );

  it("prefers a static case-directory ID over an unrelated generic ID", () => {
    const normalized = normalizeManifestRecord(
      {
        id: "cohort-id",
        case_id_clean: "case-directory-id",
        pair: "Display Pair",
      },
      { id: "dataset-a" },
    );

    expect(normalized.caseReportId).toBe("case-directory-id");
  });

  it("reports partial manifest scans instead of presenting them as complete", async () => {
    axios.get
      .mockResolvedValueOnce({ data: [{ pair: "PAIR-1" }] })
      .mockRejectedValueOnce(new Error("unavailable"));

    await expect(
      loadConfiguredManifestsWithStatus([
        { id: "a", datafilesPath: "a.json" },
        { id: "b", datafilesPath: "b.json" },
      ]),
    ).resolves.toMatchObject({
      failedDatasetCount: 1,
      recordsByDataset: {
        a: [{ datasetId: "a", caseReportId: "PAIR-1" }],
      },
    });
  });

  it("reuses a parsed manifest for repeated cohort comparisons", async () => {
    axios.get.mockResolvedValue({ data: [{ pair: "PAIR-1" }] });
    const dataset = { id: "a", datafilesPath: "a.json" };

    await loadDatasetManifest(dataset);
    await loadDatasetManifest(dataset);

    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  it("keeps JSON manifest requests in JSON mode", () => {
    expect(
      getManifestRequestConfig({ datafilesPath: "datafiles.json" }).responseType,
    ).toBe("json");
  });
});
