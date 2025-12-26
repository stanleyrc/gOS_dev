import React, { Component } from "react";
import { Typography, Button } from "antd";
import { ZoomOutOutlined } from "@ant-design/icons";
import * as d3 from "d3";
import KonvaScatter from "../konvaScatter";
import {
  TREATMENT_COLORS,
  PLOT_CONFIG,
  LINE_OF_THERAPY_COLORS,
  STATUS_COLORS,
  CANCER_TYPE_COLORS,
  STAGE_COLORS,
  getColorForValue,
} from "./constants";
import { isStandardOfCareTreatment, collectTrialPointsDualAxis } from "./trialDataUtils";
import { AXIS_TYPE_TIME } from "./constants";
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
      // Color-by state for legend grouping
      colorBy: 'treatmentClass',
    };
    this.containerRef = React.createRef();
    // Cache for computed data
    this.cachedPlotData = null;
    this.cachedDataExtent = null;
    this.lastTrials = null;
    this.lastXAxisType = null;
    this.lastYAxisType = null;
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
    const { trials, xAxisType, yAxisType, allTrials, socDisplayMode, cancerTypeFilters } = this.props;

    // Use cached extent if data hasn't changed
    if (
      this.cachedDataExtent &&
      this.lastTrials === trials &&
      this.lastXAxisType === xAxisType &&
      this.lastYAxisType === yAxisType &&
      this.lastAllTrials === allTrials &&
      this.lastSocDisplayMode === socDisplayMode &&
      this.lastCancerTypeFilters === cancerTypeFilters
    ) {
      return this.cachedDataExtent;
    }

    const points = this.getPlotData();
    const xExtent = d3.extent(points, (d) => d.x);

    if (xAxisType === AXIS_TYPE_TIME) {
      this.cachedDataExtent = [Math.floor(xExtent[0] || 2015) - 1, Math.ceil(xExtent[1] || 2025) + 1];
    } else {
      // For outcome axes, start at 0
      const xMax = xAxisType === 'ORR' ? 100 : (xExtent[1] || 50) * PLOT_CONFIG.Y_AXIS_PADDING;
      this.cachedDataExtent = [0, xMax];
    }
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
    const { trials, xAxisType, yAxisType, allTrials, socDisplayMode, cancerTypeFilters } = this.props;

    // Return cached data if inputs haven't changed
    if (
      this.cachedPlotData &&
      this.lastTrials === trials &&
      this.lastXAxisType === xAxisType &&
      this.lastYAxisType === yAxisType &&
      this.lastAllTrials === allTrials &&
      this.lastSocDisplayMode === socDisplayMode &&
      this.lastCancerTypeFilters === cancerTypeFilters
    ) {
      return this.cachedPlotData;
    }

    const allPoints = collectTrialPointsDualAxis(trials, xAxisType, yAxisType, {
      allTrials,
      socDisplayMode,
      cancerTypeFilters,
      excludeAdjuvant: true,
    });

    // Cache the results
    this.cachedPlotData = allPoints;
    this.lastTrials = trials;
    this.lastXAxisType = xAxisType;
    this.lastYAxisType = yAxisType;
    this.lastAllTrials = allTrials;
    this.lastSocDisplayMode = socDisplayMode;
    this.lastCancerTypeFilters = cancerTypeFilters;
    // Clear data extent cache so it recalculates with fresh data
    this.cachedDataExtent = null;

    return allPoints;
  };

  getScales = (points) => {
    const { containerWidth, zoomXMin, zoomXMax } = this.state;
    const { xAxisType, yAxisType } = this.props;
    const plotHeight = PLOT_CONFIG.HEIGHT;
    const margins = PLOT_CONFIG.MARGINS;

    // X-axis domain calculation
    let dataXMin, dataXMax;
    if (xAxisType === AXIS_TYPE_TIME) {
      const xExtent = d3.extent(points, (d) => d.x);
      dataXMin = Math.floor(xExtent[0] || 2015) - 1;
      dataXMax = Math.ceil(xExtent[1] || 2025) + 1;
    } else {
      // Outcome axis
      const xExtent = d3.extent(points, (d) => d.x);
      dataXMin = 0;
      dataXMax = xAxisType === 'ORR' ? 100 : (xExtent[1] || 50) * PLOT_CONFIG.Y_AXIS_PADDING;
    }

    // Use zoomed range if available, otherwise full data range
    const visibleXMin = zoomXMin !== null ? zoomXMin : dataXMin;
    const visibleXMax = zoomXMax !== null ? zoomXMax : dataXMax;

    // Filter points to visible X range for Y-axis calculation
    const visiblePoints = points.filter((d) => d.x >= visibleXMin && d.x <= visibleXMax);
    const pointsForExtent = visiblePoints.length > 0 ? visiblePoints : points;

    // Calculate y extent - include CI upper bounds only when showing error bars (X=Time)
    const yValues = pointsForExtent.flatMap((d) => {
      const vals = [d.y];
      if (xAxisType === AXIS_TYPE_TIME && d.ciUpper != null && !isNaN(d.ciUpper)) {
        vals.push(d.ciUpper);
      }
      return vals;
    });
    const yExtent = d3.extent(yValues);

    const isYORR = yAxisType === 'ORR';
    const yMax = isYORR ? 100 : (yExtent[1] || 50) * PLOT_CONFIG.Y_AXIS_PADDING;

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

  handleColorByChange = (colorBy) => {
    this.setState({ colorBy });
  };

  getColorValue = (d) => {
    const { colorBy } = this.state;
    switch (colorBy) {
      case 'treatmentClass':
        return d.treatmentClass;
      case 'line':
        return d.trial.line_of_therapy || 'OTHER';
      case 'cancerType':
        return (d.trial.cancer_types || [])[0] || 'OTHER';
      case 'stage':
        return (d.trial.cancer_stages || [])[0] || 'OTHER';
      case 'status':
        return d.trial.status || 'OTHER';
      default:
        return d.treatmentClass;
    }
  };

  colorAccessor = (d) => this.getColorValue(d);

  colorScale = (value) => {
    const { colorBy } = this.state;
    const colorMaps = {
      treatmentClass: TREATMENT_COLORS,
      line: LINE_OF_THERAPY_COLORS,
      cancerType: CANCER_TYPE_COLORS,
      stage: STAGE_COLORS,
      status: STATUS_COLORS,
    };
    const colorMap = colorMaps[colorBy] || TREATMENT_COLORS;
    return getColorForValue(value, colorMap);
  };

  tooltipAccessor = (d) => {
    const { xAxisType, yAxisType } = this.props;
    const isTimeX = xAxisType === AXIS_TYPE_TIME;

    const items = [
      { label: "NCT ID", value: d.nctId },
      { label: "Title", value: d.trial.brief_title?.substring(0, 40) + "..." },
      { label: "Arm", value: d.armTitle },
    ];

    if (isTimeX) {
      items.push(
        { label: yAxisType, value: `${d.y.toFixed(1)} ${d.outcome?.unit || "mo"}` },
        { label: "CI", value: `[${d.ciLower?.toFixed(1) || "N/A"}, ${d.ciUpper?.toFixed(1) || "N/A"}]` }
      );
    } else {
      items.push(
        { label: xAxisType, value: `${d.x.toFixed(1)} ${d.xOutcome?.unit || "mo"}` },
        { label: yAxisType, value: `${d.y.toFixed(1)} ${d.yOutcome?.unit || "mo"}` }
      );
    }

    items.push({ label: "Treatment", value: d.treatmentClass });
    return items;
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
      <div ref={this.containerRef} style={{ width: "100%" }}>
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
        {/* Row 1: Y-dropdown | Plot | Legend */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Y-axis dropdown (rotated) */}
          <div style={{ width: 32, display: "flex", justifyContent: "center", alignItems: "center" }}>
            <div style={{ transform: "rotate(-90deg)", whiteSpace: "nowrap" }}>
              <TrialsPlotAxes
                axis="y"
                axisType={this.props.yAxisType}
                availableOutcomes={this.props.availableOutcomes}
                onAxisChange={this.props.onYAxisChange}
                otherAxisType={this.props.xAxisType}
              />
            </div>
          </div>
          {/* Plot area */}
          <div style={{ flex: 1, position: "relative", height: plotHeight }}>
            <TrialsPlotAxes
              axis="plot"
              xScale={xScale}
              yScale={yScale}
              containerWidth={containerWidth}
              xAxisType={this.props.xAxisType}
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
              colorKey={this.state.colorBy}
              radiusAccessor={6}
              tooltipAccessor={this.tooltipAccessor}
              onPointClick={this.handlePointClick}
              idAccessor={(d) => `${d.nctId}-${d.armTitle}`}
              ciLowerAccessor="ciLower"
              ciUpperAccessor="ciUpper"
              showErrorBars={this.props.xAxisType === AXIS_TYPE_TIME}
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
          {/* Legend */}
          <TrialsPlotLegend
            points={points}
            colorBy={this.state.colorBy}
            onColorByChange={this.handleColorByChange}
            colorScale={this.colorScale}
            getColorValue={this.getColorValue}
          />
        </div>
        {/* Row 2: X-axis dropdown (centered) */}
        <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
          <TrialsPlotAxes
            axis="x"
            axisType={this.props.xAxisType}
            availableOutcomes={this.props.availableOutcomes}
            onAxisChange={this.props.onXAxisChange}
            otherAxisType={this.props.yAxisType}
          />
        </div>
        <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: "block", textAlign: "center" }}>
          Scroll to zoom, drag to pan
        </Text>
      </div>
    );
  }
}

export default TrialsPlotView;
