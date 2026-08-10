import React, { Component } from "react";
import PropTypes from "prop-types";
import { Button, Tooltip } from "antd";
import { CopyOutlined } from "@ant-design/icons";
import { copyTextToClipboard } from "../../helpers/utility";

const COPY_TOOLTIP_RESET_DELAY = 1500;

/**
 * Shared copy action with transient success/failure tooltip feedback.
 * Consumers own the copied value's domain wording and layout styles.
 */
export default class CopyIconButton extends Component {
  static propTypes = {
    value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    tooltipTitle: PropTypes.string,
    copiedTooltipTitle: PropTypes.string,
    failureTooltipTitle: PropTypes.string,
    ariaLabel: PropTypes.string.isRequired,
    className: PropTypes.string,
  };

  static defaultProps = {
    tooltipTitle: "Copy to clipboard",
    copiedTooltipTitle: "Copied!",
    failureTooltipTitle: "Unable to copy",
    className: "",
  };

  constructor(props) {
    super(props);
    this.state = { tooltipTitle: props.tooltipTitle };
    this.copyResetTimeout = null;
    this.unmounted = false;
  }

  componentDidUpdate(prevProps) {
    const { tooltipTitle } = this.props;
    if (
      prevProps.tooltipTitle !== tooltipTitle &&
      this.state.tooltipTitle === prevProps.tooltipTitle
    ) {
      this.setState({ tooltipTitle });
    }
  }

  componentWillUnmount() {
    this.unmounted = true;
    if (this.copyResetTimeout) {
      clearTimeout(this.copyResetTimeout);
      this.copyResetTimeout = null;
    }
  }

  resetTooltip = () => {
    this.copyResetTimeout = null;
    if (!this.unmounted) {
      this.setState({ tooltipTitle: this.props.tooltipTitle });
    }
  };

  handleCopy = async (event) => {
    event.stopPropagation();
    if (event.detail > 0) {
      event.currentTarget?.blur();
    }
    const {
      value,
      copiedTooltipTitle,
      failureTooltipTitle,
    } = this.props;
    const copied = await copyTextToClipboard(String(value));

    if (this.unmounted) return;

    this.setState({
      tooltipTitle: copied ? copiedTooltipTitle : failureTooltipTitle,
    });

    if (this.copyResetTimeout) {
      clearTimeout(this.copyResetTimeout);
    }
    this.copyResetTimeout = setTimeout(
      this.resetTooltip,
      COPY_TOOLTIP_RESET_DELAY,
    );
  };

  render() {
    const { ariaLabel, className } = this.props;

    return (
      <Tooltip title={this.state.tooltipTitle}>
        <Button
          type="text"
          size="small"
          className={className}
          icon={<CopyOutlined />}
          onClick={this.handleCopy}
          aria-label={ariaLabel}
        />
      </Tooltip>
    );
  }
}
