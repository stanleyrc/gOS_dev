import React, { Component } from "react";
import { PropTypes } from "prop-types";
import * as d3 from "d3";
import Wrapper from "./index.style";

const margins = {
  gapX: 40,
  gapY: 40,
};

class TierDistributionBarChart extends Component {
  plotContainer = null;

  componentDidMount() {
    this.renderChart();
  }

  componentDidUpdate() {
    this.renderChart();
  }

  renderChart() {
    const { width, height, tierCounts, originalTier } = this.props;

    if (!this.plotContainer) return;

    const svg = d3.select(this.plotContainer);
    svg.selectAll("*").remove(); // Clear previous render

    const innerWidth = width - 2 * margins.gapX;
    const innerHeight = height - 2 * margins.gapY;

    const xScale = d3
      .scaleBand()
      .domain([1, 2, 3])
      .range([0, innerWidth])
      .padding(0.1);

    const maxCount = Math.max(tierCounts[1], tierCounts[2], tierCounts[3]);
    const yScale = d3
      .scaleLinear()
      .domain([0, maxCount])
      .range([innerHeight, 0])
      .nice();

    const g = svg
      .append("g")
      .attr("transform", `translate(${margins.gapX}, ${margins.gapY})`);

    // Y-axis
    g.append("g")
      .call(d3.axisLeft(yScale).ticks(5));

    // X-axis
    g.append("g")
      .attr("transform", `translate(0, ${innerHeight})`)
      .call(d3.axisBottom(xScale));

    // Bars
    [1, 2, 3].forEach((tier) => {
      const isOriginal = tier === originalTier;
      g.append("rect")
        .attr("x", xScale(tier))
        .attr("y", yScale(tierCounts[tier]))
        .attr("width", xScale.bandwidth())
        .attr("height", innerHeight - yScale(tierCounts[tier]))
        .attr("fill", isOriginal ? "#ff7f0e" : "#69b3a2") // Different color for original
        .attr("stroke", isOriginal ? "black" : "none")
        .attr("stroke-width", isOriginal ? 2 : 0);
    });

    // Labels
    [1, 2, 3].forEach((tier) => {
      const isOriginal = tier === originalTier;
      g.append("text")
        .attr("x", xScale(tier) + xScale.bandwidth() / 2)
        .attr("y", yScale(tierCounts[tier]) - 5)
        .attr("text-anchor", "middle")
        .attr("fill", isOriginal ? "black" : "black")
        .style("font-weight", isOriginal ? "bold" : "normal")
        .text(tierCounts[tier]);
    });
  }

  render() {
    const { width, height } = this.props;

    return (
      <Wrapper>
        <svg
          width={width}
          height={height}
          ref={(elem) => (this.plotContainer = elem)}
        ></svg>
      </Wrapper>
    );
  }
}

TierDistributionBarChart.propTypes = {
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  tierCounts: PropTypes.shape({
    1: PropTypes.number,
    2: PropTypes.number,
    3: PropTypes.number,
  }).isRequired,
  originalTier: PropTypes.oneOf([1, 2, 3]).isRequired,
};

export default TierDistributionBarChart;
