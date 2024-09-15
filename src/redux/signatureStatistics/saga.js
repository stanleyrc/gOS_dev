import { all, takeEvery, put, call } from "redux-saga/effects";
import axios from "axios";
import {
  getSignatureMetrics,
  nucleotideMutationText,
  deletionInsertionMutationVariant,
} from "../../helpers/utility";
import * as d3 from "d3";
import actions from "./actions";
import caseReportActions from "../caseReport/actions";

function* fetchData(action) {
  try {
    const { pair, metadata } = action;
    const { sigprofiler_sbs_count, sigprofiler_indel_count } = metadata;

    // get the settings within the public folder
    let responseSettings = yield call(axios.get, "settings.json");
    let settings = responseSettings.data;
    let responseDatafiles = yield call(axios.get, "datafiles.json");
    let datafiles = responseDatafiles.data;

    let signatures = {};
    let signatureMetrics = [];
    let tumorSignatureMetrics = [];
    let mutationCatalog = [];
    let decomposedCatalog = [];
    let referenceCatalog = [];

    let signaturesList = [];
    settings.signaturesList.types.forEach((type) => {
      signatures[type] = {};
      settings.signaturesList.modes.forEach((mode) => {
        signatures[type][mode] = {};
        settings.signaturesList.datafiles[type].forEach((name) => {
          signatures[type][mode][name] = [];
          signaturesList.push({
            type: type,
            mode: mode,
            name: name,
          });
        });
      });
    });

    signaturesList.forEach((sig) => {
      let { type, mode } = sig;
      datafiles.forEach((record, i) => {
        Object.keys(record[`sigprofiler_${type}_${mode}`] || []).forEach(
          (name) => {
            signatures[type][mode][name].push({
              pair: record.pair,
              tumor_type: record.tumor_type,
              value: record[`sigprofiler_${type}_${mode}`][name],
              sig: name,
            });
          }
        );
      });
    });

    responseSettings.data.signaturesList.types.forEach((type) => {
      signatureMetrics[type] = {};
      responseSettings.data.signaturesList.modes.forEach((mode) => {
        signatureMetrics[type][mode] = getSignatureMetrics(
          signatures[type][mode]
        );
      });
    });

    let signaturesReference = {};
    let signaturesReferenceWeightsList = [];
    responseSettings.data.signaturesList.types.forEach((type) => {
      signaturesReference[type] = {};

      responseSettings.data.signaturesList.datafiles[type].forEach((d) => {
        signaturesReferenceWeightsList.push({
          type: type,
          name: d,
          path: `common/signatures/${type}_signature_weights/${d}.json`,
        });
      });
    });
    yield axios
      .all(signaturesReferenceWeightsList.map((e) => axios.get(e.path)))
      .then(
        axios.spread((...responses) => {
          responses.forEach(
            (d, i) =>
              (signaturesReference[signaturesReferenceWeightsList[i].type][
                signaturesReferenceWeightsList[i].name
              ] = d.data)
          );
        })
      )
      .catch((errors) => {
        console.log("got errors on loading signatures", errors);
      });

    Object.keys(signatures).forEach((type) => {
      signatureMetrics[type] = {};
      Object.keys(signatures[type]).forEach((mode) => {
        signatureMetrics[type][mode] = getSignatureMetrics(
          signatures[type][mode],
          {
            markData: metadata[`sigprofiler_${type}_${mode}`],
            format: mode === "fraction" ? ".4f" : ",",
            range: mode === "fraction" ? [0, 1] : null,
            scaleX: "linear",
            type: "histogram",
          }
        );
      });
    });

    Object.keys(signatures).forEach((type) => {
      tumorSignatureMetrics[type] = {};
      Object.keys(signatures[type]).forEach((mode) => {
        tumorSignatureMetrics[type][mode] = getSignatureMetrics(
          signatures[type][mode],
          {
            markData: metadata[`sigprofiler_${type}_${mode}`],
            tumorType: metadata.tumor,
            format: mode === "fraction" ? ".4f" : ",",
            range: mode === "fraction" ? [0, 1] : null,
          }
        );
      });
    });

    try {
      yield axios
        .all(
          ["", "id_"].map((e) =>
            axios.get(`data/${pair}/${e}mutation_catalog.json`)
          )
        )
        .then(
          axios.spread((...responses) => {
            responses.forEach((d, i) => {
              if (i < 1) {
                let data = d.data.data || [];
                data.forEach((d, i) => {
                  d.type = d.tnc;
                  d.mutationType = (d.tnc.match(/\[(.*?)\]/) || [])[1];
                  d.variantType = "sbs";
                  d.label = nucleotideMutationText(d.tnc);
                  d.probability = 1.0;
                  mutationCatalog.push(d);
                });
              } else {
                let data = d.data.data || [];
                data.forEach((d, i) => {
                  let { variant, label } = deletionInsertionMutationVariant(
                    d.insdel
                  );
                  d.type = d.insdel;
                  d.mutationType = variant;
                  d.variantType = "indel";
                  d.label = label;
                  d.probability = 1.0;
                  if (variant) {
                    mutationCatalog.push(d);
                  }
                });
              }
            });
            mutationCatalog = mutationCatalog.sort((a, b) =>
              d3.ascending(a.mutationType, b.mutationType)
            );
          })
        )
        .catch((errors) => {
          console.log("got errors on loading mutation catalogs", errors);
        });
    } catch (err) {
      console.log(err);
    }

    try {
      yield axios
        .all(
          ["sbs", "id"].map((e) =>
            axios.get(`data/${pair}/${e}_decomposed_prob.json`)
          )
        )
        .then(
          axios.spread((...responses) => {
            responses.forEach((d, i) => {
              let data = d.data || [];
              if (i < 1) {
                Object.entries(sigprofiler_sbs_count).forEach(
                  ([signature, value]) => {
                    if (value > 0) {
                      decomposedCatalog.push({
                        id: signature,
                        variantType: "sbs",
                        count: value,
                        catalog: data
                          .filter((e) => e.signature === signature)
                          .map((d, i) => {
                            let mutationGlobalValue =
                              mutationCatalog.find(
                                (k) =>
                                  k.variantType === "sbs" && k.type === d.tnc
                              )?.mutations || 0;
                            let entry = {
                              id: `sbs-${signature}-${i}`,
                              signature: d.signature,
                              probability: d.p,
                              mutations: Math.round(d.p * mutationGlobalValue),
                              type: d.tnc,
                              mutationType: (d.tnc.match(/\[(.*?)\]/) || [])[1],
                              variantType: "sbs",
                              label: nucleotideMutationText(d.tnc),
                            };
                            return entry;
                          })
                          .sort((a, b) =>
                            d3.ascending(a.mutationType, b.mutationType)
                          ),
                      });
                    }
                  }
                );
              } else {
                Object.entries(sigprofiler_indel_count).forEach(
                  ([signature, value]) => {
                    if (value > 0) {
                      decomposedCatalog.push({
                        id: signature,
                        variantType: "indel",
                        count: value,
                        catalog: data
                          .filter((e) => e.signature === signature)
                          .map((d, i) => {
                            let { variant, label } =
                              deletionInsertionMutationVariant(d.insdel);
                            let mutationGlobalValue =
                              mutationCatalog.find(
                                (k) =>
                                  k.variantType === "indel" &&
                                  k.type === d.insdel
                              )?.mutations || 0;
                            let entry = {
                              id: `indel-${signature}-${i}`,
                              variant,
                              label,
                              signature: d.signature,
                              probability: d.p,
                              mutations: Math.round(d.p * mutationGlobalValue),
                              type: d.insdel,
                              mutationType: variant,
                              variantType: "indel",
                            };
                            return entry;
                          })
                          .filter((e) => e.variant)
                          .sort((a, b) =>
                            d3.ascending(a.mutationType, b.mutationType)
                          ),
                      });
                    }
                  }
                );
              }
            });
          })
        )
        .catch((errors) => {
          console.log("got errors on loading mutation catalogs", errors);
        });
    } catch (err) {
      console.log(err);
    }

    // mutation catalog for reference weights for sbs
    Object.entries(sigprofiler_sbs_count).forEach(([signature, value]) => {
      if (value > 0) {
        referenceCatalog.push({
          id: signature,
          variantType: "sbs",
          count: value,
          catalog: signaturesReference.sbs[signature]
            .map((d, i) => {
              let entry = {
                id: `sbs-${signature}-ref-${i}`,
                signature,
                probability: d.value,
                mutations: Math.round(d.value * value),
                type: d.tnc,
                mutationType: (d.tnc.match(/\[(.*?)\]/) || [])[1],
                variantType: "sbs",
                label: nucleotideMutationText(d.tnc),
              };
              return entry;
            })
            .sort((a, b) => d3.ascending(a.mutationType, b.mutationType)),
        });
      }
    });

    // mutation catalog for reference weights for indels
    Object.entries(sigprofiler_indel_count).forEach(([signature, value]) => {
      if (value > 0) {
        referenceCatalog.push({
          id: signature,
          variantType: "indel",
          count: value,
          catalog: signaturesReference.indel[signature]
            .map((d, i) => {
              let { variant, label } = deletionInsertionMutationVariant(d.tnc);
              let entry = {
                id: `indel-${signature}-ref-${i}`,
                variant,
                label,
                signature,
                probability: d.value,
                mutations: Math.round(d.value * value),
                type: d.tnc,
                mutationType: variant,
                variantType: "indel",
              };
              return entry;
            })
            .filter((e) => e.variant)
            .sort((a, b) => d3.ascending(a.mutationType, b.mutationType)),
        });
      }
    });

    yield put({
      type: actions.FETCH_SIGNATURE_STATISTICS_SUCCESS,
      signatures,
      signatureMetrics,
      tumorSignatureMetrics,
      mutationCatalog,
      decomposedCatalog,
      referenceCatalog,
      signaturesReference,
    });
  } catch (error) {
    yield put({
      type: actions.FETCH_SIGNATURE_STATISTICS_FAILED,
      error,
    });
  }
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_SIGNATURE_STATISTICS_REQUEST, fetchData);
  yield takeEvery(caseReportActions.SELECT_CASE_REPORT_SUCCESS, fetchData);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
