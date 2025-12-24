import React, { Component } from "react";
import { Typography, Button } from "antd";
import { ZoomOutOutlined } from "@ant-design/icons";
import * as d3 from "d3";
import KonvaScatter from "../konvaScatter";
import { TREATMENT_COLORS, SOC_CLASSES } from "./constants";

const { Text } = Typography;

class TrialsPlotView extends Component {
  constructor(props) {
    super(props);
    this.state = {
      containerWidth: null, // Start as null to detect first render
      // Zoom state - track the visible X range
      zoomXMin: null,
      zoomXMax: null,
    };
    this.containerRef = React.createRef();
    // Cache for computed data
    this.cachedPlotData = null;
    this.cachedDataExtent = null;
    this.lastTrials = null;
    this.lastOutcomeType = null;
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
      const width = this.containerRef.current.offsetWidth - 220;
      this.setState({ containerWidth: Math.max(width, 400) });
    }
  };

  // Memoized data extent - only recalculates when trials/outcomeType change
  getDataXExtent = () => {
    const { trials, outcomeType } = this.props;

    // Use cached extent if data hasn't changed
    if (this.cachedDataExtent && this.lastTrials === trials && this.lastOutcomeType === outcomeType) {
      return this.cachedDataExtent;
    }

    const points = this.getPlotData();
    const xExtent = d3.extent(points, (d) => d.x);
    this.cachedDataExtent = [Math.floor(xExtent[0] || 2015) - 1, Math.ceil(xExtent[1] || 2025) + 1];
    return this.cachedDataExtent;
  };

  handleZoomChange = ({ xMin, xMax }) => {
    const [dataXMin, dataXMax] = this.getDataXExtent();
    const currentRange = xMax - xMin;

    // Minimum zoom level (1 month)
    const minRange = 1 / 12;
    // Maximum zoom level (full data range)
    const maxRange = dataXMax - dataXMin;

    // Check if we're zooming out beyond data bounds
    if (currentRange >= maxRange) {
      this.setState({ zoomXMin: null, zoomXMax: null });
      return;
    }

    // Clamp the range
    if (currentRange < minRange) return;

    // Clamp to data bounds
    let clampedMin = xMin;
    let clampedMax = xMax;

    if (clampedMin < dataXMin) {
      clampedMin = dataXMin;
      clampedMax = dataXMin + currentRange;
    }
    if (clampedMax > dataXMax) {
      clampedMax = dataXMax;
      clampedMin = dataXMax - currentRange;
    }

    this.setState({ zoomXMin: clampedMin, zoomXMax: clampedMax });
  };

  handleResetZoom = () => {
    this.setState({ zoomXMin: null, zoomXMax: null });
  };

  isZoomed = () => {
    const { zoomXMin, zoomXMax } = this.state;
    return zoomXMin !== null || zoomXMax !== null;
  };

  // Check if a treatment class is Standard of Care (for hollow points)
  isStandardOfCare = (d) => {
    return SOC_CLASSES.includes(d.treatmentClass);
  };

  getPlotData = () => {
    const { trials, outcomeType } = this.props;

    // Return cached data if inputs haven't changed
    if (this.cachedPlotData && this.lastTrials === trials && this.lastOutcomeType === outcomeType) {
      return this.cachedPlotData;
    }

    const points = [];

    trials.forEach((trial) => {
      const completionDate = trial.completion_date;
      if (!completionDate) return;

      const year = this.parseCompletionYear(completionDate);
      if (!year || isNaN(year)) return;

      const outcomes = (trial.outcomes || []).filter((o) => o.outcome_type === outcomeType);
      if (outcomes.length === 0) return;

      outcomes.forEach((outcome) => {
        const value = parseFloat(outcome.value);
        if (isNaN(value)) return;

        const armTitle = outcome.arm_title || "";
        const treatmentClass = trial.treatment_class_map?.[armTitle] || "OTHER";

        points.push({
          x: year,
          y: value,
          trial,
          outcome,
          treatmentClass,
          armTitle,
          nctId: trial.nct_id,
          ciLower: outcome.ci_lower,
          ciUpper: outcome.ci_upper,
        });
      });
    });

    // Cache the results
    this.cachedPlotData = points;
    this.lastTrials = trials;
    this.lastOutcomeType = outcomeType;

    return points;
  };

  parseCompletionYear = (dateStr) => {
    if (!dateStr) return null;
    // Year only: add small random offset to spread points
    if (dateStr.match(/^\d{4}$/)) {
      return parseInt(dateStr, 10) + 0.5;
    }
    // Year-month: convert to decimal year
    if (dateStr.match(/^\d{4}-\d{2}$/)) {
      const [year, month] = dateStr.split("-");
      return parseInt(year, 10) + (parseInt(month, 10) - 0.5) / 12;
    }
    // Full date: convert to precise decimal year
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [year, month, day] = dateStr.split("-");
      const monthDecimal = (parseInt(month, 10) - 1) / 12;
      const dayDecimal = (parseInt(day, 10) - 1) / 365;
      return parseInt(year, 10) + monthDecimal + dayDecimal;
    }
    return null;
  };

  getScales = (points) => {
    const { containerWidth, zoomXMin, zoomXMax } = this.state;
    const { outcomeType } = this.props;
    const plotHeight = 550;
    const margins = { top: 20, right: 20, bottom: 40, left: 60 };

    const xExtent = d3.extent(points, (d) => d.x);
    const dataXMin = Math.floor(xExtent[0] || 2015) - 1;
    const dataXMax = Math.ceil(xExtent[1] || 2025) + 1;

    // Use zoomed range if available, otherwise full data range
    const visibleXMin = zoomXMin !== null ? zoomXMin : dataXMin;
    const visibleXMax = zoomXMax !== null ? zoomXMax : dataXMax;

    // Filter points to visible X range for Y-axis calculation
    const visiblePoints = points.filter((d) => d.x >= visibleXMin && d.x <= visibleXMax);
    const yExtent = visiblePoints.length > 0
      ? d3.extent(visiblePoints, (d) => d.y)
      : d3.extent(points, (d) => d.y);

    const isORR = outcomeType === "ORR";
    const yMax = isORR ? 100 : Math.min((yExtent[1] || 50) * 1.15, 220);

    const xScale = d3
      .scaleLinear()
      .domain([visibleXMin, visibleXMax])
      .range([margins.left, containerWidth - margins.right]);

    const yScale = d3
      .scaleLinear()
      .domain([0, yMax])
      .range([plotHeight - margins.bottom, margins.top])
      .nice();

    return { xScale, yScale, plotHeight, margins };
  };

  colorAccessor = (d) => d.treatmentClass;

  colorScale = (treatmentClass) => {
    return TREATMENT_COLORS[treatmentClass] || TREATMENT_COLORS["OTHER"];
  };

  tooltipAccessor = (d) => {
    const { outcomeType } = this.props;
    return [
      { label: "NCT ID", value: d.nctId },
      { label: "Title", value: d.trial.brief_title?.substring(0, 40) + "..." },
      { label: "Arm", value: d.armTitle },
      { label: outcomeType, value: `${d.y} ${d.outcome.unit || "mo"}` },
      { label: "CI", value: `[${d.ciLower || "N/A"}, ${d.ciUpper || "N/A"}]` },
      { label: "Treatment", value: d.treatmentClass },
    ];
  };

  handlePointClick = (point) => {
    const { onTrialClick } = this.props;
    if (onTrialClick) {
      onTrialClick(point.trial, point.outcome);
    }
  };

  groupByTreatmentClass = (points) => {
    const groups = {};
    points.forEach((p) => {
      if (!groups[p.treatmentClass]) {
        groups[p.treatmentClass] = [];
      }
      groups[p.treatmentClass].push(p);
    });
    return groups;
  };

  renderLegend = () => {
    const points = this.getPlotData();
    const groups = this.groupByTreatmentClass(points);
    const color = (className) => TREATMENT_COLORS[className] || "#7F8C8D";

    return Object.keys(groups).sort().map((className) => {
      const isSoC = SOC_CLASSES.includes(className);
      return (
        <div key={className} style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
          <div
            style={{
              width: 12,
              height: 12,
              backgroundColor: isSoC ? "transparent" : color(className),
              marginRight: 8,
              borderRadius: "50%",
              border: isSoC ? `2px solid ${color(className)}` : "none",
            }}
          />
          <Text style={{ fontSize: 12 }}>{className}{isSoC ? " (SoC)" : ""}</Text>
        </div>
      );
    });
  };

  renderAxes = (xScale, yScale, plotHeight, margins) => {
    const { outcomeType } = this.props;
    const { containerWidth } = this.state;

    const xTicks = xScale.ticks(8);
    const yTicks = yScale.ticks(8);

    const isORR = outcomeType === "ORR";
    const yLabel = isORR ? `${outcomeType} (%)` : `${outcomeType} (months)`;

    return (
      <svg
        width={containerWidth}
        height={plotHeight}
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
      >
        {xTicks.map((tick) => (
          <g key={`x-${tick}`} transform={`translate(${xScale(tick)}, ${plotHeight - margins.bottom})`}>
            <line y2="6" stroke="#000" />
            <text y="20" textAnchor="middle" style={{ fontSize: 11 }}>
              {Math.floor(tick)}
            </text>
          </g>
        ))}
        <text
          x={containerWidth / 2}
          y={plotHeight - 5}
          textAnchor="middle"
          style={{ fontSize: 12 }}
        >
          Completion Year
        </text>

        {yTicks.map((tick) => (
          <g key={`y-${tick}`} transform={`translate(${margins.left}, ${yScale(tick)})`}>
            <line x2="-6" stroke="#000" />
            <text x="-10" dy="0.32em" textAnchor="end" style={{ fontSize: 11 }}>
              {tick}
            </text>
          </g>
        ))}
        <text
          transform={`translate(15, ${plotHeight / 2}) rotate(-90)`}
          textAnchor="middle"
          style={{ fontSize: 12 }}
        >
          {yLabel}
        </text>

        <line
          x1={margins.left}
          y1={plotHeight - margins.bottom}
          x2={containerWidth - margins.right}
          y2={plotHeight - margins.bottom}
          stroke="#000"
        />
        <line
          x1={margins.left}
          y1={margins.top}
          x2={margins.left}
          y2={plotHeight - margins.bottom}
          stroke="#000"
        />
      </svg>
    );
  };

  render() {
    const { containerWidth } = this.state;

    // Wait for container width to be measured
    if (containerWidth === null) {
      return (
        <div ref={this.containerRef} style={{ display: "flex", gap: 16, width: "100%" }}>
          <div style={{ flex: 1, minWidth: 0 }} />
          <div style={{ width: 200 }} />
        </div>
      );
    }

    const points = this.getPlotData();
    const { xScale, yScale, plotHeight, margins } = this.getScales(points);
    const isZoomed = this.isZoomed();

    // Clip bounds for the plot area (inside the axes)
    const clipBounds = {
      x: margins.left,
      y: margins.top,
      width: containerWidth - margins.left - margins.right,
      height: plotHeight - margins.top - margins.bottom,
    };

    return (
      <div ref={this.containerRef} style={{ display: "flex", gap: 16, width: "100%" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {isZoomed && (
            <div style={{ marginBottom: 8 }}>
              <Button
                size="small"
                icon={<ZoomOutOutlined />}
                onClick={this.handleResetZoom}
              >
                Reset Zoom
              </Button>
            </div>
          )}
          <div style={{ position: "relative", height: plotHeight }}>
            {this.renderAxes(xScale, yScale, plotHeight, margins)}
            <KonvaScatter
              data={points}
              width={containerWidth}
              height={plotHeight}
              xAccessor="x"
              yAccessor="y"
              xScale={xScale}
              yScale={yScale}
              colorAccessor={this.colorAccessor}
              colorScale={this.colorScale}
              radiusAccessor={6}
              tooltipAccessor={this.tooltipAccessor}
              onPointClick={this.handlePointClick}
              idAccessor={(d) => `${d.nctId}-${d.armTitle}`}
              ciLowerAccessor="ciLower"
              ciUpperAccessor="ciUpper"
              showErrorBars={true}
              groupAccessor="nctId"
              fadeOnHover={true}
              hollowAccessor={this.isStandardOfCare}
              clipBounds={clipBounds}
              enableZoom={true}
              enablePan={true}
              onZoomChange={this.handleZoomChange}
            />
          </div>
          <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: "block" }}>
            Scroll to zoom, drag to pan
          </Text>
        </div>
        <div style={{ width: 200, flexShrink: 0 }}>
          <Text strong style={{ marginBottom: 8, display: "block" }}>
            Legend
          </Text>
          {this.renderLegend()}
        </div>
      </div>
    );
  }
}

export default TrialsPlotView;
