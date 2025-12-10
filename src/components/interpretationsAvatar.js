import React, { Component } from "react";
import { Avatar, Tooltip } from "antd";

class InterpretationsAvatar extends Component {
  render() {
    const { pair, casesWithInterpretations, interpretationsCounts, tooltipText, size = 32, color = "#d9f7be", textColor = "#389e0d", showDot = false } = this.props;

    let tooltip = tooltipText;
    if (!tooltip && pair && casesWithInterpretations && interpretationsCounts) {
      // Fallback to original logic if tooltipText not provided
      const authors = Array.from(casesWithInterpretations.byAuthor?.entries() || [])
        .filter(([author, cases]) => cases.has(pair))
        .map(([author]) => author);
      const genes = Array.from(casesWithInterpretations.byGene?.entries() || [])
        .filter(([gene, cases]) => cases.has(pair))
        .map(([gene]) => gene);
      const hasTierChange = casesWithInterpretations.withTierChange?.has(pair);
      const total = interpretationsCounts.get(pair) || 0;
      tooltip = `${total} interpretation${total !== 1 ? 's' : ''} by ${authors.length} author${authors.length !== 1 ? 's' : ''}`;
      if (genes.length > 0) {
        tooltip += ` for ${genes.length} gene${genes.length !== 1 ? 's' : ''}`;
      }
      if (hasTierChange) {
        tooltip += ' (includes tier change)';
      }
    }

    if (showDot) {
      return (
        <Tooltip title={tooltip}>
          <span
            style={{
              display: 'inline-block',
              width: size,
              height: size,
              borderRadius: '50%',
              backgroundColor: color,
              verticalAlign: 'middle',
            }}
          />
        </Tooltip>
      );
    }

    if (!casesWithInterpretations?.all?.has(pair) && !tooltipText) {
      return null;
    }

    return (
      <Tooltip title={tooltip}>
        <Avatar
          size={size}
          style={{
            backgroundColor: color,
            color: textColor,
            fontSize: size * 0.6,
          }}
        >
          i
        </Avatar>
      </Tooltip>
    );
  }
}

export default InterpretationsAvatar;
