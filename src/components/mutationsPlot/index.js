import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { connect } from "react-redux";
import { withTranslation } from "react-i18next";
import * as d3 from "d3";
import { Stage, Layer, Path } from "react-konva";
import Wrapper from "./index.style";
import { measureText, merge } from "../../helpers/utility";
import Grid from "../grid/index";
import settingsActions from "../../redux/settings/actions";

const { updateDomains, updateHoveredLocation } = settingsActions;

const margins = {
  gap: 24,
  gapX: 50,
  bar: 10,
  gapY: 24,
  yTicksCount: 10,
};

class MutationsPlot extends Component {
  constructor(props) {
    super(props);
    this.zoom = null;
    this.container = null;
    this.grid = null;
    this.konvaStage = null;
    let currentTransform = null;
    this.state = {
      currentTransform,
      showGrid: true,
      tooltip: {
        visible: false,
        shapeId: -1,
        x: -1000,
        y: -1000,
        text: "",
      },
    };
    this.updateDomains = this.props.updateDomains;
  }

  updatePanels() {
    let {
      domains,
      width,
      height,
      commonYScale,
      defaultDomain,
      genome,
      commonRangeY,
    } = this.props;
    const { intervals } = genome;
    let stageWidth = width - 2 * margins.gapX;
    let stageHeight = height - 3 * margins.gap;
    let panelWidth =
      (stageWidth - (domains.length - 1) * margins.gapX) / domains.length;
    let panelHeight = stageHeight;
    this.connections = [];
    this.panels = domains.map((domain, index) => {
      let filteredIntervals = intervals.filter(
        (d) => d.startPlace <= domain[1] && d.endPlace >= domain[0]
      );
      const xScale = d3.scaleLinear().domain(domain).range([0, panelWidth]);
      let offset = index * (panelWidth + margins.gapX);

      let domainWidth = domain[1] - domain[0];
      let range = [
        index * (panelWidth + margins.gapX),
        (index + 1) * panelWidth + index * margins.gapX,
      ];
      let scale = d3.scaleLinear().domain(domain).range(range);
      let innerScale = d3.scaleLinear().domain(domain).range([0, panelWidth]);
      let panelGenomeScale = d3
        .scaleLinear()
        .domain(defaultDomain)
        .range([0, panelWidth]);
      let zoom = d3
        .zoom()
        .scaleExtent([1, Infinity])
        .translateExtent([
          [0, 0],
          [panelWidth, panelHeight],
        ])
        .extent([
          [0, 0],
          [panelWidth, panelHeight],
        ])
        .on("zoom", (event) => this.zooming(event, index))
        .on("end", (event) => this.zoomEnded(event, index));
      let intervalMax = d3.max(filteredIntervals, (d) => d.y);
      let offsetPerc = 2;
      let yScale = commonRangeY
        ? d3
            .scaleLinear()
            .domain(commonRangeY)
            .range([panelHeight, 0])
            .clamp(true)
        : d3
            .scaleLinear()
            .domain([0, intervalMax + offsetPerc])
            .range([panelHeight, 0])
            .nice();
      let panel = {
        index,
        zoom,
        domain,
        panelWidth,
        panelHeight,
        xScale,
        yScale,
        panelGenomeScale,
        offset,
        intervals: filteredIntervals.sort((a, b) =>
          d3.ascending(a.weight, b.weight)
        ),
        domainWidth,
        range,
        scale,
        innerScale,
      };
      return panel;
    });

    if (commonYScale) {
      let extent = d3.extent(this.panels.map((d) => d.yScale.domain()).flat());
      let commonYScale = d3
        .scaleLinear()
        .domain(extent)
        .range([panelHeight, 0])
        .clamp(true)
        .nice();
      this.panels.forEach((d) => {
        d.yScale = commonYScale;
      });
    }
  }

  shouldComponentUpdate(nextProps, nextState) {
    return (
      nextProps.genome.toString() !== this.props.genome.toString() ||
      nextProps.domains.toString() !== this.props.domains.toString() ||
      nextState.tooltip.shapeId !== this.state.tooltip.shapeId ||
      nextProps.width !== this.props.width ||
      nextProps.height !== this.props.height ||
      nextProps.hoveredLocation !== this.props.hoveredLocation ||
      nextProps.hoveredLocationPanelIndex !==
        this.props.hoveredLocationPanelIndex ||
      nextProps.commonYScale !== this.props.commonYScale ||
      nextProps.commonRangeY !== this.props.commonRangeY
    );
  }

