import React, { Component } from "react";
import { Avatar, Tooltip } from "antd";

class InterpretationsAvatar extends Component {
  getInterpretationTooltip = (pair, casesWithInterpretations, interpretationsCounts) => {
    if (!casesWithInterpretations) return '';
    const authors = Array.from(casesWithInterpretations.byAuthor?.entries() || [])
      .filter(([author, cases]) => cases.has(pair))
      .map(([author]) => author);
    const genes = Array.from(casesWithInterpretations.byGene?.entries() || [])
      .filter(([gene, cases]) => cases.has(pair))
      .map(([gene]) => gene);
    const hasTierChange = casesWithInterpretations.withTierChange?.has(pair);
    const total = interpretationsCounts.get(pair) || 0;
    let text = `${total} interpretation${total !== 1 ? 's' : ''} by ${authors.length} author${authors.length !== 1 ? 's' : ''}`;
    if (genes.length > 0) {
      text += ` for ${genes.length} gene${genes.length !== 1 ? 's' : ''}`;
    }
    if (hasTierChange) {
      text += ' (includes tier change)';
    }
    return text;
  };

  render() {
    const { pair, casesWithInterpretations, interpretationsCounts } = this.props;

    if (!casesWithInterpretations?.all?.has(pair)) {
      return null;
    }

    return (
      <Tooltip title={this.getInterpretationTooltip(pair, casesWithInterpretations, interpretationsCounts)}>
        <Avatar
          style={{
            backgroundColor: "#d9f7be",
            color: "#52c41a",
          }}
        >
          I
        </Avatar>
      </Tooltip>
    );
  }
}

export default InterpretationsAvatar;
