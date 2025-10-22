// populationStatisticsWorker.js
/* eslint-env worker */
/* eslint no-restricted-globals: "off" */

self.onmessage = function (e) {
  const { populations, metadata } = e.data;

  try {
    // Calculate general population metrics
    const general = getPopulationMetrics(populations, metadata);

    // Calculate tumor-specific population metrics
    const tumor = getPopulationMetrics(populations, metadata, metadata.tumor);

    // Post result back to main thread
    self.postMessage({
      success: true,
      data: {
        general,
        tumor,
      },
    });
  } catch (error) {
    self.postMessage({
      success: false,
      error: error.message,
    });
  }

  // Helper functions (copied from utility)
  function getPopulationMetrics(
    populations,
    metadata = {},
    tumour_type = null
  ) {
    // Extract the data from the responses and store it in an object
    return Object.keys(plotTypes()).map((d, i) => {
      let plot = {};
      let cutoff = Infinity;
      plot.id = d;
      plot.type = plotTypes()[d].plotType;
      plot.scaleX = plotTypes()[d].scaleX;
      plot.allData = populations[d].map((e) => +e.value);
      plot.data = populations[d]
        .filter((e) =>
          tumour_type ? e[plotTypes()[d].tumor_type] === tumour_type : true
        )
        .map((e) => +e.value)
        .filter((e) => e < cutoff)
        .sort((a, b) => ascending(a, b));
      plot.bandwidth = Math.pow(
        (4 * Math.pow(deviation(plot.data), 5)) / (3.0 * plot.data.length),
        0.2
      );
      plot.q1 = quantile(plot.data, 0.25);
      plot.q3 = quantile(plot.data, 0.75);
      plot.q99 = quantile(plot.data, 0.99);
      plot.range = plotTypes()[d].range || [
        max([min(plot.allData), 0.01]),
        quantile(plot.allData, 0.99),
      ];
      plot.format = plotTypes()[d].scaleXFormat;
      if (metadata[d]) {
        plot.markValue = metadata[d];
        plot.markValueText = format(plotTypes()[d].format)(metadata[d]);
        plot.colorMarker =
          plot.markValue < plot.q1
            ? legendColors()[0]
            : plot.markValue > plot.q3
            ? legendColors()[2]
            : legendColors()[1];
      }
      return plot;
    });
  }

  function plotTypes() {
    return {
      tumor_median_coverage: {
        plotType: "histogram",
        tumor_type: "tumor_type",
        format: ",",
        scaleX: "linear",
        scaleXFormat: "~s",
      },
      snvCount: {
        plotType: "histogram",
        tumor_type: "tumor_type",
        format: ",",
        scaleX: "log",
        scaleXFormat: "~s",
      },
      svCount: {
        plotType: "histogram",
        tumor_type: "tumor_type",
        format: ",",
        scaleX: "log",
        scaleXFormat: "~s",
      },
      tmb: {
        plotType: "histogram",
        tumor_type: "tumor_type",
        format: ",",
        scaleX: "log",
        scaleXFormat: "~s",
      },
      lohFraction: {
        plotType: "histogram",
        tumor_type: "tumor_type",
        format: ".3",
        scaleX: "linear",
        scaleXFormat: "0.2f",
      },
      purity: {
        plotType: "histogram",
        tumor_type: "tumor_type",
        format: ".2%",
        scaleX: "linear",
        scaleXFormat: ".0%",
        range: [0, 1],
      },
      ploidy: {
        plotType: "histogram",
        tumor_type: "tumor_type",
        format: ".2f",
        scaleX: "linear",
        scaleXFormat: "0.2f",
        range: [1.5, 5.5],
      },
      hrdScore: {
        plotType: "histogram",
        tumor_type: "tumor_type",
        format: "0.2%",
        scaleX: "linear",
        scaleXFormat: ".0%",
        range: [0, 1],
      },
      hrdB12Score: {
        plotType: "histogram",
        tumor_type: "tumor_type",
        format: "0.2%",
        scaleX: "linear",
        scaleXFormat: ".0%",
        range: [0, 1],
      },
      hrdB1Score: {
        plotType: "histogram",
        tumor_type: "tumor_type",
        format: "0.2%",
        scaleX: "linear",
        scaleXFormat: ".0%",
        range: [0, 1],
      },
      hrdB2Score: {
        plotType: "histogram",
        tumor_type: "tumor_type",
        format: "0.2%",
        scaleX: "linear",
        scaleXFormat: ".0%",
        range: [0, 1],
      },
      msiScore: {
        plotType: "histogram",
        tumor_type: "tumor_type",
        format: ".2%",
        scaleX: "linear",
        scaleXFormat: ".0%",
        range: [0, 1],
      },
    };
  }

  function legendColors() {
    // first color for x < μ - 2σ
    // second color for |x - μ| < 2σ
    // third color for x > μ + 2σ
    return ["#1f78b4", "#33a02c", "#fc8d62"];
  }

  // D3-like utility functions
  function ascending(a, b) {
    return a < b ? -1 : a > b ? 1 : a >= b ? 0 : NaN;
  }

  function quantile(values, p) {
    const sorted = values.slice().sort(ascending);
    const n = sorted.length;
    if (!n) return;
    if (p <= 0 || n < 2) return sorted[0];
    if (p >= 1) return sorted[n - 1];
    const i = (n - 1) * p;
    const i0 = Math.floor(i);
    const value0 = sorted[i0];
    const value1 = sorted[i0 + 1];
    return value0 + (value1 - value0) * (i - i0);
  }

  function deviation(values) {
    const n = values.length;
    if (n < 2) return;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance =
      values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) /
      (n - 1);
    return Math.sqrt(variance);
  }

  function min(values) {
    return Math.min(...values);
  }

  function max(values) {
    return Math.max(...values);
  }

  function format(specifier) {
    // Simplified d3.format implementation for common cases
    return function (value) {
      if (specifier === ",") return value.toLocaleString();
      if (specifier === ".2%") return (value * 100).toFixed(2) + "%";
      if (specifier === ".0%") return Math.round(value * 100) + "%";
      if (specifier === ".2f") return value.toFixed(2);
      if (specifier === ".3") return value.toFixed(3);
      if (specifier === "~s") return value.toLocaleString();
      if (specifier === "0.2f") return value.toFixed(2);
      if (specifier === "0.2%") return (value * 100).toFixed(2) + "%";
      return value.toString();
    };
  }
};