  componentDidMount() {
    const { domains, zoomedByCmd } = this.props;
    this.panels.forEach((panel, index) => {
      let domain = domains[index];
      var s = [
        panel.panelGenomeScale(domain[0]),
        panel.panelGenomeScale(domain[1]),
      ];
      d3.select(this.container)
        .select(`#panel-rect-${index}`)
        .attr("preserveAspectRatio", "xMinYMin meet")
        .call(
          panel.zoom.filter(
            (event) => !zoomedByCmd || (!event.button && event.metaKey)
          )
        );
      d3.select(this.container)
        .select(`#panel-rect-${index}`)
        .call(
          panel.zoom.filter(
            (event) => !zoomedByCmd || (!event.button && event.metaKey)
          ).transform,
          d3.zoomIdentity
            .scale(panel.panelWidth / (s[1] - s[0]))
            .translate(-s[0], 0)
        );
    });
  }

  componentDidUpdate() {
    const {
      domains,
      hoveredLocationPanelIndex,
      hoveredLocation,
      chromoBins,
      zoomedByCmd,
    } = this.props;
    this.panels.forEach((panel, index) => {
      let domain = domains[index];
      var s = [
        panel.panelGenomeScale(domain[0]),
        panel.panelGenomeScale(domain[1]),
      ];
      d3.select(this.container)
        .select(`#panel-rect-${index}`)
        .attr("preserveAspectRatio", "xMinYMin meet")
        .call(
          panel.zoom.filter(
            (event) => !zoomedByCmd || (!event.button && event.metaKey)
          )
        );
      d3.select(this.container)
        .select(`#panel-rect-${index}`)
        .call(
          panel.zoom.filter(
            (event) => !zoomedByCmd || (!event.button && event.metaKey)
          ).transform,
          d3.zoomIdentity
            .scale(panel.panelWidth / (s[1] - s[0]))
            .translate(-s[0], 0)
        );
    });

    if (this.panels[hoveredLocationPanelIndex]) {
      d3.select(this.container)
        .select(`#hovered-location-line-${hoveredLocationPanelIndex}`)
        .classed("hidden", !hoveredLocation)
        .attr(
          "transform",
          `translate(${[
            this.panels[hoveredLocationPanelIndex].xScale(hoveredLocation) ||
              -10000,
            0,
          ]})`
        );
      d3.select(this.container)
        .select(`#hovered-location-text-${hoveredLocationPanelIndex}`)
        .attr(
          "x",
          this.panels[hoveredLocationPanelIndex].xScale(hoveredLocation) ||
            -10000
        )
        .text(
          Object.values(chromoBins)
            .filter(
              (chromo) =>
                hoveredLocation < chromo.endPlace &&
                hoveredLocation >= chromo.startPlace
            )
            .map((chromo) =>
              d3.format(",")(
                Math.floor(chromo.scaleToGenome.invert(hoveredLocation))
              )
            )
        );
    }
  }

  zooming(event, index) {
    let panel = this.panels[index];
    let newDomain = event.transform
      .rescaleX(panel.panelGenomeScale)
      .domain()
      .map(Math.round);
    let newDomains = [...this.props.domains];
    let selection = Object.assign([], newDomain);

    let otherSelections = this.props.domains.filter((d, i) => i !== index);
    let lowerEdge = d3.max(
      otherSelections
        .filter(
          (d, i) => selection && d[0] <= selection[0] && selection[0] <= d[1]
        )
        .map((d, i) => d[1])
    );

    // calculate the upper allowed selection edge this brush can move
    let upperEdge = d3.min(
      otherSelections
        .filter(
          (d, i) => selection && d[1] >= selection[0] && selection[1] <= d[1]
        )
        .map((d, i) => d[0])
    );

    // if there is an upper edge, then set this to be the upper bound of the current selection
    if (upperEdge !== undefined && selection[1] >= upperEdge) {
      selection[1] = upperEdge;
      selection[0] = d3.min([selection[0], upperEdge - 1]);
    }

    // if there is a lower edge, then set this to the be the lower bound of the current selection
    if (lowerEdge !== undefined && selection[0] <= lowerEdge) {
      selection[0] = lowerEdge;
      selection[1] = d3.max([selection[1], lowerEdge + 1]);
    }

    newDomains[index] = selection;

    if (newDomains.toString() !== this.props.domains.toString()) {
      this.setState({ domains: newDomains }, () => {
        this.updateDomains(newDomains);
      });
    }
  }

