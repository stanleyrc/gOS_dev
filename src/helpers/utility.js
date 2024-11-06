import { tableFromIPC } from "apache-arrow";
import axios from "axios";
import * as d3 from "d3";
import Connection from "./connection";
import Interval from "./interval";

export function replaceSearchParams(location, params = {}) {
  let searchParams = new URLSearchParams(location.search);
  Object.keys(params).forEach((param) => {
    searchParams.set(param, params[param].toString());
  });
  return decodeURIComponent(searchParams.toString());
}

export async function loadArrowTable(file, cancelToken) {
  try {
    // Fetch the file with Axios and the provided cancel token
    const response = await axios.get(file, {
      responseType: "arraybuffer", // Ensure the response is in binary format
      cancelToken: cancelToken, // Pass the cancel token here
    });

    // Convert the Axios response data to an Arrow table
    return await tableFromIPC(response.data);
  } catch (error) {
    if (axios.isCancel(error)) {
      console.log(`Request canceled for ${file}`, error.message);
    } else {
      console.error(`Failed to load Arrow table for file ${file}:`, error);
    }
    throw error; // Re-throw error so calling code can handle it
  }
}

export function transitionStyle(inViewport) {
  if (inViewport) {
    return { WebkitTransition: "opacity 0.75s ease-in-out" };
  } else if (!inViewport) {
    return { WebkitTransition: "none", opacity: "0" };
  }
}

export function dataToGenome(data, chromoBins) {
  let genome = {
    settings: data.settings,
    intervals: [],
    connections: [],
    intervalBins: {},
    frameConnections: [],
  };
  genome.intervalBins = {};
  data.intervals.forEach((d, i) => {
    let interval = new Interval(d);
    interval.startPlace =
      chromoBins[`${interval.chromosome}`].startPlace + interval.startPoint;
    interval.endPlace =
      chromoBins[`${interval.chromosome}`].startPlace + interval.endPoint;
    interval.color = d3
      .rgb(chromoBins[`${interval.chromosome}`].color)
      .toString();
    interval.stroke = d3
      .rgb(chromoBins[`${interval.chromosome}`].color)
      .darker()
      .toString();
    genome.intervalBins[d.iid] = interval;
    genome.intervals.push(interval);
  });
  data.frameConnections = [];
  data.connections.forEach((d, i) => {
    let connection = new Connection(d);
    if (connection.isValid(genome.intervalBins)) {
      connection.pinpoint(genome.intervalBins);
      connection.arc = d3
        .arc()
        .innerRadius(0)
        .outerRadius(plotMargins().bar / 2)
        .startAngle(0)
        .endAngle((e, j) => e * Math.PI);
      genome.frameConnections.push(connection);
    }
    genome.connections.push(connection);
  });

  return genome;
}

export function defaultSearchFilters() {
  return { page: 1, per_page: 10, texts: "" };
}

export function plotMargins() {
  return {
    gap: 24,
    bar: 10,
    gapY: 24,
    yTicksCount: 10,
  };
}

export function legendColors() {
  // first color for x < μ - 2σ
  // second color for |x - μ| < 2σ
  // third color for x > μ + 2σ
  return ["#1f78b4", "#33a02c", "#fc8d62"];
}

export function qualityStatusTagClasses() {
  return { 0: "success", 1: "warning", 2: "error" };
}

export function qualityStatusTypographyClasses() {
  return { 0: "success", 1: "warning", 2: "danger" };
}

export function nucleotideColors() {
  return ["#1f78b4", "#33a02c", "#fc8d62"];
}

export function deletionInsertionMutationVariant(input) {
  if (input.includes("1:Del:C")) {
    return { variant: "1DelC", label: ` ${input.slice(-1)}` };
  } else if (input.includes("1:Del:T")) {
    return { variant: "1DelT", label: ` ${input.slice(-1)}` };
  } else if (input.includes("1:Ins:C")) {
    return { variant: "1InsC", label: ` ${input.slice(-1)}` };
  } else if (input.includes("1:Ins:T")) {
    return { variant: "1InsT", label: ` ${input.slice(-1)}` };
  } else if (input.includes("long_Del")) {
    return { variant: "longDel", label: "5+" };
  } else if (input.includes("long_Ins")) {
    return { variant: "longIns", label: "5+" };
  } else if (input.includes("MH")) {
    return { variant: "delMH", label: "5+" };
  } else if (input.includes("complex")) {
    return { variant: "delComplex", label: "5+" };
  } else {
    return { variant: null, label: null };
  }
}

