/** @jest-environment node */
/* eslint-disable import/first */

jest.mock("d3", () => ({}));
jest.mock("./field", () => class TestField {});
jest.mock("jspdf", () => ({ jsPDF: class MockJsPdf {} }));
jest.mock("jspdf/dist/polyfills.es.js", () => ({}));
jest.mock("marked", () => ({ marked: { lexer: jest.fn(() => []) } }));

import { filterReportAttributes } from "./notes";

describe("schema-aware notes context", () => {
  it("does not send raw omitted metadata into notes or trial prompts", () => {
    const dataset = {
      id: "schema-test",
      fields: [{ id: "purity" }],
    };
    const report = {
      datasetId: "schema-test",
      pair: "PAIR-1",
      summary: "SNV: TP53",
      purity: 0.37,
      ploidy: 4.8,
      tmb: 999,
      tumor_details: "SCHEMA-OMITTED",
    };

    expect(filterReportAttributes(report, dataset)).toEqual({
      datasetId: "schema-test",
      pair: "PAIR-1",
      summary: "SNV: TP53",
      purity: 0.37,
    });
    expect(report).toMatchObject({
      ploidy: 4.8,
      tmb: 999,
      tumor_details: "SCHEMA-OMITTED",
    });
  });
});
