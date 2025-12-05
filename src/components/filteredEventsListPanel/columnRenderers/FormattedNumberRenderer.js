import React from "react";
import { Typography } from "antd";
import { BsDashLg } from "react-icons/bs";
import * as d3 from "d3";

const { Text } = Typography;

/**
 * FormattedNumberRenderer
 * Renders numeric values with d3 formatting
 * 
 * @param {*} value - The numeric value
 * @param {Object} record - The complete record object (unused but kept for consistency)
 * @param {string} format - d3 format string (e.g., ".3f", ",", "0.2%")
 * @returns {JSX}
 */
export default function FormattedNumberRenderer({ value, record, format = ".3f" }) {
  if (value == null) {
    return (
      <Text italic disabled>
        <BsDashLg />
      </Text>
    );
  }

  return d3.format(format)(+value);
}