export function nucleotideMutationText(nucleotideMutation) {
  // Regular expression to match the nucleotide and mutation parts
  const regex = /\[[^\]]*\]/g;

  return nucleotideMutation
    .replace(regex, "")
    .split("")
    .join(nucleotideMutation.substring(2, 3));
}

export function roleColorMap() {
  return { oncogene: "geekblue", fusion: "green", TSG: "volcano" };
}

export function downloadCanvasAsPng(canvas, filename) {
  /// create an "off-screen" anchor tag
  var lnk = document.createElement("a"),
    e;

  /// the key here is to set the download attribute of the a tag
  lnk.download = filename;

  /// convert canvas content to data-uri for link. When download
  /// attribute is set the content pointed to by link will be
  /// pushed as "download" in HTML5 capable browsers
  lnk.href = canvas.toDataURL("image/png;base64");

  /// create a "fake" click-event to trigger the download
  if (document.createEvent) {
    e = document.createEvent("MouseEvents");
    e.initMouseEvent(
      "click",
      true,
      true,
      window,
      0,
      0,
      0,
      0,
      0,
      false,
      false,
      false,
      false,
      0,
      null
    );

    lnk.dispatchEvent(e);
  } else if (lnk.fireEvent) {
    lnk.fireEvent("onclick");
  }
}

export function measureText(string, fontSize = 10) {
  const widths = [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0.278125, 0.278125, 0.35625, 0.55625, 0.55625,
    0.890625, 0.6671875, 0.1921875, 0.334375, 0.334375, 0.390625, 0.584375,
    0.278125, 0.334375, 0.278125, 0.278125, 0.55625, 0.55625, 0.55625, 0.55625,
    0.55625, 0.55625, 0.55625, 0.55625, 0.55625, 0.55625, 0.278125, 0.278125,
    0.584375, 0.584375, 0.584375, 0.55625, 1.015625, 0.6703125, 0.6671875,
    0.7234375, 0.7234375, 0.6671875, 0.6109375, 0.778125, 0.7234375, 0.278125,
    0.5, 0.6671875, 0.55625, 0.834375, 0.7234375, 0.778125, 0.6671875, 0.778125,
    0.7234375, 0.6671875, 0.6109375, 0.7234375, 0.6671875, 0.9453125, 0.6671875,
    0.6671875, 0.6109375, 0.278125, 0.278125, 0.278125, 0.4703125, 0.584375,
    0.334375, 0.55625, 0.55625, 0.5, 0.55625, 0.55625, 0.3125, 0.55625, 0.55625,
    0.2234375, 0.2703125, 0.5, 0.2234375, 0.834375, 0.55625, 0.55625, 0.55625,
    0.55625, 0.346875, 0.5, 0.278125, 0.55625, 0.5, 0.7234375, 0.5, 0.5, 0.5,
    0.334375, 0.2609375, 0.334375, 0.584375,
  ];
  const avg = 0.528733552631579;
  return (
    string
      .split("")
      .map((c) =>
        c.charCodeAt(0) < widths.length ? widths[c.charCodeAt(0)] : avg
      )
      .reduce((cur, acc) => acc + cur) * fontSize
  );
}

export function guid() {
  function S4() {
    return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
  }
  // then to call it, plus stitch in '4' in the third group
  return (
    S4() +
    S4() +
    "-" +
    S4() +
    "-4" +
    S4().substr(0, 3) +
    "-" +
    S4() +
    "-" +
    S4() +
    S4() +
    S4()
  ).toLowerCase();
}

export function humanize(str) {
  return str
    .replace(/^[\s_]+|[\s_]+$/g, "")
    .replace(/[_\s]+/g, " ")
    .replace(/^[a-z]/, function (m) {
      return m.toUpperCase();
    });
}

/**
 * K-combinations
 *
 * Get k-sized combinations of elements in a set.
 *
 * Usage:
 *   k_combinations(set, k)
 *
 * Parameters:
 *   set: Array of objects of any type. They are treated as unique.
 *   k: size of combinations to search for.
 *
 * Return:
 *   Array of found combinations, size of a combination is k.
 *
 * Examples:
 *
 *   k_combinations([1, 2, 3], 1)
 *   -> [[1], [2], [3]]
 *
 *   k_combinations([1, 2, 3], 2)
 *   -> [[1,2], [1,3], [2, 3]
 *
 *   k_combinations([1, 2, 3], 3)
 *   -> [[1, 2, 3]]
 *
 *   k_combinations([1, 2, 3], 4)
 *   -> []
 *
 *   k_combinations([1, 2, 3], 0)
 *   -> []
 *
 *   k_combinations([1, 2, 3], -1)
 *   -> []
 *
 *   k_combinations([], 0)
 *   -> []
 */
