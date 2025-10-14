import * as d3 from "d3";

/**
 * Transforms tags array into Ant Design Cascader options.
 * @param {string[]} tags - Array of tags like "Amp: CDK4"
 * @returns {Array} Cascader-compatible nested structure
 */
export function generateCascaderOptions(tags) {
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
    children: entries.map(({ type, gene }) => {
      const full = `${type}: ${gene}`;
      return {
        type,
        label: gene,
        value: full,
      };
    }),
  })).sort((a, b) => d3.ascending(a.label, b.label));

  return options;
}

export const cascaderOperators = ["OR", "AND", "NOT"];
