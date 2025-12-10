import React from "react";
import { Button, Tooltip, Typography } from "antd";
import { BsDashLg } from "react-icons/bs";
import InterpretationsAvatar from "../../interpretationsAvatar";
import { getAllInterpretationsForAlteration } from "../../../redux/interpretations/selectors";
import { store } from "../../../redux/store";

const { Text } = Typography;

/**
 * GeneRenderer
 * Renders gene name with interpretations avatar and link to open detail view
 * 
 * @param {*} value - The gene value
 * @param {Object} record - The complete record object
 * @param {Function} selectFilteredEvent - Function to handle selection
 * @returns {JSX}
 */
export default function GeneRenderer({ value, record, selectFilteredEvent }) {
  if (value == null) {
    return (
      <Text italic disabled>
        <BsDashLg />
      </Text>
    );
  }

  const alterationId = record.uid;
  const count = getAllInterpretationsForAlteration(
    store.getState(),
    alterationId
  ).length;

  return (
    <Button type="link" onClick={() => selectFilteredEvent(record, "detail")}>
      <Tooltip placement="topLeft" title={value}>
        {count > 0 && (
          <InterpretationsAvatar
            tooltipText={`Found ${count} interpretation(s)`}
            size={18}
          />
        )}{" "}
        {value}
      </Tooltip>
    </Button>
  );
}
