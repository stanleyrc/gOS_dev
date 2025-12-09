// populationStatisticsWorker.js
/* eslint-env worker */
/* eslint no-restricted-globals: "off" */

self.onmessage = function (e) {
  const { populations, metadata, fields } = e.data;

  try {
    // Calculate general population metrics
    const general = getPopulationMetrics(fields, populations, metadata);

    // Calculate tumor-specific population metrics
    const tumor = getPopulationMetrics(
      fields,
      populations,
      metadata,
      metadata.tumor_type
    );

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
    fields,
    populations,
    metadata = {},
    tumour_type = null
  ) {
    // Extract the data from the responses and store it in an object
    return fields.map((d, i) => {
      let plot = { metadata: d };
      let cutoff = Infinity;
      plot.id = d.id;
      plot.title = d.title;
      plot.group = d.group;
      plot.groupTitle = d.groupTitle;
      plot.groupOrder = d.groupOrder || 0;
      plot.order = d.order || i;
      plot.type = d.type;
      plot.scaleX = d.scale;
      plot.dataset = populations[d.id].sort((a, b) =>
        ascending(+a.value, +b.value)
      );
      plot.allData = populations[d.id].map((e) => +e.value);
      plot.data = populations[d.id]
        .filter((e) => (tumour_type ? e.tumor_type === tumour_type : true))
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
      plot.range = [
        d.minValue == null ? max([min(plot.allData), 0.01]) : +d.minValue,
        d.maxValue == null ? quantile(plot.allData, 0.99) : +d.maxValue,
      ];
      plot.format = d.scaleFormat;
      plot.markValueFormat = d.format;
      if (getNestedValue(metadata, d.id) != null) {
        plot.markValue = getNestedValue(metadata, d.id);
      }
      return plot;
    });
  }

  function getNestedValue(obj, path) {
    if (!path) {
      return undefined;
    }
    return path
      .split(".")
      .reduce((acc, part) => (acc == null ? acc : acc[part]), obj);
  }

  // D3-like utility functions
  function ascending(a, b) {
    return a == null || b == null
      ? NaN
      : a < b
      ? -1
      : a > b
      ? 1
      : a >= b
      ? 0
      : NaN;
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
    let minVal;
    for (const value of values) {
      if (value != null && value >= value) {
        if (minVal === undefined || minVal > value) {
          minVal = value;
        }
      }
    }
    return minVal;
  }

  function max(values) {
    let maxVal;
    for (const value of values) {
      if (value != null && value >= value) {
        if (maxVal === undefined || maxVal < value) {
          maxVal = value;
        }
      }
    }
    return maxVal;
  }
};