export function k_combinations(set, k) {
  var i, j, combs, head, tailcombs;

  // There is no way to take e.g. sets of 5 elements from
  // a set of 4.
  if (k > set.length || k <= 0) {
    return [];
  }

  // K-sized set has only one K-sized subset.
  if (k === set.length) {
    return [set];
  }

  // There is N 1-sized subsets in a N-sized set.
  if (k === 1) {
    combs = [];
    for (i = 0; i < set.length; i++) {
      combs.push([set[i]]);
    }
    return combs;
  }

  // Assert {1 < k < set.length}

  // Algorithm description:
  // To get k-combinations of a set, we want to join each element
  // with all (k-1)-combinations of the other elements. The set of
  // these k-sized sets would be the desired result. However, as we
  // represent sets with lists, we need to take duplicates into
  // account. To avoid producing duplicates and also unnecessary
  // computing, we use the following approach: each element i
  // divides the list into three: the preceding elements, the
  // current element i, and the subsequent elements. For the first
  // element, the list of preceding elements is empty. For element i,
  // we compute the (k-1)-computations of the subsequent elements,
  // join each with the element i, and store the joined to the set of
  // computed k-combinations. We do not need to take the preceding
  // elements into account, because they have already been the i:th
  // element so they are already computed and stored. When the length
  // of the subsequent list drops below (k-1), we cannot find any
  // (k-1)-combs, hence the upper limit for the iteration:
  combs = [];
  for (i = 0; i < set.length - k + 1; i++) {
    // head is a list that includes only our current element.
    head = set.slice(i, i + 1);
    // We take smaller combinations from the subsequent elements
    tailcombs = k_combinations(set.slice(i + 1), k - 1);
    // For each (k-1)-combination we join it with the current
    // and store it to the set of k-combinations.
    for (j = 0; j < tailcombs.length; j++) {
      combs.push(head.concat(tailcombs[j]));
    }
  }
  return combs;
}

export function assessQuality(metadata) {
  let assessment = {
    level: 0,
    clauses: [],
  };
  let clauses = [
    {
      level: 3,
      variable: "!metadata.coverage_qc",
      threshold: "",
      comparison: "",
      label: "missing_qc_metrics",
      format: "",
    },
    {
      level: 2,
      variable: "metadata.tumor_median_coverage",
      threshold: 80,
      comparison: "<",
      label: "tumor_coverage_less_than_80x",
      format: ".1f",
    },
    {
      level: 2,
      variable: "metadata.normal_median_coverage",
      threshold: 20,
      comparison: "<",
      label: "normal_coverage_less_than_20x",
      format: ".1f",
    },
    {
      level: 2,
      variable: `metadata.coverage_qc.percent_reads_mapped`,
      threshold: 0.99,
      comparison: "<",
      label: "mapped_reads_per_total_reads_less_than_99_percentage",
      format: ".1%",
    },
    {
      level: 2,
      variable: "metadata.coverage_qc.greater_than_or_equal_to_30x",
      threshold: 0.95,
      comparison: "<",
      label:
        "genome_coverage_at_least_30x_pct_30x_picard_is_less_than_95_percentage",
      format: ".1%",
    },
    {
      level: 1,
      variable: "metadata.coverage_qc.insert_size",
      threshold: 300,
      comparison: "<=",
      label: "median_insert_size_less_or_equal_300",
      format: "d",
    },
    {
      level: 1,
      variable: "metadata.coverage_qc.percent_duplication",
      threshold: 0.2,
      comparison: ">=",
      label: "optical_pcr_dups_greater_or_equal_20_percentage",
      format: ".1%",
    },
  ];

  clauses.forEach((clause) => {
    let evaluationString = `${clause.variable} ${clause.comparison} ${clause.threshold}`;
    try {
      if (eval(evaluationString)) {
        assessment.level = d3.max([assessment.level, clause.level]);
        assessment.clauses.push(clause);
      }
    } catch (error) {
      console.log(error);
    }
  });

  return assessment;
}

export function merge(intervals) {
  // test if there are at least 2 intervals
  if (intervals.length <= 1) {
    return intervals;
  }

  var stack = [];
  var topp = null;

  // sort the intervals based on their start values
  intervals = intervals.sort((a, b) => {
    return a.startPlace - b.startPlace;
  });

  // push the 1st interval into the stack
  stack.push(intervals[0]);

  // start from the next interval and merge if needed
  for (var i = 1; i < intervals.length; i++) {
    // get the topp element
    topp = stack[stack.length - 1];

    // if the current interval doesn't overlap with the
    // stack topp element, push it to the stack
    if (topp.endPlace < intervals[i].startPlace) {
      stack.push(intervals[i]);
    }
    // otherwise update the end value of the topp element
    // if end of current interval is higher
    else if (topp.endPlace < intervals[i].endPlace) {
      topp.endPlace = intervals[i].endPlace;
      stack.pop();
      stack.push(topp);
    }
  }

  return stack;
}