  zoomEnded(event, index) {
    this.zooming(event, index);
  }

  handleMouseMove = (e) => {
    const { width, height, genome } = this.props;
    const { intervals } = genome;

    // Check if it's a Konva event (for path elements)
    let primaryKey, shapeClass, shapeType;
    if (e.target?.attrs) {
      // Konva event
      primaryKey = e.target.attrs.id;
      shapeType = e.target.attrs.type;
      shapeClass = e.target.attrs.className;
    } else if (e.target) {
      // SVG event
      primaryKey = d3.select(e.target).attr("id");
      shapeClass = d3.select(e.target).attr("class");
      shapeType = d3.select(e.target).attr("type");
    }

    let shape = null;
    if (primaryKey && shapeClass !== "zoom-background") {
      if (shapeType === "interval") {
        shape = intervals.find((e) => e.primaryKey === primaryKey);
      }
      if (shape) {
        // Get position - works for both SVG and Konva
        let offsetX, offsetY;
        if (e.target?.getStage) {
          // Konva event
          const pos = e.target.getStage().getPointerPosition();
          offsetX = pos.x;
          offsetY = pos.y;
        } else {
          // SVG event
          offsetX = e.nativeEvent.offsetX;
          offsetY = e.nativeEvent.offsetY;
        }

        let diffY = d3.min([
          0,
          height - offsetY - shape.tooltipContent.length * 16 - 12,
        ]);
        let diffX = d3.min([
          0,
          width -
            offsetX -
            d3.max(shape.tooltipContent, (d) =>
              measureText(`${d.label}: ${d.value}`, 12)
            ) -
            30,
        ]);
        this.state.tooltip.shapeId !== shape.primaryKey &&
          this.setState({
            tooltip: {
              shapeId: shape.primaryKey,
              visible: true,
              x: offsetX + diffX,
              y: offsetY + diffY,
              text: shape.tooltipContent,
            },
          });
      }
    } else {
      this.state.tooltip.visible &&
        this.setState({ tooltip: { shapeId: null, visible: false } });
    }
  };

  handleIntervalClick(panelIndex, shape, padding = 1000) {
    // center this interval in the viewport
    let newDomains = JSON.parse(JSON.stringify(this.props.domains));
    newDomains[panelIndex] = [
      shape.startPlace - padding,
      shape.endPlace + padding,
    ];
    this.updateDomains(newDomains);
  }

  handleMutationClick(panelIndex, shape, padding = 30) {
    // center this interval in the viewport
    let newDomains = JSON.parse(JSON.stringify(this.props.domains));
    let midPoint = Math.floor((shape.startPlace + shape.endPlace) / 2);
    newDomains[panelIndex] = [midPoint - padding - 2, midPoint + padding];
    this.updateDomains(newDomains);
  }

  handlePanelMouseMove = (e, panelIndex) => {
    if (panelIndex > -1) {
      this.props.updateHoveredLocation(
        this.panels[panelIndex].xScale.invert(d3.pointer(e)[0]),
        panelIndex
      );

      // Check if there's a Konva shape at the mouse position for tooltip
      if (this.konvaStage) {
        const panel = this.panels[panelIndex];
        const pointerPos = d3.pointer(e);

        const konvaX = margins.gapX + panel.offset + pointerPos[0];
        const konvaY = margins.gap + pointerPos[1];

        const shape = this.konvaStage.getIntersection({ x: konvaX, y: konvaY });

        if (shape && shape.attrs.id && shape.attrs.type === "interval") {
          const interval = this.props.genome.intervals.find(
            (interval) => interval.primaryKey === shape.attrs.id
          );
          if (interval) {
            const diffY = d3.min([
              0,
              this.props.height -
                e.nativeEvent.offsetY -
                interval.tooltipContent.length * 16 -
                12,
            ]);
            const diffX = d3.min([
              0,
              this.props.width -
                e.nativeEvent.offsetX -
                d3.max(interval.tooltipContent, (d) =>
                  measureText(`${d.label}: ${d.value}`, 12)
                ) -
                30,
            ]);

            if (this.state.tooltip.shapeId !== interval.primaryKey) {
              this.setState({
                tooltip: {
                  shapeId: interval.primaryKey,
                  visible: true,
                  x: e.nativeEvent.offsetX + diffX,
                  y: e.nativeEvent.offsetY + diffY,
                  text: interval.tooltipContent,
                },
              });
            }
            return;
          }
        }
      }

      // No shape found, hide tooltip
      if (this.state.tooltip.visible) {
        this.setState({ tooltip: { shapeId: null, visible: false } });
      }
    }
  };

