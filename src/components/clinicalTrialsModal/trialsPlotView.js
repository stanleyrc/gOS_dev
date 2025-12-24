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
    this.lastAllTrials = null;
    this.lastShowSocAlways = null;
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

  // Memoized data extent - only recalculates when data-affecting props change
  getDataXExtent = () => {
    const { trials, outcomeType, allTrials, showSocAlways } = this.props;

    // Use cached extent if data hasn't changed
    if (
      this.cachedDataExtent &&
      this.lastTrials === trials &&
      this.lastOutcomeType === outcomeType &&
      this.lastAllTrials === allTrials &&
      this.lastShowSocAlways === showSocAlways
    ) {
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

  // Validate outcome unit based on outcome type
  isValidOutcome = (outcome, outcomeType) => {
    if (outcome.value == null) return false;

    const unitLower = (outcome.unit || "").toLowerCase();

    // For ORR: accept percentage/proportion units
    if (outcomeType === "ORR") {
      return ["percent", "proportion", "participant", "patient", "probability", "rate", "%"].some(
        (w) => unitLower.includes(w)
      );
    }

    // For PFS/OS: reject percentage/proportion units, require time units
    if (outcomeType === "PFS" || outcomeType === "OS") {
      // Reject non-time units
      if (
        unitLower.includes("percent") ||
        unitLower.includes("proportion") ||
        unitLower.includes("participant") ||
        unitLower.includes("patient") ||
        unitLower.includes("probability") ||
        unitLower.includes("rate") ||
        unitLower.includes("%")
      ) {
        return false;
      }

      // Require time units
      const isTimeUnit =
        unitLower.includes("month") ||
        unitLower.includes("day") ||
        unitLower.includes("week") ||
        unitLower.includes("year");
      return isTimeUnit;
    }

    return false;
  };

  // Normalize time values to months (for PFS/OS)
  normalizeToMonths = (value, unit) => {
    if (value == null || value === undefined) return null;
    if (!unit) return value;

    const unitLower = unit.toLowerCase().trim();

    // Already in months
    if (unitLower.includes("month")) return value;

    // Convert from days
    if (unitLower.includes("day")) return value / 30.44;

    // Convert from weeks
    if (unitLower.includes("week")) return value / 4.33;

    // Convert from years
    if (unitLower.includes("year")) return value * 12;

    // Unknown unit, return as-is
    return value;
  };

  // Create a unique key for a point to avoid duplicates
  createPointKey = (trial, outcome) => {
    return `${trial.nct_id}|${outcome.arm_title}|${outcome.outcome_type}`;
  };

  // Create a point object from trial and outcome
  createPoint = (trial, outcome, isORR) => {
    const rawValue = parseFloat(outcome.value);
    if (isNaN(rawValue)) return null;

    const value = isORR ? rawValue : this.normalizeToMonths(rawValue, outcome.unit);
    const ciLower = isORR ? outcome.ci_lower : this.normalizeToMonths(outcome.ci_lower, outcome.unit);
    const ciUpper = isORR ? outcome.ci_upper : this.normalizeToMonths(outcome.ci_upper, outcome.unit);

    // Skip negative values after normalization
    if (value < 0) return null;

    const year = this.parseCompletionYear(trial.completion_date);
    if (!year || isNaN(year)) return null;

    const armTitle = outcome.arm_title || "";
    const treatmentClass = trial.treatment_class_map?.[armTitle] || "OTHER";

    return {
      x: year,
      y: value,
      trial,
      outcome,
      treatmentClass,
      armTitle,
      nctId: trial.nct_id,
      ciLower: ciLower != null && ciLower >= 0 ? ciLower : null,
      ciUpper: ciUpper != null && ciUpper >= 0 ? ciUpper : null,
    };
  };

  getPlotData = () => {
    const { trials, outcomeType, allTrials, showSocAlways } = this.props;

    // Return cached data if inputs haven't changed
    if (
      this.cachedPlotData &&
      this.lastTrials === trials &&
      this.lastOutcomeType === outcomeType &&
      this.lastAllTrials === allTrials &&
      this.lastShowSocAlways === showSocAlways
    ) {
      return this.cachedPlotData;
    }

    const points = [];
    const socPoints = [];
    const addedSocKeys = new Set();
    const isORR = outcomeType === "ORR";

    // If showSocAlways is enabled, first collect ALL SoC points from all trials
    if (showSocAlways && allTrials) {
      allTrials.forEach((trial) => {
        // Skip adjuvant and neoadjuvant trials for SoC comparison
        if (trial.line_of_therapy === "ADJUVANT" || trial.line_of_therapy === "NEOADJUVANT") {
          return;
        }

        const completionDate = trial.completion_date;
        if (!completionDate) return;

        const validOutcomes = (trial.outcomes || []).filter(
          (o) => o.outcome_type === outcomeType && this.isValidOutcome(o, outcomeType)
        );
        if (validOutcomes.length === 0) return;

        validOutcomes.forEach((outcome) => {
          const armTitle = outcome.arm_title || "";
          const treatmentClass = trial.treatment_class_map?.[armTitle] || "OTHER";

          // Only include SoC points
          if (!this.isStandardOfCare({ treatmentClass })) return;

          const key = this.createPointKey(trial, outcome);
          addedSocKeys.add(key);

          const point = this.createPoint(trial, outcome, isORR);
          if (point) {
            socPoints.push(point);
          }
        });
      });
    }

    // Add points from filtered trials (normal filtering)
    trials.forEach((trial) => {
      const completionDate = trial.completion_date;
      if (!completionDate) return;

      const year = this.parseCompletionYear(completionDate);
      if (!year || isNaN(year)) return;

      // Filter outcomes by type AND valid units
      const outcomes = (trial.outcomes || []).filter(
        (o) => o.outcome_type === outcomeType && this.isValidOutcome(o, outcomeType)
      );
      if (outcomes.length === 0) return;

      outcomes.forEach((outcome) => {
        const key = this.createPointKey(trial, outcome);

        // Skip if already added as SoC point
        if (addedSocKeys.has(key)) return;

        const point = this.createPoint(trial, outcome, isORR);
        if (point) {
          points.push(point);
        }
      });
    });

    // Merge SoC points with filtered points
    const allPoints = showSocAlways ? [...socPoints, ...points] : points;

    // Cache the results
    this.cachedPlotData = allPoints;
    this.lastTrials = trials;
    this.lastOutcomeType = outcomeType;
    this.lastAllTrials = allTrials;
    this.lastShowSocAlways = showSocAlways;

    return allPoints;
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
    const pointsForExtent = visiblePoints.length > 0 ? visiblePoints : points;

    // Calculate y extent including CI upper bounds (not just point values)
    const yValues = pointsForExtent.flatMap((d) => {
      const vals = [d.y];
      if (d.ciUpper != null && !isNaN(d.ciUpper)) vals.push(d.ciUpper);
      return vals;
    });
    const yExtent = d3.extent(yValues);

    const isORR = outcomeType === "ORR";
    const yMax = isORR ? 100 : (yExtent[1] || 50) * 1.15;

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

    // Generate only integer year ticks (like Chart.js afterBuildTicks)
    // When zoomed in past a single year, no ticks will be shown
    const [xMin, xMax] = xScale.domain();
    const xTicks = [];
    const startYear = Math.ceil(xMin);
    const endYear = Math.floor(xMax);
    for (let year = startYear; year <= endYear; year++) {
      xTicks.push(year);
    }

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
              {tick}
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
              zoomLimits={this.getDataXExtent()}
              minZoomRange={1 / 12}
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