export function updateChromoBins(coordinateSet) {
  let genomeLength = coordinateSet.reduce(
    (acc, elem) => acc + elem.endPoint,
    0
  );
  let boundary = 0;
  let chromoBins = coordinateSet.reduce((hash, element) => {
    let chromo = element;
    chromo.length = chromo.endPoint;
    chromo.startPlace = boundary + chromo.startPoint;
    chromo.endPlace = boundary + chromo.endPoint;
    chromo.scaleToGenome = d3
      .scaleLinear()
      .domain([chromo.startPoint, chromo.endPoint])
      .range([chromo.startPlace, chromo.endPlace]);
    hash[element.chromosome] = chromo;
    boundary += chromo.length;
    return hash;
  }, {});
  return { genomeLength, chromoBins };
}

export function domainsToLocation(chromoBins, domains) {
  return domains.map((d) => locateGenomeRange(chromoBins, d)).join("|");
}

export function locationToDomains(chromoBins, loc) {
  let domains = [];
  loc.split("|").forEach((d, i) => {
    let domainString = d.split("-").map((e) => e.split(":"));
    let domain = [];
    domain.push(
      chromoBins[domainString[0][0]].startPlace +
        +domainString[0][1] -
        chromoBins[domainString[0][0]].startPoint
    );
    domain.push(
      chromoBins[domainString[1][0]].startPlace +
        +domainString[1][1] -
        chromoBins[domainString[1][0]].startPoint
    );
    domains.push(domain);
  });
  return domains;
}

export function locateGenomeRange(chromoBins, domain) {
  let from = domain[0];
  let to = domain[1];
  let genomeRange = [];
  Object.keys(chromoBins).forEach((key, i) => {
    if (
      from <= chromoBins[key].endPlace &&
      from >= chromoBins[key].startPlace
    ) {
      genomeRange.push(
        `${key}:${
          from - chromoBins[key].startPlace + chromoBins[key].startPoint
        }`
      );
    }
    if (to <= chromoBins[key].endPlace && to >= chromoBins[key].startPlace) {
      genomeRange.push(
        `${key}:${to - chromoBins[key].startPlace + chromoBins[key].startPoint}`
      );
    }
  });
  return genomeRange.join("-");
}

export function cluster(
  annotatedIntervals,
  genomeLength,
  maxClusters = 6,
  minDistance = 1e7
) {
  let annotated = annotatedIntervals.sort((a, b) =>
    d3.ascending(a.startPlace, b.startPlace)
  );
  let clusters = [
    { startPlace: annotated[0].startPlace, endPlace: annotated[0].endPlace },
  ];
  for (let i = 0; i < annotated.length - 1; i++) {
    if (annotated[i + 1].startPlace - annotated[i].endPlace > minDistance) {
      clusters.push({
        startPlace: annotated[i + 1].startPlace,
        endPlace: annotated[i + 1].endPlace,
      });
    } else {
      clusters[clusters.length - 1].endPlace = annotated[i + 1].endPlace;
    }
  }
  while (clusters.length > maxClusters) {
    clusters = clusters.sort((a, b) =>
      d3.ascending(a.startPlace, b.startPlace)
    );
    let minDistance = Number.MAX_SAFE_INTEGER;
    let minIndex = 0;
    for (let i = 0; i < clusters.length - 1; i++) {
      if (clusters[i + 1].startPlace - clusters[i].endPlace < minDistance) {
        minDistance = clusters[i + 1].startPlace - clusters[i].endPlace;
        minIndex = i;
      }
    }
    clusters = clusters
      .slice(0, minIndex)
      .concat([
        {
          startPlace: clusters[minIndex].startPlace,
          endPlace: clusters[minIndex + 1].endPlace,
        },
      ])
      .concat(clusters.slice(minIndex + 2, clusters.length));
  }
  clusters = merge(
    clusters.map((d, i) => {
      return {
        startPlace: d3.max([
          d.startPlace - 0.16 * (d.endPlace - d.startPlace),
          1,
        ]),
        endPlace: d3.min([
          d.endPlace + 0.16 * (d.endPlace - d.startPlace),
          genomeLength,
        ]),
      };
    })
  ).sort((a, b) => d3.ascending(a.startPlace, b.startPlace));
  return clusters.map((d, i) => [
    Math.floor(d.startPlace),
    Math.floor(d.endPlace),
  ]);
}

