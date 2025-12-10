import React, { Component } from "react";
import PropTypes from "prop-types";
import Konva from "konva";
import * as d3 from "d3";

class KonvaContour extends Component {
  containerRef = null;
  stage = null;
  contoursLayer = null;
  markerLayer = null;
  tooltipLayer = null;
  tooltipGroup = null;
  delaunay = null;
  _delaunayDataPoints = null;
  _cachedContours = null;
  _contourCacheKey = null;

  componentDidMount() {
    this.initializeStage();
    this.renderContours();
  }

  shouldComponentUpdate(nextProps) {
    const { width, height, data, contours, selectedId } = this.props;
    if (width !== nextProps.width || height !== nextProps.height) return true;
    if (data !== nextProps.data) return true;
    if (contours !== nextProps.contours) return true;
    if (selectedId !== nextProps.selectedId) return true;
    if (this.scalesChanged(this.props.xScale, nextProps.xScale)) return true;
    if (this.scalesChanged(this.props.yScale, nextProps.yScale)) return true;
    if (this.props.colorScale !== nextProps.colorScale) return true;
    return false;
  }

  componentDidUpdate(prevProps) {
    const { width, height, data, contours, xScale, yScale, selectedId, colorScale } = this.props;

    const scalesChanged = this.scalesChanged(prevProps.xScale, xScale) ||
                          this.scalesChanged(prevProps.yScale, yScale);

    if (width !== prevProps.width || height !== prevProps.height) {
      this.handleResize();
    }

    if (
      data !== prevProps.data ||
      contours !== prevProps.contours ||
      scalesChanged ||
      selectedId !== prevProps.selectedId ||
      colorScale !== prevProps.colorScale
    ) {
      this.renderContours();
    }
  }

  scalesChanged(prevScale, nextScale) {
    if (prevScale === nextScale) return false;
    if (!prevScale || !nextScale) return true;

    const prevDomain = prevScale.domain?.();
    const nextDomain = nextScale.domain?.();
    const prevRange = prevScale.range?.();
    const nextRange = nextScale.range?.();

    if (!prevDomain || !nextDomain || !prevRange || !nextRange) return true;

    return (
      prevDomain.length !== nextDomain.length ||
      prevRange.length !== nextRange.length ||
      prevDomain.some((v, i) => v !== nextDomain[i]) ||
      prevRange.some((v, i) => v !== nextRange[i])
    );
  }

  componentWillUnmount() {
    if (this.stage) {
      this.stage.destroy();
      this.stage = null;
    }
  }

  initializeStage() {
    const { width, height } = this.props;

    if (!this.containerRef || width <= 0 || height <= 0) return;

    this.stage = new Konva.Stage({
      container: this.containerRef,
      width,
      height,
    });

    this.contoursLayer = new Konva.Layer();
    this.stage.add(this.contoursLayer);

    this.markerLayer = new Konva.Layer();
    this.stage.add(this.markerLayer);

    this.tooltipLayer = new Konva.Layer({ listening: false });
    this.stage.add(this.tooltipLayer);
    this.initializeTooltip();
    this.initializeMarker();

    this.stage.on("mousemove", this.handleStageMouseMove);
    this.stage.on("mouseleave", this.handleStageMouseLeave);
    this.stage.on("click", this.handleStageClick);
  }

  initializeTooltip() {
    this.tooltipGroup = new Konva.Group({ visible: false });

    this.tooltipRect = new Konva.Rect({
      fill: "rgba(97, 97, 97, 0.9)",
      cornerRadius: 5,
    });

    this.tooltipText = new Konva.Text({
      fill: "#fff",
      fontSize: 12,
      padding: 8,
      lineHeight: 1.4,
    });

    this.tooltipGroup.add(this.tooltipRect);
    this.tooltipGroup.add(this.tooltipText);
    this.tooltipLayer.add(this.tooltipGroup);
  }

  initializeMarker() {
    this.markerCircle = new Konva.Circle({
      radius: 5,
      fill: "#ff7f0e",
      stroke: "#fff",
      strokeWidth: 2,
      visible: false,
    });
    this.markerLayer.add(this.markerCircle);
  }

  handleResize() {
    const { width, height } = this.props;

    if (!this.stage) {
      this.initializeStage();
      this.renderContours();
      return;
    }

    this.stage.size({ width, height });
    this.renderContours();
  }

