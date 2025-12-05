import { guid } from "./utility";
import { humanize } from "./utility";

const RENDERER = {
  numeric: "slider",
  string: "select",
  pair: "cascader",
};

class Field {
  constructor(field) {
    this.id = field.id || guid();
    this.name = field.name || this.id;
    this.title = field.title || humanize(field.id);
    this.shortTitle = field.shortTitle || this.title;
    this.description = field.description || this.title;
    this.type = field.type;
    // Allow explicit renderer override, otherwise derive from type
    this.renderer = field.renderer || (field.type === "pair" ? "cascader" : (RENDERER[field.type] || "select"));
    this.kpiPlot =
      field.kpiPlot == null
        ? false
        : field.type === "numeric" && field.kpiPlot === true;
    this.format =
      field.format || (field.type === "numeric" ? ",.2f" : "string");
    this.scaleFormat =
      field.scaleFormat || (field.type === "numeric" ? "~s" : "string");
    this.scale = field.scale || "linear";
    this.minValue = field.minValue == null ? null : +field.minValue;
    this.maxValue = field.maxValue == null ? null : +field.maxValue;
    this.group = field.group || "general";
    this.groupTitle = field.groupTitle || "General";
    this.groupOrder = field.groupOrder != null ? +field.groupOrder : 0;
    this.order = field.order != null ? +field.order : 99;
    this.external = field.external || false;
  }
  get isNumeric() {
    return this.type === "numeric";
  }

  get isPair() {
    return this.type === "pair";
  }

  get isString() {
    return this.type === "string";
  }

  get isValid() {
    return (
      this.id != null &&
      this.title != null &&
      ["numeric", "string", "pair"].includes(this.type)
    );
  }

  toString() {
    return `id: ${this.id},
    title: ${this.title},
    shortTitle: ${this.shortTitle},
    description: ${this.description},
    type: ${this.type},
    format: ${this.format},
    scale: ${this.scale},
    scaleFormat: ${this.scaleFormat},
    group: ${this.group},
    groupTitle: ${this.groupTitle},
    groupOrder: ${this.groupOrder},
    order: ${this.order},
    kpiPlot: ${this.kpiPlot},
    minValue: ${this.minValue},
    maxValue: ${this.maxValue},
    order: ${this.order},
    isNumeric: ${this.isNumeric},
    isValid: ${this.isValid}
    `;
  }
}
export default Field;

export const DEFAULT_FIELDS = [
  { id: "tags", title: "Tags", type: "pair" },
  { id: "pair", title: "Pair", type: "string" },
  { id: "tumor_type", title: "Tumor Type", type: "string" },
  { id: "tumor_details", title: "Tumor Details", type: "string" },
  { id: "disease", title: "Disease", type: "string" },
  { id: "primary_site", title: "Primary Site", type: "string" },
  { id: "inferred_sex", title: "Inferred Sex", type: "string" },
  {
    id: "treatment",
    type: "string",
    group: "treatment-metrics",
    groupTitle: "Treatment Metrics",
    groupOrder: 2,
  },
  {
    id: "treatment_type",
    type: "string",
    group: "treatment-metrics",
    groupTitle: "Treatment Metrics",
    groupOrder: 2,
  },
  {
    id: "treatment_best_response",
    type: "string",
    group: "treatment-metrics",
    groupTitle: "Treatment Metrics",
    groupOrder: 2,
  },
  {
    id: "treatment_duration",
    type: "numeric",
    group: "treatment-metrics",
    groupTitle: "Treatment Metrics",
    groupOrder: 2,
  },
  {
    id: "tumor_median_coverage",
    title: "Coverage Tumor/Normal",
    type: "numeric",
    shortTitle: "Coverage T/N",
    description: "The median sequencing coverage across the tumor genome.",
    kpiPlot: true,
    format: ",",
    minValue: 0,
    group: "quality-metrics",
    groupTitle: "Quality Metrics",
    groupOrder: 4,
  },
  {
    id: "purity",
    title: "Purity",
    type: "numeric",
    kpiPlot: true,
    format: ".2%",
    scaleFormat: ".0%",
    minValue: 0,
    maxValue: 1,
    group: "quality-metrics",
    groupTitle: "Quality Metrics",
    groupOrder: 3,
  },
  {
    id: "ploidy",
    title: "Ploidy",
    type: "numeric",
    kpiPlot: true,
    format: ".2f",
    scale: "linear",
    minValue: 1.5,
    maxValue: 5.5,
    group: "quality-metrics",
    groupTitle: "Quality Metrics",
    groupOrder: 3,
  },
  {
    id: "snv_count",
    title: "SNV Count",
    type: "numeric",
    kpiPlot: true,
    format: ",",
    scale: "log",
    minValue: 1,
    group: "event-metrics",
    groupTitle: "Event Metrics",
    groupOrder: 4,
  },
  {
    id: "sv_count",
    title: "SV Count",
    type: "numeric",
    kpiPlot: true,
    format: ",",
    scale: "log",
    minValue: 1,
    group: "event-metrics",
    groupTitle: "Event Metrics",
    groupOrder: 4,
  },
  {
    id: "loh_fraction",
    title: "Fraction of Genome Altered (FGA)",
    shortTitle: "FGA",
    type: "numeric",
    kpiPlot: true,
    format: ".3",
    scale: "linear",
    minValue: 0,
    group: "event-metrics",
    groupTitle: "Event Metrics",
    groupOrder: 4,
  },
  {
    id: "tmb",
    title: "Tumor Mutational Burden (TMB)",
    shortTitle: "TMB",
    type: "numeric",
    kpiPlot: true,
    format: ",",
    scale: "log",
    minValue: 1,
    group: "biomarker-metrics",
    groupTitle: "Biomarker Metrics",
    groupOrder: 5,
  },
  {
    id: "hrd.hrd_score",
    title: "HRDetect",
    shortTitle: "HRD",
    type: "numeric",
    kpiPlot: true,
    format: "0.2%",
    scale: "linear",
    minValue: 0,
    maxValue: 1,
    group: "biomarker-metrics",
    groupTitle: "Biomarker Metrics",
    groupOrder: 5,
  },
  {
    id: "msisensor.score",
    title: "MSI Score",
    shortTitle: "MSI",
    type: "numeric",
    kpiPlot: true,
    format: ".2%",
    scale: "linear",
    minValue: 0,
    maxValue: 1,
    group: "biomarker-metrics",
    groupTitle: "Biomarker Metrics",
    groupOrder: 5,
  },
  {
    id: "hrd.b1_2_score",
    title: "B1+B2 Score",
    shortTitle: "B1+B2",
    type: "numeric",
    kpiPlot: true,
    format: "0.2%",
    scale: "linear",
    minValue: 0,
    maxValue: 1,
    group: "biomarker-metrics",
    groupTitle: "Biomarker Metrics",
    groupOrder: 5,
  },
  {
    id: "hrd.b1_score",
    title: "B1 Score",
    shortTitle: "B1",
    type: "numeric",
    kpiPlot: true,
    format: "0.2%",
    scale: "linear",
    minValue: 0,
    maxValue: 1,
    maxValueY: null,
    group: "biomarker-metrics",
    groupTitle: "Biomarker Metrics",
    groupOrder: 5,
  },
  {
    id: "hrd.b2_score",
    title: "B2 Score",
    shortTitle: "B2",
    type: "numeric",
    kpiPlot: true,
    format: "0.2%",
    scale: "linear",
    minValue: 0,
    maxValue: 1,
    maxValueY: null,
    group: "biomarker-metrics",
    groupTitle: "Biomarker Metrics",
    groupOrder: 5,
  },
];
