import React, { Component } from "react";
import PropTypes from "prop-types";
import Konva from "konva";
import * as d3 from "d3";

const normalizeAccessor = (accessor) => {
  if (typeof accessor === "function") return accessor;
  if (typeof accessor === "string") return (d) => d[accessor];
  return () => null;
};

const normalizeNumericAccessor = (accessor, defaultValue) => {
  if (typeof accessor === "function") return accessor;
  if (typeof accessor === "number") return () => accessor;
  return () => defaultValue;
};

class KonvaScatter extends Component {
  containerRef = null;
  stage = null;
  circlesLayer = null;
  tooltipData = null;

  state = {
    tooltip: {
      visible: false,
      x: 0,
      y: 0,
      content: [],
    },
  };

  componentDidMount() {
    this.initializeStage();
    this.renderPoints();
  }

  componentDidUpdate(prevProps) {
    const { width, height, data, xScale, yScale, selectedId, selectedIds } = this.props;

    if (width !== prevProps.width || height !== prevProps.height) {
      this.handleResize();
    }

    if (
      data !== prevProps.data ||
      xScale !== prevProps.xScale ||
      yScale !== prevProps.yScale ||
      selectedId !== prevProps.selectedId ||
      selectedIds !== prevProps.selectedIds
    ) {
      this.renderPoints();
    }
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

    this.circlesLayer = new Konva.Layer();
    this.stage.add(this.circlesLayer);

    this.stage.on("mouseover mousemove", this.handleStageMouseOver);
    this.stage.on("mouseout", this.handleStageMouseOut);
    this.stage.on("click", this.handleStageClick);
  }

  handleResize() {
    const { width, height } = this.props;

    if (!this.stage) {
      this.initializeStage();
      this.renderPoints();
      return;
    }

    this.stage.size({ width, height });
    this.renderPoints();
  }

  handleStageMouseOver = (evt) => {
    const { disableTooltip, onPointHover, tooltipAccessor } = this.props;
    const node = evt.target;

    if (node === this.stage || !node.getAttr) return;

    const dataPoint = node.getAttr("dataPoint");
    if (!dataPoint) return;

    node.setAttr("prevStrokeWidth", node.strokeWidth());
    node.setAttr("prevStroke", node.stroke());
    node.strokeWidth(this.props.highlightStrokeWidth);
    node.stroke(this.props.highlightStroke);
    this.circlesLayer.batchDraw();

    if (onPointHover) {
      onPointHover(dataPoint);
    }

    if (!disableTooltip) {
      const mousePos = this.stage.getPointerPosition();
      const getTooltipContent = tooltipAccessor
        ? normalizeAccessor(tooltipAccessor)
        : (d) =>
            Object.keys(d)
              .filter((k) => !k.startsWith("_"))
              .slice(0, 8)
              .map((k) => ({ label: k, value: d[k] }));

      this.setState({
        tooltip: {
          visible: true,
          x: mousePos.x + 10,
          y: mousePos.y + 10,
          content: getTooltipContent(dataPoint),
        },
      });
    }
  };

  handleStageMouseOut = (evt) => {
    const { onPointHoverEnd } = this.props;
    const node = evt.target;

    if (node === this.stage || !node.getAttr) return;

    const prevStrokeWidth = node.getAttr("prevStrokeWidth");
    const prevStroke = node.getAttr("prevStroke");

    if (prevStrokeWidth !== undefined) {
      node.strokeWidth(prevStrokeWidth);
    }
    if (prevStroke !== undefined) {
      node.stroke(prevStroke);
    }
    this.circlesLayer.batchDraw();

    if (onPointHoverEnd) {
      onPointHoverEnd();
    }

    this.setState({
      tooltip: { visible: false, x: 0, y: 0, content: [] },
    });
  };

  handleStageClick = (evt) => {
    const { onPointClick } = this.props;
    const node = evt.target;

    if (node === this.stage || !node.getAttr) return;

    const dataPoint = node.getAttr("dataPoint");
    if (dataPoint && onPointClick) {
      onPointClick(dataPoint);
    }
  };

  getScales() {
    const { width, height, data, xAccessor, yAccessor, xScale, yScale } = this.props;

    const getX = normalizeAccessor(xAccessor);
    const getY = normalizeAccessor(yAccessor);

    const finalXScale =
      xScale ||
      d3
        .scaleLinear()
        .domain(d3.extent(data, getX))
        .range([0, width])
        .nice();

    const finalYScale =
      yScale ||
      d3
        .scaleLinear()
        .domain(d3.extent(data, getY))
        .range([height, 0])
        .nice();

    return { xScale: finalXScale, yScale: finalYScale, getX, getY };
  }