  handlePanelMouseOut = (e, panelIndex) => {
    if (panelIndex > -1) {
      this.props.updateHoveredLocation(null, panelIndex);
      // Clear tooltip when mouse leaves panel
      if (this.state.tooltip.visible) {
        this.setState({ tooltip: { shapeId: null, visible: false } });
      }
    }
  };

  handlePanelClick = (e, panelIndex) => {
    if (panelIndex > -1 && this.konvaStage) {
      const panel = this.panels[panelIndex];
      const pointerPos = d3.pointer(e);
      const konvaX = margins.gapX + panel.offset + pointerPos[0];
      const konvaY = margins.gap + pointerPos[1];

      const shape = this.konvaStage.getIntersection({ x: konvaX, y: konvaY });
      if (shape && shape.attrs.id && shape.attrs.type === "interval") {
        const interval = this.props.genome.intervals.find(
          (interval) => interval.primaryKey === shape.attrs.id
        );
        if (interval) {
          this.handleMutationClick(panelIndex, interval);
        }
      }
    }
  };

  render() {
    const { width, height, annotation, yAxisTitle, yAxis2Title, chromoBins } =
      this.props;
    const { stageWidth, stageHeight, tooltip } = this.state;
    this.updatePanels();
    let randID = Math.random();

    return (
      <Wrapper className="ant-wrapper">
        <div style={{ position: "relative" }}>
          {/* SVG layer for grid, tooltips, zoom backgrounds, etc. */}
          <svg
            width={width}
            height={height}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              pointerEvents: "none",
            }}
            ref={(elem) => (this.container = elem)}
          >
            <defs>
              <clipPath
                key={`cuttOffViewPane-${randID}`}
                id={`cuttOffViewPane-${randID}`}
              >
                <rect x={0} y={0} width={stageWidth} height={stageHeight} />
              </clipPath>
              {this.panels.map((panel, i) => (
                <clipPath
                  key={`cuttOffViewPane-${randID}-${panel.index}`}
                  id={`cuttOffViewPane-${randID}-${panel.index}`}
                >
                  <rect
                    x={0}
                    y={0}
                    width={panel.panelWidth}
                    height={2 * panel.panelHeight}
                  />
                </clipPath>
              ))}
            </defs>
            <text
              className="y-axis-title"
              transform={`translate(${[margins.gapX / 2, margins.gapY / 3]})`}
            >
              {yAxisTitle}
            </text>
            <text
              className="y-axis-title"
              transform={`translate(${[width, margins.gapY / 3]})`}
              textAnchor="end"
            >
              {yAxis2Title}
            </text>
            <g transform={`translate(${[margins.gapX, margins.gap]})`}>
              {this.panels.map((panel, i) => (
                <g
                  key={`panel-${panel.index}`}
                  id={`panel-${panel.index}`}
                  transform={`translate(${[panel.offset, 0]})`}
                >
                  <g ref={(elem) => (this.grid = elem)}>
                    <Grid
                      scaleX={panel.xScale}
                      scaleY={panel.yScale}
                      axisWidth={panel.panelWidth}
                      axisHeight={panel.panelHeight}
                      chromoBins={chromoBins}
                    />
                    <line
                      className="hovered-location-line hidden"
                      id={`hovered-location-line-${panel.index}`}
                      y1={0}
                      y2={panel.panelHeight}
                    />
                    <text
                      className="hovered-location-text"
                      id={`hovered-location-text-${panel.index}`}
                      x={-1000}
                      dx={5}
                      dy={10}
                    ></text>
                  </g>
                  <rect
                    className="zoom-background"
                    id={`panel-rect-${panel.index}`}
                    x={0.5}
                    width={panel.panelWidth}
                    height={panel.panelHeight}
                    onMouseMove={(e) => this.handlePanelMouseMove(e, i)}
                    onMouseOut={(e) => this.handlePanelMouseOut(e, i)}
                    onClick={(e) => this.handlePanelClick(e, i)}
                    style={{
                      stroke: "steelblue",
                      fill: "transparent",
                      strokeWidth: 0,
                      opacity: 0.375,
                      pointerEvents: "all",
                    }}
                  />
                </g>
              ))}
            </g>
            {tooltip.visible && (
              <g
                className="tooltip"
                transform={`translate(${[tooltip.x, tooltip.y]})`}
                pointerEvents="none"
              >
                <rect
                  x="0"
                  y="0"
                  width={d3.max(
                    tooltip.text,
                    (d) => measureText(`${d.label}: ${d.value}`, 12) + 30
                  )}
                  height={tooltip.text.length * 16 + 12}
                  rx="5"
                  ry="5"
                  fill="rgb(97, 97, 97)"
                  fillOpacity="0.67"
                />
                <text x="10" y="28" fontSize="12" fill="#FFF">
                  {tooltip.text.map((d, i) => (
                    <tspan key={i} x={10} y={18 + i * 16}>
                      <tspan fontWeight="bold">{d.label}</tspan>: {d.value}
                    </tspan>
                  ))}
                </text>
              </g>
            )}
          </svg>

