import React, { Component } from "react";
import { Card, Space, Typography, Button } from "antd";
import * as d3 from "d3";
import KonvaScatter from "../konvaScatter";
import { TREATMENT_COLORS, SOC_CLASSES } from "./constants";

const { Text, Link } = Typography;

class TrialsPlotView extends Component {
  constructor(props) {
    super(props);
    this.state = {
      selectedTrial: null,
      containerWidth: 900,
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
      const width = this.containerRef.current.offsetWidth - 220;
      this.setState({ containerWidth: Math.max(width, 400) });
    }
  };

  getPlotData = () => {
    const { trials, outcomeType } = this.props;
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

    return points;
  };

  parseCompletionYear = (dateStr) => {
    if (!dateStr) return null;
    if (dateStr.match(/^\d{4}$/)) {
      return parseInt(dateStr, 10);
    }
    if (dateStr.match(/^\d{4}-\d{2}$/)) {
      return parseInt(dateStr.split("-")[0], 10);
    }
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [year, month] = dateStr.split("-");
      return parseInt(year, 10) + (parseInt(month, 10) - 1) / 12;
    }
    return null;
  };

  getScales = (points) => {
    const { containerWidth } = this.state;
    const { outcomeType } = this.props;
    const plotHeight = 550;
    const margins = { top: 20, right: 20, bottom: 40, left: 60 };

    const xExtent = d3.extent(points, (d) => d.x);
    const yExtent = d3.extent(points, (d) => d.y);

    const isORR = outcomeType === "ORR";
    const yMax = isORR ? 100 : Math.min((yExtent[1] || 50) * 1.15, 220);

    const xScale = d3
      .scaleLinear()
      .domain([Math.floor(xExtent[0] || 2015) - 1, Math.ceil(xExtent[1] || 2025) + 1])
      .range([margins.left, containerWidth - margins.right])
      .nice();

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
    this.setState({ selectedTrial: { trial: point.trial, outcome: point.outcome } });
  };

  handleCloseDetails = () => {
    this.setState({ selectedTrial: null });
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

    return Object.keys(groups).sort().map((className) => (
      <div key={className} style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
        <div
          style={{
            width: 12,
            height: 12,
            backgroundColor: TREATMENT_COLORS[className] || "#7F8C8D",
            marginRight: 8,
            borderRadius: 2,
            border: SOC_CLASSES.includes(className) ? "2px dashed " + TREATMENT_COLORS[className] : "none",
          }}
        />
        <Text style={{ fontSize: 12 }}>{className}</Text>
      </div>
    ));
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
    const { selectedTrial, containerWidth } = this.state;
    const points = this.getPlotData();
    const { xScale, yScale, plotHeight, margins } = this.getScales(points);

    return (
      <div ref={this.containerRef} style={{ display: "flex", gap: 16 }}>
        <div style={{ flex: 1 }}>
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
            />
          </div>
        </div>
        <div style={{ width: 200 }}>
          <Text strong style={{ marginBottom: 8, display: "block" }}>
            Legend
          </Text>
          {this.renderLegend()}
        </div>
        {selectedTrial && (
          <Card
            size="small"
            style={{ width: 320, position: "absolute", right: 240, top: 60 }}
            title={selectedTrial.trial.nct_id}
            extra={<Button type="text" size="small" onClick={this.handleCloseDetails}>×</Button>}
          >
            <Space direction="vertical" size="small">
              <Text strong>{selectedTrial.trial.brief_title}</Text>
              <Text>Phase: {selectedTrial.trial.phase}</Text>
              <Text>Status: {selectedTrial.trial.status}</Text>
              <Text>Sponsor: {selectedTrial.trial.sponsor}</Text>
              <Link href={selectedTrial.trial.url} target="_blank">
                View on ClinicalTrials.gov
              </Link>
            </Space>
          </Card>
        )}
      </div>
    );
  }
}

export default TrialsPlotView;
