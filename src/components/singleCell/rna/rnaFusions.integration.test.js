import { TextDecoder, TextEncoder } from "util";
import React from "react";
import { Provider } from "react-redux";
import { combineReducers, createStore } from "redux";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import fixture from "../../../helpers/singleCell/__fixtures__/rnaFusions.json";
import splicingFixture from "../../../helpers/singleCell/__fixtures__/rnaSplicing.json";

// apache-arrow (reached through helpers/utility) needs these in jsdom
if (typeof global.TextDecoder === "undefined") global.TextDecoder = TextDecoder;
if (typeof global.TextEncoder === "undefined") global.TextEncoder = TextEncoder;
// antd's responsive table and the canvas strips need these jsdom gaps filled
if (!window.matchMedia) {
  window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
}
HTMLCanvasElement.prototype.getContext = () => null;

// d3 is ESM-only (Jest cannot parse it): a chainable stand-in is enough here.
jest.mock("d3", () => {
  const chain = new Proxy(function chainFn() {}, { get: (t, p) => (p === Symbol.toPrimitive ? () => 0 : chain), apply: () => chain });
  return new Proxy({}, { get: (t, p) => (p === "__esModule" ? true : chain) });
});
// IGV (igv.js ESM) is replaced by a stub that records the view it is given
const igvViews = [];
jest.mock("../cellIgvPanel", () => ({
  __esModule: true,
  SC_MAX_RNA_TRACKS: 12,
  SC_READS_FILE: "reads.bam",
  default: ({ view }) => {
    igvViews.push(view);
    return <div data-testid="igv">{(view.rnaTracks || []).map((r) => r.rna_id).join(",")}</div>;
  },
}));
jest.mock("../cellTracksPanel", () => () => <div data-testid="cell-tracks" />);
jest.mock("../../genesPlotHiglass", () => () => <div />);
jest.mock("../../hoverLine", () => () => <div />);

const { normalizeFusions } = require("../../../helpers/singleCell/rnaFusions");
const { normalizeSplicing } = require("../../../helpers/singleCell/splicing");

function makeStore({ fusions = true, splicing = false, fusionsJson = fixture } = {}) {
  const reducers = require("../../../redux/reducers").default;
  const actions = require("../../../redux/singleCell/actions").default;
  const store = createStore(combineReducers(reducers));
  const ok = (data) => ({ status: "ok", data, error: null });
  const missing = { status: "missing", data: null, error: null };
  act(() => {
    store.dispatch({
      type: actions.FETCH_SINGLE_CELL_DATA_SUCCESS,
      patient: { caseReportId: "P1", patientKey: "P1", datasetId: "gbm-sc" },
      cells: ["c1", "c2", "c3", "c4"].map((id, k) => ({ cell_id: id, clone_id: `${1 + (k % 2)}` })),
      cloneColors: { 1: "#4E79A7", 2: "#F28E2B" },
      order: ["c3", "c1", "c2", "c4"],
      tree: missing,
      cn: missing,
      snv: missing,
      junctions: missing,
      rna: missing,
      rnaFusions: fusions ? ok(normalizeFusions(fusionsJson)) : missing,
      rnaSplicing: splicing ? ok(normalizeSplicing(splicingFixture)) : missing,
      cellFiles: {},
      selectedCellIds: [],
    });
  });
  return store;
}

describe("RNA fusions card and popup", () => {
  beforeEach(() => igvViews.splice(0));

  it("lists fusions and opens the popup with cells and RNA tracks at both breakpoints", async () => {
    const RnaFusionsCard = require("./rnaFusionsCard").default;
    const store = makeStore();
    render(
      <Provider store={store}>
        <RnaFusionsCard summary={{ cells: [{ rna_id: "r1", cell_id: "c1" }, { rna_id: "r2", cell_id: "c3" }] }} />
      </Provider>
    );
    // default filters: >= 2 cells, read-through hidden -> EGFR::SEPTIN14 and PTPRZ1::MET
    expect(screen.getByText("SEPTIN14")).toBeTruthy();
    expect(screen.getByText("PTPRZ1")).toBeTruthy();
    expect(screen.queryByText("GENEA")).toBeNull();
    fireEvent.click(screen.getByText("SEPTIN14"));
    expect(await screen.findByText("components.single-cell.rna-fusions.modal-title")).toBeTruthy();
    const modal = document.body.querySelector(".sc-rna-fusion-modal"); // eslint-disable-line testing-library/no-node-access
    expect(modal).not.toBeNull();
    const m = within(modal);
    // Summary tab: breakpoints, tier and schematic
    expect(m.getByText("chr7:55211628 · chr7:55900000")).toBeTruthy();
    expect(m.getByText("components.single-cell.rna-fusions.tier-2")).toBeTruthy();
    // Cells tab lists every carrier
    fireEvent.click(m.getByRole("tab", { name: /tab-cells/ }));
    expect(m.getByText("r9")).toBeTruthy();
    // Reads tab: RNA tracks at both breakpoints
    fireEvent.click(m.getByRole("tab", { name: /tab-reads/ }));
    const view = igvViews[igvViews.length - 1];
    expect(view.rnaTracks.map((r) => r.rna_id)).toEqual(["r2", "r9", "r1"]);
    expect(view.rnaTracks[0]).toEqual({ rna_id: "r2", bam: "rna/reads/r2.bam", patientId: "P1" });
    expect(view.loci).toEqual([{ chromosome: "chr7", position: 55211628 }, { chromosome: "chr7", position: 55900000 }]);
    expect(view.cellIds).toEqual([]);
  });

  it("opens a carrier cell's plots with its DNA and RNA reads from the Cells tab", async () => {
    const RnaFusionsCard = require("./rnaFusionsCard").default;
    render(
      <Provider store={makeStore()}>
        <RnaFusionsCard summary={{ cells: [{ rna_id: "r1", cell_id: "c1" }, { rna_id: "r2", cell_id: "c3" }] }} />
      </Provider>
    );
    fireEvent.click(screen.getByText("SEPTIN14"));
    await screen.findByText("components.single-cell.rna-fusions.modal-title");
    const m = within(document.body.querySelector(".sc-rna-fusion-modal")); // eslint-disable-line testing-library/no-node-access
    fireEvent.click(m.getByRole("tab", { name: /tab-cells/ }));
    fireEvent.click(m.getByText("r1"));
    expect(m.getByTestId("cell-tracks")).toBeTruthy();
    const view = igvViews[igvViews.length - 1];
    // c1 (RNA r1) shown: its DNA reads and its RNA slice at both breakpoints
    expect(view.cellIds).toEqual(["c1"]);
    expect(view.rnaTracks.map((r) => r.rna_id)).toEqual(["r1"]);
    expect(view.loci.map((l) => l.position)).toEqual([55211628, 55900000]);
  });

  it("shows an empty state when fusions.json is missing", () => {
    const RnaFusionsCard = require("./rnaFusionsCard").default;
    render(
      <Provider store={makeStore({ fusions: false })}>
        <RnaFusionsCard summary={{ cells: [] }} />
      </Provider>
    );
    expect(screen.getByText("components.single-cell.rna-fusions.none")).toBeTruthy();
  });
});

