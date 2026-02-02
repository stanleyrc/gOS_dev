import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { connect } from "react-redux";
import * as d3 from "d3";
import Fragment from "./fragment";
import Wrapper from "./legend-multi-brush.style";
import settingsActions from "../../redux/settings/actions";

const { updateDomains } = settingsActions;

const margins = {
  legend: {
    padding: 50,
    height: 60,
    bar: 30,
    style: { fill: "steelblue", stroke: "black", fillOpacity: 0.8 },
  },
  chromoBox: { fillOpacity: 0.66 },
  chromoText: { textAnchor: "middle" },
  brush: { gap: 10, defaultLength: 100 },
};

class LegendMultiBrush extends Component {
  fragments = [];
  activeId = null;

  constructor(props) {
    super(props);
    //keep track of existing brushes
    this.brushes = [];
    const { width, defaultDomain } = this.props;

    this.stageWidth = width - 2 * margins.legend.padding;
    this.stageHeight = margins.legend.height;
    this.brushesHeight = margins.legend.bar + 2 * margins.brush.gap;

    this.genomeScale = d3
      .scaleLinear()
      .domain(defaultDomain)
      .range([0, this.stageWidth]);

    // Execute the delete operation
    d3.select("html").on("keyup", (e) => {
      if (
        (e.keyCode === 46 || e.keyCode === 8) &&
        this.fragments.filter((d) => d.selection).length > 1
      ) {
        this.fragments = this.fragments.filter(
          (fragment) => fragment.id !== this.activeId
        );
        let visibleFragments = this.fragments.filter((d) => d.selection);
        this.activeId =
          visibleFragments.length > 0
            ? visibleFragments[visibleFragments.length - 1].id
            : null;
        this.update();
      }
    });
    //this.updateDomains = debounce(this.props.updateDomains, 1);
    this.updateDomains = this.props.updateDomains;

    this.state = {
      hoveredChromo: null,
    };
    this.prevOverlayCursor = null;
  }

  createDefaults(domain) {
    this.createBrush();
    let fragment = this.fragments[this.fragments.length - 1];
    this.update();
    fragment = d3
      .select(this.container)
      .select("#brush-" + fragment.id)
      .datum();
    fragment.domain = domain;
    fragment.selection = [
      this.genomeScale(fragment.domain[0]),
      this.genomeScale(fragment.domain[1]),
    ];
    d3.select(this.container)
      .select("#brush-" + fragment.id)
      .call(fragment.brush.move, fragment.selection);
    this.update();
    this.createBrush();
    this.update();
    this.activeId = fragment.id;
    d3.select(this.container).selectAll(".brush").classed("highlighted", false);
    d3.select(this.container)
      .select("#brush-" + fragment.id)
      .classed("highlighted", true);
  }