          {/* Konva layer ONLY for path elements (mutations) */}
          <Stage
            width={width}
            height={height}
            className="konva-stage"
            ref={(elem) => (this.konvaStage = elem)}
          >
            <Layer>
              {/* Mutation paths in Konva */}
              {this.panels.map((panel, panelIdx) => (
                <React.Fragment key={`konva-panel-${panel.index}`}>
                  {panel.intervals.map((d, idx) => (
                    <Path
                      key={idx}
                      id={d.primaryKey}
                      type="interval"
                      data={d.mutationSymbol}
                      x={
                        margins.gapX +
                        panel.offset +
                        panel.xScale(
                          Math.floor((d.startPlace + d.endPlace) / 2) - 1
                        )
                      }
                      y={margins.gap + panel.yScale(d.y)}
                      fill={
                        d.primaryKey === tooltip.shapeId
                          ? "#ff7f0e"
                          : d.fill || d.color
                      }
                      stroke={d.stroke}
                      strokeWidth={d.primaryKey === tooltip.shapeId ? 1.5 : 1}
                      opacity={d.isProteinCoded ? 1 : 0.33}
                    />
                  ))}
                </React.Fragment>
              ))}
            </Layer>
          </Stage>
        </div>
      </Wrapper>
    );
  }
}
MutationsPlot.propTypes = {
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  xDomain: PropTypes.array,
  defaultDomain: PropTypes.array,
  genome: PropTypes.object,
  title: PropTypes.string,
  chromoBins: PropTypes.object,
  updateDomain: PropTypes.func,
  annotation: PropTypes.string,
};
MutationsPlot.defaultProps = {
  xDomain: [],
  defaultDomain: [],
  commonYScale: false,
  yAxisTitle: "",
  yAxis2Title: "",
  commonRangeY: null,
  mutationsPlot: true,
};
const mapDispatchToProps = (dispatch) => ({
  updateDomains: (domains) => dispatch(updateDomains(domains)),
  updateHoveredLocation: (hoveredLocation, panelIndex) =>
    dispatch(updateHoveredLocation(hoveredLocation, panelIndex)),
});
const mapStateToProps = (state) => ({
  chromoBins: state.Settings.chromoBins,
  defaultDomain: state.Settings.defaultDomain,
  domains: state.Settings.domains,
  zoomedByCmd: state.Settings.zoomedByCmd,
  hoveredLocation: state.Settings.hoveredLocation,
  hoveredLocationPanelIndex: state.Settings.hoveredLocationPanelIndex,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(MutationsPlot));