  handleStageMouseMove = (evt) => {
    const { data, xScale, yScale, xAccessor, yAccessor, tooltipAccessor, width, height, onPointHover, disableTooltip } = this.props;

    if (!data || data.length === 0) return;

    const mousePos = this.stage.getPointerPosition();
    if (!mousePos) return;

    if (!this.delaunay || this._delaunayDataPoints !== data) {
      this.delaunay = d3.Delaunay.from(
        data,
        (d) => xScale(d[xAccessor]),
        (d) => yScale(d[yAccessor])
      );
      this._delaunayDataPoints = data;
    }

    const idx = this.delaunay.find(mousePos.x, mousePos.y);
    if (idx === undefined || idx === null) return;

    const dataPoint = data[idx];
    const screenX = xScale(dataPoint[xAccessor]);
    const screenY = yScale(dataPoint[yAccessor]);

    this.markerCircle.position({ x: screenX, y: screenY });
    this.markerCircle.visible(true);
    this.markerLayer.batchDraw();

    this._hoveredIndex = idx;

    if (onPointHover) {
      onPointHover(dataPoint);
    }

    this.stage.container().style.cursor = "pointer";

    if (!disableTooltip && this.tooltipGroup) {
      const getTooltipContent = tooltipAccessor
        ? tooltipAccessor
        : (d) =>
            Object.keys(d)
              .filter((k) => !k.startsWith("_"))
              .slice(0, 8)
              .map((k) => ({ label: k, value: d[k] }));

      const content = getTooltipContent(dataPoint);
      const textContent = content
        .map((item) => `${item.label}: ${String(item.value)}`)
        .join("\n");

      this.tooltipText.text(textContent);
      const textWidth = this.tooltipText.width();
      const textHeight = this.tooltipText.height();
      this.tooltipRect.size({ width: textWidth, height: textHeight });

      this.updateTooltipPosition(mousePos, width, height);
      this.tooltipGroup.visible(true);
      this.tooltipLayer.batchDraw();
    }
  };

  updateTooltipPosition(mousePos, width, height) {
    const tooltipWidth = this.tooltipRect.width();
    const tooltipHeight = this.tooltipRect.height();

    const xPos = mousePos.x + 10 + tooltipWidth > width
      ? mousePos.x - tooltipWidth - 10
      : mousePos.x + 10;

    const yPos = mousePos.y + 10 + tooltipHeight > height
      ? mousePos.y - tooltipHeight - 10
      : mousePos.y + 10;

    this.tooltipGroup.position({ x: xPos, y: yPos });
  }

  handleStageMouseLeave = () => {
    const { onPointHoverEnd } = this.props;

    if (onPointHoverEnd) {
      onPointHoverEnd();
    }

    if (this.stage) {
      this.stage.container().style.cursor = "default";
    }

    this.markerCircle.visible(false);
    this.markerLayer.batchDraw();

    this._hoveredIndex = null;

    if (this.tooltipGroup) {
      this.tooltipGroup.visible(false);
      this.tooltipLayer.batchDraw();
    }
  };

  handleStageClick = () => {
    const { data, onPointClick } = this.props;

    if (this._hoveredIndex !== null && this._hoveredIndex !== undefined && onPointClick) {
      onPointClick(data[this._hoveredIndex]);
    }
  };

  renderContours() {
    if (!this.contoursLayer) return;

    const { contours, colorScale } = this.props;

    this.contoursLayer.destroyChildren();

    if (!contours || contours.length === 0) {
      this.contoursLayer.batchDraw();
      return;
    }

    contours.forEach((contour, i) => {
      const pathData = d3.geoPath()(contour);
      if (!pathData) return;

      const fill = colorScale(contour.value);
      const strokeColor = d3.rgb(fill).darker(0.3).toString();

      const path = new Konva.Path({
        data: pathData,
        fill: fill,
        stroke: strokeColor,
        strokeWidth: i % 5 ? 0.25 : 1,
        lineJoin: "round",
      });

      this.contoursLayer.add(path);
    });

    this.contoursLayer.batchDraw();
  }

  render() {
    const { width, height } = this.props;

    return (
      <div style={{ position: "relative", width, height }}>
        <div
          ref={(ref) => (this.containerRef = ref)}
          style={{ width, height }}
        />
      </div>
    );
  }
}

KonvaContour.propTypes = {
  contours: PropTypes.array.isRequired,
  data: PropTypes.array.isRequired,
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,

  xAccessor: PropTypes.string.isRequired,
  yAccessor: PropTypes.string.isRequired,
  xScale: PropTypes.func.isRequired,
  yScale: PropTypes.func.isRequired,

  colorScale: PropTypes.func.isRequired,

  selectedId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),

  tooltipAccessor: PropTypes.func,

  onPointClick: PropTypes.func,
  onPointHover: PropTypes.func,
  onPointHoverEnd: PropTypes.func,

  disableTooltip: PropTypes.bool,
};

KonvaContour.defaultProps = {
  disableTooltip: false,
};

export default KonvaContour;
