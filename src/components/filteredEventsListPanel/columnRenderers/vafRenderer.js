import React, { Component } from "react";
import { Typography } from "antd";
import { BsDashLg } from "react-icons/bs";
import { formatMyeloSeqVaf } from "../../../helpers/myeloSeqReportFormatting";

/** Display VAF using the report's percentage convention, without changing data. */
export default class VafRenderer extends Component {
  render() {
    const formatted = formatMyeloSeqVaf(this.props.value);
    return formatted || (
      <Typography.Text italic disabled>
        <BsDashLg />
      </Typography.Text>
    );
  }
}
