import React, { Component } from "react";
import { getClinvarLinkModel } from "../../../helpers/clinvar";
import ClassIconRenderer from "./ClassIconRenderer";

/** Add ClinVar-specific navigation to the shared annotation badge. */
export default class ClinvarIconRenderer extends Component {
  render() {
    const { value, record } = this.props;
    const linkModel = getClinvarLinkModel(value, record);

    return (
      <ClassIconRenderer
        value={value}
        href={linkModel ? linkModel.href : undefined}
        linkAriaLabel={
          linkModel
            ? `Open ${linkModel.targetLabel} in ClinVar`
            : undefined
        }
        tooltipHint={linkModel ? "Click to open ClinVar." : undefined}
      />
    );
  }
}
