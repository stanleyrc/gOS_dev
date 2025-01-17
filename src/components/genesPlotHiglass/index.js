import React, { Component } from "react";
import { PropTypes } from "prop-types";
import * as d3 from "d3";
import { connect } from "react-redux";
import { withTranslation } from "react-i18next";
import { humanize, measureText } from "../../helpers/utility";
import Wrapper from "./index.style";
import debounce from "lodash.debounce";
import settingsActions from "../../redux/settings/actions";
import appActions from "../../redux/app/actions";

const { updateHoveredLocation } = appActions;
const { updateDomains } = settingsActions;

const margins = {
  gapX: 24,
  gapY: 24,
  yTicksCount: 10,
};

class GenesPlot extends Component {
  plotContainer = null;

  constructor(props) {
    super(props);

    this.state = {
      selectedGene: null,
      tooltip: {
        visible: false,
        shapeId: -1,
        x: -1000,
        y: -1000,
        text: "",
      },
    };
    this.debouncedUpdateDomains = debounce(this.props.updateDomains, 100);
  }

  shouldComponentUpdate(nextProps, nextState) {
    return (
      nextProps.domains.toString() !== this.props.domains.toString() ||
      nextProps.genesList.toString() !== this.props.genesList.toString() ||
      nextProps.width !== this.props.width ||
      nextProps.height !== this.props.height ||
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
      .map(Math.floor);
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
        this.debouncedUpdateDomains(newDomains);
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

  tooltipContent(gene) {
    let attributes = [
      { label: "iid", value: gene.id },
      { label: "title", value: gene.title },
      { label: "type", value: gene.bioType },
      { label: "Chromosome", value: gene.chromosome },
      { label: "Start Point", value: d3.format(",")(gene.startPoint) },
      { label: "End Point", value: d3.format(",")(gene.endPoint) },
    ];
    gene.strand && attributes.push({ label: "Strand", value: gene.strand });
    return attributes;
  }

  handleTitleClick = (selectedGene) => {
    window
      .open(
        `https://www.genecards.org/cgi-bin/carddisp.pl?gene=${selectedGene.title}`,
        "_blank"
      )
      .focus();
  };

  handleGeneMouseOver = (event, selectedGene) => {
    const { width, height } = this.props;

    let textData = this.tooltipContent(selectedGene);
    let diffY = d3.min([
      0,
      height - event.nativeEvent.offsetY - textData.length * 16 - 12,
    ]);
    let diffX = d3.min([
      0,
      width -
        event.nativeEvent.offsetX -
        d3.max(textData, (d) => measureText(`${d.label}: ${d.value}`, 12)) -
        0,
    ]);
    this.setState({
      selectedGene,
      tooltip: {
        shape: selectedGene,
        shapeId: selectedGene.id,
        visible: true,
        x: event.nativeEvent.offsetX + diffX,
        y: event.nativeEvent.offsetY + diffY,
        text: textData,
      },
    });
  };

  handleGeneMouseLeave = () => {
    this.setState({
      selectedGene: null,
      tooltip: { shape: null, shapeId: null, visible: false },
    });
  };

  render() {
    const { width, height, domains, genesList, defaultDomain } = this.props;
    const { tooltip, selectedGene } = this.state;

    let stageWidth = width - 2 * margins.gapX;
    let stageHeight = height - 2 * margins.gapY;

    let panelWidth =
      (stageWidth - (domains.length - 1) * margins.gapX) / domains.length;
    let panelHeight = stageHeight;
    this.panels = [];

    domains.forEach((xDomain, index) => {
      let dataGenes = [];

      genesList.forEach((gene, i) => {
        if (gene.xEnd >= xDomain[0] && gene.xStart <= xDomain[1]) {
          dataGenes.push({
            ...gene,
            y: gene.fields[5] === "+" ? 2 : -2,
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

      let yExtent = [-8, 8];

      let yScale = d3
        .scaleLinear()
        .domain(yExtent)
        .range([panelHeight, 0])
        .nice();

      let xScale = d3.scaleLinear().domain(xDomain).range([0, panelWidth]);
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
        dataGenes,
      });
    });

    return (
      <Wrapper className="ant-wrapper" margins={margins}>
        <div
          className="areaplot"
          style={{ width: stageWidth, height: stageHeight }}
          ref={(elem) => (this.container = elem)}
        />
        <svg
          width={width}
          height={height}
          className="plot-container"
          ref={(elem) => (this.plotContainer = elem)}
        >
          <defs>
            <clipPath key={`cuttOffViewPane`} id={`cuttOffViewPane`}>
              <rect x={0} y={0} width={stageWidth} height={stageHeight} />
            </clipPath>
            {this.panels.map((panel, i) => (
              <clipPath
                key={`cuttOffViewPane-${panel.index}`}
                id={`cuttOffViewPane-${panel.index}`}
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
          <g transform={`translate(${[margins.gapX, margins.gapY]})`}>
            {this.panels.map((panel, i) => (
              <g
                key={`panel-${panel.index}`}
                id={`panel-${panel.index}`}
                transform={`translate(${[panel.offset, 0]})`}
              >
                <g clipPath={`url(#cuttOffViewPane-${panel.index})`}>
                  <rect
                    className="zoom-background"
                    id={`panel-rect-${panel.index}`}
                    x={0.5}
                    width={panelWidth}
                    height={panelHeight}
                    onMouseMove={(e) => this.handleMouseMove(e, i)}
                    onMouseOut={(e) => this.handleMouseOut(e, i)}
                    style={{
                      stroke: "steelblue",
                      fill: "transparent",
                      strokeWidth: 1,
                      opacity: 0.375,
                      pointerEvents: "all",
                    }}
                  />
                  {panel.dataGenes.map((gene, j) => (
                    <g
                      onMouseOver={(event) =>
                        this.handleGeneMouseOver(event, gene)
                      }
                      onMouseLeave={() => this.handleGeneMouseLeave(gene)}
                    >
                      <rect
                        className={
                          gene.id === selectedGene?.id ? "highlighted" : ""
                        }
                        transform={`translate(${[
                          panel.xScale(gene.xStart),
                          panel.yScale(gene.y) - 1,
                        ]})`}
                        fill={gene.fields[5] === "+" ? "#3333FF" : "#FF4444"}
                        width={
                          panel.xScale(gene.xEnd) - panel.xScale(gene.xStart)
                        }
                        height={2}
                      />
                      <polygon
                        className={
                          gene.id === selectedGene?.id ? "highlighted" : ""
                        }
                        key={gene.uid}
                        id={gene.uid}
                        transform={`translate(${[0, 0]})`}
                        points={
                          gene.fields[5] === "+"
                            ? [
                                panel.xScale(gene.xEnd),
                                panel.yScale(gene.y),
                                panel.xScale(gene.xEnd) - 5,
                                panel.yScale(gene.y) - 5,
                                panel.xScale(gene.xEnd) - 5,
                                panel.yScale(gene.y) + 5,
                              ]
                            : [
                                panel.xScale(gene.xStart),
                                panel.yScale(gene.y),
                                panel.xScale(gene.xStart) + 5,
                                panel.yScale(gene.y) - 5,
                                panel.xScale(gene.xStart) + 5,
                                panel.yScale(gene.y) + 5,
                              ]
                        }
                        fill={gene.fields[5] === "+" ? "#3333FF" : "#FF4444"}
                      />
                      <text
                        className={
                          gene.id === selectedGene?.id ? "highlighted" : ""
                        }
                        transform={`translate(${[
                          (d3.max([0, panel.xScale(gene.xStart)]) +
                            d3.min([panel.xScale(gene.xEnd), panelWidth])) /
                            2,
                          gene.fields[5] === "+"
                            ? panel.yScale(gene.y) - 15
                            : panel.yScale(gene.y) + 15,
                        ]})`}
                        textAnchor="middle"
                        fill={gene.fields[5] === "+" ? "#3333FF" : "#FF4444"}
                        fontSize={9}
                        onClick={() => this.handleTitleClick(gene)}
                      >
                        {gene.fields[3]}
                      </text>
                    </g>
                  ))}
                </g>
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
              transform={`translate(${[tooltip.x + 30, tooltip.y]})`}
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
GenesPlot.propTypes = {
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  data: PropTypes.array,
  chromoBins: PropTypes.object,
};
GenesPlot.defaultProps = {};
const mapDispatchToProps = (dispatch) => ({
  updateDomains: (domains) => dispatch(updateDomains(domains)),
  updateHoveredLocation: (hoveredLocation, panelIndex) =>
    dispatch(updateHoveredLocation(hoveredLocation, panelIndex)),
});
const mapStateToProps = (state) => ({
  chromoBins: state.Settings.chromoBins,
  defaultDomain: state.Settings.defaultDomain,
  hoveredLocation: state.App.hoveredLocation,
  hoveredLocationPanelIndex: state.App.hoveredLocationPanelIndex,
  zoomedByCmd: state.App.zoomedByCmd,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(GenesPlot));
