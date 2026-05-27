import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { Button, Space } from "antd";
import Wrapper from "./copyStateFitControls.style";

const fitFields = ["Slope", "Intercept", "Purity", "Ploidy"];

const formatFitValue = (value) =>
  Number.isFinite(value) ? value.toFixed(3) : "n/a";

class CopyStateFitControls extends Component {
  getFitValues() {
    const { activeCopyStateFit } = this.props;

    return fitFields.map((label) => [
      label,
      activeCopyStateFit?.[label.charAt(0).toLowerCase() + label.slice(1)],
    ]);
  }

  render() {
    const { hasFitSession, hasPreview, onApply, onReset } = this.props;

    return (
      <Wrapper className="copy-state-fit-controls">
        <div className="copy-state-fit-panel">
          <div className="copy-state-fit-header">
            <div className="copy-state-fit-title">Fit adjustment</div>
            <Space className="copy-state-fit-toolbar" size="small" wrap>
              <Button
                size="small"
                type="primary"
                disabled={!hasPreview}
                onClick={onApply}
              >
                Apply
              </Button>
              <Button size="small" disabled={!hasFitSession} onClick={onReset}>
                Reset
              </Button>
            </Space>
          </div>
          <div className="copy-state-fit-readout">
            {this.getFitValues().map(([label, value]) => (
              <span className="copy-state-fit-metric" key={label}>
                <span className="copy-state-fit-metric-label">{label}</span>
                <strong className="copy-state-fit-metric-value">
                  {formatFitValue(value)}
                </strong>
              </span>
            ))}
          </div>
        </div>
      </Wrapper>
    );
  }
}

CopyStateFitControls.propTypes = {
  activeCopyStateFit: PropTypes.shape({
    slope: PropTypes.number.isRequired,
    intercept: PropTypes.number.isRequired,
    purity: PropTypes.number.isRequired,
    ploidy: PropTypes.number.isRequired,
  }).isRequired,
  hasFitSession: PropTypes.bool.isRequired,
  hasPreview: PropTypes.bool.isRequired,
  onApply: PropTypes.func.isRequired,
  onReset: PropTypes.func.isRequired,
};

export default CopyStateFitControls;
