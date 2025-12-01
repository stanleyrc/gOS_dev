// signatureStatisticsWorker.js
/* eslint-env worker */
/* eslint no-restricted-globals: "off" */

self.onmessage = function (e) {
  const {
    signatures,
    signaturesReference,
    metadata,
    dataset,
    id,
    sigprofiler_sbs_count,
    sigprofiler_indel_count,
    signatureTitles,
  } = e.data;

  try {
    // Use the dataPath as provided by the saga (should be absolute URL)
    const correctedDataPath = dataset.dataPath;
    let signatureMetrics = {
      indel: { count: [], fraction: [] },
      sbs: { count: [], fraction: [] },
    };
    let tumorSignatureMetrics = {
      indel: { count: [], fraction: [] },
      sbs: { count: [], fraction: [] },
    };
    let mutationCatalog = [];
    let decomposedCatalog = [];
    let referenceCatalog = [];

    // Calculate signature metrics
    Object.keys(signatures).forEach((type) => {
      signatureMetrics[type] = {};
      Object.keys(signatures[type]).forEach((mode) => {
        signatureMetrics[type][mode] = getSignatureMetrics(
          signatures[type][mode],
          signatureTitles,
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

    // Calculate tumor signature metrics
    Object.keys(signatures).forEach((type) => {
      tumorSignatureMetrics[type] = {};
      Object.keys(signatures[type]).forEach((mode) => {
        tumorSignatureMetrics[type][mode] = getSignatureMetrics(
          signatures[type][mode],
          {
            markData: metadata[`sigprofiler_${type}_${mode}`],
            tumorType: metadata.tumor_type,
            format: mode === "fraction" ? ".4f" : ",",
            range: mode === "fraction" ? [0, 1] : null,
          }
        );
      });
    });

    // Fetch mutation catalog files
    Promise.all([
      fetch(`${correctedDataPath}${id}/mutation_catalog.json`)
        .then((r) => {
          if (!r.ok) {
            throw new Error(
              `HTTP ${r.status}: ${r.statusText} for mutation_catalog.json at URL: ${correctedDataPath}${id}/mutation_catalog.json`
            );
          }
          return r.text();
        })
        .then((text) => {
          try {
            return JSON.parse(text);
          } catch (e) {
            throw new Error(
              `Failed to parse mutation_catalog.json as JSON at URL: ${correctedDataPath}${id}/mutation_catalog.json. Response: ${text.substring(
                0,
                200
              )}...`
            );
          }
        }),
      fetch(`${correctedDataPath}${id}/id_mutation_catalog.json`)
        .then((r) => {
          if (!r.ok) {
            throw new Error(
              `HTTP ${r.status}: ${r.statusText} for id_mutation_catalog.json at URL: ${correctedDataPath}${id}/id_mutation_catalog.json`
            );
          }
          return r.text();
        })
        .then((text) => {
          try {
            return JSON.parse(text);
          } catch (e) {
            throw new Error(
              `Failed to parse id_mutation_catalog.json as JSON at URL: ${correctedDataPath}${id}/id_mutation_catalog.json. Response: ${text.substring(
                0,
                200
              )}...`
            );
          }
        }),
    ])
      .then((responses) => {
        responses.forEach((d, i) => {
          if (i < 1) {
            let data = d.data || [];
            data.forEach((d, i) => {
              d.type = d.tnc;
              d.mutationType = (d.tnc?.match(/\[(.*?)\]/) || [])[1];
              d.variantType = "sbs";
              d.group = mutationsGroups()[d.mutationType];
              d.label = nucleotideMutationText(d.tnc);
              d.probability = 1.0;
              mutationCatalog.push(d);
            });
          } else {
            let data = d.data || [];
            data.forEach((d, i) => {
              let { variant, label } = deletionInsertionMutationVariant(
                d.insdel
              );
              d.type = d.insdel;
              d.mutationType = variant;
              d.group = mutationsGroups()[d.mutationType];
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
          ascending(a.mutationType, b.mutationType)
        );

        // Fetch decomposed probability files
        return Promise.all([
          fetch(`${correctedDataPath}${id}/sbs_decomposed_prob.json`).then(
            async (r) => {
              if (!r.ok) {
                throw new Error(
                  `HTTP ${r.status}: ${r.statusText} for sbs_decomposed_prob.json at URL: ${correctedDataPath}${id}/sbs_decomposed_prob.json`
                );
              }
              const text = await r.text();
              try {
                return JSON.parse(text);
              } catch (jsonError) {
                throw new Error(
                  `Failed to parse sbs_decomposed_prob.json as JSON at URL: ${correctedDataPath}${id}/sbs_decomposed_prob.json: ${
                    jsonError.message
                  }. Response: ${text.substring(0, 200)}...`
                );
              }
            }
          ),
          fetch(`${correctedDataPath}${id}/id_decomposed_prob.json`).then(
            async (r) => {
              if (!r.ok) {
                throw new Error(
                  `HTTP ${r.status}: ${r.statusText} for id_decomposed_prob.json at URL: ${correctedDataPath}${id}/id_decomposed_prob.json`
                );
              }
              const text = await r.text();
              try {
                return JSON.parse(text);
              } catch (jsonError) {
                throw new Error(
                  `Failed to parse id_decomposed_prob.json as JSON at URL: ${correctedDataPath}${id}/id_decomposed_prob.json: ${
                    jsonError.message
                  }. Response: ${text.substring(0, 200)}...`
                );
              }
            }
          ),
        ]);
      })
      .then((responses) => {
        responses.forEach((data, i) => {
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
                            (k) => k.variantType === "sbs" && k.type === d.tnc
                          )?.mutations || 0;
                        let entry = {
                          id: `sbs-${signature}-${i}`,
                          signature: d.signature,
                          probability: d.p,
                          mutations: Math.round(d.p * mutationGlobalValue),
                          type: d.tnc,
                          mutationType: (d.tnc?.match(/\[(.*?)\]/) || [])[1],
                          variantType: "sbs",
                          label: nucleotideMutationText(d.tnc),
                          group:
                            mutationsGroups()[
                              (d.tnc?.match(/\[(.*?)\]/) || [])[1]
                            ],
                        };
                        return entry;
                      })
                      .sort((a, b) =>
                        ascending(a.mutationType, b.mutationType)
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
                              k.variantType === "indel" && k.type === d.insdel
                          )?.mutations || 0;
                        let entry = {
                          id: `indel-${signature}-${i}`,
                          variant,
                          label,
                          signature: d.signature,
                          probability: d.p,
                          mutations: Math.round(d.p * mutationGlobalValue),
                          type: d.insdel,
                          group: mutationsGroups()[variant],
                          mutationType: variant,
                          variantType: "indel",
                        };
                        return entry;
                      })
                      .filter((e) => e.variant)
                      .sort((a, b) =>
                        ascending(a.mutationType, b.mutationType)
                      ),
                  });
                }
              }
            );
          }
        });

        // Process reference catalog for SBS
        Object.entries(sigprofiler_sbs_count).forEach(([signature, value]) => {
          if (
            signaturesReference.sbs &&
            signaturesReference.sbs[signature] &&
            value > 0
          ) {
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
                    mutationType: (d.tnc?.match(/\[(.*?)\]/) || [])[1],
                    variantType: "sbs",
                    label: nucleotideMutationText(d.tnc),
                  };
                  return entry;
                })
                .sort((a, b) => ascending(a.mutationType, b.mutationType)),
            });
          }
        });

        // Process reference catalog for indels
        Object.entries(sigprofiler_indel_count).forEach(
          ([signature, value]) => {
            if (
              signaturesReference.indel &&
              signaturesReference.indel[signature] &&
              value > 0
            ) {
              referenceCatalog.push({
                id: signature,
                variantType: "indel",
                count: value,
                catalog: signaturesReference.indel[signature]
                  .map((d, i) => {
                    let { variant, label } = deletionInsertionMutationVariant(
                      d.tnc
                    );
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
                  .sort((a, b) => ascending(a.mutationType, b.mutationType)),
              });
            }
          }
        );

        // Post result back to main thread
        self.postMessage({
          success: true,
          data: {
            signatureMetrics,
            tumorSignatureMetrics,
            mutationCatalog,
            decomposedCatalog,
            referenceCatalog,
          },
        });
      })
      .catch((error) => {
        self.postMessage({
          success: false,
          error: error.message,
        });
      });
  } catch (error) {
    self.postMessage({
      success: false,
      error: error.message,
    });
  }

  // Helper functions (copied from utility)
  function getSignatureMetrics(
    populations,
    titles,
    props = {
      range: null,
      markData: {},
      tumorType: null,
      format: "0.4f",
      scaleX: "linear",
      type: "histogram",
    }
  ) {
    const { range, markData, tumorType, type, format, scaleX } = props;
    // Extract the data from the responses and store it in an object
    return Object.keys(populations)
      .map((d, i) => {
        let plot = {};
        let cutoff = Infinity;
        plot.id = d;
        plot.title = titles && titles[d] ? titles[d] : d;
        plot.group = "signatures";
        plot.groupTitle = "Signatures";
        plot.groupOrder = 0;
        plot.order = i;
        plot.type = type;
        plot.scaleX = scaleX;
        plot.allData = populations[d].map((e) => +e.value);
        plot.data = populations[d]
          .filter((e) =>
            tumorType ? !e.tumor_type || e.tumor_type === tumorType : true
          )
          .map((d) => +d.value)
          .filter((d) => d < cutoff)
          .sort((a, b) => ascending(a, b));
        plot.bandwidth = Math.pow(
          (4 * Math.pow(deviation(plot.data), 5)) / (3.0 * plot.data.length),
          0.15
        );
        plot.q1 = quantile(plot.data, 0.25);
        plot.q3 = quantile(plot.data, 0.75);
        plot.q99 = quantile(plot.data, 0.99);
        let minValue = scaleX === "log" ? 1 : 0;
        let maxValue = max([
          plot.allData.find((e) => e > 0),
          quantile(plot.data, 0.8),
        ]);
        plot.range = range ? range : [minValue, maxValue];
        plot.format = format;
        plot.markValueFormat = format;
        if (Object.keys(markData).includes(d)) {
          plot.markValue = +markData[d];
        }
        return plot;
      })
      .sort((a, b) => descending(a.markValue, b.markValue));
  }

  function mutationsGroups() {
    return {
      "C>A": "Cmutation",
      "C>G": "Cmutation",
      "C>T": "Cmutation",
      "T>A": "Tmutation",
      "T>C": "Tmutation",
      "T>G": "Tmutation",
      "1DelC": "1Del",
      "1DelT": "1Del",
      "1InsC": "1Ins",
      "1InsT": "1Ins",
      "2DelR": "longDel",
      "3DelR": "longDel",
      "4DelR": "longDel",
      "5DelR": "longDel",
      "2InsR": "longIns",
      "3InsR": "longIns",
      "4InsR": "longIns",
      "5InsR": "longIns",
      "2DelM": "delMH",
      "3DelM": "delMH",
      "4DelM": "delMH",
      "5DelM": "delMH",
      longDel: "longDel",
      longIns: "longIns",
      delMH: "delMH",
      delComplex: "delComplex",
    };
  }

  function nucleotideMutationText(nucleotideMutation) {
    // Regular expression to match the nucleotide and mutation parts
    const regex = /\[[^\]]*\]/g;

    return nucleotideMutation
      .replace(regex, "")
      .split("")
      .join(nucleotideMutation.substring(2, 3));
  }

  function deletionInsertionMutationVariant(input) {
    const label = +input.slice(-1);
    const baseLabel = `${label}${label > 4 ? "+" : ""}`;
    const incrementedLabel = `${label + 1}${label > 4 ? "+" : ""}`;

    const patterns = [
      { match: "1:Del:C", variant: "1DelC", label: incrementedLabel },
      { match: "1:Del:T", variant: "1DelT", label: incrementedLabel },
      { match: "1:Ins:C", variant: "1InsC", label: baseLabel },
      { match: "1:Ins:T", variant: "1InsT", label: baseLabel },
      { match: "2:Del:R", variant: "2DelR", label: incrementedLabel },
      { match: "3:Del:R", variant: "3DelR", label: incrementedLabel },
      { match: "4:Del:R", variant: "4DelR", label: incrementedLabel },
      { match: "5:Del:R", variant: "5DelR", label: incrementedLabel },
      { match: "2:Ins:R", variant: "2InsR", label: baseLabel },
      { match: "3:Ins:R", variant: "3InsR", label: baseLabel },
      { match: "4:Ins:R", variant: "4InsR", label: baseLabel },
      { match: "5:Ins:R", variant: "5InsR", label: baseLabel },
      { match: "2:Del:M", variant: "2DelM", label: baseLabel },
      { match: "3:Del:M", variant: "3DelM", label: baseLabel },
      { match: "4:Del:M", variant: "4DelM", label: baseLabel },
      { match: "5:Del:M", variant: "5DelM", label: baseLabel },
      { match: "long_Del", variant: "longDel", label: "5+" },
      { match: "long_Ins", variant: "longIns", label: "5+" },
      { match: "MH", variant: "delMH", label: "5+" },
      { match: "complex", variant: "delComplex", label: "5+" },
    ];

    const matchedPattern = patterns.find(({ match }) => input.includes(match));
    return matchedPattern
      ? { variant: matchedPattern.variant, label: matchedPattern.label }
      : { variant: null, label: null };
  }

  // D3-like utility functions
  function quantile(values, p) {
    const sorted = values.slice().sort(ascending);
    const n = sorted.length;
    if (!n) return;
    if (p <= 0 || n < 2) return sorted[0];
    if (p >= 1) return sorted[n - 1];
    const i = (n - 1) * p;
    const i0 = Math.floor(i);
    const value0 = sorted[i0];
    const value1 = sorted[i0 + 1];
    return value0 + (value1 - value0) * (i - i0);
  }

  function deviation(values) {
    const n = values.length;
    if (n < 2) return;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance =
      values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) /
      (n - 1);
    return Math.sqrt(variance);
  }

  function max(values) {
    let maxVal;
    for (const value of values) {
      if (value != null && value >= value) {
        if (maxVal === undefined || maxVal < value) {
          maxVal = value;
        }
      }
    }
    return maxVal;
  }

  function descending(a, b) {
    return a == null || b == null
      ? NaN
      : b < a
      ? -1
      : b > a
      ? 1
      : b >= a
      ? 0
      : NaN;
  }

  function ascending(a, b) {
    return a == null || b == null
      ? NaN
      : a < b
      ? -1
      : a > b
      ? 1
      : a >= b
      ? 0
      : NaN;
  }
};
