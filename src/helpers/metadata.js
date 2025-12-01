const valueFormats = {
  "hrd.hrd_score": ".4f",
  "hrd.b1_2_score": ".3f",
  "hrd.b1_score": ".3f",
  "hrd.b2_score": ".3f",
  "hrd.wt_score": ".3f",
  "hrd.DUP_1kb_100kb": ",.2",
  "hrd.qrppos": ",",
  "hrd.qrpmin": ",",
  "hrd.qrpmix": ",",
  "hrd.qrdup": ",",
  "hrd.qrdel": ",",
  "hrd.tib": ",",
  "hrd.ihdel": ",",
  "hrd.del_mh_prop": ".0%",
  "hrd.loh_score": ".3f",
  "hrd.SNV3": ".2f",
  "hrd.SNV8": ".2f",
  "hrd.RS3": ".2f",
  "hrd.RS5": ".2f",
  tyfonas: ",",
  dm: ",",
  bfb: ",",
  cpxdm: ",",
  chromothripsis: ",",
  chromoplexy: ",",
  tic: ",",
  rigma: ",",
  pyrgo: ",",
  del: ",",
  dup: ",",
  inv: ",",
  simple: ",",
  tra: ",",
  "DEL-like": ",",
  "DUP-like": ",",
  "INV-like": ",",
  "TRA-like": ",",
  coverage_variance: ".2f",
  tumor_median_coverage: ",",
  snv_count: ",",
  sv_count: ",",
  tmb: ",",
  loh_fraction: ".3",
  purity: ".2f",
  ploidy: ".2f",
  "msisensor.score": ".2%",
  "msisensor.n_unstable": ",",
  "msisensor.n_evaluated": ",",
  "msisensor.label": "",
};

export const hrdFields = [
  "b1_score",
  "b2_score",
  "wt_score",
  "hrd_score",
  "DUP_1kb_100kb",
  "qrppos",
  "qrpmin",
  "qrpmix",
  "qrdup",
  "qrdel",
  "tib",
  "ihdel",
  "del_mh_prop",
  "loh_score",
  "SNV3",
  "SNV8",
  "RS3",
  "RS5",
];

export const sv_countFields = [
  "tyfonas",
  "dm",
  "bfb",
  "cpxdm",
  "chromothripsis",
  "chromoplexy",
  "tic",
  "rigma",
  "pyrgo",
  "del",
  "dup",
  "simple",
  "DEL-like",
  "DUP-like",
  "INV-like",
  "TRA-like",
];

export const msiFields = ["score", "n_unstable", "n_evaluated", "label"];

export const headerList = [
  "tumor_median_coverage",
  "snv_count",
  "sv_count",
  "hrd.b1_2_score",
  "msisensor.label",
  "tmb",
  "loh_fraction",
];

export const hrdDividers = {
  "hrd.DUP_1kb_100kb": "b12Features",
  "hrd.del_mh_prop": "hrdetectFeatures",
};

export const msiLabels = {
  MSS: "#33a02c",
  "MSI-Low": "#faad14",
  "MSI-High": "#ff4d4f",
};

export function valueFormat(value) {
  return valueFormats[value] || ".2f";
}

export function cosineSimilarityClass(value) {
  if (value >= 0.95) {
    return "success";
  } else if (value >= 0.85 && value < 0.95) {
    return "warning";
  } else {
    return "error";
  }
}

export function qcEvaluator(qcMetrics) {
  return qcMetrics.length === 0
    ? null
    : qcMetrics.some((d) => d.code === "FAIL")
    ? "FAIL"
    : qcMetrics.some((d) => d.code === "WARN")
    ? "WARN"
    : qcMetrics.every((d) => d.code === "UNKNOWN")
    ? "UNKNOWN"
    : "PASS";
}

export const qcMetricsClasses = {
  pass: "success",
  warn: "warning",
  fail: "error",
  unknown: "default",
};

export function getNestedValue(obj, path) {
  if (!path) {
    return undefined;
  }
  return path
    .split(".")
    .reduce((acc, part) => (acc == null ? acc : acc[part]), obj);
}
