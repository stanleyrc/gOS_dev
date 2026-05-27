import React, { Component } from "react";
import { PropTypes } from "prop-types";
import * as d3 from "d3";
import Wrapper from "./index.style";

class PurityPloidySlider extends Component {
  state = {
    copyStateSeparatorDrag: null,
  };

  componentDidUpdate(prevProps) {
    const previousSource = prevProps.activeCopyStateFit?.source;
    const currentSource = this.props.activeCopyStateFit?.source;

    if (
      this.state.copyStateSeparatorDrag != null &&
      previousSource != null &&
      previousSource !== "metadata" &&
      currentSource === "metadata"
    ) {
      this.clearCopyStateSeparatorDrag();
    }
  }

  componentWillUnmount() {
    this.clearCopyStateSeparatorDrag();
  }

  getSeparatorSegmentMean = (separator) => {
    if (separator == null) return undefined;
    return typeof separator === "number" ? separator : separator.segmentMean;
  };

  clearCopyStateSeparatorDrag = () => {
    const drag = this.state.copyStateSeparatorDrag;

    if (drag == null) return;

    if (typeof window !== "undefined") {
      if (typeof drag.mouseMoveListener === "function") {
        window.removeEventListener("mousemove", drag.mouseMoveListener);
      }
      if (typeof drag.mouseUpListener === "function") {
        window.removeEventListener("mouseup", drag.mouseUpListener);
      }
    }

    this.setState({ copyStateSeparatorDrag: null });
  };

  handleCopyStateSeparatorDragStart = (event, separator) => {
    event.preventDefault?.();
    event.stopPropagation?.();
    this.clearCopyStateSeparatorDrag();

    const copyState = separator.copyState;
    const startSegmentMean = this.getSeparatorSegmentMean(separator);
    const startFit = this.props.activeCopyStateFit;
    // Shift, Alt, or Meta modifier drags on nonzero separators edit spacing
    // anchored at copy state 0; copy-state 0 itself can only shift the family.
    const mode =
      copyState !== 0 && (event.shiftKey || event.altKey || event.metaKey)
        ? "spacing"
        : "shift";
    const mouseMoveListener = (moveEvent) =>
      this.handleCopyStateSeparatorDragMove(moveEvent, separator);
    const mouseUpListener = (mouseUpEvent) =>
      this.handleCopyStateSeparatorDragEnd(mouseUpEvent, separator);

    this.setState({
      copyStateSeparatorDrag: {
        startClientX: event.clientX,
        startSegmentMean,
        copyState,
        mode,
        startFit,
        mouseMoveListener,
        mouseUpListener,
      },
    });

    if (typeof window !== "undefined") {
      window.addEventListener("mousemove", mouseMoveListener);
      window.addEventListener("mouseup", mouseUpListener);
    }
  };

  handleCopyStateSeparatorDragMove = (event, separator) => {
    const drag = this.state.copyStateSeparatorDrag;

    if (drag == null) return;

    event.preventDefault?.();
    event.stopPropagation?.();

    const { onCopyStateFitPreview, xScale } = this.props;
    if (typeof onCopyStateFitPreview !== "function") return;

    const startClientX = drag.startClientX;
    const startSegmentMean = Number.isFinite(drag.startSegmentMean)
      ? drag.startSegmentMean
      : this.getSeparatorSegmentMean(separator);

    if (!Number.isFinite(event.clientX) || !Number.isFinite(startClientX)) {
      return;
    }

    const deltaPixels = event.clientX - startClientX;
    let deltaSegmentMean;

    if (typeof xScale === "function" && typeof xScale.invert === "function") {
      const startPixel = xScale(startSegmentMean);
      const endSegmentMean = xScale.invert(startPixel + deltaPixels);
      const startSegmentMeanFromScale = xScale.invert(startPixel);
      deltaSegmentMean = endSegmentMean - startSegmentMeanFromScale;
    } else if (
      xScale != null &&
      typeof xScale.domain === "function" &&
      typeof xScale.range === "function"
    ) {
      const domain = xScale.domain();
      const range = xScale.range();

      if (Array.isArray(domain) && Array.isArray(range)) {
        const domainSpan = domain[domain.length - 1] - domain[0];
        const rangeSpan = range[range.length - 1] - range[0];
        deltaSegmentMean = (deltaPixels * domainSpan) / rangeSpan;
      }
    }

    const segmentMean = startSegmentMean + deltaSegmentMean;
    const copyState = drag.copyState ?? separator?.copyState;

    if (
      !Number.isFinite(deltaSegmentMean) ||
      !Number.isFinite(segmentMean) ||
      !Number.isFinite(copyState)
    ) {
      return;
    }

    if (drag.mode === "spacing") {
      onCopyStateFitPreview({
        mode: "spacing",
        copyState,
        segmentMean,
        ...(drag.startFit == null ? {} : { startFit: drag.startFit }),
      });
      return;
    }

    onCopyStateFitPreview({
      mode: "shift",
      copyState,
      segmentMean,
      deltaSegmentMean,
      ...(drag.startFit == null ? {} : { startFit: drag.startFit }),
    });
  };

