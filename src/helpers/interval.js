import * as d3 from "d3";
import { humanize, guid } from "./utility";

class Interval {
  constructor(inter) {
    this.identifier = guid();
    this.primaryKey = `iid-${inter.iid}`;
    this.iid = inter.iid;
    this.siid = inter.siid;
    this.chromosome = inter.chromosome;
    this.startPoint = inter.startPoint;
    this.endPoint = inter.endPoint;
    this.annotation = inter.annotation;
    this.metadata = inter.metadata || {};
    this.fill = this.metadata.color;
    this.overlapping = inter.overlapping;
    this.annotationArray = inter.annotation ? inter.annotation.split("|") : [];
    this.intervalLength = this.endPoint - this.startPoint;
    this.y = inter.y;
    this.title = inter.title;
    this.type = inter.type;
    this.strand = inter.strand;
    this.sequence = inter.sequence;
    this.errors = [];
    this.attributes = [
      { label: "Chromosome", value: this.chromosome },
      { label: "Y", value: this.y },
      {
        label: "Start Point (chromosome)",
        value: d3.format(",")(this.startPoint),
      },
      {
        label: "End Point (chromosome)",
        value: d3.format(",")(this.endPoint - 1),
      }, // because endpoint is inclusive
      { label: "Interval Length", value: d3.format(",")(this.intervalLength) },
    ];
    if (this.strand) {
      this.attributes.push({ label: "Strand", value: this.strand });
    }
    if (this.sequence) {
      this.attributes.push({ label: "Sequence", value: this.sequence });
    }
  }

  get isSubInterval() {
    return this.mode === "subinterval";
  }

  get location() {
    return `${this.chromosome}: ${this.startPoint} - ${this.endPoint}`;
  }

  get mutationSymbol() {
    let value = d3.symbol(d3.symbolCircle, 10);
    if (this.annotation) {
      const annotations = this.annotation.split(";").map((item) => {
        if (!item.includes(":")) {
          return null;
        }
        const [key, value] = item.split(":");
        return { key: key.trim(), value: value.trim() };
      });
      const oncogenicity = annotations.find(
        (item) => item?.key === "Oncogenicity"
      )?.value;
      const effect = annotations.find((item) => item?.key === "Effect")?.value;
      if (oncogenicity) {
        value = d3.symbol(d3.symbolAsterisk, 100);
      }
      if (effect) {
        value = d3.symbol(d3.symbolStar, 100);
      }
    }
    return value();
  }

  get tooltipContent() {
    let attributes = [
      { label: "Locus", value: this.location },
      { label: "CN", value: this.y },
    ];
    if (this.annotation) {
      const annotations = this.annotation.split(";").map((item) => {
        if (!item.includes(":")) {
          return null;
        }
        const [key, value] = item.split(":");
        return { key: key.trim(), value: value.trim() };
      });
      const gene = annotations.find((item) => item.key === "Gene")?.value;
      const geneType = annotations.find((item) => item.key === "Type")?.value;
      const filter = annotations.find((item) => item.key === "Filter")?.value;
      const variant = annotations.find((item) => item.key === "Variant")?.value;
      const protein_variant = annotations.find(
        (item) => item.key === "Protein_variant"
      )?.value;
      const gene_variant = annotations.find(
        (item) => item.key === "Genomic_variant"
      )?.value;
      const alt_count = annotations.find(
        (item) => item.key === "Alt_count"
      )?.value;
      const ref_count = annotations.find(
        (item) => item.key === "Ref_count"
      )?.value;
      const total_count =
        ref_count && alt_count
          ? parseInt(ref_count) + parseInt(alt_count)
          : null;
      const vaf = d3.format(".3f")(
        +annotations.find((item) => item.key === "VAF")?.value
      );
      const normal_alt_count = annotations.find(
        (item) => item.key === "Normal_alt_count"
      )?.value;
      const normal_ref_count = annotations.find(
        (item) => item.key === "Normal_ref_count"
      )?.value;
      const normal_total_count =
        normal_ref_count && normal_alt_count
          ? parseInt(normal_ref_count) + parseInt(normal_alt_count)
          : null;

      if (gene) {
        attributes.push({ label: "Gene", value: gene });
      }
      if (geneType) {
        attributes.push({ label: "Type", value: geneType });
      }
      if (filter) {
        attributes.push({ label: "Filter", value: filter });
      }
      if (variant || protein_variant || gene_variant) {
        attributes.push({
          label: "Variant",
          value: `${variant}, ${protein_variant}, ${gene_variant}`,
        });
      }
      if (ref_count && alt_count && total_count && vaf) {
        attributes.push({
          label: "Tumor ALT | REF | TOTAL | VAF",
          value: `${alt_count} | ${ref_count} | ${total_count} | ${vaf}`,
        });
      }
      if (normal_alt_count && normal_ref_count && normal_total_count) {
        attributes.push({
          label: "Normal ALT | REF | TOTAL",
          value: `${normal_alt_count} | ${normal_ref_count} | ${normal_total_count}`,
        });
      }
      const oncogenicity = annotations.find(
        (item) => item.key === "Oncogenicity"
      )?.value;
      if (oncogenicity) {
        attributes.push({
          label: "OncoKB Oncogenicity",
          value: oncogenicity || "NA",
        });
      }
      const effect = annotations.find((item) => item.key === "Effect")?.value;
      if (effect) {
        attributes.push({
          label: "OncoKB Predicted Effect",
          value: effect || "NA",
        });
      }
      const level = annotations.find((item) => item.key === "Level")?.value;
      if (level) {
        attributes.push({
          label: "OncoKB Therapeutic Level",
          value: level || "NA",
        });
      }
    }
    if (this.strand) {
      attributes.push({ label: "Strand", value: this.strand });
    }
    if (this.sequence) {
      attributes.push({ label: "Sequence", value: this.sequence });
    }
    if (this.intervalLength > 1) {
      attributes.push({
        label: "Length",
        value: d3.format(",")(this.intervalLength),
      });
    }
    Object.keys(this.metadata).forEach((key) => {
      attributes.push({ label: humanize(key), value: this.metadata[key] });
    });
    return attributes;
  }

  get weight() {
    let value = 0;
    if (this.annotation) {
      const annotations = this.annotation.split(";").map((item) => {
        if (!item.includes(":")) {
          return null;
        }
        const [key, value] = item.split(":");
        return { key: key.trim(), value: value.trim() };
      });
      const oncogenicity = annotations.find(
        (item) => item?.key === "Oncogenicity"
      )?.value;
      const effect = annotations.find((item) => item?.key === "Effect")?.value;
      if (oncogenicity) {
        value = 1;
      }
      if (effect) {
        value = 2;
      }
    }
    return value;
  }

  toString() {
    return `identifier: ${this.identifier},
    iid: ${this.iid},
    chromosome: ${this.chromosome},
    startPoint: ${this.startPoint},
    endPoint: ${this.endPoint},
    y: ${this.y},
    title: ${this.title},
    type: ${this.type},
    strand: ${this.strand}
    strand: ${this.strand}
    sequence: ${this.sequence}
    `;
  }
}
export default Interval;
