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
  tooltipLayer = null;
  tooltipGroup = null;
  
  // Debug tracers
  static instanceCount = 0;
  instanceId = ++KonvaScatter.instanceCount;
  renderCount = 0;
  renderPointsCount = 0;

  componentDidMount() {
    console.log(`[KonvaScatter #${this.instanceId}] componentDidMount`);
    this.initializeStage();
    this.renderPoints();
  }

  shouldComponentUpdate(nextProps) {
    // Tooltip is now handled entirely in Konva - no React state for it
    // Only re-render for meaningful prop changes
    const { width, height, data, selectedId, selectedIds } = this.props;
    if (width !== nextProps.width || height !== nextProps.height) return true;
    if (data !== nextProps.data) return true;
    if (selectedId !== nextProps.selectedId) return true;
    if (selectedIds !== nextProps.selectedIds) return true;
    if (this.scalesChanged(this.props.xScale, nextProps.xScale)) return true;
    if (this.scalesChanged(this.props.yScale, nextProps.yScale)) return true;
    
    console.log(`[KonvaScatter #${this.instanceId}] shouldComponentUpdate - BLOCKED (no meaningful changes)`);
    return false;
  }

  componentDidUpdate(prevProps) {
    const { width, height, data, xScale, yScale, selectedId, selectedIds } = this.props;

    const reasons = [];
    if (width !== prevProps.width) reasons.push(`width: ${prevProps.width} -> ${width}`);
    if (height !== prevProps.height) reasons.push(`height: ${prevProps.height} -> ${height}`);
    if (data !== prevProps.data) reasons.push(`data: ref changed (${prevProps.data?.length} -> ${data?.length})`);
    if (selectedId !== prevProps.selectedId) reasons.push(`selectedId`);
    if (selectedIds !== prevProps.selectedIds) reasons.push(`selectedIds`);
    
    const scalesChanged = this.scalesChanged(prevProps.xScale, xScale) || 
                          this.scalesChanged(prevProps.yScale, yScale);
    if (scalesChanged) reasons.push(`scales changed`);

    if (reasons.length > 0) {
      console.log(`[KonvaScatter #${this.instanceId}] componentDidUpdate - props changed:`, reasons.join(', '));
    }

    if (width !== prevProps.width || height !== prevProps.height) {
      this.handleResize();
    }

    if (
      data !== prevProps.data ||
      scalesChanged ||
      selectedId !== prevProps.selectedId ||
      selectedIds !== prevProps.selectedIds
    ) {
      this.renderPoints();
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

    this.circlesLayer = new Konva.Layer();
    this.stage.add(this.circlesLayer);

    // Tooltip layer with listening: false for performance
    this.tooltipLayer = new Konva.Layer({ listening: false });
    this.stage.add(this.tooltipLayer);
    this.initializeTooltip();

    this.stage.on("mouseover", this.handleStageMouseOver);
    this.stage.on("mouseout", this.handleStageMouseOut);
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
    const { disableTooltip, onPointHover, tooltipAccessor, width } = this.props;
    const node = evt.target;

    if (node === this.stage || !node.getAttr) return;

    const dataPoint = node.getAttr("dataPoint");
    if (!dataPoint) return;

    if (onPointHover) {
      onPointHover(dataPoint);
    }

    if (!disableTooltip && this.tooltipGroup) {
      const mousePos = this.stage.getPointerPosition();
      const getTooltipContent = tooltipAccessor
        ? normalizeAccessor(tooltipAccessor)
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
      
      this.updateTooltipPosition(mousePos, width);
      this.tooltipGroup.visible(true);
      this.tooltipLayer.batchDraw();
    }
  };

  handleStageMouseMove = (evt) => {
    const { disableTooltip, width } = this.props;
    
    if (!disableTooltip && this.tooltipGroup && this.tooltipGroup.visible()) {
      const mousePos = this.stage.getPointerPosition();
      this.updateTooltipPosition(mousePos, width);
      this.tooltipLayer.batchDraw();
    }
  };

  handleStageMouseOut = (evt) => {
    const node = evt.target;
    if (node === this.stage) return;
    
    if (this.tooltipGroup) {
      this.tooltipGroup.visible(false);
      this.tooltipLayer.batchDraw();
    }
  };

  updateTooltipPosition(mousePos, width) {
    const tooltipWidth = this.tooltipRect.width();
    const xPos = mousePos.x + 10 + tooltipWidth > width 
      ? mousePos.x - tooltipWidth - 10 
      : mousePos.x + 10;
    this.tooltipGroup.position({ x: xPos, y: mousePos.y + 10 });
  }

  handleStageMouseLeave = () => {
    const { onPointHoverEnd } = this.props;
    
    if (onPointHoverEnd) {
      onPointHoverEnd();
    }
    
    if (this.tooltipGroup) {
      this.tooltipGroup.visible(false);
      this.tooltipLayer.batchDraw();
    }
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
    this.renderPointsCount++;
    const startTime = performance.now();
    console.log(`[KonvaScatter #${this.instanceId}] renderPoints() call #${this.renderPointsCount}`);
    
    if (!this.circlesLayer) {
      console.log(`[KonvaScatter #${this.instanceId}] renderPoints() aborted - no circlesLayer`);
      return;
    }

    const {
      data,
      colorAccessor,
      colorScale,
      radiusAccessor,
      shapeAccessor,
      idAccessor,
      selectedId,
      selectedIds,
      highlightStroke,
      highlightStrokeWidth,
      zOrderComparator,
    } = this.props;

    const destroyStart = performance.now();
    this.circlesLayer.destroyChildren();
    const destroyTime = performance.now() - destroyStart;

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
    const getShape = shapeAccessor ? normalizeAccessor(shapeAccessor) : () => "circle";
    const getId = idAccessor ? normalizeAccessor(idAccessor) : (d, i) => i;

    const selectedIdsSet = new Set(
      selectedIds || (selectedId !== undefined && selectedId !== null ? [selectedId] : [])
    );

    const dataFilterStart = performance.now();
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
    const dataFilterTime = performance.now() - dataFilterStart;

    const shapeCreateStart = performance.now();
    sortedData.forEach((d) => {
      const xVal = getX(d);
      const yVal = getY(d);
      const screenX = xScale(xVal);
      const screenY = yScale(yVal);

      if (isNaN(screenX) || isNaN(screenY)) return;

      const colorVal = getColor(d);
      const fill = colorScale ? colorScale(colorVal) : colorVal;
      const radius = getRadius(d);
      const shapeType = getShape(d);
      const pointId = getId(d, d._originalIndex);
      const isSelected = selectedIdsSet.has(pointId);

      let shape;

      if (shapeType === "star") {
        shape = new Konva.Star({
          x: screenX,
          y: screenY,
          numPoints: 5,
          innerRadius: radius * 0.5,
          outerRadius: radius * 1.5,
          fill,
        });
      } else if (shapeType === "square") {
        const size = radius * 2;
        shape = new Konva.Rect({
          x: screenX - radius,
          y: screenY - radius,
          width: size,
          height: size,
          fill,
        });
      } else {
        shape = new Konva.Circle({
          x: screenX,
          y: screenY,
          radius,
          fill,
        });
      }

      if (isSelected) {
        shape.stroke(highlightStroke);
        shape.strokeWidth(highlightStrokeWidth);
      }

      shape.setAttr("dataPoint", d);
      shape.setAttr("pointId", pointId);

      this.circlesLayer.add(shape);
    });
    const shapeCreateTime = performance.now() - shapeCreateStart;

    const batchDrawStart = performance.now();
    this.circlesLayer.batchDraw();
    const batchDrawTime = performance.now() - batchDrawStart;
    
    const totalTime = performance.now() - startTime;
    console.log(`[KonvaScatter #${this.instanceId}] renderPoints() complete:`, {
      points: sortedData.length,
      destroyTime: destroyTime.toFixed(1) + 'ms',
      dataFilterTime: dataFilterTime.toFixed(1) + 'ms',
      shapeCreateTime: shapeCreateTime.toFixed(1) + 'ms',
      batchDrawTime: batchDrawTime.toFixed(1) + 'ms',
      totalTime: totalTime.toFixed(1) + 'ms',
    });
  }

  render() {
    this.renderCount++;
    console.log(`[KonvaScatter #${this.instanceId}] render() call #${this.renderCount}`);
    
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
};

KonvaScatter.defaultProps = {
  radiusAccessor: 4,
  highlightStroke: "#ff7f0e",
  highlightStrokeWidth: 3,
  disableTooltip: false,
};

export default KonvaScatter;
