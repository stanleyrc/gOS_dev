export const densityPlotTypes = ["scatterplot", "contourplot"];

export const densityPlotVariables = ["xVariable", "yVariable", "colorVariable"];

export const densityPlotFields = [
  { name: "tumor_depth", format: ".0f" },
  { name: "normal_depth", format: ".0f" },
  { name: "tumor_vaf", format: ".0%" },
  { name: "normal_vaf", format: ".0%" },
  { name: "tumor_alt_counts", format: ".0f" },
  { name: "normal_alt_counts", format: ".0f" },
  { name: "tumor_abq", format: ".0f" },
  { name: "altered_copies", format: ".0f" },
  { name: "total_snv_copies", format: ".0f" },
  { name: "mapping_quality", format: ".0f" },
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
      } else if (typeof value === 'bigint') {
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