  renderPoints() {
    if (!this.circlesLayer) return;

    const {
      data,
      colorAccessor,
      colorScale,
      radiusAccessor,
      opacityAccessor,
      shapeAccessor,
      idAccessor,
      selectedId,
      selectedIds,
      highlightStroke,
      highlightStrokeWidth,
      zOrderComparator,
      hitStrokeWidth,
    } = this.props;

    this.circlesLayer.destroyChildren();

    if (!data || data.length === 0) {
      this.circlesLayer.batchDraw();
      return;
    }

    const { xScale, yScale, getX, getY } = this.getScales();

    if (!xScale || !yScale) {
      this.circlesLayer.batchDraw();
      return;
    }

    const getColor = colorAccessor ? normalizeAccessor(colorAccessor) : () => "#1890ff";
    const getRadius = normalizeNumericAccessor(radiusAccessor, 4);
    const getOpacity = normalizeNumericAccessor(opacityAccessor, 0.8);
    const getShape = shapeAccessor ? normalizeAccessor(shapeAccessor) : () => "circle";
    const getId = idAccessor ? normalizeAccessor(idAccessor) : (d, i) => i;

    const selectedIdsSet = new Set(
      selectedIds || (selectedId !== undefined && selectedId !== null ? [selectedId] : [])
    );

    let sortedData = data
      .map((d, i) => {
        const xVal = getX(d);
        const yVal = getY(d);
        if (xVal == null || yVal == null || isNaN(xVal) || isNaN(yVal)) {
          return null;
        }
        return { ...d, _originalIndex: i };
      })
      .filter(Boolean);

    if (zOrderComparator) {
      sortedData = sortedData.sort(zOrderComparator);
    }

    sortedData.forEach((d) => {
      const xVal = getX(d);
      const yVal = getY(d);
      const screenX = xScale(xVal);
      const screenY = yScale(yVal);

      if (isNaN(screenX) || isNaN(screenY)) return;

      const colorVal = getColor(d);
      const fill = colorScale ? colorScale(colorVal) : colorVal;
      const radius = getRadius(d);
      const opacity = getOpacity(d);
      const shapeType = getShape(d);
      const pointId = getId(d, d._originalIndex);
      const isSelected = selectedIdsSet.has(pointId);

      const stroke = isSelected ? highlightStroke : "white";
      const strokeWidth = isSelected ? highlightStrokeWidth : 0.5;

      let shape;

      if (shapeType === "star") {
        shape = new Konva.Star({
          x: screenX,
          y: screenY,
          numPoints: 5,
          innerRadius: radius * 0.5,
          outerRadius: radius * 1.5,
          fill,
          stroke,
          strokeWidth,
          opacity,
          hitStrokeWidth: hitStrokeWidth || 8,
        });
      } else if (shapeType === "square") {
        const size = radius * 2;
        shape = new Konva.Rect({
          x: screenX - radius,
          y: screenY - radius,
          width: size,
          height: size,
          fill,
          stroke,
          strokeWidth,
          opacity,
          hitStrokeWidth: hitStrokeWidth || 8,
        });
      } else {
        shape = new Konva.Circle({
          x: screenX,
          y: screenY,
          radius,
          fill,
          stroke,
          strokeWidth,
          opacity,
          hitStrokeWidth: hitStrokeWidth || 8,
        });
      }

      shape.setAttr("dataPoint", d);
      shape.setAttr("pointId", pointId);

      this.circlesLayer.add(shape);
    });

    this.circlesLayer.batchDraw();
  }

  renderTooltip() {
    const { tooltip } = this.state;
    const { width } = this.props;

    if (!tooltip.visible || tooltip.content.length === 0) {
      return null;
    }

    const tooltipX = tooltip.x + 150 > width ? tooltip.x - 160 : tooltip.x;

    return (
      <div
        style={{
          position: "absolute",
          left: tooltipX,
          top: tooltip.y,
          background: "rgba(97, 97, 97, 0.9)",
          color: "#fff",
          padding: "8px 12px",
          borderRadius: 5,
          fontSize: 12,
          pointerEvents: "none",
          zIndex: 1000,
          maxWidth: 200,
          whiteSpace: "nowrap",
        }}
      >
        {tooltip.content.map((item, i) => (
          <div key={i}>
            <strong>{item.label}</strong>: {String(item.value)}
          </div>
        ))}
      </div>
    );
  }

  render() {
    const { width, height, disableTooltip } = this.props;

    return (
      <div style={{ position: "relative", width, height }}>
        <div
          ref={(ref) => (this.containerRef = ref)}
          style={{ width, height }}
        />
        {!disableTooltip && this.renderTooltip()}
      </div>
    );
  }
}

KonvaScatter.propTypes = {
  data: PropTypes.array.isRequired,
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,

  xAccessor: PropTypes.oneOfType([PropTypes.func, PropTypes.string]).isRequired,
  yAccessor: PropTypes.oneOfType([PropTypes.func, PropTypes.string]).isRequired,
  xScale: PropTypes.func,
  yScale: PropTypes.func,

  colorAccessor: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),
  colorScale: PropTypes.func,
  radiusAccessor: PropTypes.oneOfType([PropTypes.func, PropTypes.number]),
  opacityAccessor: PropTypes.oneOfType([PropTypes.func, PropTypes.number]),
  shapeAccessor: PropTypes.func,

  selectedId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  selectedIds: PropTypes.array,
  highlightStroke: PropTypes.string,
  highlightStrokeWidth: PropTypes.number,

  tooltipAccessor: PropTypes.func,
  idAccessor: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),

  onPointClick: PropTypes.func,
  onPointHover: PropTypes.func,
  onPointHoverEnd: PropTypes.func,

  zOrderComparator: PropTypes.func,

  disableTooltip: PropTypes.bool,
  hitStrokeWidth: PropTypes.number,
};

KonvaScatter.defaultProps = {
  radiusAccessor: 4,
  opacityAccessor: 0.8,
  highlightStroke: "#ff7f0e",
  highlightStrokeWidth: 3,
  disableTooltip: false,
  hitStrokeWidth: 8,
};

export default KonvaScatter;
