import React, { Component } from "react";
import { PropTypes } from "prop-types";
import * as d3 from "d3";
import { connect } from "react-redux";
import { withTranslation } from "react-i18next";
import { filterGenesByOverlap, measureText } from "../../helpers/utility";
import Wrapper from "./index.style";
import settingsActions from "../../redux/settings/actions";
import appActions from "../../redux/app/actions";

const { updateHoveredLocation } = appActions;
const { updateDomains } = settingsActions;

const margins = {
  gapX: 50,
  gapY: 0,
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
    //this.updateDomains = debounce(this.props.updateDomains, 100);
    this.updateDomains = this.props.updateDomains;
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

  tooltipContent(gene) {
    let attributes = [
      { label: "id", value: gene.id },
      { label: "Title", value: gene.title },
      { label: "Type", value: gene.bioType },
      { label: "Description", value: gene.description },
      {
        label: "Locus",
        value: `chr${gene.chromosome}: ${d3.format(",")(
          gene.startPoint
        )} - ${d3.format(",")(gene.endPoint)}`,
      },
      {
        label: "CDS Locus",
        value: `chr${gene.chromosome}: ${d3.format(",")(
          gene.cdsStartPoint
        )} - ${d3.format(",")(gene.cdsEndPoint)}`,
      },
      { label: "Strand", value: gene.strand },
    ];
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

  handleGeneMouseMove = (event, selectedGene) => {
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
        60,
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

  handleGeneMouseOut = () => {
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
      let xScale = d3.scaleLinear().domain(xDomain).range([0, panelWidth]);
      genesList.forEach((gene, i) => {
        if (gene.endPlace >= xDomain[0] && gene.startPlace <= xDomain[1]) {
          dataGenes.push({
            ...gene,
            y: gene.strand === "+" ? 2 : -2,
            textPosX:
              (d3.max([0, xScale(gene.startPlace)]) +
                d3.min([xScale(gene.endPlace), panelWidth])) /
              2,
          });
        }
      });

      dataGenes = filterGenesByOverlap(dataGenes);
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
    let randID = Math.random();

    return (
      <Wrapper className="ant-wrapper-genes" margins={margins}>
        <div className="areaplot" ref={(elem) => (this.container = elem)} />
        <svg
          width={width}
          height={height}
          className="plot-container-genes"
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
          <g transform={`translate(${[margins.gapX, margins.gapY]})`}>
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
                  {panel.dataGenes.map((gene, j) => (
                    <g
                      onMouseMove={(event) =>
                        this.handleGeneMouseMove(event, gene)
                      }
                      onMouseOut={() => this.handleGeneMouseOut(gene)}
                    >
                      {gene.exons
                        .filter(
                          (g) =>
                            panel.xScale(g.endPlace) -
                              panel.xScale(g.startPlace) >
                            1
                        )
                        .map((g) => (
                          <rect
                            className={`exon-rect ${
                              gene.id === selectedGene?.id
                                ? "rect-highlighted"
                                : ""
                            }`}
                            transform={`translate(${[
                              panel.xScale(g.startPlace),
                              panel.yScale(gene.y) - 8,
                            ]})`}
                            fill={gene.fillColor}
                            stroke={d3.rgb(gene.fillColor).darker()}
                            fillOpacity={0.15}
                            strokeOpacity={0.3}
                            width={
                              panel.xScale(g.endPlace) -
                              panel.xScale(g.startPlace)
                            }
                            height={16}
                          />
                        ))}
                      <rect
                        className={
                          gene.id === selectedGene?.id ? "rect-highlighted" : ""
                        }
                        transform={`translate(${[
                          panel.xScale(gene.startPlace),
                          panel.yScale(gene.y) - 1,
                        ]})`}
                        fill={gene.fillColor}
                        opacity={0.5}
                        width={
                          panel.xScale(gene.endPlace) -
                          panel.xScale(gene.startPlace)
                        }
                        height={2}
                      />
                      <polygon
                        className={
                          gene.id === selectedGene?.id ? "rect-highlighted" : ""
                        }
                        key={gene.uid}
                        id={gene.uid}
                        opacity={0.66}
                        points={
                          gene.strand === "+"
                            ? [
                                panel.xScale(gene.endPlace),
                                panel.yScale(gene.y),
                                panel.xScale(gene.endPlace) - 5,
                                panel.yScale(gene.y) - 5,
                                panel.xScale(gene.endPlace) - 5,
                                panel.yScale(gene.y) + 5,
                              ]
                            : [
                                panel.xScale(gene.startPlace),
                                panel.yScale(gene.y),
                                panel.xScale(gene.startPlace) + 5,
                                panel.yScale(gene.y) - 5,
                                panel.xScale(gene.startPlace) + 5,
                                panel.yScale(gene.y) + 5,
                              ]
                        }
                        fill={gene.fillColor}
                      />
                      <text
                        className={
                          gene.id === selectedGene?.id
                            ? "highlighted"
                            : gene.textOverlap
                            ? "hidden"
                            : ""
                        }
                        transform={`translate(${[
                          gene.textPosX,
                          gene.strand === "+"
                            ? panel.yScale(gene.y) - 20
                            : panel.yScale(gene.y) + 20,
                        ]})`}
                        textAnchor="middle"
                        fill={gene.color ? gene.color : "currentColor"}
                        fontSize={10}
                        onClick={() => this.handleTitleClick(gene)}
                      >
                        {gene.title}
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
              transform={`translate(${[tooltip.x + 10, tooltip.y + 5]})`}
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
