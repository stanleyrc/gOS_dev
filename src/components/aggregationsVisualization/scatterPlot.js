import React, { Component } from "react";
import KonvaScatter from "../konvaScatter";
import { getValue, getColumnLabel, margins } from "./helpers";
import { hasGene } from "../../helpers/geneAggregations";
import * as d3 from "d3";

class ScatterPlot extends Component {
  scatterIdAccessor = (d) => d.pair;

  render() {
    const {
      data,
      config,
      colorConfig,
      xVariable,
      yVariable,
      colorByVariable,
      selectedGene,
      onPointClick,
    } = this.props;

    const { xScale, yScale, panelWidth, panelHeight } = config;
    const { colorAccessor, colorScale } = colorConfig;

    const xAccessor = (d) => getValue(d, xVariable);
    const yAccessor = (d) => getValue(d, yVariable);

    const tooltipAccessor = (d) => {
      const items = [
        { label: "Case", value: d.pair },
        { label: getColumnLabel(xVariable), value: d3.format(",.2f")(getValue(d, xVariable)) },
        { label: getColumnLabel(yVariable), value: d3.format(",.2f")(getValue(d, yVariable)) },
      ];

      if (colorByVariable === "driver_gene" && selectedGene) {
        items.push({
          label: selectedGene,
          value: hasGene(d, selectedGene) ? "Mutated" : "Wild-type",
        });
      } else if (colorByVariable && colorAccessor) {
        const colorVal = colorAccessor(d);
        if (colorVal != null) {
          items.push({
            label: getColumnLabel(colorByVariable),
            value: colorVal,
          });
        }
      }

      return items;
    };

    return (
      <div
        style={{
          position: "absolute",
          top: margins.gapY + margins.gapLegend,
          left: margins.gapX,
          width: panelWidth,
          height: panelHeight,
          pointerEvents: "auto",
        }}
      >
        <KonvaScatter
          data={data}
          width={panelWidth}
          height={panelHeight}
          xAccessor={xAccessor}
          yAccessor={yAccessor}
          xScale={xScale}
          yScale={yScale}
          idAccessor={this.scatterIdAccessor}
          tooltipAccessor={tooltipAccessor}
          radiusAccessor={5}
          colorAccessor={colorAccessor}
          colorScale={colorScale}
          onPointClick={onPointClick}
        />
      </div>
    );
  }
}

export default ScatterPlot;