// returns the maxium Y value within the domains array as applied to the dataPointsX
export function findMaxInRanges(
  domains,
  dataPointsX,
  dataPointsY,
  usePercentile = true
) {
  return domains.map(([start, end]) => {
    let left = 0,
      right = dataPointsX.length - 1;

    // Binary search for the first element >= start
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (dataPointsX[mid] < start) left = mid + 1;
      else right = mid - 1;
    }

    // Collect values within the specified range using slice
    const sliceEnd = dataPointsX.findIndex((d) => d > end); // Find first index greater than end
    const valuesInRangeSlice = dataPointsY.slice(left, sliceEnd);

    // Calculate either max or 99th percentile
    let resultValue;
    if (usePercentile && valuesInRangeSlice.length > 0) {
      valuesInRangeSlice.sort((a, b) => a - b); // Sort values to calculate the percentile
      const index = Math.floor(0.999 * valuesInRangeSlice.length);
      resultValue = valuesInRangeSlice[index];
    } else {
      resultValue =
        valuesInRangeSlice.length > 0 ? d3.max(valuesInRangeSlice) : -Infinity;
    }

    return resultValue;
  });
}

export function magnitude(n) {
  let order = Math.floor(Math.log(n) / Math.LN10 + 0.000000001); // because float math sucks like that
  return Math.pow(10, order);
}

export function densityPlotTypes() {
  return ["contourplot", "scatterplot"];
}

export function plotTypes() {
  return {
    tumor_median_coverage: {
      plotType: "histogram",
      tumor_type: "tumor_type",
      format: ",",
      scaleX: "linear",
      scaleXFormat: "~s",
    },
    snvCount: {
      plotType: "histogram",
      tumor_type: "tumor_type",
      format: ",",
      scaleX: "log",
      scaleXFormat: "~s",
    },
    svCount: {
      plotType: "histogram",
      tumor_type: "tumor_type",
      format: ",",
      scaleX: "log",
      scaleXFormat: "~s",
    },
    hrdScore: {
      plotType: "histogram",
      tumor_type: "tumor_type",
      format: ".2f",
      scaleX: "linear",
      scaleXFormat: "0.5f",
    },
    tmb: {
      plotType: "histogram",
      tumor_type: "tumor_type",
      format: ",",
      scaleX: "log",
      scaleXFormat: "~s",
    },
    lohFraction: {
      plotType: "histogram",
      tumor_type: "tumor_type",
      format: ".3",
      scaleX: "linear",
      scaleXFormat: "0.2f",
    },
    purity: {
      plotType: "histogram",
      tumor_type: "tumor_type",
      format: ".2f",
      scaleX: "linear",
      scaleXFormat: "0.2f",
    },
    ploidy: {
      plotType: "histogram",
      tumor_type: "tumor_type",
      format: ".2f",
      scaleX: "linear",
      scaleXFormat: "0.2f",
    },
  };
}

export function reportAttributesMap() {
  return {
    pair: "pair",
    tumor_type: "tumor",
    tumor_median_coverage: "tumor_median_coverage",
    normal_median_coverage: "normal_median_coverage",
    snv_count: "snvCount",
    sv_count: "svCount",
    hrd_score: "hrdScore",
    tmb: "tmb",
    loh_fraction: "lohFraction",
    purity: "purity",
    ploidy: "ploidy",
    disease: "disease",
    inferred_sex: "sex",
    primary_site: "primary_site",
    beta: "beta",
    gamma: "gamma",
    cov_slope: "cov_slope",
    cov_intercept: "cov_intercept",
    hets_slope: "hets_slope",
    hets_intercept: "hets_intercept",
    loose_count: "loose_count",
    junction_count: "junction_count",
    sv_types_count: "sv_types_count",
    hrd: "hrd",
    coverage_qc: "coverage_qc",
    snv_count_normal_vaf_greater0: "snv_count_normal_vaf_greater0",
    signatures: "signatures",
    deletionInsertion: "deletionInsertion",
    sigprofiler_indel_fraction: "sigprofiler_indel_fraction",
    sigprofiler_indel_count: "sigprofiler_indel_count",
    sigprofiler_sbs_fraction: "sigprofiler_sbs_fraction",
    sigprofiler_sbs_count: "sigprofiler_sbs_count",
  };
}

export function mutationCatalogMetadata() {
  return ["id", "type", "mutations", "mutationType", "label", "probability"];
}

export function reportFilters() {
  return ["pair", "tumor_type", "disease", "primary_site", "inferred_sex"];
}

