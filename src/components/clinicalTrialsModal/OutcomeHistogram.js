import React, { Component } from "react";
import { Select, Typography, Space, Empty, Card, Statistic, Row, Col } from "antd";
import * as d3 from "d3";
import { isValidOutcome, normalizeToMonths } from "./trialDataUtils";

const { Text } = Typography;

const HISTOGRAM_CONFIG = {
  HEIGHT: 400,
  MARGINS: { top: 30, right: 20, bottom: 50, left: 60 },
  BAR_COLOR: "#1890ff",
  BAR_HOVER_COLOR: "#40a9ff",
  BIN_COUNT: 20,
  DETAILS_PANEL_WIDTH: 260,
  GUTTER: 16,
};

class OutcomeHistogram extends Component {
  constructor(props) {
    super(props);
    this.state = {
      outcomeType: "PFS",
      hoveredBin: null,
      containerWidth: null,
    };
    this.containerRef = React.createRef();
  }

  componentDidMount() {
    this.updateContainerWidth();
    window.addEventListener("resize", this.updateContainerWidth);
  }

  componentWillUnmount() {
    window.removeEventListener("resize", this.updateContainerWidth);
  }

  updateContainerWidth = () => {
    if (this.containerRef.current) {
      const { DETAILS_PANEL_WIDTH, GUTTER } = HISTOGRAM_CONFIG;
      // Subtract details panel width and gutter from container width
      const chartWidth = this.containerRef.current.offsetWidth - DETAILS_PANEL_WIDTH - GUTTER;
      this.setState({ containerWidth: Math.max(chartWidth, 400) });
    }
  };

  getOutcomeValues = () => {
    const { trials } = this.props;
    const { outcomeType } = this.state;
    const isORR = outcomeType === "ORR";

    const values = [];
    trials.forEach((trial) => {
      (trial.outcomes || []).forEach((outcome) => {
        if (outcome.outcome_type !== outcomeType) return;
        if (!isValidOutcome(outcome, outcomeType)) return;

        const rawValue = parseFloat(outcome.value);
        if (isNaN(rawValue)) return;

        const value = isORR ? rawValue : normalizeToMonths(rawValue, outcome.unit);
        if (value >= 0) {
          values.push({
            value,
            trial,
            outcome,
            armTitle: outcome.arm_title,
          });
        }
      });
    });

    return values;
  };

  getStatistics = (values) => {
    if (values.length === 0) return null;

    const sorted = [...values].map((v) => v.value).sort((a, b) => a - b);
    const sum = sorted.reduce((acc, v) => acc + v, 0);
    const mean = sum / sorted.length;
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
    const min = sorted[0];
    const max = sorted[sorted.length - 1];

    // Calculate quartiles
    const q1Index = Math.floor(sorted.length * 0.25);
    const q3Index = Math.floor(sorted.length * 0.75);
    const q1 = sorted[q1Index];
    const q3 = sorted[q3Index];

    return { mean, median, min, max, count: sorted.length, q1, q3 };
  };

  handleOutcomeTypeChange = (value) => {
    this.setState({ outcomeType: value, hoveredBin: null });
  };

  handleBarMouseEnter = (bin) => {
    this.setState({ hoveredBin: bin });
  };

  handleBarMouseLeave = () => {
    this.setState({ hoveredBin: null });
  };

