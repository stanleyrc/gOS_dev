import * as d3 from "d3";
import { plotTypes, reportAttributesMap } from "./utility";

export function reportFilters() {
  return [
    { name: "tags", type: "string", renderer: "cascader" },
    { name: "pair", type: "string", renderer: "select" },
    { name: "tumor_type", type: "string", renderer: "select" },
    { name: "tumor_details", type: "string", renderer: "select" },
    { name: "disease", type: "string", renderer: "select" },
    { name: "primary_site", type: "string", renderer: "select" },
    { name: "inferred_sex", type: "string", renderer: "select" },
    { name: "operator", type: "string", renderer: "cascader-select" },
    {
      name: "treatment",
      type: "string",
      renderer: "select",
      group: "treatment-metrics",
    },
    {
      name: "treatment_type",
      type: "string",
      renderer: "select",
      group: "treatment-metrics",
    },
    {
      name: "treatment_best_response",
      type: "string",
      renderer: "select",
      group: "treatment-metrics",
    },
    {
      name: "treatment_duration",
      type: "number",
      renderer: "slider",
      group: "treatment-metrics",
    },
    {
      name: "tumor_median_coverage",
      type: "number",
      renderer: "slider",
      group: "quality-metrics",
    },
    {
      name: "purity",
      type: "number",
      renderer: "slider",
      group: "quality-metrics",
    },
    {
      name: "ploidy",
      type: "number",
      renderer: "slider",
      group: "quality-metrics",
    },
    {
      name: "snv_count",
      type: "number",
      renderer: "slider",
      group: "event-metrics",
    },
    {
      name: "sv_count",
      type: "number",
      renderer: "slider",
      group: "event-metrics",
    },
    {
      name: "loh_fraction",
      type: "number",
      renderer: "slider",
      group: "event-metrics",
    },
    {
      name: "tmb",
      type: "number",
      renderer: "slider",
      group: "biomarker-metrics",
    },
    {
      name: "hrd.hrd_score",
      type: "number",
      renderer: "slider",
      group: "biomarker-metrics",
    },
    {
      name: "msisensor.score",
      type: "number",
      renderer: "slider",
      group: "biomarker-metrics",
    },
    {
      name: "hrd.b1_2_score",
      type: "number",
      renderer: "slider",
      group: "biomarker-metrics",
    },
    {
      name: "hrd.b1_score",
      type: "number",
      renderer: "slider",
      group: "biomarker-metrics",
    },
    {
      name: "hrd.b2_score",
      type: "number",
      renderer: "slider",
      group: "biomarker-metrics",
    },
  ];
}

/**
 * Transforms tags array into Ant Design Cascader options.
 * @param {string[]} tags - Array of tags like "Amp: CDK4"
 * @returns {Array} Cascader-compatible nested structure
 */
export function generateCascaderOptions(tags, frequencies = {}) {
  // Step 1: Parse the tags into objects
  const parsedTags = tags.map((tag) => {
    const [type, gene] = tag.split(": ").map((d) => d.trim());
    return { type, gene };
  });

  // Step 2: Nest data using d3.group
  const grouped = d3.group(parsedTags, (d) => d.type);

  // Step 3: Convert to Cascader options structure
  const options = Array.from(grouped, ([type, entries]) => ({
    label: type,
    value: type,
    count: entries
      .map(({ type, gene }) => {
        const full = `${type}: ${gene}`;
        return frequencies[full] || 0;
      })
      .reduce((a, b) => a + b, 0),
    children: entries.map(({ type, gene }) => {
      const full = `${type}: ${gene}`;
      return {
        type,
        label: gene,
        value: full,
        count: frequencies[full] || 0,
      };
    }),
  })).sort((a, b) => d3.descending(a.count, b.count));

  return options;
}

export const cascaderOperators = ["OR", "AND", "NOT"];