export function mutationFilterTypes() {
  return {
    sbs: ["C>A", "C>G", "C>T", "T>A", "T>C", "T>G"],
    indel: [
      "1DelC",
      "1DelT",
      "1InsC",
      "1InsT",
      "longDel",
      "longIns",
      "delMH",
      "delComplex",
    ],
  };
}

export function coverageQCFields() {
  return [
    { variable: "percent_reads_mapped", format: ".1%" },
    { variable: "percent_gc", format: ".1%" },
    { variable: "greater_than_or_equal_to_30x", format: ".1%" },
    { variable: "greater_than_or_equal_to_50x", format: ".1%" },
    { variable: "insert_size", format: "d" },
    { variable: "percent_mapq_0_reads", format: ".1%" },
    { variable: "coverage_variance", format: ".1%" },
  ];
}
export function flip(data) {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [value, key])
  );
}

export function snakeCaseToHumanReadable(str) {
  return str
    ? str
        .toString()
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : "";
}

export function segmentAttributes() {
  return {
    iid: "",
    mean: ".4f",
    y: ",",
    chromosome: "",
    width: ",",
    startPoint: ",",
    endPoint: ",",
    raw_var: ".4f",
    nbins: ",",
    nbins_tot: ",",
    nbins_nafrac: ".4f",
    wbins_nafrac: ".4f",
    max_na: ".4f",
    loess_var: ".4f",
    tau_sq_post: ".4f",
    post_var: ".4f",
    var: ".4f",
    sd: ".4f",
  };
}

export function transformFilteredEventAttributes(filteredEvents) {
  return filteredEvents
    .map((event) => {
      const regex = /^(\w+):(\d+)-(\d+).*/;
      let gene = event.gene;
      let match = regex.exec(event.Genome_Location);
      let chromosome = match[1];
      let startPoint = match[2];
      let endPoint = match[3];
      let location = `${chromosome}:${startPoint}-${endPoint}`;
      if (event.vartype == "SNV") {
        // center the SNV in the plot while encapsulating its gene in the
        // window
        const snvMatch = regex.exec(event.Variant_g);
        const snvStartPoint = parseInt(snvMatch[2]);
        const snvEndPoint = parseInt(snvMatch[3]);
        const geneStartPoint = parseInt(startPoint);
        const geneEndPoint = parseInt(endPoint);

        let padding =
          snvStartPoint - geneStartPoint > geneEndPoint - snvEndPoint
            ? snvStartPoint - geneStartPoint
            : geneEndPoint - snvEndPoint;
        padding += 1000;
        startPoint = parseInt(snvStartPoint - padding);
        endPoint = parseInt(snvEndPoint + padding);
        location = event.Variant_g;
      } else if (event.vartype == "fusion") {
        gene = event.fusion_genes;
        location = event.fusion_genes;
        chromosome = event.fusion_gene_coords
          .split(",")
          .map((d) => d.split(":")[0]);
        startPoint = event.fusion_gene_coords
          .split(",")
          .map((d) => d.split(":")[1].split("-")[0]);
        endPoint = event.fusion_gene_coords
          .split(",")
          .map((d) => d.split(":")[1].split("-")[1]);
      }
      return {
        gene: gene,
        type: event.type,
        name: event.Name,
        tier: event.Tier,
        role: event.Role_in_Cancer,
        chromosome: chromosome,
        startPoint: startPoint,
        endPoint: endPoint,
        location: location,
        id: event.id,
        variant: event.Variant,
      };
    })
    .sort((a, b) => d3.ascending(a.gene, b.gene));
}

export function kde(kernel, thresholds, data) {
  return thresholds.map((t) => [t, d3.mean(data, (d) => kernel(t - d))]);
}

export function epanechnikov(bandwidth) {
  return (x) =>
    Math.abs((x /= bandwidth)) <= 1 ? (0.75 * (1 - x * x)) / bandwidth : 0;
}

export function sequencesToGenome(ppfit) {
  return {
    settings: ppfit.settings,
    intervals: ppfit.intervals
      .filter((d) => !d.metadata.bad)
      .filter((d) => d.endPoint - d.startPoint >= 10000)
      .map((d, i) => {
        return {
          iid: d.iid,
          chromosome: d.chromosome,
          startPoint: d.startPoint,
          endPoint: d.endPoint,
          y: d.y,
          cn: d.y,
          type: "interval",
          strand: d.strand,
          title: d.title,
          ...d.metadata,
          metadata: { ...d.metadata, width: d.endPoint - d.startPoint },
        };
      }),
    connections: ppfit.connections,
  };
}

