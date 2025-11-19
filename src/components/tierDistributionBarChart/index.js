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
    const { width, height, tierCounts, originalTier, gene, variantType } = this.props;

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
      .range([innerHeight, 0]);

    const g = svg
      .append("g")
      .attr("transform", `translate(${margins.gapX}, ${margins.gapY})`);

    // Title
    g.append("text")
      .attr("x", innerWidth / 2)
      .attr("y", -margins.gapY / 2)
      .attr("text-anchor", "middle")
      .attr("fill", "white")
      .style("font-size", "12px")
      .style("font-weight", "bold")
      .text(`Retier Distribution for ${gene} ${variantType}`);

    // Y-axis
    const numTicks = Math.min(6, maxCount + 1);
    const step = maxCount > 0 ? Math.max(1, Math.floor(maxCount / (numTicks - 1))) : 1;
    const tickValues = d3.range(0, maxCount + 1, step).filter(x => x <= maxCount);
    g.append("g")
      .call(d3.axisLeft(yScale).tickValues(tickValues).tickFormat(d3.format("d")));

    // X-axis
    const xAxisGroup = g.append("g")
      .attr("transform", `translate(0, ${innerHeight})`)
      .call(d3.axisBottom(xScale));

    // Highlight original tier with a circle
    if (originalTier) {
      xAxisGroup.selectAll(".tick")
        .filter(d => d === originalTier)
        .insert("circle", "text")
        .attr("cx", 0)
        .attr("cy", 14)
        .attr("r", 10)
        .attr("fill", "rgba(255, 255, 255, 0.1)")
        .attr("stroke", "white")
        .attr("stroke-width", 2);
    }

    // X-axis label
    g.append("text")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight + margins.gapY / 2 + 20)
      .attr("text-anchor", "middle")
      .attr("fill", "white")
      .style("font-size", "14px")
      .text("Tier");

    // Y-axis label
    g.append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -innerHeight / 2)
      .attr("y", -margins.gapX / 2 - 30)
      .attr("text-anchor", "middle")
      .attr("fill", "white")
      .style("font-size", "14px")
      .text("Count");

    // Bars
    [1, 2, 3].forEach((tier) => {
      g.append("rect")
        .attr("x", xScale(tier))
        .attr("y", yScale(tierCounts[tier]))
        .attr("width", xScale.bandwidth())
        .attr("height", innerHeight - yScale(tierCounts[tier]))
        .attr("fill", "#69b3a2");
    });

    // Labels
    [1, 2, 3].forEach((tier) => {
      g.append("text")
        .attr("x", xScale(tier) + xScale.bandwidth() / 2)
        .attr("y", yScale(tierCounts[tier]) - 5)
        .attr("text-anchor", "middle")
        .attr("fill", "white")
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
  gene: PropTypes.string.isRequired,
  variantType: PropTypes.string.isRequired,
};

export default TierDistributionBarChart;
