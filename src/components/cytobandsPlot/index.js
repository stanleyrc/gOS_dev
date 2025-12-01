import React, { Component } from "react";
import { PropTypes } from "prop-types";
import * as d3 from "d3";
import { connect } from "react-redux";
import { withTranslation } from "react-i18next";
import { measureText } from "../../helpers/utility";
import { createChromosomePaths } from "../../helpers/cytobandsUtil";
import Wrapper from "./index.style";
import settingsActions from "../../redux/settings/actions";

const { updateDomains, updateHoveredLocation } = settingsActions;

const margins = {
  gapX: 50,
  gapY: 24,
  yTicksCount: 10,
};

class CytobandsPlot extends Component {
  plotContainer = null;

  constructor(props) {
    super(props);

    this.state = {
      selectedCytoband: null,
      tooltip: {
        visible: false,
        shapeId: -1,
        x: -1000,
        y: -1000,
        text: "",
      },
    };
    //this.updateDomains = debounce(this.props.updateDomains, 100);
    this.updateDomains = this.props.updateDomains;
  }

  shouldComponentUpdate(nextProps, nextState) {
    return (
      nextProps.domains.toString() !== this.props.domains.toString() ||
      nextProps.cytobands.toString() !== this.props.cytobands.toString() ||
      nextProps.chromosomeOutlines.toString() !==
        this.props.chromosomeOutlines.toString() ||
      nextProps.width !== this.props.width ||
      nextProps.height !== this.props.height ||
      nextState.selectedCytoband?.id !== this.state.selectedCytoband?.id ||
      nextState.tooltip.x !== this.state.tooltip.x ||
      nextState.tooltip.y !== this.state.tooltip.y ||
      nextProps.hoveredLocation !== this.props.hoveredLocation ||
      nextProps.hoveredLocationPanelIndex !==
        this.props.hoveredLocationPanelIndex
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
      d3.select(this.plotContainer)
        .select(`#panel-rect-${index}`)
        .attr("preserveAspectRatio", "xMinYMin meet")
        .call(
          panel.zoom.filter(
            (event) => !zoomedByCmd || (!event.button && event.metaKey)
          )
        );
      d3.select(this.plotContainer)
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

  componentDidUpdate(prevProps, prevState) {
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
      d3.select(this.plotContainer)
        .select(`#panel-rect-${index}`)
        .attr("preserveAspectRatio", "xMinYMin meet")
        .call(
          panel.zoom.filter(
            (event) => !zoomedByCmd || (!event.button && event.metaKey)
          )
        );
      d3.select(this.plotContainer)
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
      d3.select(this.plotContainer)
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
      d3.select(this.plotContainer)
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

  handleMouseMove = (e, panelIndex) => {
    this.props.updateHoveredLocation(
      this.panels[panelIndex].xScale.invert(d3.pointer(e)[0]),
      panelIndex
    );
  };

  handleMouseOut = (e, panelIndex) => {
    this.props.updateHoveredLocation(null, panelIndex);
  };

  tooltipContent(cytoband) {
    let attributes = [
      { label: "Title", value: cytoband.title },
      { label: "Chromosome", value: cytoband.chromosomeTitle },
      { label: "Description", value: cytoband.description },
      {
        label: "Locus",
        value: `${cytoband.chromosomeTitle}: ${d3.format(",")(
          cytoband.startPoint
        )} - ${d3.format(",")(cytoband.endPoint)}`,
      },
    ];
    return attributes;
  }

  handleCytobandMouseMove = (event, selectedCytoband) => {
    const { width, height } = this.props;

    let textData = this.tooltipContent(selectedCytoband);
    let diffY = d3.min([
      0,
      height - event.nativeEvent.offsetY - textData.length * 16 - 12,
    ]);
    let diffX = d3.min([
      0,
      width -
        event.nativeEvent.offsetX -
        d3.max(textData, (d) => measureText(`${d.label}: ${d.value}`, 12)) -
        60,
    ]);
    this.setState({
      selectedCytoband,
      tooltip: {
        shape: selectedCytoband,
        shapeId: selectedCytoband.id,
        visible: true,
        x: event.nativeEvent.offsetX + diffX,
        y: event.nativeEvent.offsetY + diffY,
        text: textData,
      },
    });
  };

  handleCytobandMouseOut = () => {
    this.setState({
      selectedCytoband: null,
      tooltip: { shape: null, shapeId: null, visible: false },
    });
  };

  render() {
    const {
      width,
      height,
      domains,
      defaultDomain,
      cytobands,
      chromosomeOutlines,
    } = this.props;
    const { tooltip, selectedCytoband } = this.state;

    let stageWidth = width - 2 * margins.gapX;
    let stageHeight = height - 2 * margins.gapY;

    let panelWidth =
      (stageWidth - (domains.length - 1) * margins.gapX) / domains.length;
    let panelHeight = stageHeight;
    this.panels = [];

    domains.forEach((xDomain, index) => {
      let dataCytobands = [];
      let xScale = d3.scaleLinear().domain(xDomain).range([0, panelWidth]);
      cytobands.forEach((cytoband) => {
        if (
          cytoband.endPlace >= xDomain[0] &&
          cytoband.startPlace <= xDomain[1]
        ) {
          dataCytobands.push({
            ...cytoband,
            y: 0,
            textPosX:
              (d3.max([0, xScale(cytoband.startPlace)]) +
                d3.min([xScale(cytoband.endPlace), panelWidth])) /
              2,
          });
        }
      });

      let offset = index * (panelWidth + margins.gapX);
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
      let panelGenomeScale = d3
        .scaleLinear()
        .domain(defaultDomain)
        .range([0, panelWidth]);

      let yExtent = [-1, 2];

      let yScale = d3
        .scaleLinear()
        .domain(yExtent)
        .range([panelHeight, 0])
        .nice();

      let outlines = chromosomeOutlines.map((chromo) => {
        const { chromosome, color, pointsLeft, pointsRight } = chromo;
        return {
          ...createChromosomePaths(
            pointsLeft.map((point) => [xScale(point[0]), yScale(point[1])]),
            pointsRight.map((point) => [xScale(point[0]), yScale(point[1])])
          ),
          chromosome,
          color,
        };
      });

      let yTicks = yScale.ticks(margins.yTicksCount);
      yTicks[yTicks.length - 1] = yScale.domain()[1];
      this.panels.push({
        index,
        xScale,
        yScale,
        yTicks,
        zoom,
        panelWidth,
        panelHeight,
        offset,
        panelGenomeScale,
        dataCytobands,
        outlines,
      });
    });
    let randID = Math.random();

    return (
      <Wrapper className="ant-wrapper-cytobands">
        <svg
          width={width}
          height={height}
          className="plot-container-cytobands"
          ref={(elem) => (this.plotContainer = elem)}
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
          <g transform={`translate(${[margins.gapX, 0]})`}>
            {this.panels.map((panel, i) => (
              <g
                key={`panel-${panel.index}`}
                id={`panel-${panel.index}`}
                transform={`translate(${[panel.offset, 0]})`}
              >
                <g clipPath={`url(#cuttOffViewPane-${randID}-${panel.index})`}>
                  <rect
                    className="zoom-background"
                    id={`panel-rect-${panel.index}`}
                    x={0.5}
                    width={panelWidth - 1}
                    height={panelHeight}
                    onMouseMove={(e) => this.handleMouseMove(e, i)}
                    onMouseOut={(e) => this.handleMouseOut(e, i)}
                    style={{
                      stroke: "steelblue",
                      fill: "transparent",
                      strokeWidth: 0,
                      opacity: 0.375,
                      pointerEvents: "all",
                    }}
                  />
                  {panel.dataCytobands.map((cytoband, j) => (
                    <g className="cytoband" key={cytoband.id}>
                      <polygon
                        className={
                          cytoband.id === selectedCytoband?.id
                            ? "rect-highlighted"
                            : ""
                        }
                        fill={cytoband.color}
                        points={cytoband.points
                          .map(
                            (e) => `${panel.xScale(e[0])},${panel.yScale(e[1])}`
                          )
                          .join(" ")}
                        onMouseMove={(event) =>
                          this.handleCytobandMouseMove(event, cytoband)
                        }
                        onMouseOut={() => this.handleCytobandMouseOut(cytoband)}
                      />
                    </g>
                  ))}
                </g>
                {panel.outlines.map((outline, k) => (
                  <g
                    className="chromosome-outline"
                    key={outline.chromosome}
                    clipPath={`url(#cuttOffViewPane-${randID}-${panel.index})`}
                  >
                    <path
                      d={outline.left}
                      stroke={outline.color}
                      fill="transparent"
                      strokeWidth={2}
                    />
                    <path
                      d={outline.right}
                      stroke={outline.color}
                      fill="transparent"
                      strokeWidth={2}
                    />
                  </g>
                ))}
                {panel.dataCytobands.map((cytoband, j) => (
                  <g className="cytoband" key={cytoband.id}>
                    {(measureText(cytoband.title, 10) <=
                      panel.xScale(cytoband.endPlace) -
                        panel.xScale(cytoband.startPlace) ||
                      cytoband.id === selectedCytoband?.id) && (
                      <text
                        className={
                          cytoband.id === selectedCytoband?.id
                            ? "highlighted"
                            : ""
                        }
                        transform={`translate(${[
                          cytoband.textPosX,
                          panel.yScale(cytoband.y),
                        ]})`}
                        textAnchor="middle"
                        fill={
                          cytoband.titleColor
                            ? cytoband.titleColor
                            : "currentColor"
                        }
                        dy={-7.7}
                        fontSize={10}
                      >
                        {cytoband.title}
                      </text>
                    )}
                  </g>
                ))}
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
            ))}
          </g>
          {tooltip.visible && (
            <g
              className="tooltip"
              transform={`translate(${[tooltip.x + 10, tooltip.y]})`}
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
      </Wrapper>
    );
  }
}
CytobandsPlot.propTypes = {
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  data: PropTypes.array,
  chromoBins: PropTypes.object,
};
CytobandsPlot.defaultProps = {};
const mapDispatchToProps = (dispatch) => ({
  updateDomains: (domains) => dispatch(updateDomains(domains)),
  updateHoveredLocation: (hoveredLocation, panelIndex) =>
    dispatch(updateHoveredLocation(hoveredLocation, panelIndex)),
});
const mapStateToProps = (state) => ({
  chromoBins: state.Settings.chromoBins,
  defaultDomain: state.Settings.defaultDomain,
  cytobands: state.Cytobands.data,
  chromosomeOutlines: state.Cytobands.chromosomeOutlines,
  hoveredLocation: state.Settings.hoveredLocation,
  hoveredLocationPanelIndex: state.Settings.hoveredLocationPanelIndex,
  zoomedByCmd: state.Settings.zoomedByCmd,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(CytobandsPlot));