  render() {
    const { outcomeType, hoveredBin, containerWidth } = this.state;
    const { availableOutcomes } = this.props;

    const values = this.getOutcomeValues();
    const stats = this.getStatistics(values);

    const outcomeOptions = [
      { label: "PFS (months)", value: "PFS", disabled: !availableOutcomes?.PFS },
      { label: "OS (months)", value: "OS", disabled: !availableOutcomes?.OS },
      { label: "ORR (%)", value: "ORR", disabled: !availableOutcomes?.ORR },
    ];

    const isORR = outcomeType === "ORR";
    const unit = isORR ? "%" : "mo";

    // Wait for container measurement
    if (containerWidth === null) {
      return (
        <div ref={this.containerRef} style={{ width: "100%", minHeight: 200 }}>
          <div style={{ marginBottom: 16 }}>
            <Space>
              <Text>Outcome:</Text>
              <Select
                value={outcomeType}
                options={outcomeOptions}
                onChange={this.handleOutcomeTypeChange}
                style={{ width: 150 }}
              />
            </Space>
          </div>
        </div>
      );
    }

    if (values.length === 0) {
      return (
        <div ref={this.containerRef} style={{ width: "100%" }}>
          <div style={{ marginBottom: 16 }}>
            <Space>
              <Text>Outcome:</Text>
              <Select
                value={outcomeType}
                options={outcomeOptions}
                onChange={this.handleOutcomeTypeChange}
                style={{ width: 150 }}
              />
            </Space>
          </div>
          <Empty description={`No ${outcomeType} data available for filtered trials`} />
        </div>
      );
    }

    const { HEIGHT, MARGINS, BAR_COLOR, BAR_HOVER_COLOR, BIN_COUNT } = HISTOGRAM_CONFIG;
    const width = containerWidth;
    const innerWidth = width - MARGINS.left - MARGINS.right;
    const innerHeight = HEIGHT - MARGINS.top - MARGINS.bottom;

    // Create histogram bins
    const valueArray = values.map((v) => v.value);
    const xExtent = d3.extent(valueArray);

    // For ORR, use 0-100 range
    const xMin = isORR ? 0 : Math.max(0, xExtent[0] - 1);
    const xMax = isORR ? 100 : xExtent[1] + 1;

    const xScale = d3.scaleLinear()
      .domain([xMin, xMax])
      .range([0, innerWidth])
      .nice();

    const histogram = d3.bin()
      .value((d) => d.value)
      .domain(xScale.domain())
      .thresholds(xScale.ticks(BIN_COUNT));

    const bins = histogram(values);

    const yMax = d3.max(bins, (d) => d.length) || 1;
    const yScale = d3.scaleLinear()
      .domain([0, yMax])
      .range([innerHeight, 0])
      .nice();

    const xTicks = xScale.ticks(10);
    const yTicks = yScale.ticks(6);

    return (
      <div ref={this.containerRef} style={{ width: "100%" }}>
        {/* Header row with outcome selector and stats */}
        <Row gutter={24} align="middle" style={{ marginBottom: 24 }}>
          <Col>
            <Space>
              <Text strong>Outcome:</Text>
              <Select
                value={outcomeType}
                options={outcomeOptions}
                onChange={this.handleOutcomeTypeChange}
                style={{ width: 150 }}
              />
            </Space>
          </Col>
          {stats && (
            <>
              <Col>
                <Statistic
                  title="Trial Arms"
                  value={stats.count}
                  valueStyle={{ fontSize: 20 }}
                />
              </Col>
              <Col>
                <Statistic
                  title="Median"
                  value={stats.median.toFixed(1)}
                  suffix={unit}
                  valueStyle={{ fontSize: 20, color: "#f5222d" }}
                />
              </Col>
              <Col>
                <Statistic
                  title="Mean"
                  value={stats.mean.toFixed(1)}
                  suffix={unit}
                  valueStyle={{ fontSize: 20 }}
                />
              </Col>
              <Col>
                <Statistic
                  title="IQR"
                  value={`${stats.q1.toFixed(1)} - ${stats.q3.toFixed(1)}`}
                  suffix={unit}
                  valueStyle={{ fontSize: 16 }}
                />
              </Col>
              <Col>
                <Statistic
                  title="Range"
                  value={`${stats.min.toFixed(1)} - ${stats.max.toFixed(1)}`}
                  suffix={unit}
                  valueStyle={{ fontSize: 16 }}
                />
              </Col>
            </>
          )}
        </Row>

        {/* Chart and hover panel side by side */}
        <div style={{ display: "flex", gap: HISTOGRAM_CONFIG.GUTTER }}>
          <div style={{ flex: "1 1 auto", minWidth: 0 }}>
            <svg width={width} height={HEIGHT}>
              <g transform={`translate(${MARGINS.left}, ${MARGINS.top})`}>
                {/* Grid lines */}
                {yTicks.map((tick) => (
                  <line
                    key={`grid-${tick}`}
                    x1={0}
                    x2={innerWidth}
                    y1={yScale(tick)}
                    y2={yScale(tick)}
                    stroke="#f0f0f0"
                    strokeWidth={1}
                  />
                ))}

                {/* Bars */}
                {bins.map((bin, i) => {
                  const barWidth = Math.max(0, xScale(bin.x1) - xScale(bin.x0) - 2);
                  const barHeight = innerHeight - yScale(bin.length);
                  const isHovered = hoveredBin === bin;

                  return (
                    <rect
                      key={i}
                      x={xScale(bin.x0) + 1}
                      y={yScale(bin.length)}
                      width={barWidth}
                      height={barHeight}
                      fill={isHovered ? BAR_HOVER_COLOR : BAR_COLOR}
                      stroke="white"
                      strokeWidth={1}
                      rx={2}
                      style={{ cursor: bin.length > 0 ? "pointer" : "default", transition: "fill 0.15s" }}
                      onMouseEnter={() => bin.length > 0 && this.handleBarMouseEnter(bin)}
                      onMouseLeave={this.handleBarMouseLeave}
                    />
                  );
                })}

                {/* Median line */}
                {stats && (
                  <g>
                    <line
                      x1={xScale(stats.median)}
                      x2={xScale(stats.median)}
                      y1={0}
                      y2={innerHeight}
                      stroke="#f5222d"
                      strokeWidth={2}
                      strokeDasharray="6,4"
                    />
                    <text
                      x={xScale(stats.median)}
                      y={-10}
                      textAnchor="middle"
                      style={{ fontSize: 12, fill: "#f5222d", fontWeight: 500 }}
                    >
                      Median: {stats.median.toFixed(1)} {unit}
                    </text>
                  </g>
                )}

                {/* X-axis */}
                <g transform={`translate(0, ${innerHeight})`}>
                  <line x1={0} x2={innerWidth} y1={0} y2={0} stroke="#000" />
                  {xTicks.map((tick) => (
                    <g key={tick} transform={`translate(${xScale(tick)}, 0)`}>
                      <line y2={6} stroke="#000" />
                      <text y={22} textAnchor="middle" style={{ fontSize: 12 }}>
                        {tick}
                      </text>
                    </g>
                  ))}
                  <text
                    x={innerWidth / 2}
                    y={42}
                    textAnchor="middle"
                    style={{ fontSize: 13, fontWeight: 500 }}
                  >
                    {outcomeType} ({unit})
                  </text>
                </g>

                {/* Y-axis */}
                <g>
                  <line x1={0} x2={0} y1={0} y2={innerHeight} stroke="#000" />
                  {yTicks.map((tick) => (
                    <g key={tick} transform={`translate(0, ${yScale(tick)})`}>
                      <line x2={-6} stroke="#000" />
                      <text x={-10} dy="0.32em" textAnchor="end" style={{ fontSize: 12 }}>
                        {tick}
                      </text>
                    </g>
                  ))}
                  <text
                    transform={`translate(-45, ${innerHeight / 2}) rotate(-90)`}
                    textAnchor="middle"
                    style={{ fontSize: 13, fontWeight: 500 }}
                  >
                    Number of Trial Arms
                  </text>
                </g>
              </g>
            </svg>
          </div>

          {/* Hover details panel - fixed width on right */}
          <div style={{ flex: `0 0 ${HISTOGRAM_CONFIG.DETAILS_PANEL_WIDTH}px` }}>
            <Card
              size="small"
              title="Bin Details"
              style={{ height: HEIGHT, overflow: "hidden" }}
              styles={{ body: { padding: 12, height: HEIGHT - 48, overflowY: "auto" } }}
            >
              {hoveredBin && hoveredBin.length > 0 ? (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <Text strong style={{ fontSize: 14 }}>
                      {outcomeType}: {hoveredBin.x0.toFixed(1)} - {hoveredBin.x1.toFixed(1)} {unit}
                    </Text>
                    <br />
                    <Text type="secondary">
                      {hoveredBin.length} trial arm{hoveredBin.length !== 1 ? "s" : ""}
                    </Text>
                  </div>
                  <div>
                    {hoveredBin.slice(0, 15).map((item, i) => (
                      <div
                        key={i}
                        style={{
                          fontSize: 12,
                          padding: "4px 0",
                          borderBottom: i < Math.min(hoveredBin.length, 15) - 1 ? "1px solid #f0f0f0" : "none",
                        }}
                      >
                        <Text style={{ fontFamily: "monospace", fontSize: 11 }}>
                          {item.trial.nct_id}
                        </Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {item.armTitle?.substring(0, 25)}{item.armTitle?.length > 25 ? "..." : ""}: {item.value.toFixed(1)} {unit}
                        </Text>
                      </div>
                    ))}
                    {hoveredBin.length > 15 && (
                      <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 8 }}>
                        ... and {hoveredBin.length - 15} more
                      </Text>
                    )}
                  </div>
                </>
              ) : (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Hover over a bar to see the trial arms in that range.
                </Text>
              )}
            </Card>
          </div>
        </div>

        <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 12 }}>
          Distribution of {outcomeType} values across all trial arms matching current filters.
        </Text>
      </div>
    );
  }
}

export default OutcomeHistogram;
