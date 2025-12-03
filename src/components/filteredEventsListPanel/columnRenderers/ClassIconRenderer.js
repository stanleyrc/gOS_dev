import React from "react";
import { Tooltip, Typography } from "antd";
import { BsDashLg, BsQuestionCircle } from "react-icons/bs";
import { MdHealthAndSafety } from "react-icons/md";
import { PiWarningOctagonFill } from "react-icons/pi";

const { Text } = Typography;

/**
 * ClassIconRenderer
 * Renders a class-based icon with tooltip containing description and optional score
 * Maps class enum values (benign, pathogenic, na) to appropriate icons
 * 
 * @param {Object} value - Object containing { class, desc, score }
 * @returns {JSX}
 */
export default function ClassIconRenderer({ value }) {
  if (!value || !value.class) {
    return (
      <Text italic disabled>
        <BsDashLg />
      </Text>
    );
  }

  const { class: classValue, desc, score } = value;

  // Map class to icon and color
  const iconConfig = {
    benign: {
      icon: <MdHealthAndSafety style={{ color: "#52c41a", fontSize: "24px" }} />,
      label: "Benign",
    },
    pathogenic: {
      icon: <PiWarningOctagonFill style={{ color: "#f5222d", fontSize: "24px" }} />,
      label: "Pathogenic",
    },
    na: {
      icon: <BsQuestionCircle style={{ color: "#d9d9d9", fontSize: "24px" }} />,
      label: "Not Available",
    },
  };

  const config = iconConfig[classValue] || iconConfig.na;

  // Build tooltip content with line breaks
  const tooltipContent = (
    <div>
      <div>{desc || "No description"}</div>
      {score !== undefined && score !== null && score >= 0 && (
        <div>Score: {score}</div>
      )}
    </div>
  );

  return (
    <Tooltip title={tooltipContent} placement="right">
      <span>{config.icon}</span>
    </Tooltip>
  );
}
