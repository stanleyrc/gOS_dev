import React from "react";
import { Typography } from "antd";
import { BsDashLg } from "react-icons/bs";

const { Text } = Typography;

/**
 * StringRenderer
 * Renders string values with optional ellipsis tooltip
 * 
 * @param {*} value - The string value
 * @param {Object} record - The complete record object (unused but kept for consistency)
 * @param {boolean} ellipsis - Whether to add ellipsis with tooltip
 * @returns {JSX}
 */
export default function StringRenderer({ value, record, ellipsis = false }) {
  if (value == null) {
    return (
      <Text italic disabled>
        <BsDashLg />
      </Text>
    );
  }

  if (ellipsis) {
    return (
      <Text
        ellipsis={{ tooltip: value }}
        className="filtered-events-ellipsis-text"
      >
        {value}
      </Text>
    );
  }

  return value;
}
