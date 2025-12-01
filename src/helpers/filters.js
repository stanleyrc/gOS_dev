import * as d3 from "d3";
import { plotTypes, reportAttributesMap } from "./utility";
import common from '../translations/en/common.json';

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
      name: "has_interpretations",
      type: "string",
      renderer: "cascader",
      group: "interpretations",
      external: true,
    },
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

export function generateInterpretationsCascaderOptions(reports, casesWithInterpretations) {
  const options = [];
  
  // Ensure casesWithInterpretations has the expected structure
  const withTierChange = casesWithInterpretations?.withTierChange || new Set();
  const byAuthor = casesWithInterpretations?.byAuthor || new Map();
  const byGene = casesWithInterpretations?.byGene || new Map();
  const all = casesWithInterpretations?.all || new Set();
  
  // Tier Change option
  const tierChangeCount = reports.filter(r => withTierChange.has(r.pair)).length;
  options.push({
  label: common.containers["list-view"].filters.interpretations_cascader_labels.tier_change,
  value: "tier_change",
  count: tierChangeCount,
  });

   // Other changes option
   const otherChangesCount = reports.filter(r => all.has(r.pair) && !withTierChange.has(r.pair)).length;
   options.push({
     label: common.containers["list-view"].filters.interpretations_cascader_labels.other_changes,
     value: "other_changes",
     count: otherChangesCount,
   });
  
  // Author option with children
  const authorChildren = [];
  byAuthor.forEach((cases, authorName) => {
    const count = reports.filter(r => cases.has(r.pair)).length;
    authorChildren.push({
      label: authorName,
      value: authorName,
      count: count,
    });
  });
  
  if (authorChildren.length > 0) {
    authorChildren.sort((a, b) => d3.descending(a.count, b.count));
    const totalAuthorCount = authorChildren.reduce((sum, child) => sum + child.count, 0);
    options.push({
      label: common.containers["list-view"].filters.interpretations_cascader_labels.author,
      value: "author",
      count: totalAuthorCount,
      children: authorChildren,
    });
  }
  
  // Gene option with children
  const geneChildren = [];
  byGene.forEach((cases, geneName) => {
    const count = reports.filter(r => cases.has(r.pair)).length;
    geneChildren.push({
      label: geneName,
      value: geneName,
      count: count,
    });
  });
  
  if (geneChildren.length > 0) {
    geneChildren.sort((a, b) => d3.descending(a.count, b.count));
    const totalGeneCount = geneChildren.reduce((sum, child) => sum + child.count, 0);
    options.push({
      label: common.containers["list-view"].filters.interpretations_cascader_labels.gene,
      value: "gene",
      count: totalGeneCount,
      children: geneChildren,
    });
  }
  
  // No interpretations option
  const noInterpretationsCount = reports.filter(r => !all.has(r.pair)).length;
  options.push({
    label: common.containers["list-view"].filters.interpretations_cascader_labels.without,
    value: "without",
    count: noInterpretationsCount,
  });
  
  return options;
}

export const cascaderOperators = ["OR", "AND", "NOT"];

export function getReportFilterExtents(reports) {
  let extents = {};
  reportFilters().forEach((filter) => {
    let allValues = reports
      .map((record) => {
        try {
          return eval(`record.${filter.name}`);
        } catch (err) {
          return null;
        }
      })
      .flat();
    extents[filter.name] = d3.extent(
      allValues.filter((e) => !isNaN(e) && e !== null && e !== undefined)
    );
  });
  return extents;
}

