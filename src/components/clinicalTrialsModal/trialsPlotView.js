import React, { Component } from "react";
import { Typography, Button } from "antd";
import { ZoomOutOutlined } from "@ant-design/icons";
import * as d3 from "d3";
import KonvaScatter from "../konvaScatter";
import { TREATMENT_COLORS, PLOT_CONFIG } from "./constants";
import { isStandardOfCareTreatment, collectTrialPoints } from "./trialDataUtils";
import TrialsPlotLegend from "./trialsPlotLegend";
import TrialsPlotAxes from "./trialsPlotAxes";

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
    this.lastSocDisplayMode = null;
    this.lastCancerTypeFilters = null;
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
      const width = this.containerRef.current.offsetWidth - PLOT_CONFIG.CONTAINER_OFFSET;
      this.setState({ containerWidth: Math.max(width, PLOT_CONFIG.MIN_WIDTH) });
    }
  };

  // Memoized data extent - only recalculates when data-affecting props change
  getDataXExtent = () => {
    const { trials, outcomeType, allTrials, socDisplayMode, cancerTypeFilters } = this.props;

    // Use cached extent if data hasn't changed
    if (
      this.cachedDataExtent &&
      this.lastTrials === trials &&
      this.lastOutcomeType === outcomeType &&
      this.lastAllTrials === allTrials &&
      this.lastSocDisplayMode === socDisplayMode &&
      this.lastCancerTypeFilters === cancerTypeFilters
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
    const minRange = PLOT_CONFIG.MIN_ZOOM_MONTHS;
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
    return isStandardOfCareTreatment(d.treatmentClass);
  };

  getPlotData = () => {
    const { trials, outcomeType, allTrials, socDisplayMode, cancerTypeFilters } = this.props;

    // Return cached data if inputs haven't changed
    if (
      this.cachedPlotData &&
      this.lastTrials === trials &&
      this.lastOutcomeType === outcomeType &&
      this.lastAllTrials === allTrials &&
      this.lastSocDisplayMode === socDisplayMode &&
      this.lastCancerTypeFilters === cancerTypeFilters
    ) {
      return this.cachedPlotData;
    }

    const allPoints = collectTrialPoints(trials, outcomeType, {
      allTrials,
      socDisplayMode,
      cancerTypeFilters,
      excludeAdjuvant: true,
    });

    // Cache the results
    this.cachedPlotData = allPoints;
    this.lastTrials = trials;
    this.lastOutcomeType = outcomeType;
    this.lastAllTrials = allTrials;
    this.lastSocDisplayMode = socDisplayMode;
    this.lastCancerTypeFilters = cancerTypeFilters;
    // Clear data extent cache so it recalculates with fresh data
    this.cachedDataExtent = null;

    return allPoints;
  };

  getScales = (points) => {
    const { containerWidth, zoomXMin, zoomXMax } = this.state;
    const { outcomeType } = this.props;
    const plotHeight = PLOT_CONFIG.HEIGHT;
    const margins = PLOT_CONFIG.MARGINS;

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
    const yMax = isORR ? 100 : (yExtent[1] || 50) * PLOT_CONFIG.Y_AXIS_PADDING;

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
        <div style={{ flex: 1, minWidth: 0, paddingLeft: 48 }}>
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
          <div style={{ position: "relative", height: plotHeight, overflow: "visible" }}>
            <TrialsPlotAxes
              xScale={xScale}
              yScale={yScale}
              containerWidth={containerWidth}
              outcomeType={this.props.outcomeType}
              availableOutcomes={this.props.availableOutcomes}
              onOutcomeChange={this.props.onOutcomeChange}
            />
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
              minZoomRange={PLOT_CONFIG.MIN_ZOOM_MONTHS}
            />
          </div>
          <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: "block" }}>
            Scroll to zoom, drag to pan
          </Text>
        </div>
        <TrialsPlotLegend points={points} />
      </div>
    );
  }
}

export default TrialsPlotView;
