/** @jest-environment node */
/* eslint-disable import/first */

// Keep the real utility wrapper/parser and selection watchers; isolate plotting.
jest.mock("d3", () => ({}));
jest.mock("../helpers/connection", () => class Connection {});
jest.mock("../helpers/interval", () => class Interval {});
jest.mock("../helpers/progressChannel", () => ({ createProgressChannel: jest.fn() }));

import axios from "axios";
import { buffers, channel as bufferedChannel, runSaga, stdChannel } from "redux-saga";
import { createProgressChannel } from "../helpers/progressChannel";
import { all } from "redux-saga/effects";
import {
  locationToDomains,
  transformFilteredEventAttributes,
} from "../helpers/utility";
import filteredEventsSaga, { selectFilteredEvent } from "./filteredEvents/saga";
import sageQcSaga, { fetchSageQc, selectVariant } from "./sageQc/saga";
import filteredEventsActions from "./filteredEvents/actions";
import sageQcActions from "./sageQc/actions";
import settingsActions from "./settings/actions";

const chromoBins = Object.freeze({
  1: Object.freeze({ startPoint: 1, endPoint: 1000, startPlace: 1 }),
  2: Object.freeze({ startPoint: 1, endPoint: 1000, startPlace: 1001 }),
});
const currentDomains = Object.freeze([
  Object.freeze([400, 500]),
  Object.freeze([1400, 1500]),
]);
const defaultDomain = Object.freeze([1, 2000]);

function stateWith(settings = {}) {
  return { Settings: { chromoBins, domains: currentDomains, defaultDomain, ...settings } };
}

async function runSelection(saga, action, settings) {
  const dispatched = [];
  await runSaga({
    getState: () => stateWith(settings),
    dispatch: (update) => dispatched.push(update),
  }, saga, action).toPromise();
  return dispatched;
}

let previousDocument;
let previousWindow;
beforeEach(() => {
  previousDocument = global.document;
  previousWindow = global.window;
  global.document = { location: "http://localhost/?case=demo&gene=old&variant=old" };
  global.window = {
    history: {
      replaceState: jest.fn((_state, _title, url) => { document.location = url; }),
    },
  };
});
afterEach(() => {
  jest.restoreAllMocks();
  if (previousDocument === undefined) delete global.document;
  else global.document = previousDocument;
  if (previousWindow === undefined) delete global.window;
  else global.window = previousWindow;
});

test.each([
  ["1", 999, "1:749-1:1249", [[749, 1000]]],
  ["1", 100, "1:-150-1:350", [[1, 350]]],
  ["2", 999, "2:749-2:1249", [[1749, 2000]]],
])("selects a real transformed SNV at %s:%s without changing its raw location", async (
  chromosome, position, actualLocation, expected,
) => {
  const raw = Object.freeze({
    gene: "GENE", vartype: "SNV", id: 7,
    Genome_Location: `${chromosome}:1-1000`,
    Variant_g: `${chromosome}:${position}-${position} A>G`,
  });
  const record = Object.freeze(transformFilteredEventAttributes([raw])[0]);
  const before = { ...record };
  expect(record.actualLocation).toBe(actualLocation);
  expect(() => locationToDomains(chromoBins, record.actualLocation)).toThrow();

  const dispatched = await runSelection(
    selectFilteredEvent, filteredEventsActions.selectFilteredEvent(record),
  );

  expect(dispatched).toEqual([{ type: settingsActions.UPDATE_DOMAINS, domains: expected }]);
  expect(record).toEqual(before);
  expect(record.Variant_g).toBe(raw.Variant_g);
  expect(record.uid).toBe(`${chromosome}:${position}-${chromosome}:${position}`);
  expect(new URL(document.location).searchParams.get("gene")).toBe("GENE");
});

test.each([
  [1001, 1001, "1:999-1:1002", [[999, 1001]]],
  [1, 1, "1:0-1:1", [[1, 1]]],
  [1001, undefined, "1:999-1:1002", [[999, 1001]]],
])("selects Sage QC position %s/end %s with real ingestion padding", async (
  position, end, actualLocation, expected,
) => {
  const bins = Object.freeze({
    1: Object.freeze({ startPoint: 1, endPoint: 1001, startPlace: 1 }),
  });
  const raw = Object.freeze({ chromosome: "1", position, end });
  const progress = bufferedChannel(buffers.expanding());
  progress.put({ response: { data: [{ ...raw }] } });
  createProgressChannel.mockReturnValue(progress);
  // Exercise the actual JSON ingestion branch without network/Arrow fixtures.
  jest.spyOn(axios, "head").mockImplementation(async (url) => ({
    headers: { "content-type": url.endsWith(".arrow") ? "text/html" : "application/json" },
  }));
  const fetched = [];
  await runSaga({
    getState: () => ({
      Settings: { dataset: { dataPath: "/fixture/" } },
      CaseReport: { id: "demo" },
      SageQc: { filename: "variants" },
    }),
    dispatch: (update) => fetched.push(update),
  }, fetchSageQc, sageQcActions.fetchSageQc()).toPromise();
  progress.close();
  expect(fetched[0].type).toBe(sageQcActions.FETCH_SAGEQC_SUCCESS);
  const record = Object.freeze(fetched[0].records[0]);
  const before = { ...record };
  expect(record.actualLocation).toBe(actualLocation);
  expect(() => locationToDomains(bins, record.actualLocation)).toThrow();

  const dispatched = await runSelection(
    selectVariant, sageQcActions.selectVariant(record), { chromoBins: bins },
  );

  expect(dispatched).toEqual([{ type: settingsActions.UPDATE_DOMAINS, domains: expected }]);
  expect(record).toEqual(before);
  expect(record.uid).toBe(`1:${position}-1:${end}`);
  expect(record.position).toBe(raw.position);
  expect(record.end).toBe(raw.end);
  expect(new URL(document.location).searchParams.get("variant")).toBe("1");
});

