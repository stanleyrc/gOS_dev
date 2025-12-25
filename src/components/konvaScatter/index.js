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
  errorBarsLayer = null;
  circlesLayer = null;
  hoverLayer = null;
  tooltipLayer = null;
  tooltipGroup = null;
  hoveredNode = null;
  hoveredGroupId = null;
  isPanning = false;
  lastPanPos = null;
  pendingZoom = null;
  zoomRafId = null;
  // Track current data for position-only updates
  currentData = null;
  dataAccessors = null;
  // For local zoom state during active zooming (bypass React)
  localZoomDomain = null;
  zoomEndTimeout = null;
  // Pre-computed group memberships for fast hover (Phase 1)
  shapesByGroup = null;      // Map<groupId, shape[]>
  errorBarsByGroup = null;   // Map<groupId, errorBarGroup[]>
  // Reusable hover line (Phase 4)
  cachedHoverLine = null;
  // RAF throttling for hover effect
  hoverRafId = null;
  pendingHoverGroupId = null;

  componentDidMount() {
    this.initializeStage();
    this.renderPoints();
  }

  shouldComponentUpdate(nextProps) {
    // Tooltip is now handled entirely in Konva - no React state for it
    // Only re-render for meaningful prop changes
    const { width, height, data, selectedId, selectedIds, colorAccessor, colorScale, colorKey, xAccessor, yAccessor } = this.props;
    if (width !== nextProps.width || height !== nextProps.height) return true;
    if (data !== nextProps.data) return true;
    if (selectedId !== nextProps.selectedId) return true;
    if (selectedIds !== nextProps.selectedIds) return true;
    if (colorAccessor !== nextProps.colorAccessor) return true;
    if (colorScale !== nextProps.colorScale) return true;
    if (colorKey !== nextProps.colorKey) return true;
    if (xAccessor !== nextProps.xAccessor) return true;
    if (yAccessor !== nextProps.yAccessor) return true;
    if (this.scalesChanged(this.props.xScale, nextProps.xScale)) return true;
    if (this.scalesChanged(this.props.yScale, nextProps.yScale)) return true;
    return false;
  }

  componentDidUpdate(prevProps) {
    const { width, height, data, xScale, yScale, selectedId, selectedIds, colorAccessor, colorScale, xAccessor, yAccessor } = this.props;

    const scalesChanged = this.scalesChanged(prevProps.xScale, xScale) ||
                          this.scalesChanged(prevProps.yScale, yScale);

    if (width !== prevProps.width || height !== prevProps.height) {
      this.handleResize();
      return;
    }

    // Check if only scales changed (zoom/pan) - use fast position update
    const { colorKey } = this.props;
    const onlyScalesChanged = scalesChanged &&
      data === prevProps.data &&
      selectedId === prevProps.selectedId &&
      selectedIds === prevProps.selectedIds &&
      colorAccessor === prevProps.colorAccessor &&
      colorScale === prevProps.colorScale &&
      colorKey === prevProps.colorKey &&
      xAccessor === prevProps.xAccessor &&
      yAccessor === prevProps.yAccessor;

    if (onlyScalesChanged && this.currentData) {
      // Fast path: just update positions without recreating shapes
      this.updatePositions();
      return;
    }

    if (
      data !== prevProps.data ||
      scalesChanged ||
      selectedId !== prevProps.selectedId ||
      selectedIds !== prevProps.selectedIds ||
      colorAccessor !== prevProps.colorAccessor ||
      colorScale !== prevProps.colorScale ||
      colorKey !== prevProps.colorKey ||
      xAccessor !== prevProps.xAccessor ||
      yAccessor !== prevProps.yAccessor
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
    if (this.zoomRafId) {
      cancelAnimationFrame(this.zoomRafId);
    }
    if (this.hoverRafId) {
      cancelAnimationFrame(this.hoverRafId);
    }
    if (this.zoomEndTimeout) {
      clearTimeout(this.zoomEndTimeout);
    }
    if (this.stage) {
      this.stage.destroy();
      this.stage = null;
    }
  }

  initializeStage() {
    const { width, height, clipBounds } = this.props;

    if (!this.containerRef || width <= 0 || height <= 0) return;

    this.stage = new Konva.Stage({
      container: this.containerRef,
      width,
      height,
    });

    // Use clipBounds if provided, otherwise full canvas
    const clip = clipBounds || { x: 0, y: 0, width, height };

    this.errorBarsLayer = new Konva.Layer({ listening: false, clip });
    this.stage.add(this.errorBarsLayer);

    this.circlesLayer = new Konva.Layer({ clip });
    this.stage.add(this.circlesLayer);

    this.hoverLayer = new Konva.Layer({ listening: false, clip });
    this.stage.add(this.hoverLayer);

    this.tooltipLayer = new Konva.Layer({ listening: false });
    this.stage.add(this.tooltipLayer);
    this.initializeTooltip();

    this.stage.on("mouseover", this.handleStageMouseOver);
    this.stage.on("mouseout", this.handleStageMouseOut);
    this.stage.on("mousemove", this.handleStageMouseMove);
    this.stage.on("mouseleave", this.handleStageMouseLeave);
    this.stage.on("click", this.handleStageClick);

    // Add zoom/pan handlers
    this.stage.on("wheel", this.handleWheel);
    this.stage.on("mousedown", this.handlePanStart);
    this.stage.on("touchstart", this.handlePanStart);
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
    const { width, height, clipBounds } = this.props;

    if (!this.stage) {
      this.initializeStage();
      this.renderPoints();
      return;
    }

    this.stage.size({ width, height });
    const clip = clipBounds || { x: 0, y: 0, width, height };
    if (this.circlesLayer) {
      this.circlesLayer.clip(clip);
    }
    if (this.errorBarsLayer) {
      this.errorBarsLayer.clip(clip);
    }
    if (this.hoverLayer) {
      this.hoverLayer.clip(clip);
    }
    this.renderPoints();
  }

  handleStageMouseOver = (evt) => {
    const { disableTooltip, onPointHover, tooltipAccessor, width, hoverStroke, hoverStrokeWidth, fadeOnHover } = this.props;
    const node = evt.target;

    if (node === this.stage || !node.getAttr) return;

    const dataPoint = node.getAttr("dataPoint");
    if (!dataPoint) return;

    this.hoveredNode = node;
    this.stage.container().style.cursor = "pointer";

    node._originalStroke = node.stroke();
    node._originalStrokeWidth = node.strokeWidth();
    node.stroke(hoverStroke);
    node.strokeWidth(hoverStrokeWidth);

    // Use cached accessor instead of creating new one (Phase 3)
    const groupId = this.dataAccessors?.getGroupId ? this.dataAccessors.getGroupId(dataPoint) : null;
    this.hoveredGroupId = groupId;

    if (fadeOnHover && groupId) {
      // RAF throttle: only apply hover effect once per frame
      this.pendingHoverGroupId = groupId;
      if (!this.hoverRafId) {
        this.hoverRafId = requestAnimationFrame(() => {
          this.hoverRafId = null;
          if (this.pendingHoverGroupId) {
            this.applyHoverEffect(this.pendingHoverGroupId);
          }
        });
      }
    }

    this.circlesLayer.batchDraw();

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

  applyHoverEffect = (groupId) => {
    const { xScale, yScale, colorScale, hoverStroke, hoverStrokeWidth } = this.props;

    // Use cached accessors and group maps (Phase 3)
    if (!this.shapesByGroup || !this.dataAccessors) return;

    const { getX, getY, getColor } = this.dataAccessors;
    const sameGroupPoints = [];

    // O(1) lookup for hovered group shapes
    const hoveredShapes = this.shapesByGroup.get(groupId) || [];

    // First pass: dim ALL shapes (still O(n) but simpler operation)
    this.circlesLayer.children.forEach((shape) => {
      shape.opacity(0.2);
    });

    // Second pass: highlight only hovered group shapes (O(k) where k = group size)
    hoveredShapes.forEach((shape) => {
      const dp = shape.getAttr("dataPoint");
      shape.opacity(1);
      if (!shape.hasOwnProperty('_originalStroke')) {
        shape._originalStroke = shape.stroke();
        shape._originalStrokeWidth = shape.strokeWidth();
      }
      shape.stroke(hoverStroke);
      shape.strokeWidth(hoverStrokeWidth);

      if (dp) {
        sameGroupPoints.push({
          x: xScale(getX(dp)),
          y: yScale(getY(dp)),
          color: colorScale ? colorScale(getColor(dp)) : getColor(dp),
        });
      }
    });

    // Handle error bars similarly
    if (this.errorBarsLayer && this.errorBarsByGroup) {
      this.errorBarsLayer.children.forEach((errorBarGroup) => {
        errorBarGroup.opacity(0.2);
      });

      const hoveredErrorBars = this.errorBarsByGroup.get(groupId) || [];
      hoveredErrorBars.forEach((errorBarGroup) => {
        errorBarGroup.opacity(1);
      });
    }

    // Update hover layer (connecting lines) - reuse cached line (Phase 4)
    if (sameGroupPoints.length > 1) {
      sameGroupPoints.sort((a, b) => a.y - b.y);

      if (!this.cachedHoverLine) {
        this.cachedHoverLine = new Konva.Line({
          stroke: "#666",
          strokeWidth: 2,
          dash: [5, 5],
        });
        this.hoverLayer.add(this.cachedHoverLine);
      }

      this.cachedHoverLine.points(sameGroupPoints.flatMap((p) => [p.x, p.y]));
      this.cachedHoverLine.visible(true);
    } else if (this.cachedHoverLine) {
      this.cachedHoverLine.visible(false);
    }

    // Single consolidated batch draw at the end (Phase 3)
    if (this.errorBarsLayer) {
      this.errorBarsLayer.batchDraw();
    }
    this.circlesLayer.batchDraw();
    this.hoverLayer.batchDraw();
  };

  clearHoverEffect = () => {
    this.circlesLayer.children.forEach((shape) => {
      shape.opacity(1);
      // Only restore stroke if original values were stored (i.e., stroke was modified)
      if (shape.hasOwnProperty('_originalStroke')) {
        shape.stroke(shape._originalStroke);
        shape.strokeWidth(shape._originalStrokeWidth);
        // Clear the stored values
        delete shape._originalStroke;
        delete shape._originalStrokeWidth;
      }
    });

    // Restore error bar opacity
    if (this.errorBarsLayer) {
      this.errorBarsLayer.children.forEach((errorBarGroup) => {
        errorBarGroup.opacity(1);
      });
      this.errorBarsLayer.batchDraw();
    }

    // Hide cached line instead of destroying (Phase 4)
    if (this.cachedHoverLine) {
      this.cachedHoverLine.visible(false);
    }
    // Clear any pending hover RAF
    this.pendingHoverGroupId = null;
    this.hoverLayer.batchDraw();
    this.circlesLayer.batchDraw();
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
    const { fadeOnHover } = this.props;
    const node = evt.target;
    if (node === this.stage) return;
    
    if (this.stage) {
      this.stage.container().style.cursor = "default";
    }

    if (this.hoveredNode) {
      this.hoveredNode.stroke(this.hoveredNode._originalStroke || null);
      this.hoveredNode.strokeWidth(this.hoveredNode._originalStrokeWidth || 0);
      this.hoveredNode = null;
    }

    if (fadeOnHover && this.hoveredGroupId) {
      this.clearHoverEffect();
      this.hoveredGroupId = null;
    } else {
      this.circlesLayer.batchDraw();
    }
    
    if (this.tooltipGroup) {
      this.tooltipGroup.visible(false);
      this.tooltipLayer.batchDraw();
    }
  };

  updateTooltipPosition(mousePos, width) {
    const tooltipWidth = this.tooltipRect.width();
    const tooltipHeight = this.tooltipRect.height();
    const { height } = this.props;

    // Horizontal: flip left if would overflow right
    const xPos = mousePos.x + 10 + tooltipWidth > width 
      ? mousePos.x - tooltipWidth - 10 
      : mousePos.x + 10;

    // Vertical: flip up if would overflow bottom
    const yPos = mousePos.y + 10 + tooltipHeight > height
      ? mousePos.y - tooltipHeight - 10
      : mousePos.y + 10;

    this.tooltipGroup.position({ x: xPos, y: yPos });
  }

  handleStageMouseLeave = () => {
    const { onPointHoverEnd, fadeOnHover } = this.props;
    
    if (onPointHoverEnd) {
      onPointHoverEnd();
    }
    
    if (this.stage) {
      this.stage.container().style.cursor = "default";
    }

    if (this.hoveredNode) {
      this.hoveredNode.stroke(this.hoveredNode._originalStroke || null);
      this.hoveredNode.strokeWidth(this.hoveredNode._originalStrokeWidth || 0);
      this.hoveredNode = null;
    }

    if (fadeOnHover && this.hoveredGroupId) {
      this.clearHoverEffect();
      this.hoveredGroupId = null;
    } else {
      this.circlesLayer.batchDraw();
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

  handleWheel = (evt) => {
    const { enableZoom, onZoomChange, clipBounds, xScale, yScale, zoomLimits, minZoomRange } = this.props;
    if (!enableZoom || !onZoomChange || !xScale) return;

    // Prevent page scroll
    evt.evt.preventDefault();
    evt.evt.stopPropagation();

    const pointer = this.stage.getPointerPosition();
    if (!pointer) return;

    // Get zoom limits
    const [limitMin, limitMax] = zoomLimits || xScale.domain();
    const maxRange = limitMax - limitMin;
    const minRange = minZoomRange || maxRange / 100;

    // Get current domain - use local zoom if active, otherwise props
    const domain = this.localZoomDomain || xScale.domain();
    const range = xScale.range();
    const currentMin = domain[0];
    const currentMax = domain[1];
    const currentRange = currentMax - currentMin;

    // Calculate zoom direction
    const scaleBy = 1.1;
    const direction = evt.evt.deltaY > 0 ? 1 : -1; // 1 = zoom out, -1 = zoom in

    // Early exit if already at limits
    const isAtMaxZoom = currentRange >= maxRange - 0.001; // Already fully zoomed out
    const isAtMinZoom = currentRange <= minRange + 0.001; // Already fully zoomed in

    if (isAtMaxZoom && direction > 0) {
      // Already at max zoom out, can't zoom out further
      return;
    }
    if (isAtMinZoom && direction < 0) {
      // Already at max zoom in, can't zoom in further
      return;
    }

    const factor = direction > 0 ? scaleBy : 1 / scaleBy;

    // Get mouse position in data coordinates
    const plotLeft = clipBounds ? clipBounds.x : range[0];
    const plotRight = clipBounds ? clipBounds.x + clipBounds.width : range[1];
    const mouseRatio = Math.max(0, Math.min(1, (pointer.x - plotLeft) / (plotRight - plotLeft)));
    const mouseDataX = currentMin + mouseRatio * currentRange;

    // Calculate new range
    let newRange = currentRange * factor;

    // Clamp range to limits
    if (newRange >= maxRange) {
      // Zooming out to or beyond max - reset to full view
      this.localZoomDomain = null;
      if (this.zoomEndTimeout) {
        clearTimeout(this.zoomEndTimeout);
      }
      onZoomChange({ xMin: limitMin, xMax: limitMax });
      return;
    }
    if (newRange < minRange) {
      // Can't zoom in further
      return;
    }

    // Zoom towards mouse position
    let newMin = mouseDataX - mouseRatio * newRange;
    let newMax = mouseDataX + (1 - mouseRatio) * newRange;

    // Clamp to data bounds
    if (newMin < limitMin) {
      newMin = limitMin;
      newMax = limitMin + newRange;
    }
    if (newMax > limitMax) {
      newMax = limitMax;
      newMin = limitMax - newRange;
    }

    // Store local zoom domain
    this.localZoomDomain = [newMin, newMax];

    // Immediately update positions locally (no React!) - using RAF for smooth animation
    if (!this.zoomRafId) {
      this.zoomRafId = requestAnimationFrame(() => {
        this.zoomRafId = null;
        if (this.localZoomDomain && this.currentData && this.dataAccessors) {
          // Create temporary scale with local domain
          const tempXScale = xScale.copy().domain(this.localZoomDomain);
          this.updatePositionsWithScale(tempXScale, yScale);
        }
      });
    }

    // Debounce React sync - only fire after 100ms of no wheel events
    if (this.zoomEndTimeout) {
      clearTimeout(this.zoomEndTimeout);
    }
    this.zoomEndTimeout = setTimeout(() => {
      if (this.localZoomDomain) {
        onZoomChange({ xMin: this.localZoomDomain[0], xMax: this.localZoomDomain[1] });
        this.localZoomDomain = null;
      }
    }, 100);
  };

  handlePanStart = (evt) => {
    const { enablePan, onZoomChange, xScale, clipBounds } = this.props;
    if (!enablePan || !onZoomChange || !xScale) return;

    // Don't start pan if clicking on a data point
    const node = evt.target;
    if (node !== this.stage && node.getAttr && node.getAttr("dataPoint")) return;

    const pointer = this.stage.getPointerPosition();
    if (!pointer) return;

    // Check if pointer is within plot area
    if (clipBounds) {
      if (pointer.x < clipBounds.x || pointer.x > clipBounds.x + clipBounds.width ||
          pointer.y < clipBounds.y || pointer.y > clipBounds.y + clipBounds.height) {
        return;
      }
    }

    this.isPanning = true;
    this.lastPanPos = pointer;
    this.stage.container().style.cursor = "grabbing";

    // Add global listeners for pan
    window.addEventListener("mousemove", this.handlePanMove);
    window.addEventListener("mouseup", this.handlePanEnd);
    window.addEventListener("touchmove", this.handlePanMove);
    window.addEventListener("touchend", this.handlePanEnd);
  };

  handlePanMove = (evt) => {
    if (!this.isPanning || !this.lastPanPos) return;

    const { onZoomChange, xScale, yScale, clipBounds, zoomLimits } = this.props;
    if (!onZoomChange || !xScale) return;

    evt.preventDefault();

    // Get zoom limits
    const [limitMin, limitMax] = zoomLimits || xScale.domain();

    // Get current mouse position
    const rect = this.containerRef.getBoundingClientRect();
    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const pointerX = clientX - rect.left;

    // Calculate delta in pixels
    const deltaX = pointerX - this.lastPanPos.x;
    this.lastPanPos = { x: pointerX, y: this.lastPanPos.y };

    // Convert to data units - use local domain if active
    const domain = this.localZoomDomain || xScale.domain();
    const plotWidth = clipBounds ? clipBounds.width : (xScale.range()[1] - xScale.range()[0]);
    const dataRange = domain[1] - domain[0];
    const dataDelta = (deltaX / plotWidth) * dataRange;

    // Calculate new domain (pan is inverted - drag right = move left in data)
    let newMin = domain[0] - dataDelta;
    let newMax = domain[1] - dataDelta;

    // Clamp to data bounds
    if (newMin < limitMin) {
      newMin = limitMin;
      newMax = limitMin + dataRange;
    }
    if (newMax > limitMax) {
      newMax = limitMax;
      newMin = limitMax - dataRange;
    }

    // Store local domain and update immediately
    this.localZoomDomain = [newMin, newMax];

    // Immediate local update (no React)
    if (this.currentData && this.dataAccessors) {
      const tempXScale = xScale.copy().domain(this.localZoomDomain);
      this.updatePositionsWithScale(tempXScale, yScale);
    }

    // Debounce React sync
    if (this.zoomEndTimeout) {
      clearTimeout(this.zoomEndTimeout);
    }
    this.zoomEndTimeout = setTimeout(() => {
      if (this.localZoomDomain) {
        onZoomChange({ xMin: this.localZoomDomain[0], xMax: this.localZoomDomain[1] });
        this.localZoomDomain = null;
      }
    }, 100);
  };

  handlePanEnd = () => {
    this.isPanning = false;
    this.lastPanPos = null;
    if (this.stage) {
      this.stage.container().style.cursor = "default";
    }

    // Immediately sync to React when pan ends
    if (this.zoomEndTimeout) {
      clearTimeout(this.zoomEndTimeout);
      this.zoomEndTimeout = null;
    }
    if (this.localZoomDomain) {
      const { onZoomChange } = this.props;
      if (onZoomChange) {
        onZoomChange({ xMin: this.localZoomDomain[0], xMax: this.localZoomDomain[1] });
      }
      this.localZoomDomain = null;
    }

    window.removeEventListener("mousemove", this.handlePanMove);
    window.removeEventListener("mouseup", this.handlePanEnd);
    window.removeEventListener("touchmove", this.handlePanMove);
    window.removeEventListener("touchend", this.handlePanEnd);
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
    if (!this.circlesLayer) {
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
      ciLowerAccessor,
      ciUpperAccessor,
      showErrorBars,
      hollowAccessor,
    } = this.props;

    this.circlesLayer.destroyChildren();
    if (this.errorBarsLayer) {
      this.errorBarsLayer.destroyChildren();
    }

    if (!data || data.length === 0) {
      this.circlesLayer.batchDraw();
      if (this.errorBarsLayer) this.errorBarsLayer.batchDraw();
      return;
    }

    const { xScale, yScale, getX, getY } = this.getScales();

    if (!xScale || !yScale) {
      this.circlesLayer.batchDraw();
      if (this.errorBarsLayer) this.errorBarsLayer.batchDraw();
      return;
    }

    const getColor = colorAccessor ? normalizeAccessor(colorAccessor) : () => "#1890ff";
    const getRadius = normalizeNumericAccessor(radiusAccessor, 4);
    const getShape = shapeAccessor ? normalizeAccessor(shapeAccessor) : () => "circle";
    const getId = idAccessor ? normalizeAccessor(idAccessor) : (d, i) => i;
    const getCiLower = ciLowerAccessor ? normalizeAccessor(ciLowerAccessor) : null;
    const getCiUpper = ciUpperAccessor ? normalizeAccessor(ciUpperAccessor) : null;
    const getHollow = hollowAccessor ? normalizeAccessor(hollowAccessor) : () => false;

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
      const shapeType = getShape(d);
      const pointId = getId(d, d._originalIndex);
      const isSelected = selectedIdsSet.has(pointId);
      const isHollow = getHollow(d);

      if (showErrorBars && this.errorBarsLayer) {
        const ciLower = getCiLower ? getCiLower(d) : null;
        const ciUpper = getCiUpper ? getCiUpper(d) : null;
        const hasLower = ciLower != null && !isNaN(ciLower);
        const hasUpper = ciUpper != null && !isNaN(ciUpper);

        // Draw error bars if at least one bound is available
        if (hasLower || hasUpper) {
          const yLower = hasLower ? yScale(ciLower) : null;
          const yUpper = hasUpper ? yScale(ciUpper) : null;
          const capWidth = 3;

          const errorBarGroup = new Konva.Group();
          errorBarGroup.setAttr("dataPoint", d);

          // Draw vertical line from point to available bound(s)
          if (hasLower && hasUpper) {
            // Full interval
            const verticalLine = new Konva.Line({
              points: [screenX, yLower, screenX, yUpper],
              stroke: fill,
              strokeWidth: 1.5,
            });
            errorBarGroup.add(verticalLine);
          } else if (hasLower) {
            // Only lower bound - draw from point down
            const verticalLine = new Konva.Line({
              points: [screenX, screenY, screenX, yLower],
              stroke: fill,
              strokeWidth: 1.5,
            });
            errorBarGroup.add(verticalLine);
          } else if (hasUpper) {
            // Only upper bound - draw from point up
            const verticalLine = new Konva.Line({
              points: [screenX, screenY, screenX, yUpper],
              stroke: fill,
              strokeWidth: 1.5,
            });
            errorBarGroup.add(verticalLine);
          }

          // Draw caps for available bounds
          if (hasLower) {
            const lowerCap = new Konva.Line({
              points: [screenX - capWidth, yLower, screenX + capWidth, yLower],
              stroke: fill,
              strokeWidth: 1.5,
            });
            errorBarGroup.add(lowerCap);
          }

          if (hasUpper) {
            const upperCap = new Konva.Line({
              points: [screenX - capWidth, yUpper, screenX + capWidth, yUpper],
              stroke: fill,
              strokeWidth: 1.5,
            });
            errorBarGroup.add(upperCap);
          }

          this.errorBarsLayer.add(errorBarGroup);
        }
      }

      let shape;

      // For hollow points, use transparent fill (for hit detection) with colored stroke
      const shapeConfig = isHollow
        ? { stroke: fill, strokeWidth: 2.5, fill: 'rgba(255,255,255,0.01)' }
        : { fill };

      if (shapeType === "star") {
        shape = new Konva.Star({
          x: screenX,
          y: screenY,
          numPoints: 5,
          innerRadius: radius * 0.5,
          outerRadius: radius * 1.5,
          ...shapeConfig,
        });
      } else if (shapeType === "square") {
        const size = radius * 2;
        shape = new Konva.Rect({
          x: screenX - radius,
          y: screenY - radius,
          width: size,
          height: size,
          ...shapeConfig,
        });
      } else {
        shape = new Konva.Circle({
          x: screenX,
          y: screenY,
          radius,
          ...shapeConfig,
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

    if (this.errorBarsLayer) {
      this.errorBarsLayer.batchDraw();
    }
    this.circlesLayer.batchDraw();

    // Cache data and accessors for fast position updates AND hover (Phases 1 & 2)
    const { groupAccessor } = this.props;
    this.currentData = sortedData;
    this.dataAccessors = {
      getX,
      getY,
      getCiLower,
      getCiUpper,
      getColor,
      getGroupId: groupAccessor ? normalizeAccessor(groupAccessor) : null,
    };

    // Pre-compute group memberships for fast hover (Phase 1)
    if (groupAccessor) {
      const getGroupId = this.dataAccessors.getGroupId;
      this.shapesByGroup = new Map();
      this.errorBarsByGroup = new Map();

      this.circlesLayer.children.forEach((shape) => {
        const dp = shape.getAttr("dataPoint");
        if (!dp) return;
        const gid = getGroupId(dp);
        if (!this.shapesByGroup.has(gid)) {
          this.shapesByGroup.set(gid, []);
        }
        this.shapesByGroup.get(gid).push(shape);
      });

      if (this.errorBarsLayer) {
        this.errorBarsLayer.children.forEach((errorGroup) => {
          const dp = errorGroup.getAttr("dataPoint");
          if (!dp) return;
          const gid = getGroupId(dp);
          if (!this.errorBarsByGroup.has(gid)) {
            this.errorBarsByGroup.set(gid, []);
          }
          this.errorBarsByGroup.get(gid).push(errorGroup);
        });
      }
    } else {
      this.shapesByGroup = null;
      this.errorBarsByGroup = null;
    }
  }

  // Fast position update without recreating shapes - used during zoom/pan
  updatePositions() {
    const { xScale, yScale } = this.props;
    this.updatePositionsWithScale(xScale, yScale);
  }

  // Core position update with provided scales - for both React updates and local zoom
  updatePositionsWithScale(xScale, yScale) {
    if (!this.circlesLayer || !this.currentData || !this.dataAccessors) {
      return;
    }

    const { showErrorBars } = this.props;
    const { getX, getY, getCiLower, getCiUpper } = this.dataAccessors;

    if (!xScale || !yScale) return;

    const circleShapes = this.circlesLayer.children;

    // Update circle/shape positions
    circleShapes.forEach((shape) => {
      const dataPoint = shape.getAttr("dataPoint");
      if (!dataPoint) return;

      const xVal = getX(dataPoint);
      const yVal = getY(dataPoint);
      const screenX = xScale(xVal);
      const screenY = yScale(yVal);

      if (isNaN(screenX) || isNaN(screenY)) return;

      // Update position based on shape type
      if (shape.className === "Rect") {
        const radius = shape.width() / 2;
        shape.x(screenX - radius);
        shape.y(screenY - radius);
      } else {
        shape.x(screenX);
        shape.y(screenY);
      }
    });

    // Update error bar positions
    if (showErrorBars && this.errorBarsLayer) {
      const capWidth = 3;
      this.errorBarsLayer.children.forEach((errorGroup) => {
        const d = errorGroup.getAttr("dataPoint");
        if (!d) return;

        const xVal = getX(d);
        const yVal = getY(d);
        const screenX = xScale(xVal);
        const screenY = yScale(yVal);

        const ciLower = getCiLower ? getCiLower(d) : null;
        const ciUpper = getCiUpper ? getCiUpper(d) : null;
        const hasLower = ciLower != null && !isNaN(ciLower);
        const hasUpper = ciUpper != null && !isNaN(ciUpper);

        const yLower = hasLower ? yScale(ciLower) : null;
        const yUpper = hasUpper ? yScale(ciUpper) : null;

        const lines = errorGroup.children;
        let lineIdx = 0;

        // Update vertical line
        if (lines[lineIdx]) {
          if (hasLower && hasUpper) {
            lines[lineIdx].points([screenX, yLower, screenX, yUpper]);
          } else if (hasLower) {
            lines[lineIdx].points([screenX, screenY, screenX, yLower]);
          } else if (hasUpper) {
            lines[lineIdx].points([screenX, screenY, screenX, yUpper]);
          }
          lineIdx++;
        }

        // Update lower cap if present
        if (hasLower && lines[lineIdx]) {
          lines[lineIdx].points([screenX - capWidth, yLower, screenX + capWidth, yLower]);
          lineIdx++;
        }

        // Update upper cap if present
        if (hasUpper && lines[lineIdx]) {
          lines[lineIdx].points([screenX - capWidth, yUpper, screenX + capWidth, yUpper]);
        }
      });
    }

    // Batch draw for performance
    if (this.errorBarsLayer) {
      this.errorBarsLayer.batchDraw();
    }
    this.circlesLayer.batchDraw();
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
  hoverStroke: PropTypes.string,
  hoverStrokeWidth: PropTypes.number,

  tooltipAccessor: PropTypes.func,
  idAccessor: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),

  onPointClick: PropTypes.func,
  onPointHover: PropTypes.func,
  onPointHoverEnd: PropTypes.func,

  zOrderComparator: PropTypes.func,

  disableTooltip: PropTypes.bool,

  ciLowerAccessor: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),
  ciUpperAccessor: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),
  showErrorBars: PropTypes.bool,

  groupAccessor: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),
  fadeOnHover: PropTypes.bool,

  // Hollow points (stroke-only circles)
  hollowAccessor: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),

  // Clipping bounds for plot area
  clipBounds: PropTypes.shape({
    x: PropTypes.number,
    y: PropTypes.number,
    width: PropTypes.number,
    height: PropTypes.number,
  }),

  // Zoom/pan support
  enableZoom: PropTypes.bool,
  enablePan: PropTypes.bool,
  onZoomChange: PropTypes.func,
  zoomLimits: PropTypes.arrayOf(PropTypes.number),
  minZoomRange: PropTypes.number,
};

KonvaScatter.defaultProps = {
  radiusAccessor: 4,
  highlightStroke: "#ff7f0e",
  highlightStrokeWidth: 3,
  hoverStroke: "#ff7f0e",
  hoverStrokeWidth: 3,
  disableTooltip: false,
  showErrorBars: false,
  fadeOnHover: false,
  enableZoom: false,
  enablePan: false,
};

export default KonvaScatter;
