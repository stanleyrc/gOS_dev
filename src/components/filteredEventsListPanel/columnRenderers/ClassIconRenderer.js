import React, { Component } from "react";
import { Tooltip, Typography } from "antd";
import { BsDashLg, BsQuestionCircle } from "react-icons/bs";
import { MdHealthAndSafety } from "react-icons/md";
import { PiWarningOctagonFill } from "react-icons/pi";

const { Text } = Typography;

/**
 * Render a class-based annotation icon with its description and optional score.
 * Consumers may provide external-link details without coupling this shared
 * renderer to a particular annotation source.
 */
export default class ClassIconRenderer extends Component {
  handleLinkClick = (event) => {
    event.stopPropagation();
  };

  render() {
    const {
      value,
      href,
      linkAriaLabel,
      tooltipHint,
    } = this.props;

    if (!value || !value.class) {
      return (
        <Text italic disabled>
          <BsDashLg />
        </Text>
      );
    }

    const { class: classValue, desc, score } = value;
    const iconConfig = {
      benign: {
        icon: (
          <MdHealthAndSafety
            style={{ color: "#52c41a", fontSize: "24px" }}
          />
        ),
      },
      pathogenic: {
        icon: (
          <PiWarningOctagonFill
            style={{ color: "#f5222d", fontSize: "24px" }}
          />
        ),
      },
      na: {
        icon: (
          <BsQuestionCircle
            style={{ color: "#faad14", fontSize: "24px" }}
          />
        ),
      },
    };
    const config = iconConfig[classValue] || iconConfig.na;
    const tooltipContent = (
      <div>
        <div>{desc || "No description"}</div>
        {score !== undefined && score !== null && score >= 0 && (
          <div>Score: {score}</div>
        )}
        {tooltipHint && <div>{tooltipHint}</div>}
      </div>
    );
    const badge = href ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={linkAriaLabel}
        onClick={this.handleLinkClick}
      >
        {config.icon}
      </a>
    ) : (
      <span>{config.icon}</span>
    );

    return (
      <Tooltip title={tooltipContent} placement="right">
        {badge}
      </Tooltip>
    );
  }
}
