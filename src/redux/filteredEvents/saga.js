import { all, takeEvery, put, call, select } from "redux-saga/effects";
import axios from "axios";
import { getCurrentState } from "./selectors";
import {
  transformFilteredEventAttributes,
  locationToDomains,
  getEventType,
} from "../../helpers/utility";
import actions from "./actions";
import settingsActions from "../settings/actions";
import { getCancelToken } from "../../helpers/cancelToken";
import { slugify } from "../../helpers/report";
import { idbSet, idbGetAll, toCommaList, fromCommaList } from "../../helpers/idbStore";

const FIELD_NAMES = ["gene_summary", "variant_summary", "effect_description", "therapeutics", "resistances", "notes"];

function makeAnchor(rec) {
  const gene = rec?.gene || "";
  const variant = rec?.variant || "";
  return slugify(`${gene} ${variant}`);
}
function nsForState(state) {
  const id = state?.CaseReport?.id;
  return `app-case-${id}`;
}
function fieldBaseKey(id, anchor) {
  return `gos.field.${id}.${anchor}`;
}
function tierKey(id, anchor) {
  return `gos.tier.${id}.${anchor}`;
}

function* fetchFilteredEvents(action) {
  const currentState = yield select(getCurrentState);
  const { dataset } = currentState.Settings;
  const { id } = currentState.CaseReport;
  try {
    let responseReportFilteredEvents = yield call(
      axios.get,
      `${dataset.dataPath}${id}/filtered.events.json`,
      { cancelToken: getCancelToken() }
    );

    let filteredEvents = transformFilteredEventAttributes(
      responseReportFilteredEvents.data || []
    ).map((d) => {
      d.eventType = getEventType(d);
      return d;
    });

    let selectedFilteredEvent = filteredEvents.find(
      (e) =>
        e.gene ===
        new URL(decodeURI(document.location)).searchParams.get("gene")
    );

    const reportUrl = `${dataset.dataPath}${id}/report.html`;
    let reportSrc = null;
    try {
      // Check if file exists using HEAD request first
      yield call(axios.head, reportUrl, { cancelToken: getCancelToken() });
      reportSrc = reportUrl;
    } catch (e) {
      // If HEAD fails, treat as missing (do not attempt GET)
      reportSrc = null;
    }

    yield put({
      type: actions.FETCH_FILTERED_EVENTS_SUCCESS,
      filteredEvents,
      selectedFilteredEvent,
      reportSrc,
    });
    try {
      yield call(hydrateAlterationFieldsFromIdb);
    } catch (_e) {}
  } catch (error) {
    console.log(error);
    if (axios.isCancel(error)) {
      console.log(
        `fetch ${dataset.dataPath}${id}/filtered.events.json request canceled`,
        error.message
      );
    } else {
      yield put({
        type: actions.FETCH_FILTERED_EVENTS_FAILED,
        error,
      });
    }
  }
}

function* selectFilteredEvent(action) {
  const currentState = yield select(getCurrentState);
  let { chromoBins, defaultDomain } = currentState.Settings;
  let { filteredEvent } = action;
  let selectedFilteredEvent = filteredEvent;
  let urlGene = new URL(decodeURI(document.location));
  if (selectedFilteredEvent) {
    let loc = selectedFilteredEvent.actualLocation;
    let domsGene = locationToDomains(chromoBins, loc);
    // eliminate domains that are smaller than 10 bases wide
    if (domsGene.length > 1) {
      domsGene = domsGene.filter((d) => d[1] - d[0] > 10);
    }
    urlGene.searchParams.set("gene", selectedFilteredEvent.gene);
    window.history.replaceState(
      unescape(urlGene.toString()),
      "Case Report",
      unescape(urlGene.toString())
    );
    yield put({
      type: settingsActions.UPDATE_DOMAINS,
      domains: domsGene,
    });
  } else {
    // Remove the query parameter
    urlGene.searchParams.delete("gene");
    // Update the URL in the browser's history
    window.history.replaceState(
      null,
      "Case Report",
      unescape(urlGene.toString())
    );
    yield put({
      type: settingsActions.UPDATE_DOMAINS,
      domains: [defaultDomain],
    });
  }
}

function* persistTierOverride(action) {
  try {
    const state = yield select(getCurrentState);
    const id = state?.CaseReport?.id;
    const ns = nsForState(state);
    const ev =
      (state?.FilteredEvents?.filteredEvents || []).find((d) => d?.uid === action.uid) ||
      state?.FilteredEvents?.selectedFilteredEvent;
    if (!id || !ev) return;
    const anchor = makeAnchor(ev);
    const key = tierKey(id, anchor);
    yield call(idbSet, ns, key, String(action.tier));
  } catch (_e) {}
}

function* persistAlterationFields(action) {
  try {
    const { uid, changes } = action;
    if (!uid || !changes) return;
    const state = yield select(getCurrentState);
    const id = state?.CaseReport?.id;
    const ns = nsForState(state);
    const ev =
      (state?.FilteredEvents?.filteredEvents || []).find((d) => d?.uid === uid) ||
      state?.FilteredEvents?.selectedFilteredEvent;
    if (!id || !ev) return;
    const anchor = makeAnchor(ev);
    const base = fieldBaseKey(id, anchor);

    const entries = Object.entries(changes || {});
    for (const [k, v] of entries) {
      if (!FIELD_NAMES.includes(k)) continue;
      const key = `${base}.${k}`;
      let val = "";
      if (k === "therapeutics" || k === "resistances") {
        val = toCommaList(v);
      } else {
        val = String(v ?? "");
      }
      if (val) {
        yield call(idbSet, ns, key, val);
      } else {
        try {
          yield call(idbSet, ns, key, "");
        } catch (_e) {}
      }
    }
  } catch (_e) {}
}

function* hydrateAlterationFieldsFromIdb() {
  try {
    const state = yield select(getCurrentState);
    const id = state?.CaseReport?.id;
    const ns = nsForState(state);
    if (!id) return;
    const map = yield call(idbGetAll, ns);
    const list = state?.FilteredEvents?.filteredEvents || [];
    for (const ev of list) {
      const anchor = makeAnchor(ev);
      const base = fieldBaseKey(id, anchor);
      const patch = {};
      for (const k of FIELD_NAMES) {
        const key = `${base}.${k}`;
        if (Object.prototype.hasOwnProperty.call(map, key)) {
          const raw = String(map[key] ?? "");
          if (!raw) continue;
          if (k === "therapeutics" || k === "resistances") {
            patch[k] = fromCommaList(raw);
          } else {
            patch[k] = raw;
          }
        }
      }
      if (Object.keys(patch).length) {
        yield put({
          type: actions.UPDATE_ALTERATION_FIELDS,
          uid: ev.uid,
          changes: patch,
        });
      }
    }
  } catch (_e) {}
}


function* actionWatcher() {
  yield takeEvery(actions.FETCH_FILTERED_EVENTS_REQUEST, fetchFilteredEvents);
  yield takeEvery(actions.SELECT_FILTERED_EVENT, selectFilteredEvent);
  yield takeEvery(actions.UPDATE_ALTERATION_FIELDS, persistAlterationFields);
  yield takeEvery(actions.APPLY_TIER_OVERRIDE, persistTierOverride);
  yield takeEvery(actions.FETCH_FILTERED_EVENTS_SUCCESS, hydrateAlterationFieldsFromIdb);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