  handleCopyStateSeparatorDragEnd = (event, separator) => {
    const drag = this.state.copyStateSeparatorDrag;

    if (drag == null) return;

    try {
      this.handleCopyStateSeparatorDragMove(event, separator);
    } finally {
      this.clearCopyStateSeparatorDrag();
    }
  };

  renderVisibleLayer() {
    const { clipPath, panelHeight, separators, xScale } = this.props;

    return (
      <g className="copy-state-separator-visible-layer" clipPath={clipPath}>
        {separators.map((d, i) => {
          const segmentMean = this.getSeparatorSegmentMean(d);
          const previousSegmentMean = this.getSeparatorSegmentMean(
            separators[i - 1]
          );
          const copyState = d.copyState ?? i;
          const labelOpacity =
            xScale(segmentMean) - xScale(previousSegmentMean) < 30 ? i % 2 : 1;

          return (
            <g key={copyState}>
              <line
                className="copy-state-separator-line"
                transform={`translate(${[xScale(segmentMean), 0]})`}
                y2={panelHeight + 15}
                onMouseDown={(event) =>
                  this.handleCopyStateSeparatorDragStart(event, d)
                }
              />
              <text
                className="copy-state-separator-label"
                transform={`translate(${[xScale(segmentMean), 0]})`}
                dy="-3"
                opacity={labelOpacity}
              >
                {copyState}
              </text>
              <text
                className="copy-state-separator-segment-mean"
                transform={`translate(${[xScale(segmentMean), panelHeight + 20]})`}
                dy="5"
                opacity={labelOpacity}
              >
                {d3.format(".3f")(segmentMean)}
              </text>
            </g>
          );
        })}
      </g>
    );
  }

  renderHitTargetLayer() {
    const { clipPath, panelHeight, separators, xScale } = this.props;

    return (
      <g className="copy-state-separator-hit-target-layer" clipPath={clipPath}>
        {separators.map((d, i) => {
          const segmentMean = this.getSeparatorSegmentMean(d);
          const copyState = d.copyState ?? i;

          return (
            <line
              key={copyState}
              className="copy-state-separator-hit-target"
              transform={`translate(${[xScale(segmentMean), 0]})`}
              y2={panelHeight + 15}
              onMouseDown={(event) =>
                this.handleCopyStateSeparatorDragStart(event, d)
              }
            />
          );
        })}
      </g>
    );
  }

  render() {
    const { children } = this.props;

    return (
      <Wrapper className="purity-ploidy-slider">
        {this.renderVisibleLayer()}
        {children}
        {this.renderHitTargetLayer()}
      </Wrapper>
    );
  }
}

const copyStateFitPropType = PropTypes.shape({
  slope: PropTypes.number.isRequired,
  intercept: PropTypes.number.isRequired,
  spacing: PropTypes.number.isRequired,
  zeroCopyOffset: PropTypes.number.isRequired,
  purity: PropTypes.number.isRequired,
  ploidy: PropTypes.number.isRequired,
  source: PropTypes.oneOf(["metadata", "preview", "appliedOverride"]).isRequired,
});

PurityPloidySlider.propTypes = {
  activeCopyStateFit: copyStateFitPropType,
  children: PropTypes.node,
  clipPath: PropTypes.string.isRequired,
  onCopyStateFitPreview: PropTypes.func,
  panelHeight: PropTypes.number.isRequired,
  separators: PropTypes.arrayOf(
    PropTypes.shape({
      copyState: PropTypes.number.isRequired,
      segmentMean: PropTypes.number.isRequired,
    })
  ).isRequired,
  xScale: PropTypes.func.isRequired,
};

export default PurityPloidySlider;
