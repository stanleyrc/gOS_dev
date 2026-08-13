import React, { Component } from "react";
import {
  getClinvarAlleleId,
  getClinvarUrl,
} from "../../../helpers/clinvar";
import ClassIconRenderer from "./ClassIconRenderer";

/** Add ClinVar-specific navigation to the shared annotation badge. */
export default class ClinvarIconRenderer extends Component {
  render() {
    const { value, record } = this.props;
    const alleleId =
      getClinvarAlleleId(value) || getClinvarAlleleId(record);
    const variant =
      record && typeof record.Variant_g === "string"
        ? record.Variant_g.trim()
        : "";
    const href = getClinvarUrl(value, record);
    const linkTargetLabel = alleleId
      ? `allele ${alleleId}`
      : variant || "variant";

    return (
      <ClassIconRenderer
        value={value}
        href={href || undefined}
        linkAriaLabel={
          href ? `Open ${linkTargetLabel} in ClinVar` : undefined
        }
        tooltipHint={href ? "Click to open ClinVar." : undefined}
      />
    );
  }
}