  createBrush = () => {
    var self = this;
    var brush = d3
      .brushX()
      .extent([
        [0, 0],
        [this.stageWidth, this.brushesHeight],
      ])
      .on("start", function (event) {
        // brush starts here
        self.originalSelection = event.selection;
      })
      .on("brush", function (event) {
        // brushing happens here

        // ignore brush-by-zoom
        if (event.sourceEvent && event.sourceEvent.type === "zoom") return;

        // Only transition after input.
        if (!event || !event.sourceEvent || event.sourceEvent.type === "brush")
          return;

        let fragment = d3.select(this).datum();
        self.activeId = d3.select(this).datum().id;
        let originalSelection = fragment.selection;
        let currentSelection = event.selection;
        let selection = Object.assign([], currentSelection);
        let node;

        // read the current state of all the self.fragments before you start checking on collisions
        self.otherSelections = self.fragments
          .filter((d, i) => d.selection !== null && d.id !== self.activeId)
          .map((d, i) => {
            node = d3.select("#brush-" + d.id).node();
            return node && d3.brushSelection(node);
          });

        // calculate the lower allowed selection edge this brush can move
        let lowerEdge = d3.max(
          self.otherSelections
            .filter((d, i) => d && d.selection !== null)
            .filter(
              (d, i) =>
                originalSelection &&
                d[0] <= originalSelection[0] &&
                originalSelection[0] <= d[1]
            )
            .map((d, i) => d[1])
        );

        // calculate the upper allowed selection edge this brush can move
        let upperEdge = d3.min(
          self.otherSelections
            .filter((d, i) => d && d.selection !== null)
            .filter(
              (d, i) =>
                originalSelection &&
                d[1] >= originalSelection[0] &&
                originalSelection[1] <= d[1]
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

        // move the brush to stay within the allowed bounded selection zone
        if (
          selection !== undefined &&
          selection !== null &&
          selection[1] !== selection[0]
        ) {
          fragment.selection = selection;
          d3.select(this).call(fragment.brush.move, selection);
        }
        fragment.domain = selection
          .map(self.genomeScale.invert)
          .map(Math.round);
        // finally, update the chart with the selection in question
        self.update();
      })
      .on("end", function (event) {
        // ignore brush-by-zoom
        if (event.sourceEvent && event.sourceEvent.type === "zoom") return;

        // Only transition after input.
        if (!event.sourceEvent) return;

        // Ignore empty selections.
        if (!event.selection) return;

        // Figure out if our latest brush has a selection
        let lastBrushID = self.fragments[self.fragments.length - 1].id;
        let lastBrush = d3.select("#brush-" + lastBrushID).node();
        let selection = lastBrush && d3.brushSelection(lastBrush);

        // If it does, that means we need another one
        if (selection && selection[0] !== selection[1]) {
          self.createBrush();
        }

        self.activeId = d3.select(this).datum().id;

        // finally, update the chart with the selection in question
        self.update();
      });

    this.fragments.push(new Fragment(brush));
  };

  update = (mode) => {
    // draw the brushes
    this.renderBrushes();

    this.updateDomains(
      this.fragments
        .filter((d) => d.selection)
        .map((d) => d.domain)
        .sort((a, b) => d3.ascending(a[0], b[0]))
    );
  };

  handleChromosomeClick = (chromosome) => {
    this.updateDomains([[chromosome.startPlace, chromosome.endPlace]]);
  };

  renderBrushes = () => {
    let { hoveredLocationPanelIndex } = this.props;

    var self = this;

    self.activeId =
      this.fragments?.filter((e) => e.selection)[hoveredLocationPanelIndex]
        ?.id || self.activeId;

    let brushSelection = d3
      .select(this.container)
      .select(".brushes")
      .selectAll(".brush")
      .data(this.fragments, (d, i) => d.id);

    // Set up new brushes
    brushSelection
      .enter()
      .insert("g", ".brush")
      .attr("class", "brush")
      .attr("id", (d, i) => "brush-" + d.id)
      .each(function (fragment) {
        //call the brush
        d3.select(this).call(fragment.brush);
      });

    // update the brushes
    brushSelection.each(function (fragment) {
      d3.select(this)
        .attr("class", "brush")
        .classed("highlighted", (d, i) => d.id === self.activeId)
        .selectAll(".overlay")
        .style("pointer-events", (d, i) => {
          let brush = fragment.brush;
          if (
            fragment.id === self.fragments[self.fragments.length - 1].id &&
            brush !== undefined
          ) {
            return "all";
          } else {
            return "none";
          }
        });
    });

    // exit the brushes
    brushSelection.exit().remove();
  };

  componentDidMount() {
    const { domains, width, defaultDomain } = this.props;
    this.stageWidth = width - 2 * margins.legend.padding;
    this.genomeScale = d3
      .scaleLinear()
      .domain(defaultDomain)
      .range([0, this.stageWidth]);
    domains.map((d) => this.createDefaults(d));

    // Add global click handler on SVG to detect chromosome clicks based on X position (overlay-friendly)
    d3.select(this.container).on("click", (event) => {
      const { chromoBins } = this.props;
      // Temporarily disable brush overlays/selections to see what is under the cursor
      const overlays = Array.from(
        this.container.querySelectorAll(".overlay, .selection")
      );
      const prevPointers = overlays.map((n) => n.style.pointerEvents);
      overlays.forEach((n) => (n.style.pointerEvents = "none"));
      const hitElement = document.elementFromPoint(
        event.clientX,
        event.clientY
      );
      overlays.forEach((n, i) => (n.style.pointerEvents = prevPointers[i]));

      const clickedChromo =
        hitElement && chromoBins[d3.select(hitElement).attr("id")];
      if (clickedChromo) {
        this.handleChromosomeClick(clickedChromo);
        return;
      }
    });

    d3.select(this.container).on("mousemove", (event) => {
      const { chromoBins } = this.props;

      // Temporarily disable brush overlays/selections to see what is under the cursor
      const overlays = Array.from(
        this.container.querySelectorAll(".overlay, .selection")
      );
      const prevPointers = overlays.map((n) => n.style.pointerEvents);
      overlays.forEach((n) => (n.style.pointerEvents = "none"));
      const hitElement = document.elementFromPoint(
        event.clientX,
        event.clientY
      );
      overlays.forEach((n, i) => (n.style.pointerEvents = prevPointers[i]));

      const hitSel = d3.select(hitElement);
      const chromoId = hitSel.attr("id");
      const newHover =
        chromoId && hitSel?.classed("chromo-text")
          ? chromoBins[chromoId]?.chromosome || null
          : null;

      if (this.state.hoveredChromo !== newHover) {
        this.setState({ hoveredChromo: newHover });
      }

      if (overlays.length) {
        if (newHover) {
          overlays.forEach((overlayNode) => {
            if (this.prevOverlayCursor === null) {
              this.prevOverlayCursor = overlayNode.style.cursor || "";
            }
            overlayNode.style.cursor = "pointer";
          });
        } else {
          overlays.forEach((overlayNode) => {
            overlayNode.style.cursor = this.prevOverlayCursor || "";
          });
          this.prevOverlayCursor = null;
        }
      }
    });
  }

  shouldComponentUpdate(nextProps, nextState) {
    return (
      nextProps.domains.toString() !== this.props.domains.toString() ||
      nextProps.width !== this.props.width ||
      nextState.hoveredChromo !== this.state.hoveredChromo ||
      nextProps.hoveredLocationPanelIndex !==
        this.props.hoveredLocationPanelIndex
    );
  }

  componentDidUpdate() {
    const { domains, defaultDomain, width } = this.props;
    this.stageWidth = width - 2 * margins.legend.padding;
    this.genomeScale = d3
      .scaleLinear()
      .domain(defaultDomain)
      .range([0, this.stageWidth]);
    let visibleFragments = this.fragments.filter((d) => d.selection);
    if (visibleFragments.length !== domains.length) {
      this.fragments = [];
      domains.map((d) => this.createDefaults(d));
    } else {
      visibleFragments.forEach((fragment, index) => {
        this.update();
        fragment = d3
          .select(this.container)
          .select("#brush-" + fragment.id)
          .datum();
        fragment.domain = domains[index];
        fragment.selection = [
          this.genomeScale(fragment.domain[0]),
          this.genomeScale(fragment.domain[1]),
        ];
        d3.select(this.container)
          .select("#brush-" + fragment.id)
          .call(fragment.brush.move, fragment.selection);
        this.update();
      });
    }
  }

  render() {
    const { width, defaultDomain, chromoBins } = this.props;
    const { hoveredChromo } = this.state;
    if (!chromoBins) {
      return null;
    }
    let stageWidth = width - 2 * margins.legend.padding;
    let stageHeight = margins.legend.height;
    let genomeScale = d3
      .scaleLinear()
      .domain(defaultDomain)
      .range([0, stageWidth]);

    return (
      <Wrapper>
        <div className="ant-wrapper-legend">
          <svg
            ref={(elem) => (this.container = elem)}
            width={width}
            height={stageHeight}
            className="legend-container"
          >
            <g
              className="chromo-legend"
              transform={`translate(${[
                margins.legend.padding,
                0.5 * (stageHeight - margins.legend.bar),
              ]})`}
            >
              <rect
                className="legend-bar"
                width={stageWidth}
                height={margins.legend.bar}
                {...margins.legend.style}
              />
              <g className="chromo-legend-container">
                {Object.values(chromoBins).map((d, i) => (
                  <g
                    key={i}
                    className="chromo-container"
                    transform={`translate(${[genomeScale(d.startPlace), 0]})`}
                  >
                    <rect
                      className="chromo-box"
                      width={genomeScale(d.endPoint)}
                      height={margins.legend.bar}
                      fill={d3.rgb(d.color)}
                      stroke={d3.rgb(d.color).darker(1)}
                      {...margins.chromoBox}
                    />
                    <text
                      id={d.chromosome}
                      className={`chromo-text${
                        hoveredChromo === d.chromosome
                          ? " chromosome-highlighted"
                          : ""
                      }`}
                      fill={hoveredChromo === d.chromosome ? "#ff7f0e" : "#FFF"}
                      dx={genomeScale(d.endPoint) / 2}
                      dy={0.62 * margins.legend.bar}
                      {...margins.chromoText}
                    >
                      {d.chromosome}
                    </text>
                  </g>
                ))}
              </g>
              <g
                className="brushes"
                transform={`translate(${[0, -margins.brush.gap]})`}
              ></g>
            </g>
          </svg>
        </div>
      </Wrapper>
    );
  }
}
LegendMultiBrush.propTypes = {
  chromoBins: PropTypes.object,
  domain: PropTypes.array,
  defaultDomain: PropTypes.array,
  width: PropTypes.number.isRequired,
};
LegendMultiBrush.defaultProps = {
  width: 400,
};
const mapDispatchToProps = (dispatch) => ({
  updateDomains: (domains) => dispatch(updateDomains(domains)),
});
const mapStateToProps = (state) => ({
  domains: state.Settings.domains,
  chromoBins: state.Settings.chromoBins,
  defaultDomain: state.Settings.defaultDomain,
  hoveredLocationPanelIndex: state.Settings.hoveredLocationPanelIndex,
});
export default connect(mapStateToProps, mapDispatchToProps)(LegendMultiBrush);