export function allelicToGenome(allelic) {
  allelic.intervals.forEach((interval1, i) => {
    allelic.intervals.forEach((interval2, j) => {
      if (
        i !== j &&
        interval1.chromosome === interval2.chromosome &&
        interval1.startPoint === interval2.startPoint &&
        interval1.y === interval2.y &&
        interval1.endPoint === interval2.endPoint
      ) {
        interval1.overlapping = true;
        interval2.overlapping = true;
        interval1.metadata.overlaps_with = interval2.iid;
        interval2.metadata.overlaps_with = interval2.iid;
      }
    });
  });
  return {
    settings: allelic.settings,
    intervals: allelic.intervals,
    connections: allelic.connections,
  };
}

export function getPopulationMetrics(
  populations,
  metadata = {},
  tumour_type = null
) {
  // Extract the data from the responses and store it in an object
  return Object.keys(plotTypes()).map((d, i) => {
    let plot = {};
    let cutoff = Infinity;
    plot.id = d;
    plot.type = plotTypes()[d].plotType;
    plot.scaleX = plotTypes()[d].scaleX;
    plot.allData = populations[d].map((e) => +e.value);
    plot.data = populations[d]
      .filter((e) =>
        tumour_type ? e[plotTypes()[d].tumor_type] === tumour_type : true
      )
      .map((e) => +e.value)
      .filter((e) => e < cutoff)
      .sort((a, b) => d3.ascending(a, b));
    plot.bandwidth = Math.pow(
      (4 * Math.pow(d3.deviation(plot.data), 5)) / (3.0 * plot.data.length),
      0.2
    );
    plot.q1 = d3.quantile(plot.data, 0.25);
    plot.q3 = d3.quantile(plot.data, 0.75);
    plot.q99 = d3.quantile(plot.data, 0.99);
    plot.range = [
      d3.max([d3.min(plot.allData), 0.01]),
      d3.quantile(plot.allData, 0.99),
    ];
    plot.format = plotTypes()[d].scaleXFormat;
    if (metadata[d]) {
      plot.markValue = metadata[d];
      plot.markValueText = d3.format(plotTypes()[d].format)(metadata[d]);
      plot.colorMarker =
        plot.markValue < plot.q1
          ? legendColors()[0]
          : plot.markValue > plot.q3
          ? legendColors()[2]
          : legendColors()[1];
    }
    return plot;
  });
}

export function getSignatureMetrics(
  populations,
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
      plot.type = type;
      plot.scaleX = scaleX;
      plot.allData = populations[d].map((e) => +e.value);
      plot.data = populations[d]
        .filter((e) =>
          tumorType ? !e.tumor_type || e.tumor_type === tumorType : true
        )
        .map((d) => +d.value)
        .filter((d) => d < cutoff)
        .sort((a, b) => d3.ascending(a, b));
      plot.bandwidth = Math.pow(
        (4 * Math.pow(d3.deviation(plot.data), 5)) / (3.0 * plot.data.length),
        0.15
      );
      plot.q1 = d3.quantile(plot.data, 0.25);
      plot.q3 = d3.quantile(plot.data, 0.75);
      plot.q99 = d3.quantile(plot.data, 0.99);
      let minValue = scaleX === "log" ? 1 : 0;
      let maxValue = d3.max([
        plot.allData.find((e) => e > 0),
        d3.quantile(plot.data, 0.8),
      ]);
      plot.range = range ? range : [minValue, maxValue];
      plot.format = format;
      if (Object.keys(markData).includes(d)) {
        plot.markValue = +markData[d];
        plot.markValueText = d3.format(format)(markData[d]);
        plot.colorMarker =
          plot.markValue < plot.q1
            ? legendColors()[0]
            : plot.markValue > plot.q3
            ? legendColors()[2]
            : legendColors()[1];
      }
      return plot;
    })
    .sort((a, b) => d3.descending(a.markValue, b.markValue));
}

// Function to calculate optimum number of bins using Doane's rule
export function calculateOptimalBins(data) {
  const n = data.length;

  // Calculate skewness
  const mean = data.reduce((acc, val) => acc + val, 0) / n;
  const variance =
    data.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);
  const skewness =
    data.reduce((acc, val) => acc + Math.pow((val - mean) / stdDev, 3), 0) / n;

  // Calculate bins using Doane's rule
  const k = 1 + Math.log2(n) + Math.log2(1 + Math.abs(skewness));

  return Math.ceil(k);
}

