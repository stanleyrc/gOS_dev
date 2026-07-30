import React, { Component } from "react";
import { Avatar, Tooltip, Typography } from "antd";
import { tierColor } from "../../../helpers/utility";
import { BsDashLg } from "react-icons/bs";

const { Text } = Typography;
const TIERS = [1, 2, 3];

class TierBadgeRenderer extends Component {
  handleTierChange = (tier) => (event) => {
    event.stopPropagation();
    this.props.onTierChange(this.props.record, tier);
  };

  renderTier = (tier, currentTier) => {
    if (tier === currentTier) {
      return (
        <Avatar
          key={tier}
          size="small"
          aria-label={`Current tier ${tier}`}
          style={{
            color: "#FFF",
            backgroundColor: tierColor(tier),
            fontWeight: 700,
          }}
        >
          {tier}
        </Avatar>
      );
    }

    return (
      <button
        key={tier}
        type="button"
        className="tier-selector-button"
        onClick={this.handleTierChange(tier)}
        aria-label={`Set tier ${tier}`}
      >
        <Avatar
          size={18}
          style={{
            color: "#FFF",
            backgroundColor: tierColor(tier),
            fontSize: "10px",
          }}
        >
          {tier}
        </Avatar>
      </button>
    );
  };

  render() {
    const { value, record, getTierTooltipContent } = this.props;

    if (value == null) {
      return (
        <Text italic disabled>
          <BsDashLg />
        </Text>
      );
    }

    const currentTier = TIERS.includes(+value) ? +value : 3;

    return (
      <Tooltip
        title={getTierTooltipContent(record)}
        placement="right"
        overlayStyle={{ maxWidth: "350px" }}
      >
        <span className="tier-selector">
          {TIERS.map((tier) => this.renderTier(tier, currentTier))}
        </span>
      </Tooltip>
    );
  }
}

export default TierBadgeRenderer;