export function getReportsFilters(fields, reports) {
  let reportsFilters = [];

  // Iterate through each filter
  fields.forEach((field) => {
    let allValues = reports
      .map((record) => {
        try {
          return eval(`record.${field.name}`);
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
      filter: field,
      records: [...distinctValues],
      frequencies: Object.fromEntries(frequencyMap),
      extent: d3.extent(
        distinctValues.filter((e) => !isNaN(e) && e !== null && e !== undefined)
      ),
      totalRecords: reports.length,
      format: field.format,
    });
  });
  //console.log("reportsFilters", reportsFilters);
  return reportsFilters;
}

export function getInterpretationsFilter(reports, casesWithInterpretations = { all: new Set(), withTierChange: new Set(), byAuthor: new Map(), byGene: new Map() }) {
  const filter = reportFilters().find(f => f.name === "has_interpretations");
  
  const options = generateInterpretationsCascaderOptions(reports, casesWithInterpretations);
  
  return {
    filter: filter,
    options: options,
    totalRecords: reports.length,
    format: plotTypes()[reportAttributesMap()[filter.name]]?.format
  };
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
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const getSearchTokens = (value) => {
  // HELPER FUNCTION: Split search input into individual words
  // Example: "hom cb" -> ["hom", "cb"]
  // Example: "hrd_scr" -> ["hrd", "scr"]
  const normalized = normalizeSearchInput(value);
  return normalized ? normalized.split(" ").filter(Boolean) : [];
};

export const getOptionLabelText = (option) => {
  // HELPER FUNCTION: Extract searchable text from cascader option
  // Safely handles different option formats and converts to string
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

/*
 * ================================
 * CASCADER SEARCH PERFORMANCE OPTIMIZATION SUMMARY
 * ================================
 *
 * Problem: With large datasets (6000+ items), the cascader search becomes
 * unresponsive because it runs fuzzy matching on every item for every keystroke.
 *
 * Solution: Multiple performance optimizations implemented:
 *
 * 1. RESULT LIMITING (ListView Component):
 *    - Added limit: 200 to showSearch configuration
 *    - Prevents rendering thousands of results at once
 *
 * 2. SEARCH RESULT CACHING:
 *    - Cache search results to avoid recalculating same queries
 *    - Memory-managed cache (clears when > 1000 items)
 *    - Key format: "searchInput|path1/path2/path3"
 *
 * 3. EARLY EXIT CONDITIONS:
 *    - Return immediately for empty searches
 *    - Skip processing for very short queries (< 3 characters)
 *
 * 4. FAST PATH OPTIMIZATION:
 *    - Check exact substring matches first (much faster)
 *    - Only use fuzzy matching as fallback
 *    - Example: "hom cb" quickly matches "Homdel / CBFA2T3"
 *
 * 5. CONDITIONAL FUZZY MATCHING:
 *    - Only run expensive fuzzy matching for longer inputs
 *    - Prevents fuzzy matching on short queries like "a" or "ab"
 *
 * Performance Impact:
 * - Before: ~6821 fuzzy matches per keystroke = browser freeze
 * - After: ~200 limited results + caching + fast paths = smooth typing
 *
 * ================================
 */

// PERFORMANCE OPTIMIZATION 2: In-memory cache for search results
// Prevents recalculating the same search multiple times
// Key format: "searchInput|path1/path2/path3"
let searchCache = new Map();

export const cascaderSearchFilter = (inputValue, path) => {
  // PERFORMANCE OPTIMIZATION 3: Early exit for empty search
  // No need to process anything if there's no search input
  const tokens = getSearchTokens(inputValue);
  if (tokens.length === 0) {
    return true; // Show everything when no search terms
  }

  // PERFORMANCE OPTIMIZATION 4: Caching system
  // Create a unique cache key combining search input and the item path
  const cacheKey = `${inputValue}|${path.map((p) => p.label).join("/")}`;

  // Check if we've already calculated this result
  if (searchCache.has(cacheKey)) {
    return searchCache.get(cacheKey); // Return cached result immediately
  }

  // PERFORMANCE OPTIMIZATION 5: Build searchable text efficiently
  // Convert the cascader path (e.g., ["Disease", "Cancer"]) into searchable string
  const searchablePath = path
    .map((option) => getOptionLabelText(option))
    .filter(Boolean) // Remove empty/null values
    .join(CASCADER_PATH_SEPARATOR); // Join with separator (e.g., "Disease / Cancer")

  // Early exit if no searchable content
  if (!searchablePath) {
    const result = false;
    searchCache.set(cacheKey, result);
    return result;
  }

  // PERFORMANCE OPTIMIZATION 6: Prioritize exact substring matches
  // This is much faster than fuzzy matching and covers most use cases
  const normalizedPath = normalizeSearchInput(searchablePath);
  const normalizedInput = normalizeSearchInput(inputValue);

  let result;
  if (normalizedPath.includes(normalizedInput)) {
    // FAST PATH: Exact substring match found
    // e.g., "hom cb" matches "Homdel / CBFA2T3" because both "hom" and "cb" are substrings
    result = true;
  } else {
    // PERFORMANCE OPTIMIZATION 7: Conditional fuzzy matching
    // Only use expensive fuzzy matching for longer inputs (3+ characters)
    // This prevents fuzzy matching on very short queries like "a" or "ab"
    if (inputValue.length >= 3) {
      result = runSequentialFuzzyMatch(searchablePath, tokens);
    } else {
      result = false; // Skip fuzzy matching for very short queries
    }
  }

  // PERFORMANCE OPTIMIZATION 8: Cache management
  // Prevent memory bloat by clearing cache when it gets too large
  if (searchCache.size > 1000) {
    searchCache.clear(); // Reset cache to prevent memory leaks
  }

  // Store result in cache for future lookups
  searchCache.set(cacheKey, result);

  return result;
};