export function Legend(
  color,
  {
    title,
    tickSize = 6,
    width = 320,
    height = 44 + tickSize,
    marginTop = 18,
    marginRight = 0,
    marginBottom = 16 + tickSize,
    marginLeft = 0,
    ticks = width / 64,
    tickFormat,
    tickValues,
  } = {}
) {
  function ramp(color, n = 256) {
    const canvas = document.createElement("canvas");
    canvas.width = n;
    canvas.height = 1;
    const context = canvas.getContext("2d");
    for (let i = 0; i < n; ++i) {
      context.fillStyle = color(i / (n - 1));
      context.fillRect(i, 0, 1, 1);
    }
    return canvas;
  }

  const svg = d3
    .create("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height])
    .style("overflow", "visible")
    .style("display", "block");

  let tickAdjust = (g) =>
    g.selectAll(".tick line").attr("y1", marginTop + marginBottom - height);
  let x;

  // Continuous
  if (color.interpolate) {
    const n = Math.min(color.domain().length, color.range().length);

    x = color
      .copy()
      .rangeRound(
        d3.quantize(d3.interpolate(marginLeft, width - marginRight), n)
      );

    svg
      .append("image")
      .attr("x", marginLeft)
      .attr("y", marginTop)
      .attr("width", width - marginLeft - marginRight)
      .attr("height", height - marginTop - marginBottom)
      .attr("preserveAspectRatio", "none")
      .attr(
        "href",
        ramp(
          color.copy().domain(d3.quantize(d3.interpolate(0, 1), n))
        ).toDataURL()
      );
  }

  // Sequential
  else if (color.interpolator) {
    x = Object.assign(
      color
        .copy()
        .interpolator(d3.interpolateRound(marginLeft, width - marginRight)),
      {
        range() {
          return [marginLeft, width - marginRight];
        },
      }
    );

    svg
      .append("image")
      .attr("x", marginLeft)
      .attr("y", marginTop)
      .attr("width", width - marginLeft - marginRight)
      .attr("height", height - marginTop - marginBottom)
      .attr("preserveAspectRatio", "none")
      .attr("href", ramp(color.interpolator()).toDataURL());

    // scaleSequentialQuantile doesn’t implement ticks or tickFormat.
    if (!x.ticks) {
      if (tickValues === undefined) {
        const n = Math.round(ticks + 1);
        tickValues = d3
          .range(n)
          .map((i) => d3.quantile(color.domain(), i / (n - 1)));
      }
      if (typeof tickFormat !== "function") {
        tickFormat = d3.format(tickFormat === undefined ? ",f" : tickFormat);
      }
    }
  }

  // Threshold
  else if (color.invertExtent) {
    const thresholds = color.thresholds
      ? color.thresholds() // scaleQuantize
      : color.quantiles
      ? color.quantiles() // scaleQuantile
      : color.domain(); // scaleThreshold

    const thresholdFormat =
      tickFormat === undefined
        ? (d) => d
        : typeof tickFormat === "string"
        ? d3.format(tickFormat)
        : tickFormat;

    x = d3
      .scaleLinear()
      .domain([-1, color.range().length - 1])
      .rangeRound([marginLeft, width - marginRight]);

    svg
      .append("g")
      .selectAll("rect")
      .data(color.range())
      .join("rect")
      .attr("x", (d, i) => x(i - 1))
      .attr("y", marginTop)
      .attr("width", (d, i) => x(i) - x(i - 1))
      .attr("height", height - marginTop - marginBottom)
      .attr("fill", (d) => d);

    tickValues = d3.range(thresholds.length);
    tickFormat = (i) => thresholdFormat(thresholds[i], i);
  }

  // Ordinal
  else {
    x = d3
      .scaleBand()
      .domain(color.domain())
      .rangeRound([marginLeft, width - marginRight])
      .padding(0.1);

    svg
      .append("g")
      .selectAll("rect")
      .data(color.domain())
      .join("rect")
      .attr("x", x)
      .attr("y", marginTop)
      .attr("width", Math.max(0, x.bandwidth() - 1))
      .attr("height", height - marginTop - marginBottom)
      .attr("fill", color);

    tickAdjust = () => {};
  }

  svg
    .append("g")
    .attr("transform", `translate(0,${height - marginBottom})`)
    .call(
      d3
        .axisBottom(x)
        .ticks(ticks, typeof tickFormat === "string" ? tickFormat : undefined)
        .tickFormat(typeof tickFormat === "function" ? tickFormat : undefined)
        .tickSize(tickSize)
        .tickValues(tickValues)
    )
    .call(tickAdjust)
    .call((g) => g.select(".domain").remove())
    .call((g) =>
      g
        .append("text")
        .attr("x", marginLeft)
        .attr("y", marginTop + marginBottom - height - 6)
        .attr("fill", "currentColor")
        .attr("text-anchor", "start")
        .attr("font-weight", "bold")
        .attr("class", "title")
        .text(title)
    );

  return svg.node();
}
