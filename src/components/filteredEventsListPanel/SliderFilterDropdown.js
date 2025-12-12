import React, { Component } from "react";
import { Slider, Button, Space, InputNumber } from "antd";

class SliderFilterDropdown extends Component {
  constructor(props) {
    super(props);
    const { min, max } = props;
    this.state = {
      range: [min, max],
    };
  }

  componentDidUpdate(prevProps) {
    if (
      prevProps.min !== this.props.min ||
      prevProps.max !== this.props.max
    ) {
      this.setState({ range: [this.props.min, this.props.max] });
    }
  }

  handleSliderChange = (range) => {
    this.setState({ range });
  };

  handleMinChange = (value) => {
    const { max } = this.props;
    const newMin = value != null ? value : this.props.min;
    this.setState((prev) => ({
      range: [Math.min(newMin, prev.range[1]), prev.range[1]],
    }));
  };

  handleMaxChange = (value) => {
    const { min } = this.props;
    const newMax = value != null ? value : this.props.max;
    this.setState((prev) => ({
      range: [prev.range[0], Math.max(newMax, prev.range[0])],
    }));
  };

  handleReset = () => {
    const { min, max, clearFilters, confirm } = this.props;
    this.setState({ range: [min, max] });
    clearFilters();
    confirm();
  };

  handleConfirm = () => {
    const { setSelectedKeys, confirm, min, max } = this.props;
    const { range } = this.state;
    if (range[0] === min && range[1] === max) {
      setSelectedKeys([]);
    } else {
      setSelectedKeys([`${range[0]},${range[1]}`]);
    }
    confirm();
  };

  render() {
    const { min, max, step } = this.props;
    const { range } = this.state;

    return (
      <div style={{ padding: 12, width: 280 }}>
        <Slider
          range
          min={min}
          max={max}
          step={step}
          value={range}
          onChange={this.handleSliderChange}
          style={{ marginBottom: 16 }}
        />
        <Space style={{ marginBottom: 12 }}>
          <InputNumber
            size="small"
            min={min}
            max={max}
            step={step}
            value={range[0]}
            onChange={this.handleMinChange}
            style={{ width: 100 }}
          />
          <span>to</span>
          <InputNumber
            size="small"
            min={min}
            max={max}
            step={step}
            value={range[1]}
            onChange={this.handleMaxChange}
            style={{ width: 100 }}
          />
        </Space>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <Button size="small" onClick={this.handleReset}>
            Reset
          </Button>
          <Button type="primary" size="small" onClick={this.handleConfirm}>
            OK
          </Button>
        </div>
      </div>
    );
  }
}

export default SliderFilterDropdown;
