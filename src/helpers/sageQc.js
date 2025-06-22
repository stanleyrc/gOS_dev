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
