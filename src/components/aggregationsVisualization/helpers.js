import { parseDriverGenes } from "../../helpers/geneAggregations";

export const margins = {
  gapX: 34,
  gapY: 24,
  gapYBottom: 60,
  gapLegend: 0,
  tooltipGap: 5,
};

export const MIN_BAR_WIDTH = 30;
export const MIN_CATEGORY_WIDTH = 40;
export const MAX_COLOR_CATEGORIES = 10;

export const parseAlterationSummary = (summary) => {
  if (!summary || typeof summary !== "string") {
    return [];
  }
  const lines = summary.split("\n");
  const types = [];
  lines.forEach((line) => {
    const match = line.match(/^([^:]+):/);
    if (match) {
      const typeNormalized = match[1].toLowerCase().replace(/\s+/g, "_");
      if (!types.includes(typeNormalized)) {
        types.push(typeNormalized);
      }
    }
  });
  return types;
};

export const numericColumns = [
  { key: "sv_count", dataIndex: "sv_count", label: "SV Count", type: "numeric" },
  { key: "tmb", dataIndex: "tmb", label: "TMB", type: "numeric" },
  { key: "tumor_median_coverage", dataIndex: "tumor_median_coverage", label: "Tumor Coverage", type: "numeric" },
  { key: "normal_median_coverage", dataIndex: "normal_median_coverage", label: "Normal Coverage", type: "numeric" },
  { key: "purity", dataIndex: "purity", label: "Purity", type: "numeric" },
  { key: "ploidy", dataIndex: "ploidy", label: "Ploidy", type: "numeric" },
  { key: "hrd.hrd_score", dataIndex: "hrd.hrd_score", label: "HRDetect", type: "numeric" },
  { key: "hrd.b1_2_score", dataIndex: "hrd.b1_2_score", label: "B1+2", type: "numeric" },
  { key: "hrd.b1_score", dataIndex: "hrd.b1_score", label: "B1", type: "numeric" },
  { key: "hrd.b2_score", dataIndex: "hrd.b2_score", label: "B2", type: "numeric" },
];

export const categoricalColumns = [
  { key: "disease", dataIndex: "disease", label: "Disease", type: "categorical" },
  { key: "primary_site", dataIndex: "primary_site", label: "Primary Site", type: "categorical" },
  { key: "tumor_type", dataIndex: "tumor_type", label: "Tumor Type", type: "categorical" },
  { key: "inferred_sex", dataIndex: "inferred_sex", label: "Inferred Sex", type: "categorical" },
  { key: "qcEvaluation", dataIndex: "qcEvaluation", label: "QC Evaluation", type: "categorical" },
  { key: "alteration_type", dataIndex: "alteration_type", label: "Alteration Type", type: "categorical" },
  { key: "driver_gene", dataIndex: "driver_gene", label: "Driver Genes", type: "categorical" },
];

export const pairColumn = { key: "pair", dataIndex: "pair", label: "Pair", type: "pair" };

export const allColumns = [...numericColumns, ...categoricalColumns, pairColumn];

export const getColumnType = (dataIndex) => {
  const col = allColumns.find((c) => c.dataIndex === dataIndex);
  return col?.type || "numeric";
};

export const getColumnLabel = (dataIndex) => {
  const col = allColumns.find((c) => c.dataIndex === dataIndex);
  return col?.label || dataIndex;
};

export const getValue = (record, path) => {
  if (path === "alteration_type") {
    return parseAlterationSummary(record.summary);
  }
  if (path === "driver_gene") {
    return parseDriverGenes(record.summary).map((g) => g.gene);
  }
  return path.split(".").reduce((obj, key) => obj?.[key], record);
};
