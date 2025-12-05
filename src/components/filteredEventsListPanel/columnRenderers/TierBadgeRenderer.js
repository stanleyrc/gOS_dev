import React from "react";
import { Avatar, Tooltip, Button, Typography } from "antd";
import { tierColor } from "../../../helpers/utility";
import { BsDashLg } from "react-icons/bs";

const { Text } = Typography;

/**
 * TierBadgeRenderer
 * Renders the tier value as a colored avatar badge with tooltip
 * 
 * @param {*} value - The tier value
 * @param {Object} record - The complete record object
 * @param {Function} getTierTooltipContent - Function to get tooltip content
 * @param {Function} selectFilteredEvent - Function to handle selection
 * @returns {JSX}
 */
export default function TierBadgeRenderer({
  value,
  record,
  getTierTooltipContent,
  selectFilteredEvent,
}) {
  if (value == null) {
    return (
      <Text italic disabled>
        <BsDashLg />
      </Text>
    );
  }

  return (
    <Tooltip
      title={getTierTooltipContent(record)}
      placement="right"
      overlayStyle={{ maxWidth: "350px" }}
    >
      <Button
        type="link"
        onClick={() => selectFilteredEvent(record, "detail")}
      >
        <Avatar
          size="small"
          style={{
            color: "#FFF",
            backgroundColor: tierColor(+value),
          }}
        >
          {value}
        </Avatar>
      </Button>
    </Tooltip>
  );
}
