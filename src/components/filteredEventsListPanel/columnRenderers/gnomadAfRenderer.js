import React, { Component } from "react";
import { Tooltip, Typography } from "antd";
import { BsDashLg } from "react-icons/bs";
import * as d3 from "d3";
import {
  getGnomadVariant,
  getGnomadVariantUrl,
} from "../../../helpers/gnomad";

const { Text } = Typography;

/** Render gnomAD allele frequency as a link to the matching gnomAD variant. */
export default class GnomadAfRenderer extends Component {
  handleLinkClick = (event) => {
    event.stopPropagation();
  };

  render() {
    const { value, record, format = ".3g" } = this.props;
    if (value == null) {
      return (
        <Text italic disabled>
          <BsDashLg />
        </Text>
      );
    }

    const displayValue = d3.format(format)(+value);
    const variant = getGnomadVariant(record);
    const href = getGnomadVariantUrl(record);
    if (!variant || !href) {
      return <span>{displayValue}</span>;
    }

    const {
      chromosome,
      position,
      referenceAllele,
      alternateAllele,
    } = variant;
    const variantId = `${chromosome}-${position}-${referenceAllele}-${alternateAllele}`;

    return (
      <Tooltip title="Click to open gnomAD." placement="right">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open variant ${variantId} in gnomAD`}
          onClick={this.handleLinkClick}
        >
          {displayValue}
        </a>
      </Tooltip>
    );
  }
}