describe("RNA support in the DNA event popup", () => {
  beforeEach(() => igvViews.splice(0));

  it("adds the matching RNA fusion's cells and tracks to the event reads", async () => {
    const { EventReads } = require("../eventCellTracks");
    const record = { uid: "e1", gene: "SEPT14::EGFR", vartype: "fusion", type: "Fusion", fusion_gene_coords: "7:55019017-55211628+,7:55900100-55950000-", cell_ids: "c1,c2" };
    render(
      <Provider store={makeStore()}>
        <EventReads record={record} fallback={<div />} />
      </Provider>
    );
    expect(screen.getByText("components.single-cell.rna-fusions.support-title")).toBeTruthy();
    const view = igvViews[igvViews.length - 1];
    expect(view.cellIds).toEqual(["c1", "c2"]);
    // the shown DNA cell c1's RNA (r1) comes first
    expect(view.rnaTracks.map((r) => r.rna_id)).toEqual(["r1", "r2", "r9"]);
    // DNA gene-start loci, then the RNA breakpoints not already near them
    expect(view.loci.map((l) => l.position)).toEqual([55019017, 55900100, 55211628]);
  });

  it("says when no RNA fusion matches", () => {
    const { EventReads } = require("../eventCellTracks");
    render(
      <Provider store={makeStore()}>
        <EventReads record={{ gene: "TP53::MDM2", vartype: "fusion", fusion_gene_coords: "17:1-2+,12:3-4+", cell_ids: "c1" }} fallback={<div />} />
      </Provider>
    );
    expect(screen.getByText(/support-none/)).toBeTruthy();
    expect(igvViews[igvViews.length - 1].rnaTracks).toBeUndefined();
  });
});

describe("splicing card", () => {
  it("renders known variants and the cluster explorer from fixtures", () => {
    const SplicingCard = require("./splicingCard").default;
    render(
      <Provider store={makeStore({ splicing: true })}>
        <SplicingCard summary={{ cells: [{ rna_id: "r1", cell_id: "c1", state: "MES" }, { rna_id: "r2", cell_id: "c3", state: "NPC" }, { rna_id: "r3", cell_id: "c2", state: "MES" }, { rna_id: "r9", cell_id: null }], fields: [{ name: "state", numeric: false, levels: ["MES", "NPC"] }] }} />
      </Provider>
    );
    expect(screen.getAllByText("EGFRvIII").length).toBeGreaterThan(0);
    expect(screen.getByText("components.single-cell.splicing.clusters-title")).toBeTruthy();
    // one sashimi panel per clone group (1, 2, RNA-only) of clu_1
    expect(screen.getAllByRole("img").length).toBeGreaterThanOrEqual(3);
  });
});

describe("real BWH70 fusions.json", () => {
  it("renders the 802-fusion table quickly with the default filters", () => {
    const real = require("../../../helpers/singleCell/__fixtures__/rnaFusions.BWH70.json");
    const RnaFusionsCard = require("./rnaFusionsCard").default;
    const store = makeStore({ fusionsJson: real });
    const t0 = Date.now();
    render(
      <Provider store={store}>
        <RnaFusionsCard summary={{ cells: [] }} />
      </Provider>
    );
    expect(Date.now() - t0).toBeLessThan(8000);
    // the DNA-matched fusions are kept even below the cell threshold
    expect(screen.getAllByText("components.single-cell.rna-fusions.dna-gene-pair").length).toBeGreaterThan(0);
  });
});
