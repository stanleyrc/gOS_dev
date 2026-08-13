import React, { Component } from "react";
import {
  getClinvarAlleleId,
  getClinvarAlleleUrl,
} from "../../../helpers/clinvar";
import ClassIconRenderer from "./ClassIconRenderer";

/** Add ClinVar-specific navigation to the shared annotation badge. */
export default class ClinvarIconRenderer extends Component {
  render() {
    const { value, record } = this.props;
    const annotationWithAlleleId = getClinvarAlleleId(value) ? value : record;
    const alleleId = getClinvarAlleleId(annotationWithAlleleId);
    const href = getClinvarAlleleUrl(annotationWithAlleleId);

    return (
      <ClassIconRenderer
        value={value}
        href={href || undefined}
        linkAriaLabel={
          alleleId ? `Open allele ${alleleId} in ClinVar` : undefined
        }
        tooltipHint={href ? "Click to open ClinVar." : undefined}
      />
    );
  }
}