export function getReportsFilters(reports, fullReports) {
  let reportsFilters = [];

  // Iterate through each filter
  reportFilters().forEach((filter) => {
    let fullValues = fullReports
      .map((record) => {
        try {
          return eval(`record.${filter.name}`);
        } catch (err) {
          return null;
        }
      })
      .flat();
    let allValues = reports
      .map((record) => {
        try {
          return eval(`record.${filter.name}`);
        } catch (err) {
          return null;
        }
      })
      .flat();

    let frequencyMap = d3.rollup(
      allValues,
      (v) => v.length,
      (d) => d
    );

    let fullFrequencyMap = d3.rollup(
      fullValues,
      (v) => v.length,
      (d) => d
    );

    let fullDistinctValues = Array.from(fullFrequencyMap.entries()).map(
      ([value, frequency]) => value
    );
    // Extract distinct values and sort by frequency (descending), then by value (ascending) for ties
    let distinctValues = Array.from(frequencyMap.entries())
      .sort((a, b) => {
        // First sort by frequency (descending)
        const freqCompare = d3.descending(a[1], b[1]);
        if (freqCompare !== 0) return freqCompare;
        // If frequencies are equal, sort by value (ascending)
        return d3.ascending(a[0], b[0]);
      })
      .map(([value, frequency]) => value);

    // Add the filter information to the reportsFilters array
    reportsFilters.push({
      filter: filter,
      records: [...distinctValues],
      frequencies: Object.fromEntries(frequencyMap),
      extent: d3.extent(
        distinctValues.filter((e) => !isNaN(e) && e !== null && e !== undefined)
      ),
      fullExtent: d3.extent(
        fullDistinctValues.filter((e) => !isNaN(e) && e !== null && e !== undefined)
      ),
      totalRecords: reports.length,
      totalFullRecords: fullReports.length,
      format: plotTypes()[reportAttributesMap()[filter.name]]?.format,
    });
  });
  //console.log("reportsFilters", reportsFilters);
  return reportsFilters;
}

const CASCADER_PATH_SEPARATOR = " / ";

export const normalizeSearchInput = (value = "") =>
  // Step 1: Make the search text comparable by
  //   - forcing it to lowercase
  //   - turning underscores/dashes into spaces
  //   - squeezing any extra whitespace
  value
    .toString()
    .toLowerCase()
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const getSearchTokens = (value) => {
  const normalized = normalizeSearchInput(value);
  // Break the cleaned string into the small pieces (tokens)
  // we want to match, e.g. "hrd scr" -> ["hrd", "scr"]
  return normalized ? normalized.split(" ").filter(Boolean) : [];
};

export const getOptionLabelText = (option) => {
  const rawLabel = option?.label ?? option?.value ?? "";
  if (rawLabel == null) {
    return "";
  }
  if (typeof rawLabel === "string" || typeof rawLabel === "number") {
    return String(rawLabel);
  }
  return "";
};

const advanceTokenMatch = (text, token, offset = 0) => {
  // Walk through the full option text one character at a time,
  // starting from `offset`, and try to find the next token character.
  // If any character can't be found in order, give up with -1.
  let cursor = offset;
  const lowerText = text.toLowerCase();
  const lowerToken = token.toLowerCase();
  for (let i = 0; i < lowerToken.length; i += 1) {
    const nextIndex = lowerText.indexOf(lowerToken[i], cursor);
    if (nextIndex === -1) {
      return -1;
    }
    cursor = nextIndex + 1;
  }
  return cursor;
};

export const runSequentialFuzzyMatch = (text, tokens) => {
  // VS Code-style check: for every token we keep searching
  // further along the option text, never rewinding.
  if (!text) {
    return false;
  }
  let cursor = 0;
  for (const token of tokens) {
    if (!token) {
      continue;
    }
    cursor = advanceTokenMatch(text, token, cursor);
    if (cursor === -1) {
      return false;
    }
  }
  return true;
};

export const cascaderSearchFilter = (inputValue, path) => {
  const tokens = getSearchTokens(inputValue);
  if (tokens.length === 0) {
    // Empty search means everything passes.
    return true;
  }
  const searchablePath = path
    .map((option) => getOptionLabelText(option))
    .filter(Boolean)
    .join(CASCADER_PATH_SEPARATOR);
  if (!searchablePath) {
    return false;
  }
  return runSequentialFuzzyMatch(searchablePath, tokens);
};
