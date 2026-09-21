import React, { Component } from "react";
import { Button, Tooltip, Typography } from "antd";
import { BsDashLg } from "react-icons/bs";
import CopyIconButton from "../../copyIconButton";
import {
  formatLocationDisplay,
  getCoordinateCopyValue,
} from "../../../helpers/genomicLocation";

const { Text } = Typography;

/**
 * Renders a coordinate link that opens the unified modal's Plots tab plus an
 * independent control for copying the displayed coordinates.
 */
export default class LocationRenderer extends Component {
  handleOpenLocation = (event) => {
    event.preventDefault();
    const { record, selectFilteredEvent } = this.props;
    if (selectFilteredEvent) selectFilteredEvent(record, "tracks");
  };

  render() {
    const { value } = this.props;
    if (value == null) {
      return (
        <Text italic disabled>
          <BsDashLg />
        </Text>
      );
    }

    const displayValue = formatLocationDisplay(value);
    const copyValue = getCoordinateCopyValue(displayValue);

    return (
      <div className="filtered-events-location-cell">
        <Tooltip title={String(displayValue)}>
          <Button
            type="link"
            className="filtered-events-location-link filtered-events-ellipsis-text"
            onClick={this.handleOpenLocation}
            aria-label={`Open coordinates ${displayValue} in Plots`}
          >
            {displayValue}
          </Button>
        </Tooltip>
        <CopyIconButton
          value={copyValue}
          tooltipTitle="Copy coordinates"
          copiedTooltipTitle="Copied!"
          failureTooltipTitle="Unable to copy"
          className="filtered-events-location-copy-button"
          ariaLabel={`Copy coordinates ${copyValue} to clipboard`}
        />
      </div>
    );
  }
}