const selections = [
  ["Filtered Events", selectFilteredEvent, filteredEventsActions.selectFilteredEvent, "gene", "GENE"],
  ["Sage QC", selectVariant, sageQcActions.selectVariant, "variant", "17"],
];

describe.each(selections)("%s selection integration", (_label, saga, action, queryKey, queryValue) => {
  test.each([
    undefined,
    "unknown:1-unknown:100",
    "1:1200-1:1100",
    "1:-100-1:-200",
    "1:50-1:NaN",
    "1:20-1:30|unknown:1-100",
  ])("contains invalid record location %# and preserves the exact prior view", async (actualLocation) => {
    const record = Object.freeze({ gene: "GENE", id: 17, uid: "unchanged", actualLocation });
    const before = { ...record };
    const dispatched = await runSelection(saga, action(record));

    expect(dispatched).toEqual([{ type: settingsActions.UPDATE_DOMAINS, domains: currentDomains }]);
    expect(dispatched[0].domains).toBe(currentDomains);
    expect(record).toEqual(before);
    expect(new URL(document.location).searchParams.get(queryKey)).toBe(queryValue);
    expect(new URL(document.location).searchParams.get("case")).toBe("demo");
    expect(window.history.replaceState).toHaveBeenCalledTimes(1);
  });

  test.each([undefined, null])("falls back to defaultDomain when current domains are %s", async (domains) => {
    const dispatched = await runSelection(saga, action({ actualLocation: "bad" }), { domains });
    expect(dispatched).toEqual([{ type: settingsActions.UPDATE_DOMAINS, domains: [defaultDomain] }]);
  });

  it("preserves an existing empty current view rather than inventing a fallback", async () => {
    const domains = Object.freeze([]);
    const dispatched = await runSelection(saga, action({ actualLocation: "bad" }), { domains });
    expect(dispatched[0].domains).toBe(domains);
  });

  it("keeps the existing small-domain filtering for valid multi-ranges", async () => {
    const dispatched = await runSelection(saga, action({
      gene: "GENE", id: 17, actualLocation: "1:1-1:10|2:-150-2:350",
    }));
    expect(dispatched).toEqual([{ type: settingsActions.UPDATE_DOMAINS, domains: [[1001, 1350]] }]);
  });

  it("retains deselection reset semantics and removes only its own URL parameter", async () => {
    const dispatched = await runSelection(saga, action(null));
    const url = new URL(document.location);
    expect(dispatched).toEqual([{ type: settingsActions.UPDATE_DOMAINS, domains: [defaultDomain] }]);
    expect(url.searchParams.has(queryKey)).toBe(false);
    expect(url.searchParams.get(queryKey === "gene" ? "variant" : "gene")).toBe("old");
    expect(url.searchParams.get("case")).toBe("demo");
    expect(window.history.replaceState).toHaveBeenCalledWith(null, "Case Report", document.location);
  });
});

test.each(selections)("invalid %s selection does not abort the root or sibling watcher", async (
  _label, _saga, action,
) => {
  const channel = stdChannel();
  const dispatched = [];
  const onError = jest.fn();
  const state = stateWith();
  const task = runSaga({
    channel,
    getState: () => state,
    dispatch: (update) => {
      dispatched.push(update);
      if (update.type === settingsActions.UPDATE_DOMAINS) state.Settings.domains = update.domains;
    },
    onError,
  }, function* navigationRoot() {
    yield all([filteredEventsSaga(), sageQcSaga()]);
  });
  // Observe rejections even if the pre-fix root aborts, without leaking tasks.
  const finished = task.toPromise().catch((error) => error);

  try {
    channel.put(action({ gene: "BAD", id: 0, actualLocation: "1:1200-1:1100" }));
    expect(onError).not.toHaveBeenCalled();
    expect(task.isRunning()).toBe(true);
    expect(dispatched[0].domains).toBe(currentDomains);

    channel.put(filteredEventsActions.selectFilteredEvent({
      gene: "VALID", actualLocation: "1:-150-1:350",
    }));
    channel.put(sageQcActions.selectVariant({ id: 12, actualLocation: "2:999-2:1001" }));
    expect(dispatched.slice(1)).toEqual([
      { type: settingsActions.UPDATE_DOMAINS, domains: [[1, 350]] },
      { type: settingsActions.UPDATE_DOMAINS, domains: [[1999, 2000]] },
    ]);

    // Invalid navigation after a successful update must retain the latest view.
    channel.put(action({ gene: "BAD", id: 0, actualLocation: null }));
    expect(dispatched[3].domains).toBe(dispatched[2].domains);
    expect(task.isRunning()).toBe(true);
    expect(onError).not.toHaveBeenCalled();
  } finally {
    task.cancel();
    channel.close();
    await finished;
  }
});
