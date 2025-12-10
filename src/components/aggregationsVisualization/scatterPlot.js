import React, { Component } from "react";
import KonvaScatter from "../konvaScatter";
import KonvaContour from "../konvaContour";
import { getValue, getColumnLabel, margins } from "./helpers";
import { hasGene } from "../../helpers/geneAggregations";
import * as d3 from "d3";

class ScatterPlot extends Component {
  scatterIdAccessor = (d) => d.pair;
  _cachedContours = null;
  _contourCacheKey = null;

  getContours() {
    const { data, config, xVariable, yVariable, contourBandwidth = 15, contourThresholdCount = 100 } = this.props;
    const { xScale, yScale, panelWidth, panelHeight } = config;

    const xAccessor = (d) => getValue(d, xVariable);
    const yAccessor = (d) => getValue(d, yVariable);

    const cacheKey = `${data.length}-${xVariable}-${yVariable}-${contourBandwidth}-${contourThresholdCount}-${panelWidth}-${panelHeight}-${xScale.domain().join(",")}-${yScale.domain().join(",")}`;

    if (this._contourCacheKey === cacheKey && this._cachedContours) {
      return this._cachedContours;
    }

    const contours = d3
      .contourDensity()
      .x((d) => xScale(xAccessor(d)))
      .y((d) => yScale(yAccessor(d)))
      .thresholds(contourThresholdCount)
      .bandwidth(contourBandwidth)
      .size([panelWidth, panelHeight])(data);

    this._cachedContours = contours;
    this._contourCacheKey = cacheKey;
    return contours;
  }

  getContourColorScale(contours) {
    const { contourColorScheme = d3.interpolateBlues } = this.props;
    return d3
      .scaleSequential(contourColorScheme)
      .domain(d3.extent(contours, (d) => d.value))
      .nice();
  }

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
      scatterPlotType = "scatter",
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

    const isContour = scatterPlotType === "contour";

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
        {isContour ? (
          <KonvaContour
            contours={this.getContours()}
            data={data}
            width={panelWidth}
            height={panelHeight}
            xAccessor={xVariable}
            yAccessor={yVariable}
            xScale={xScale}
            yScale={yScale}
            colorScale={this.getContourColorScale(this.getContours())}
            tooltipAccessor={tooltipAccessor}
            onPointClick={onPointClick}
          />
        ) : (
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
        )}
      </div>
    );
  }
}

export default ScatterPlot;
