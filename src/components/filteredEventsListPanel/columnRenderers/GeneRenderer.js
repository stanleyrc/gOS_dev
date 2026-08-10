import React, { Component } from "react";
import { Button, Tooltip, Typography } from "antd";
import { BsDashLg } from "react-icons/bs";
import InterpretationsAvatar from "../../interpretationsAvatar";
import { getAllInterpretationsForEvent } from "../../../redux/interpretations/selectors";
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
export default class GeneRenderer extends Component {
  handleOpenGene = () => {
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
        className="filtered-events-gene-link"
        onClick={this.handleOpenGene}
      >
        <Tooltip placement="topLeft" title={value}>
          <span className="filtered-events-gene-content">
            {count > 0 && (
              <InterpretationsAvatar
                tooltipText={`Found ${count} interpretation(s)`}
                size={18}
              />
            )}
            <span className="filtered-events-gene-text">{value}</span>
          </span>
        </Tooltip>
      </Button>
    );
  }
}
