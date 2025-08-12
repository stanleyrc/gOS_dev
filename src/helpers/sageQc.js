export const densityPlotTypes = ["contourplot", "scatterplot"];

export const densityPlotVariables = [
  { name: "xVariable", allows: ["int", "float"] },
  { name: "yVariable", allows: ["int", "float"] },
  { name: "colorVariable", allows: ["enum", "int", "float"] },
];

export const densityPlotFields = [
  { name: "tumor_depth", format: ".1f", type: "int" },
  { name: "normal_depth", format: ".1f", type: "int" },
  { name: "tumor_vaf", format: ".3f", type: "float" },
  { name: "normal_vaf", format: ".3f", type: "float" },
  { name: "tumor_alt_counts", format: ".1f", type: "int" },
  { name: "normal_alt_counts", format: ".1f", type: "int" },
  { name: "tumor_abq", format: ".1f", type: "int" },
  { name: "altered_copies", format: ".1f", type: "int" },
  { name: "total_snv_copies", format: ".1f", type: "int" },
  { name: "mapping_quality", format: ".1f", type: "int" },
];

export function sageQcArrowTableToJson(table) {
  const monitoredFields = new Set(densityPlotFields.map((d) => d.name));

  const result = [];

  for (let row of table) {
    const obj = {};

    for (let [key, value] of row) {
      if (value === null || value === undefined) {
        obj[key] = null;
      } else if (value instanceof Date) {
        obj[key] = value.toISOString();
      } else if (typeof value === "bigint") {
        obj[key] = Number(value);
      } else if (monitoredFields.has(key)) {
        // If the key is in the struct fields, format it as a number
        obj[key] = Number(value);
      } else {
        // Otherwise, keep the original value
        obj[key] = value;
      }
    }

    result.push(obj);
  }

  return result;
}
