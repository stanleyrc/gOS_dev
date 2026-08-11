import React, { Component } from "react";
import { Button, Tooltip, Typography } from "antd";
import { BsDashLg } from "react-icons/bs";
import InterpretationsAvatar from "../../interpretationsAvatar";
import { getAllInterpretationsForEvent } from "../../../redux/interpretations/selectors";
import { store } from "../../../redux/store";

const { Text } = Typography;

/**
 * EventDetailRenderer
 * Renders an event value with its interpretations avatar and a detail-view link.
 * Used by event-detail-link columns and the legacy gene-link view type.
 *
 * @param {*} value - The displayed event value
 * @param {Object} record - The complete record object
 * @param {Function} selectFilteredEvent - Function to handle selection
 * @returns {JSX}
 */
export default class EventDetailRenderer extends Component {
  handleOpenDetails = () => {
    const { record, selectFilteredEvent } = this.props;
    selectFilteredEvent(record, "detail");
  };

  render() {
    const { value, record } = this.props;
    if (value == null) {
      return (
        <Text italic disabled>
          <BsDashLg />
        </Text>
      );
    }

    const count = getAllInterpretationsForEvent(
      store.getState(),
      record,
    ).length;

    return (
      <Button
        type="link"
        className="filtered-events-detail-link"
        onClick={this.handleOpenDetails}
      >
        <Tooltip placement="topLeft" title={value}>
          <span className="filtered-events-detail-content">
            {count > 0 && (
              <InterpretationsAvatar
                tooltipText={`Found ${count} interpretation(s)`}
                size={18}
              />
            )}
            <span className="filtered-events-detail-text">{value}</span>
          </span>
        </Tooltip>
      </Button>
    );
  }
}
